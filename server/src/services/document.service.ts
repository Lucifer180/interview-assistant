import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractDocumentText(file: Express.Multer.File): Promise<String> {
    const extension = file.originalname.split(".").pop()?.toLowerCase();

    let extractedText = "";

    if (extension === "pdf") {
        const parser = new PDFParse({
            data: new Uint8Array(file.buffer)
        })
        try {
            const result = await parser.getText();
            extractedText = result.text;
        } finally {
            await parser.destroy();
        }
    } else if (extension === "docx") {
        const result = await mammoth.extractRawText({
            buffer: file.buffer,
        });
        extractedText = result.value;
    } else {
        throw new Error("only PDF and DOCX files are supported");
    }

    if (!extractedText.trim()) {
        throw new Error("No readable text found in the document");
    }
    return extractedText.trim();
}