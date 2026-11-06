import { useEffect, useRef } from "react";
import { Eraser, Mic, Square, Timer, X } from "lucide-react";
import { useInterviewSession, type LatencyMetrics } from "./hooks/useInterviewSession";
import { StatusOrb, PHASE_STYLES } from "./components/StatusOrb";
import { ContextPanel } from "./components/ContextPanel";
import { AnswerText } from "./components/AnswerText";

function formatMs(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function LatencyBadge({ metrics }: { metrics: LatencyMetrics }) {
  const ttft = metrics.firstTokenMs;
  const tone =
    ttft === null
      ? "text-zinc-500"
      : ttft < 1500
        ? "text-emerald-400"
        : ttft < 3000
          ? "text-amber-400"
          : "text-rose-400";

  return (
    <div
      className="flex items-center gap-3 text-xs text-zinc-500"
      title="Measured in the browser from QUESTION_DETECTED (end of speech) to the first / last answer token"
    >
      <Timer className="h-3.5 w-3.5" />
      <span>
        First token <span className={`font-mono ${tone}`}>{formatMs(ttft)}</span>
      </span>
      <span className="text-zinc-700">·</span>
      <span>
        Total <span className="font-mono text-zinc-300">{formatMs(metrics.totalMs)}</span>
      </span>
    </div>
  );
}

function App() {
  const session = useInterviewSession();
  const {
    phase,
    connected,
    listening,
    starting,
    finalTranscript,
    interimTranscript,
    question,
    answer,
    isGenerating,
    questionCount,
    metrics,
  } = session;

  const transcriptRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // Keep the newest transcript / answer text in view.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [finalTranscript, interimTranscript]);

  useEffect(() => {
    const el = answerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [answer]);

  const status = PHASE_STYLES[phase];
  const active = listening || starting;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header: status at a glance + primary control */}
      <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <StatusOrb phase={phase} size={64} />
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                <span className="text-lg font-semibold tracking-tight">
                  {status.label}
                </span>
              </div>
              <p className="text-xs text-zinc-500">{status.hint}</p>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-zinc-800 md:block" />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-zinc-300">
              Real-Time Interview Assistant
            </h1>
            <LatencyBadge metrics={metrics} />
          </div>

          <button
            type="button"
            onClick={active ? session.stop : session.start}
            disabled={!connected}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-500/25"
                : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            }`}
          >
            {active ? (
              <>
                <Square className="h-4 w-4 fill-current" /> Stop
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Start listening
              </>
            )}
          </button>
        </div>
      </header>

      {session.error && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <span>{session.error}</span>
            <button
              type="button"
              onClick={session.dismissError}
              className="text-rose-300 hover:text-rose-100"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Left column: context + live transcript */}
        <div className="flex min-w-0 flex-col gap-5">
          <ContextPanel
            connected={connected}
            saved={session.contextSaved}
            onEdited={() => session.setContextSaved(false)}
            onSave={session.saveContext}
            onError={session.reportError}
          />

          <section className="flex min-h-[260px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 lg:flex-1">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Live transcript</h2>
                {listening && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={session.clearTranscript}
                disabled={!finalTranscript && !interimTranscript}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
              >
                <Eraser className="h-3 w-3" /> Clear
              </button>
            </div>
            <div
              ref={transcriptRef}
              className="max-h-[40vh] flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed lg:max-h-none"
            >
              {finalTranscript || interimTranscript ? (
                <p>
                  <span className="text-zinc-200">{finalTranscript}</span>
                  {interimTranscript && (
                    <span className="text-zinc-500 italic">
                      {finalTranscript ? " " : ""}
                      {interimTranscript}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-zinc-600">
                  {listening
                    ? "Listening… start speaking."
                    : "The interviewer's words will appear here. Grey italic text is interim (still changing); white text is final."}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right column: question + answer, the part read during a call */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-6 py-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                Detected question
              </h2>
              {questionCount > 0 && (
                <span className="font-mono text-xs text-zinc-600">
                  #{questionCount}
                </span>
              )}
            </div>
            <p
              className={`text-xl leading-snug font-medium sm:text-2xl ${
                question ? "text-zinc-50" : "text-zinc-600"
              }`}
            >
              {question || "Waiting for the interviewer to ask a question…"}
            </p>
          </section>

          <section className="flex min-h-[360px] flex-1 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
              <div className="flex items-center gap-2.5">
                {isGenerating && <StatusOrb phase={phase} size={20} />}
                <h2 className="text-sm font-semibold">Suggested answer</h2>
              </div>
              {isGenerating ? (
                <span className="text-xs" style={{ color: status.color }}>
                  {phase === "thinking" ? "Thinking…" : "Answering…"}
                </span>
              ) : (
                answer && <span className="text-xs text-zinc-500">Done</span>
              )}
            </div>

            <div ref={answerRef} className="flex-1 overflow-y-auto px-6 py-5">
              {phase === "thinking" ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-zinc-500">
                  <StatusOrb phase="thinking" size={64} />
                  <p className="text-sm">Preparing an answer…</p>
                </div>
              ) : answer ? (
                <>
                  <AnswerText text={answer} />
                  {isGenerating && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-sky-400 align-middle" />
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-center text-zinc-600">
                  <StatusOrb phase={phase === "offline" ? "offline" : "idle"} size={64} />
                  <p className="max-w-sm text-sm">
                    When a question is detected, a short, speakable answer will
                    stream in here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
