import { env } from "../config/env.js";

interface GenerateAnswerOptions {
    question: string;
    resumeText?: string;
    jobDescription?: string;
    onToken: (token: string) => void;
}

export async function generateAnswer({
    question, resumeText = "", jobDescription = "", onToken
}: GenerateAnswerOptions): Promise<void> {
    if (!env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is missing");
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: env.GROQ_MODEL,
            messages: [
                {
                    role: "system",
                    content: `
You are an expert technical interview assistant.

Your task is to help a candidate answer interview questions.

Use the candidate's resume and job description as context.

Instructions:
- Personalize answers based on the candidate's actual experience.
- Never invent experience, projects, or skills.
- If a question concerns something not mentioned in the resume, answer using general technical knowledge.
- Connect technical concepts to the candidate's projects when relevant.
- Keep answers concise and interview-friendly.
- Use simple, natural language.
- Include code examples when useful.
- Structure answers with bullet points when appropriate.
    `.trim(),
                },
                {
                    role: "user",
                    content: `
CANDIDATE RESUME:
${resumeText || "Not provided"}

JOB DESCRIPTION:
${jobDescription || "Not provided"}

INTERVIEW QUESTION:
${question}

Generate a relevant interview answer.
    `.trim(),
                },
            ],
            temperature: 0.3,
            stream: true
        })
    });
    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `Groq API error (${response.status}): ${errorText}`
        );
    }
    if (!response.body) {
        throw new Error("Groq returned an empty response stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine.startsWith("data:")) continue;

            const data = trimmedLine.slice(5).trim();

            if (!data || data === "[DONE]") continue;

            const parsed = JSON.parse(data);

            const token = parsed.choices?.[0]?.delta?.content;

            if (typeof token == "string" && token.length > 0) {
                {
                    onToken(token);
                }
            }
        }
    }

    // Process any remaining data in the buffer once the stream has ended.
    const finalLine = buffer.trim();

    if (finalLine.startsWith("data:")) {
        const data = finalLine.slice(5).trim();

        if (data && data !== "[DONE]") {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;

            if (typeof token === "string" && token.length > 0) {
                onToken(token);
            }
        }
    }

}