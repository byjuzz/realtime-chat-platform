import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { createSocketServer } from "./socket.js";

const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3000;

// Sin wildcard por defecto: si no se define la variable de entorno, se usa
// el origen conocido del frontend en desarrollo, nunca "*".
const corsOrigin = process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: corsOrigin }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = createSocketServer(httpServer, corsOrigin);

httpServer.listen(port, () => {
  console.log(`API listening on port ${port} (CORS origin: ${corsOrigin})`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  io.close(() => {
    httpServer.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
