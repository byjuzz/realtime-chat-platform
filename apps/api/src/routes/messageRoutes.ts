import { Router } from "express";
import type { MessageHistoryResponse } from "@realtime-chat/shared";
import type { ChatService } from "../services/chatService.js";
import type { MessageCursor } from "../repositories/messageRepository.js";

const DEFAULT_LIMIT = Number(process.env.MESSAGE_HISTORY_DEFAULT_LIMIT ?? 50);
const MAX_LIMIT = Number(process.env.MESSAGE_HISTORY_MAX_LIMIT ?? 100);

function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString(
    "base64url"
  );
}

function decodeCursor(raw: string): MessageCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8")) as {
      createdAt: string;
      id: string;
    };
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || typeof parsed.id !== "string" || !parsed.id) {
      return null;
    }
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function createMessageRoutes(chatService: ChatService): Router {
  const router = Router();

  router.get("/rooms/:roomSlug/messages", async (req, res) => {
    const { roomSlug } = req.params;

    const limitParam = req.query.limit;
    let limit = DEFAULT_LIMIT;
    if (typeof limitParam === "string") {
      const parsed = Number(limitParam);
      if (!Number.isInteger(parsed) || parsed < 1) {
        res.status(400).json({ error: "invalid limit" });
        return;
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    let cursor: MessageCursor | undefined;
    const cursorParam = req.query.cursor;
    if (typeof cursorParam === "string") {
      const decoded = decodeCursor(cursorParam);
      if (!decoded) {
        res.status(400).json({ error: "invalid cursor" });
        return;
      }
      cursor = decoded;
    }

    const result = await chatService.getHistory(roomSlug, limit, cursor);
    if (!result.ok) {
      res.status(404).json({ error: "room not found" });
      return;
    }

    const response: MessageHistoryResponse = {
      room: result.room,
      messages: result.page.messages,
      hasMore: result.page.hasMore,
      nextCursor: result.page.nextCursor ? encodeCursor(result.page.nextCursor) : null,
    };

    res.json(response);
  });

  return router;
}
