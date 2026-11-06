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

                                    // Detect completed question
                                    const question = questionDetector.processTranscript(result);

                                    if (!question) return;

                                    console.log("Detected question:", question);

                                    sendMessage(socket, {
                                        type: "QUESTION_DETECTED",
                                        question,
                                    });

                                    // Notify frontend that answer generation started
                                    sendMessage(socket, {
                                        type: "AI_ANSWER_START",
                                    });

                                    // Generate and stream answer using Groq
                                    void generateAnswer({
                                        question,
                                        resumeText: candidateContext.resumeText,
                                        jobDescription: candidateContext.jobDescription,

                                        onToken: (token) => {
                                            sendMessage(socket, {
                                                type: "AI_ANSWER_CHUNK",
                                                token,
                                            });
                                        },
                                    }).then(() => {
                                        sendMessage(socket, {
                                            type: "AI_ANSWER_COMPLETE",
                                        });
                                    })
                                        .catch((error) => {
                                            console.error("Groq generation failed:", error);

                                            sendMessage(socket, {
                                                type: "AI_ANSWER_ERROR",
                                                message: "Unable to generate an answer",
                                            });
                                        });
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
            deepgramSession?.close();
            deepgramSession = null
        });

        socket.on("error", (error) => {
            console.error("WebSocket error:", error.message);
        });
    });

    return wss;
}