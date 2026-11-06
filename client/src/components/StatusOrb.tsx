import { ThinkingOrb, type OrbState } from "thinking-orbs";
import type { Phase } from "../hooks/useInterviewSession";

interface PhaseStyle {
  orb: OrbState;
  label: string;
  hint: string;
  /** Orb ink tint + accent colour for the label dot. */
  color: string;
  paused?: boolean;
}

/**
 * Maps each assistant phase to a Thinking Orb animation.
 * Only uses the free states/sizes of `thinking-orbs`
 * (https://libraries.dev/orbs).
 */
export const PHASE_STYLES: Record<Phase, PhaseStyle> = {
  offline: {
    orb: "connecting",
    label: "Offline",
    hint: "Backend not connected",
    color: "#71717a",
    paused: true,
  },
  idle: {
    orb: "breathing",
    label: "Ready",
    hint: "Press Start to listen",
    color: "#a1a1aa",
  },
  starting: {
    orb: "connecting",
    label: "Connecting",
    hint: "Opening mic + Deepgram",
    color: "#a78bfa",
  },
  listening: {
    orb: "listening",
    label: "Listening",
    hint: "Waiting for a question",
    color: "#34d399",
  },
  thinking: {
    orb: "solving",
    label: "Thinking",
    hint: "Question detected",
    color: "#fbbf24",
  },
  answering: {
    orb: "composing",
    label: "Answering",
    hint: "Streaming answer",
    color: "#38bdf8",
  },
};

interface StatusOrbProps {
  phase: Phase;
  size?: 64 | 20;
}

export function StatusOrb({ phase, size = 64 }: StatusOrbProps) {
  const style = PHASE_STYLES[phase];

  return (
    <ThinkingOrb
      key={style.orb}
      state={style.orb}
      size={size}
      theme="dark"
      color={style.color}
      paused={style.paused}
      aria-label={`${style.label}: ${style.hint}`}
    />
  );
}
