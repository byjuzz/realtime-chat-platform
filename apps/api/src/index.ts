import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { prisma, disconnectPrisma, isDatabaseReady } from "./database/prisma.js";
import { PrismaGuestUserRepository } from "./repositories/guestUserRepository.js";
import { PrismaRoomRepository } from "./repositories/roomRepository.js";
import { PrismaMessageRepository } from "./repositories/messageRepository.js";
import { ChatService } from "./services/chatService.js";
import { createMessageRoutes } from "./routes/messageRoutes.js";
import { createSocketServer } from "./socket.js";

const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3000;

// Sin wildcard por defecto: si no se define la variable de entorno, se usa
// el origen conocido del frontend en desarrollo, nunca "*".
const corsOrigin = process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:5173";

const guestUserRepository = new PrismaGuestUserRepository(prisma);
const roomRepository = new PrismaRoomRepository(prisma);
const messageRepository = new PrismaMessageRepository(prisma);
const chatService = new ChatService(guestUserRepository, roomRepository, messageRepository);

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (_req, res) => {
  const ready = await isDatabaseReady();
  if (ready) {
    res.status(200).json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not_ready" });
  }
});

app.use("/api", createMessageRoutes(chatService));

const httpServer = createServer(app);
const io = createSocketServer(httpServer, corsOrigin, chatService);

httpServer.listen(port, () => {
  console.log(`API listening on port ${port} (CORS origin: ${corsOrigin})`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  io.close(() => {
    httpServer.close(async () => {
      await disconnectPrisma();
      console.log("Server closed.");
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
