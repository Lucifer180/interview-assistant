
import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket.service";
import { AudioService } from "./services/audio.services";
import { uploadDocument } from "./services/upload.service";
function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<AudioService | null>(null);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [status, setStatus] = useState("DISCONNECTED");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [detectedQuestion, setDetectedQuestion] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [contextSaved, setContextSaved] = useState(false);

  useEffect(() => {
    const socket = createWebSocket();
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "CONNECTED") {
        setStatus("CONNECTED");
      }

      if (message.type === "STATUS") {
        setStatus(message.status);
      }
      if (message.type === "QUESTION_DETECTED") {
        console.log("Completed question:", message.question);
      }
      if (message.type === "QUESTION_DETECTED") {
        setDetectedQuestion(message.question);
      }

      if (message.type === "AI_ANSWER_START") {
        setAnswer("");
        setIsGenerating(true);
      }

      if (message.type === "AI_ANSWER_CHUNK") {
        setAnswer((previous) => previous + message.token);
      }

      if (message.type === "AI_ANSWER_COMPLETE") {
        setIsGenerating(false);
      }

      if (message.type === "AI_ANSWER_ERROR") {
        setIsGenerating(false);
        console.error(message.message);
      }
      if (message.type === "CONTEXT_SAVED") {
        setContextSaved(true);
        console.log(message.message);
      }

      if (message.type === "TRANSCRIPT") {
        if (message.isFinal) {
          setFinalTranscript((prev) =>
            prev + " " + message.transcript
          );

          setInterimTranscript("");
        } else {
          setInterimTranscript(message.transcript);
        }
      }

      if (message.type === "ERROR") {
        console.error(message.message);
      }
    };

    socket.onclose = () => {
      setStatus("DISCONNECTED");
    };

    return () => {
      socket.close();
    };
  }, []);

  const saveContext = () => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    socket.send(
      JSON.stringify({
        type: "SET_CONTEXT",
        resumeText,
        jobDescription,
      })
    );
  };

  const startListening = async () => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    socket.send(JSON.stringify({ type: "START" }));

    socket.addEventListener(
      "message",
      async function waitForListening(event) {
        const message = JSON.parse(event.data);

        if (
          message.type === "STATUS" &&
          message.status === "LISTENING"
        ) {
          socket.removeEventListener("message", waitForListening);

          const audio = new AudioService();
          audioRef.current = audio;

          await audio.start((audioData) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(audioData);
            }
          });
        }
      }
    );
  };

  const stopListening = async () => {
    await audioRef.current?.stop();
    audioRef.current = null;

    socketRef.current?.send(
      JSON.stringify({ type: "STOP" })
    );
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const result = await uploadDocument(file);

      setResumeText(result.text);
      setContextSaved(false);
      console.log("resume extracted succesfully");
    } catch (error) {
      console.error("resume upload faied", error);
    }
  }

  const handleJobDescriptionUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const result = await uploadDocument(file);

      setJobDescription(result.text);
      setContextSaved(false);
    } catch (error) {
      console.error("Job description upload failed:", error);
    }
  };
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">
        Real-Time Interview Assistant
      </h1>

      <p>Connection: {status}</p>
      <form
        action="http://localhost:5000/api/upload"
        method="POST"
        encType="multipart/form-data"
      >
        <label className="block mb-2">
          Upload Resume (PDF/DOCX)
        </label>

        <input
          type="file"
          name="resume"
          accept=".pdf,.docx"
          required
          className="block w-full text-sm text-white"
        />

        <label className="block mb-2 mt-4">
          Upload Job Description (PDF/DOCX)
        </label>

        <input
          type="file"
          name="jobDescription"
          accept=".pdf,.docx"
          required
          className="block w-full text-sm text-white"
        />

        <button
          type="submit"
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Submit
        </button>
      </form>
      <div className="w-full max-w-2xl rounded-xl bg-slate-800 p-6">
        <h2 className="text-xl font-semibold mb-4">
          Candidate Context
        </h2>

        <label className="block mb-2">
          Resume
        </label>

        <textarea
          value={resumeText}
          onChange={(e) => {
            setResumeText(e.target.value);
            setContextSaved(false);
          }}
          placeholder="Paste your resume text here..."
          className="w-full h-40 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white"
        />

        <label className="block mt-4 mb-2">
          Job Description
        </label>

        <textarea
          value={jobDescription}
          onChange={(e) => {
            setJobDescription(e.target.value);
            setContextSaved(false);
          }}
          placeholder="Paste the job description here..."
          className="w-full h-40 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white"
        />

        <button
          onClick={saveContext}
          className="mt-4 bg-blue-600 px-5 py-2 rounded-lg"
        >
          Save Context
        </button>

        {contextSaved && (
          <p className="text-green-400 mt-3">
            Resume and job description saved!
          </p>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={startListening}
          className="bg-green-600 px-6 py-3 rounded-lg"
        >
          Start
        </button>

        <button
          onClick={stopListening}
          className="bg-red-600 px-6 py-3 rounded-lg"
        >
          Stop
        </button>
      </div>

      <div className="w-full max-w-2xl rounded-xl bg-slate-800 p-6">
        <h2 className="text-xl font-semibold mb-3">
          Live Transcript
        </h2>

        <p className="text-slate-300 whitespace-pre-wrap">
          <div>
            <p>{finalTranscript || "Your transcript will appear here..."}</p>

            {/* <p className="text-slate-400">
              {interimTranscript || "Your transcript will appear here..."}
            </p> */}
          </div>
        </p>
      </div>
      <div className="w-full max-w-2xl rounded-xl bg-slate-800 p-6">
        <h2 className="text-xl font-semibold mb-3">
          Detected Question
        </h2>

        <p className="text-slate-300">
          {detectedQuestion || "Waiting for a question..."}
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">
          AI Suggested Answer
        </h2>

        <p className="text-slate-300 whitespace-pre-wrap">
          {answer || "Your AI answer will appear here..."}
        </p>

        {isGenerating && (
          <p className="text-green-400 mt-3">
            Generating answer...
          </p>
        )}
      </div>

    </div>
  );
}

export default App;
