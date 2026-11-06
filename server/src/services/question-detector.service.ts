interface TranscriptInput {
    transcript: string;
    isFinal: boolean;
    speechfinal: boolean;
}

/**
 * Words that typically open an interview question or prompt
 * ("What is…", "Can you…", "Tell me about…", "Walk me through…").
 */
const QUESTION_STARTERS = new Set([
    "what", "why", "how", "when", "where", "which", "who", "whom", "whose",
    "can", "could", "would", "will", "should", "shall",
    "do", "does", "did", "is", "are", "was", "were", "have", "has", "had",
    "tell", "explain", "describe", "walk", "give", "share", "talk",
    "define", "compare", "difference", "name", "list", "suppose", "imagine",
]);

/** Short acknowledgements / small talk that should never trigger an answer. */
const FILLER_PHRASES = new Set([
    "ok", "okay", "alright", "all right", "right", "yes", "yeah", "yep", "no",
    "sure", "great", "good", "nice", "cool", "perfect", "awesome", "fine",
    "thanks", "thank you", "thank you so much", "got it", "i see", "makes sense",
    "hmm", "hm", "um", "uh", "mhm", "uh huh", "so", "and", "well",
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "can you hear me", "one second", "one moment", "let me see",
]);

function normalize(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

/** True for filler / small talk that should be ignored. */
export function isFiller(text: string): boolean {
    const norm = normalize(text);
    if (!norm) return true;
    if (FILLER_PHRASES.has(norm)) return true;

    // Very short fragments with no question mark ("okay so", "right yeah").
    const words = norm.split(" ");
    return words.length < 3 && !text.includes("?");
}

/** Heuristic: does this utterance read like a question or interview prompt? */
export function isQuestionLike(text: string): boolean {
    if (isFiller(text)) return false;
    if (text.includes("?")) return true;

    const words = normalize(text).split(" ");
    // Check the first few words so "So, can you explain…" / "Okay, tell me…" still count.
    return words.slice(0, 3).some((w) => QUESTION_STARTERS.has(w));
}

/**
 * Turns Deepgram's streaming results into complete questions.
 *
 * - Final segments are buffered until the speaker stops.
 * - On `speech_final` (≈300 ms pause), the buffer is emitted immediately
 *   only if it clearly ends as a question ("…?"); otherwise we wait,
 *   because people pause mid-question.
 * - On `UtteranceEnd` (≈1 s with no new words), whatever is buffered is
 *   emitted if it looks like a question, and dropped if it is filler or a
 *   statement. This also covers the case where `speech_final` never arrives
 *   (background noise keeps the endpointer open).
 */
export class QuestionDetector {
    private questionBuffer = "";

    processTranscript(data: TranscriptInput): string | null {
        if (data.isFinal && data.transcript.trim()) {
            this.questionBuffer += ` ${data.transcript.trim()}`;
        }

        if (!data.speechfinal) {
            return null;
        }

        const candidate = this.questionBuffer.trim();

        // Fast path: a clear, complete question — answer right away.
        if (candidate.endsWith("?") && isQuestionLike(candidate)) {
            this.questionBuffer = "";
            return candidate;
        }

        // Otherwise keep buffering; UtteranceEnd will decide.
        return null;
    }

    /**
     * Flushes the buffered utterance. Returns null if nothing was buffered,
     * otherwise the text and whether it should be answered.
     */
    processUtteranceEnd(): { text: string; isQuestion: boolean } | null {
        const candidate = this.questionBuffer.trim();
        this.questionBuffer = "";

        if (!candidate) return null;

        const isQuestion = isQuestionLike(candidate);
        if (!isQuestion) {
            console.log("Ignored non-question:", candidate);
        }

        return { text: candidate, isQuestion };
    }

    reset() {
        this.questionBuffer = "";
    }
}
