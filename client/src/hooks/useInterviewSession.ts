import { useCallback, useEffect, useRef, useState } from "react";
import { createWebSocket } from "../services/websocket.service";
import { AudioService } from "../services/audio.services";

/**
 * High-level phase of the assistant, derived from socket + generation state.
 * This is what the UI status indicator (and the thinking orb) reflects.
 */
export type Phase =
  | "offline" // WebSocket not connected to the backend
  | "idle" // connected, not listening
  | "starting" // START sent, waiting for Deepgram session + mic
  | "listening" // streaming mic audio, waiting for a question
  | "thinking" // question detected, waiting for the first LLM token
  | "answering"; // LLM tokens are streaming in

export interface LatencyMetrics {
  /** Question detected -> first answer token (ms). */
  firstTokenMs: number | null;
  /** Question detected -> answer complete (ms). */
  totalMs: number | null;
}

/** One finished utterance in the transcript (one bullet in the UI). */
export interface TranscriptSegment {
  id: number;
  text: string;
  /** "question" = detected + answered; "other" = filler / statement. */
  kind: "question" | "other";
}

export function useInterviewSession() {
  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<AudioService | null>(null);
  const pendingStartRef = useRef(false);
  const questionAtRef = useRef<number | null>(null);
  const gotFirstTokenRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);

  // Finished utterances, the final text of the one in progress, and its
  // interim (still-changing) words.
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const segmentIdRef = useRef(0);
  // Mirror of currentTranscript, readable inside socket handlers.
  const currentRef = useRef("");

  const setCurrent = useCallback((text: string) => {
    currentRef.current = text;
    setCurrentTranscript(text);
  }, []);

  const closeSegment = useCallback(
    (text: string, kind: TranscriptSegment["kind"]) => {
      const trimmed = text.trim();
      if (trimmed) {
        const id = ++segmentIdRef.current;
        setSegments((prev) => [...prev, { id, text: trimmed, kind }]);
      }
      setCurrent("");
    },
    [setCurrent]
  );

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);

  const [metrics, setMetrics] = useState<LatencyMetrics>({
    firstTokenMs: null,
    totalMs: null,
  });

  const [contextSaved, setContextSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopAudio = useCallback(async () => {
    const audio = audioRef.current;
    audioRef.current = null;
    await audio?.stop();
  }, []);

  useEffect(() => {
    const socket = createWebSocket();
    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      setConnected(true);
      setError(null);
    };

    socket.onmessage = async (event) => {
      if (socketRef.current !== socket) return;

      let message: Record<string, unknown>;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (message.type) {
        case "STATUS": {
          if (message.status === "LISTENING" && pendingStartRef.current) {
            pendingStartRef.current = false;

            const audio = new AudioService();
            audioRef.current = audio;

            try {
              await audio.start((chunk) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(chunk);
                }
              });
              setListening(true);
            } catch {
              audioRef.current = null;
              socket.send(JSON.stringify({ type: "STOP" }));
              setError(
                "Microphone access was blocked. Allow mic permission and try again."
              );
            } finally {
              setStarting(false);
            }
          }

          if (message.status === "STOPPED") {
            setListening(false);
            setStarting(false);
            setInterimTranscript("");
            // Keep anything said before Stop as its own bullet.
            closeSegment(currentRef.current, "other");
          }
          break;
        }

        case "TRANSCRIPT": {
          const text = String(message.transcript ?? "");
          if (message.isFinal) {
            if (text.trim()) {
              const prev = currentRef.current;
              setCurrent(prev ? `${prev} ${text}` : text);
            }
            setInterimTranscript("");
          } else {
            setInterimTranscript(text);
          }
          break;
        }

        case "UTTERANCE_IGNORED": {
          closeSegment(String(message.text ?? ""), "other");
          break;
        }

        case "QUESTION_DETECTED": {
          questionAtRef.current = performance.now();
          gotFirstTokenRef.current = false;
          const detected = String(message.question ?? "");
          // The server's question text is exactly the buffered finals,
          // so it replaces the in-progress text as a finished bullet.
          closeSegment(detected, "question");
          setQuestion(detected);
          setQuestionCount((n) => n + 1);
          setMetrics({ firstTokenMs: null, totalMs: null });
          break;
        }

        case "AI_ANSWER_START": {
          setAnswer("");
          setIsGenerating(true);
          break;
        }

        case "AI_ANSWER_CHUNK": {
          if (!gotFirstTokenRef.current && questionAtRef.current !== null) {
            gotFirstTokenRef.current = true;
            const firstTokenMs = performance.now() - questionAtRef.current;
            setMetrics((m) => ({ ...m, firstTokenMs }));
          }
          setAnswer((prev) => prev + String(message.token ?? ""));
          break;
        }

        case "AI_ANSWER_COMPLETE": {
          if (questionAtRef.current !== null) {
            const totalMs = performance.now() - questionAtRef.current;
            setMetrics((m) => ({ ...m, totalMs }));
          }
          setIsGenerating(false);
          break;
        }

        case "AI_ANSWER_ERROR": {
          setIsGenerating(false);
          setError(String(message.message ?? "Unable to generate an answer"));
          break;
        }

        case "CONTEXT_SAVED": {
          setContextSaved(true);
          break;
        }

        case "ERROR": {
          setStarting(false);
          pendingStartRef.current = false;
          setError(String(message.message ?? "Something went wrong"));
          break;
        }
      }
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setError(
        "Can't reach the backend at ws://localhost:4000. Is the server running?"
      );
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      setConnected(false);
      setListening(false);
      setStarting(false);
      void stopAudio();
    };

    return () => {
      socketRef.current = null;
      socket.close();
      void stopAudio();
    };
  }, [stopAudio, closeSegment, setCurrent]);

  const start = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Not connected to the backend.");
      return;
    }
    if (listening || starting) return;

    setError(null);
    setStarting(true);
    pendingStartRef.current = true;
    socket.send(JSON.stringify({ type: "START" }));
  }, [listening, starting]);

  const stop = useCallback(async () => {
    pendingStartRef.current = false;
    await stopAudio();
    setListening(false);
    setStarting(false);
    setInterimTranscript("");

    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "STOP" }));
    }
  }, [stopAudio]);

  const saveContext = useCallback(
    (resumeText: string, jobDescription: string) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("Not connected to the backend.");
        return;
      }
      setContextSaved(false);
      socket.send(
        JSON.stringify({ type: "SET_CONTEXT", resumeText, jobDescription })
      );
    },
    []
  );

  const clearTranscript = useCallback(() => {
    setSegments([]);
    setCurrent("");
    setInterimTranscript("");
  }, [setCurrent]);

  let phase: Phase = "idle";
  if (!connected) phase = "offline";
  else if (isGenerating && !answer) phase = "thinking";
  else if (isGenerating) phase = "answering";
  else if (starting) phase = "starting";
  else if (listening) phase = "listening";

  return {
    phase,
    connected,
    listening,
    starting,
    segments,
    currentTranscript,
    interimTranscript,
    question,
    answer,
    isGenerating,
    questionCount,
    metrics,
    contextSaved,
    setContextSaved,
    error,
    dismissError: () => setError(null),
    reportError: setError,
    start,
    stop,
    saveContext,
    clearTranscript,
  };
}
