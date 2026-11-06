import express from "express";
import cors from "cors"
import { createServer } from "http";

import { env } from "./config/env.js"
import healthRoutes from "./routes/health.routes.js"
import { initializeWebSocket } from "./websocket/websocket.server.js"
import uploadRoutes from "./routes/upload.routes.js";
const app = express();

app.use(cors({
    origin: env.CLIENT_ORIGIN
}));

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/upload", uploadRoutes);
const server = createServer(app);

initializeWebSocket(server);

server.listen(env.PORT, () => {
    console.log(`HTTP server running on http://localhost:${env.PORT}`);

    console.log(`WebSocket Server running on ws://localhost:${env.PORT}/ws`
    )
});

process.on("SIGTERM", () => {
    server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
    });
});