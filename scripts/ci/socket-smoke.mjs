#!/usr/bin/env node
// Smoke test de Socket.IO para CI / Docker.
//
// Se conecta a través de Nginx (no directo a la API) para validar la ruta
// real que usa un navegador: cliente -> Nginx -> Socket.IO -> API.
//
// Usa `socket.io-client`, ya presente en el monorepo (devDependency de
// apps/api) — no se agrega ninguna dependencia nueva.
//
// Contrato de eventos: packages/shared/src/events.ts. No se inventan
// nombres de evento ni payloads.

import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8080";
const ROOM_SLUG = "general";
const TIMEOUT_MS = 10_000;

// Identificadores únicos por corrida: el script no depende de mensajes
// o usuarios de ejecuciones anteriores.
const runId = randomUUID().slice(0, 8);
const nameA = `ci-smoke-a-${runId}`;
const nameB = `ci-smoke-b-${runId}`;
const messageText = `ci-smoke-message-${runId}`;

let clientA;
let clientB;

// Conecta un cliente y espera el evento nativo "connect", con timeout.
function connectClient(label) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { reconnection: false, timeout: TIMEOUT_MS });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${label}: no conectó en ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      console.log(`[socket-smoke] ${label} conectado (${socket.id})`);
      resolve(socket);
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${label}: connect_error — ${err.message}`));
    });
  });
}

// Emite un evento y espera su ack (la función de confirmación), con timeout.
// socket.timeout(ms) es una utilidad propia de socket.io-client para esto.
function emitWithAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(TIMEOUT_MS).emit(event, payload, (err, response) => {
      if (err) {
        reject(new Error(`${event}: sin respuesta en ${TIMEOUT_MS}ms`));
        return;
      }
      if (!response.ok) {
        reject(new Error(`${event}: ack de error — ${JSON.stringify(response)}`));
        return;
      }
      resolve(response.data);
    });
  });
}

// Espera un evento que el servidor manda sin que lo pidamos (un broadcast).
function waitForEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${event}: no llegó en ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  console.log(`[socket-smoke] conectando a ${BASE_URL}`);

  clientA = await connectClient("cliente A");
  clientB = await connectClient("cliente B");

  const joinDataA = await emitWithAck(clientA, "room:join", { name: nameA, roomSlug: ROOM_SLUG });
  console.log(`[socket-smoke] A entró a la sala ${joinDataA.room.slug}`);

  await emitWithAck(clientB, "room:join", { name: nameB, roomSlug: ROOM_SLUG });
  console.log("[socket-smoke] B entró a la sala");

  // B debe recibir el mensaje que manda A.
  const messagePromise = waitForEvent(clientB, "message:new");
  const sendResult = await emitWithAck(clientA, "message:send", { text: messageText });
  console.log(`[socket-smoke] A envió el mensaje (id=${sendResult.message.id})`);

  const received = await messagePromise;
  if (received.text !== messageText) {
    throw new Error("El mensaje recibido por B no coincide con el enviado por A");
  }
  console.log("[socket-smoke] B recibió el mensaje correctamente");

  console.log("[socket-smoke] ÉXITO");
}

main()
  .then(() => {
    clientA?.close();
    clientB?.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error("[socket-smoke] FALLÓ:", error.message);
    clientA?.close();
    clientB?.close();
    process.exit(1);
  });
