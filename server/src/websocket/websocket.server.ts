import { WebSocket, WebSocketServer, type RawData } from "ws";
import { QuestionDetector } from "../services/question-detector.service.js";
import type { Server } from "http";
import { generateAnswer } from "../services/llm.service.js";
import { createDeepgramSession } from "../services/deepgram.service.js";

type DeepgramSession = Awaited<ReturnType<typeof createDeepgramSession>>;

function sendMessage(socket: WebSocket, payload: object) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload))
    }
}

function toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
        return data;
    };

    if (Array.isArray(data)) {
        return Buffer.concat(data);
    }

    return Buffer.from(data);
};

export function initializeWebSocket(server: Server) {
    const wss = new WebSocketServer({
        server,
        path: "/ws"
    });

    wss.on("connection", (socket: WebSocket) => {
        const questionDetector = new QuestionDetector();
        console.log("client connected");
        let candidateContext = {
            resumeText: "",
            jobDescription: "",
        };
        let deepgramSession: DeepgramSession | null = null;

        let isStarting = false;
        let shouldStop = false;

        // Only one answer streams at a time: a newer question cancels the
        // previous answer so tokens from two answers never interleave.
        let currentAnswer: AbortController | null = null;

        const cancelCurrentAnswer = () => {
            currentAnswer?.abort();
            currentAnswer = null;
        };

        const answerQuestion = (question: string) => {
            console.log("Detected question:", question);

            cancelCurrentAnswer();
            const controller = new AbortController();
            currentAnswer = controller;

            sendMessage(socket, { type: "QUESTION_DETECTED", question });
            sendMessage(socket, { type: "AI_ANSWER_START" });

            generateAnswer({
                question,
                resumeText: candidateContext.resumeText,
                jobDescription: candidateContext.jobDescription,
                signal: controller.signal,
                onToken: (token) => {
                    if (controller.signal.aborted) return;
                    sendMessage(socket, { type: "AI_ANSWER_CHUNK", token });
                },
            })
                .then(() => {
                    if (controller.signal.aborted) return;
                    sendMessage(socket, { type: "AI_ANSWER_COMPLETE" });
                })
                .catch((error) => {
                    // Superseded by a newer question or STOP: not an error.
                    if (controller.signal.aborted) return;

                    console.error("Groq generation failed:", error);
                    sendMessage(socket, {
                        type: "AI_ANSWER_ERROR",
                        message: "Unable to generate an answer",
                    });
                })
                .finally(() => {
                    if (currentAnswer === controller) currentAnswer = null;
                });
        };

        sendMessage(socket, {
            type: "CONNECTED",
            message: "websocket connection established"
        });

        socket.on("message", async (data, isBinary) => {
            if (isBinary) {
                if (!deepgramSession) {
                    sendMessage(socket, {
                        type: "ERROR",
                        message: "Deepgram session is not active"
                    });
                    return;
                }
                try {
                    deepgramSession.sendAudio(toBuffer(data));
                } catch (error) {
                    console.error("Audio forwarding failed", error);

                    sendMessage(socket, {
                        type: "ERROR",
                        message: "Failed to forward audio"
                    })
                };

                return;
            }

            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case "START":
                        if (
                            deepgramSession ||
                            isStarting ||
                            socket.readyState !== WebSocket.OPEN
                        ) {
                            break;
                        }
                        isStarting = true;
                        shouldStop = false;

                        try {
                            const session = await createDeepgramSession({
                                onTranscript: (result) => {
                                    // Send transcript to frontend
                                    sendMessage(socket, {
                                        type: "TRANSCRIPT",
                                        ...result,
                                    });

                                    // Detect completed question (fast path: "...?" + pause)
                                    const question = questionDetector.processTranscript(result);
                                    if (question) answerQuestion(question);
                                },
                                onUtteranceEnd: () => {
                                    // ~1 s of silence: flush whatever was said, if it's a question
                                    const question = questionDetector.processUtteranceEnd();
                                    if (question) answerQuestion(question);
                                },
                                onError: (error) => {
                                    console.error("Deepgram Error:", error);

                                    sendMessage(socket, {
                                        type: "ERROR",
                                        message: "Deepgram transcription error"
                                    });
                                }
                            });

                            if (
                                shouldStop ||
                                socket.readyState !== WebSocket.OPEN
                            ) {
                                session.close();
                                break;
                            }

                            deepgramSession = session;

                            sendMessage(socket, {
                                type: "STATUS",
                                status: "LISTENING"
                            })

                        } catch (error) {
                            console.error("Deepgram startup failed:", error);

                            sendMessage(socket, {
                                type: "ERROR",
                                message: "Unable to start Deepgram session",
                            });

                        } finally {
                            isStarting = false;
                        }

                        break;
                    case "SET_CONTEXT": {
                        const { resumeText, jobDescription } = message;

                        if (
                            typeof resumeText !== "string" ||
                            typeof jobDescription !== "string"
                        ) {
                            sendMessage(socket, {
                                type: "ERROR",
                                message: "Invalid candidate context",
                            });
                            break;
                        }

                        // Basic size protection for this POC.
                        if (resumeText.length > 30000 || jobDescription.length > 20000) {
                            sendMessage(socket, {
                                type: "ERROR",
                                message: "Resume or job description is too large",
                            });
                            break;
                        }

                        candidateContext = {
                            resumeText,
                            jobDescription,
                        };

                        sendMessage(socket, {
                            type: "CONTEXT_SAVED",
                            message: "Candidate context saved successfully",
                        });

                        break;
                    }
                    case "STOP": {
                        shouldStop = true;

                        deepgramSession?.close();
                        deepgramSession = null;
                        questionDetector.reset();
                        cancelCurrentAnswer();
                        sendMessage(socket, {
                            type: "STATUS",
                            status: "STOPPED",
                        });

                        break;
                    }


                    default: sendMessage(socket, {
                        type: "ERROR",
                        message: "Unknown message type"
                    })
                }
            } catch (error) {
                console.error("Message handling error:", error);

                sendMessage(socket, {
                    type: "ERROR",
                    message: "Invalid WebSocket message",
                });
            }
        })
        socket.on("close", () => {
            console.log("client disconnected");

            shouldStop = true;
            cancelCurrentAnswer();
            deepgramSession?.close();
            deepgramSession = null
        });

        socket.on("error", (error) => {
            console.error("WebSocket error:", error.message);
        });
    });

    return wss;
}