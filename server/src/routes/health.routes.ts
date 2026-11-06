import { Router } from "express";
import { timeStamp } from "node:console";
import { success } from "zod";

const router = Router();

router.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Interview assistant backend is running",
        timeStamp: new Date().toString()
    })
});

export default router;