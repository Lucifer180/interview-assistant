import { DeepgramClient } from "@deepgram/sdk";
import { env } from "../config/env.js";

const deepgramClient = new DeepgramClient({
    apiKey: env.DEEPGRAM_API_KEY
});

interface DeepgramCallbacks {
    onTranscript: (data: {
        transcript: string;
        isFinal: boolean;
        speechfinal: boolean;
    }) => void;

    onError: (error: unknown) => void;
}

export async function createDeepgramSession(callbacks: DeepgramCallbacks) {
    if (!env.DEEPGRAM_API_KEY) {
        throw new Error("DEEPGRAM_API_KEY is missing");
    }

    const connection = await deepgramClient.listen.v1.connect({
        model: "nova-3",
        language: "en",
        encoding: "linear16",
        sample_rate: 16000,
        channels: 1,
        punctuate: "true",
        interim_results: "true",
        smart_format: "true",
        endpointing: "300",
        utterance_end_ms: "1000"
    });

    connection.on("message", (data) => {
        if (data.type !== "Results") {
            return;
        }

        const transcript = data.channel.alternatives[0]?.transcript ?? "";

        if (!transcript.trim()) {
            return;
        }

        callbacks.onTranscript({
            transcript,
            isFinal: data?.is_final ?? false,
            speechfinal: data.speech_final ?? false
        });
    });

    connection.on("error", (error) => {
        callbacks.onError(error);
    });

    connection.connect();

    await connection.waitForOpen();

    console.log("Deepgram connection established");

    return {
        sendAudio(audio: Buffer) {
            connection.sendMedia(audio);
        },

        close() {
            try {
                connection.sendCloseStream({
                    type: "CloseStream"
                });
                connection.close();
            } catch (error) {
                console.error("Deepgram cleanup failed:", error);
            }
        }
    };
}
