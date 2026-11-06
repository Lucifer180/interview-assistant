interface TranscriptInput {
    transcript: string;
    isFinal: boolean;
    speechfinal: boolean;
};

export class QuestionDetector {
    private questionBuffer = "";

    processTranscript(data: TranscriptInput): string | null {
        if (!data.isFinal || !data.transcript.trim()) {
            return null;
        }

        this.questionBuffer += ` ${data.transcript.trim()}`;

        if (!data.speechfinal) {
            return null;
        }

        const completedQuestion = this.questionBuffer.trim();

        this.questionBuffer = "";

        if (!completedQuestion) {
            return null;
        };

        return completedQuestion;
    }
    reset() {
        this.questionBuffer = "";
    }
}