export class AudioService {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private gainNode: GainNode | null = null;

    async start(onAudioData: (audio: ArrayBuffer) => void) {
        if (this.audioContext) {
            throw new Error("AudioService is already running");
        }
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
        } catch (error) {
            console.error("Microphone access failed:", error);
            throw error;
        }

        this.audioContext = new AudioContext({
            sampleRate: 16000
        });

        await this.audioContext.resume();

        this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.processor.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);

            const pcm16 = new Int16Array(input.length);

            for (let i = 0; i < input.length; i++) {
                const sample = Math.max(-1, Math.min(1, input[i]));

                pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            };
            onAudioData(pcm16.buffer);

        };

        this.gainNode = this.audioContext.createGain();

        this.gainNode.gain.value = 0;

        this.source.connect(this.processor);
        this.processor.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
    }
    async stop() {
        this.processor?.disconnect();
        this.source?.disconnect();

        this.mediaStream?.getTracks().forEach((track) => {
            track.stop();
        });

        await this.audioContext?.close();
        this.gainNode?.disconnect();
        this.gainNode = null;
        this.processor = null;
        this.source = null;
        this.mediaStream = null;
        this.audioContext = null;
    }


}