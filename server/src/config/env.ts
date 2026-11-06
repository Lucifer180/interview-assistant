import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number().default(4000),

    CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

    DEEPGRAM_API_KEY: z.string().optional(),

    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),

});

export const env = envSchema.parse(process.env);