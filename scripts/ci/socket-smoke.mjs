#!/usr/bin/env node
// Smoke test de Socket.IO para CI / Docker.
//
// Se conecta a través de Nginx (no directo a la API) para validar la ruta
// real cliente -> Nginx -> upgrade/polling Socket.IO -> API, la misma que
// usan los navegadores. Usa `socket.io-client`, ya presente en el monorepo
// (devDependency de apps/api) — no se agrega ninguna dependencia nueva.
//
// Contrato de eventos: packages/shared/src/events.ts (ClientToServerEvents /
// ServerToClientEvents). No se inventan nombres de evento ni payloads.
//
// No depende de estado previo: cada corrida usa nombres/mensajes únicos
// (crypto.randomUUID). Siempre desconecta los sockets al terminar, éxito o
// fallo. Ningún dato sensible se imprime ni se requiere.

import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8080";
const ROOM_SLUG = process.env.SMOKE_ROOM_SLUG ?? "general";
const CONNECT_TIMEOUT_MS = 10_000;
const ACK_TIMEOUT_MS = 10_000;
const EVENT_TIMEOUT_MS = 10_000;
const GLOBAL_TIMEOUT_MS = 45_000;

const runId = randomUUID().slice(0, 8);
const nameA = `ci-smoke-a-${runId}`;
const nameB = `ci-smoke-b-${runId}`;
const messageText = `ci-smoke-message-${runId}`;

let clientA;
let clientB;
let globalWatchdog;

function log(step, detail = "") {
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[socket-smoke] ${step}${suffix}`);
}

function fail(step, error) {
  console.error(`[socket-smoke] FALLO en: ${step}`);
  console.error(error instanceof Error ? error.message : error);
  return new Error(`socket-smoke failed at: ${step}`);
}

function connectClient(label) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: CONNECT_TIMEOUT_MS,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(fail(`conexión de ${label}`, `sin 'connect' tras ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      log(`${label} conectado`, socket.id);
      resolve(socket);
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(fail(`conexión de ${label}`, err));
    });
  });
}

function emitWithAck(socket, label, event, payload) {
  return new Promise((resolve, reject) => {
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(event, payload, (err, response) => {
        if (err) {
          reject(fail(`${event} (${label})`, `sin ack tras ${ACK_TIMEOUT_MS}ms`));
          return;
        }
        if (!response || response.ok !== true) {
          reject(fail(`${event} (${label})`, `ack de error: ${JSON.stringify(response)}`));
          return;
        }
        resolve(response.data);
      });
  });
}

function waitForEvent(socket, label, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(fail(`esperando '${event}' en ${label}`, `sin evento tras ${EVENT_TIMEOUT_MS}ms`));
    }, EVENT_TIMEOUT_MS);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  log("inicio", `BASE_URL=${BASE_URL} roomSlug=${ROOM_SLUG}`);

  clientA = await connectClient("cliente A");
  clientB = await connectClient("cliente B");

  // Cliente A entra a la sala primero.
  const joinDataA = await emitWithAck(clientA, "cliente A", "room:join", {
    name: nameA,
    roomSlug: ROOM_SLUG,
  });
  const roomId = joinDataA.room.id;
  log("cliente A unido a la sala", `roomId=${roomId}`);

  if (joinDataA.user.name !== nameA) {
    throw fail("verificación de identidad de A", "el nombre devuelto no coincide");
  }

  // A debe ver a B entrar (evento room:joined) — confirma presencia entre
  // identidades DISTINTAS antes de continuar.
  const roomJoinedPromise = waitForEvent(clientA, "cliente A", "room:joined");

  const joinDataB = await emitWithAck(clientB, "cliente B", "room:join", {
    name: nameB,
    roomSlug: ROOM_SLUG,
  });
  log("cliente B unido a la sala", `roomId=${joinDataB.room.id}`);

  if (joinDataB.room.id !== roomId) {
    throw fail("aislamiento por sala (join)", "A y B no quedaron en la misma sala esperada");
  }
  if (joinDataB.user.guestUserId === joinDataA.user.guestUserId) {
    throw fail("verificación de identidades distintas", "A y B comparten guestUserId");
  }

  const roomJoinedPayload = await roomJoinedPromise;
  if (roomJoinedPayload.roomId !== roomId || roomJoinedPayload.user.name !== nameB) {
    throw fail("evento room:joined", "payload de presencia inesperado");
  }
  log("presencia recibida en A", `entró ${roomJoinedPayload.user.name}`);

  // B debe recibir el mensaje que envía A, con el mismo roomId (aislamiento
  // básico: el mensaje viaja acotado a la sala en la que ambos están).
  const messageNewPromise = waitForEvent(clientB, "cliente B", "message:new");

  const sendData = await emitWithAck(clientA, "cliente A", "message:send", {
    text: messageText,
  });
  if (sendData.message.text !== messageText || sendData.message.roomId !== roomId) {
    throw fail("ack de message:send", "el mensaje confirmado no coincide con lo enviado");
  }
  log("mensaje enviado por A", `id=${sendData.message.id}`);

  const receivedMessage = await messageNewPromise;
  if (receivedMessage.text !== messageText) {
    throw fail("evento message:new en B", "texto recibido no coincide con el enviado");
  }
  if (receivedMessage.roomId !== roomId) {
    throw fail("aislamiento por sala (mensaje)", "el mensaje llegó con un roomId distinto al esperado");
  }
  log("mensaje recibido en B", `id=${receivedMessage.id}`);

  log("éxito", "conexión, presencia y mensajería verificadas a través de Nginx");
}

globalWatchdog = setTimeout(() => {
  console.error(`[socket-smoke] FALLO: tiempo total excedido (${GLOBAL_TIMEOUT_MS}ms)`);
  cleanupAndExit(1);
}, GLOBAL_TIMEOUT_MS);
globalWatchdog.unref?.();

function cleanupAndExit(code) {
  clearTimeout(globalWatchdog);
  clientA?.removeAllListeners();
  clientB?.removeAllListeners();
  clientA?.close();
  clientB?.close();
  process.exit(code);
}

main()
  .then(() => cleanupAndExit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    cleanupAndExit(1);
  });
