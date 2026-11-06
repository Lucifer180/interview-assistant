import { Router } from "express";
import multer from "multer";
import { extractDocumentText } from "../services/document.service.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (_req, file, callback) => {
        const allowedExtensions = [".pdf", ".docx"];

        const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            return callback(new Error("Only PDF and DOCX files are allowed"));
        }

        callback(null, true);
    }
});

router.post("/document", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({
                success: false,
                message: "Please upload a document",
            });
            return;
        }

        const text = await extractDocumentText(req.file);

        res.status(200).json({
            success: true,
            filename: req.file.originalname,
            text,
        });
    } catch (error) {
        console.error("Document extraction failed:", error);

        res.status(500).json({
            success: false,
            message: "Unable to extract document text",
        });
    }
});

export default router;