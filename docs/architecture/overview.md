# Arquitectura — Visión general

> Estado: Fase 4 (chat con múltiples salas). Los componentes marcados como futuros aún no
> están implementados.

## Componentes

```
                    ┌─────────────────────┐
                    │   apps/web            │
                    │   React + Vite + TS    │
                    │   Socket.IO client       │
                    └──────────┬───────────┘
                     WebSocket │ │ HTTP (historial)
                               ▼ ▼
                    ┌─────────────────────┐
                    │   apps/api            │
                    │   Express + TS        │
                    │   Socket.IO server      │
                    │   RoomPresenceState        │
                    │     (presencia por sala,     │
                    │      en memoria)               │
                    │   ChatService              │
                    │   Repositories               │
                    └──────────┬───────────┘
                               │ Prisma Client
                               ▼
                    ┌─────────────────────┐
                    │  PostgreSQL             │
                    │  (realtime_chat_dev)     │
                    └─────────────────────┘
```

`apps/web` corre en `http://localhost:5173` y se conecta a `apps/api` en `http://localhost:3000`
por WebSocket (Socket.IO, tiempo real) y HTTP (`/api/rooms/:slug/messages`, historial paginado).

## Arquitectura de capas en `apps/api`

```
socket.ts / routes/messageRoutes.ts
   ↓
ChatService            (services/chatService.ts — reglas de negocio)
   ↓
Repositories            (repositories/*.ts, detrás de interfaces)
   ↓
Prisma Client            (database/prisma.ts — singleton)
   ↓
PostgreSQL
```

Ningún handler de Socket.IO ni ruta REST llama a Prisma directamente — todos pasan por
`ChatService`. Las interfaces de repositorio (`IGuestUserRepository`, `IRoomRepository`,
`IMessageRepository`) permiten inyectar implementaciones falsas en pruebas unitarias sin
depender de PostgreSQL.

## Contrato de eventos Socket.IO

Definido en `packages/shared/src/events.ts`, compartido entre `apps/web` y `apps/api`:

| Evento | Dirección | Acknowledgement |
|---|---|---|
| `room:join` | cliente → servidor | `RoomJoinAck` (resuelve identidad invitada **y** une a la sala; éxito con `{user, room, users}`, o error tipado) |
| `room:leave` | cliente → servidor | `RoomLeaveAck` |
| `message:send` | cliente → servidor | `MessageAck` (éxito con `ChatMessage`, o error tipado) |
| `room:joined` | servidor → sala | — (informativo; se emite solo si el guest no tenía ya otro socket en esa sala) |
| `room:left` | servidor → sala | — |
| `room:users` | servidor → sala | lista consolidada por `guestUserId` (se reemite tras cada entrada/salida) |
| `message:new` | servidor → sala (`io.to(roomId)`) | — |

`connect_error` es un evento **nativo** del cliente de Socket.IO (no forma parte de
`ServerToClientEvents`). Fase 4 reemplazó por completo `user:join`/`user:joined`/`user:left`/
`user:list` — ver [ADR-005](../adr/ADR-005-multi-room-chat.md).

**Identidad**: `PublicUser.id` es ahora el `guestUserId` consolidado (antes era el `socket.id`;
cambió porque la presencia se consolida por invitado, no por conexión — ver ADR-005).
`ChatMessage.roomId` es el identificador canónico de sala en cada mensaje.

Reglas de negocio en `apps/api/src/socket.ts`:

- **Una sala activa por socket**, aplicada por `RoomPresenceState`; `socket.join`/`socket.leave`
  (rooms nativas de Socket.IO) mantienen el aislamiento de broadcast.
- `room:join` valida que la sala destino existe **antes** de abandonar la sala anterior.
- Un socket no puede enviar `message:send` sin una sala activa (`NOT_JOINED`).
- **El servidor determina la sala del mensaje desde el estado del socket, nunca desde el payload
  del cliente.**
- Validación de nombre y mensaje según `VALIDATION` en `packages/shared`.
- Límite de frecuencia de mensajes por socket (rate limiting, en memoria, independiente de la sala).
- **`message:new` solo se emite (`io.to(roomId)`) si el mensaje se persistió correctamente en
  PostgreSQL.** Si la escritura falla, se responde `MESSAGE_PERSISTENCE_FAILED` y no se emite nada.
- Al desconectarse o cambiar de sala: se limpia la presencia del socket; `room:left` solo se
  emite si era el último socket de ese `guestUserId` en la sala. Esto **no** borra al
  `GuestUser` ni sus mensajes de la base.

## Historial de mensajes (REST)

`GET /api/rooms/:roomSlug/messages?limit=&cursor=` — paginación por cursor
(`createdAt + id`, no offset), mensajes en orden cronológico ascendente en la respuesta.
`404` si la sala no existe; `400` si `limit`/`cursor` son inválidos. Ver
`packages/shared/src/events.ts` → `MessageHistoryResponse`.

## API REST de salas

- `GET /api/rooms` — lista todas las salas (orden `createdAt` ascendente), con `connectedUsers`
  calculado en memoria desde `RoomPresenceState`.
- `POST /api/rooms` — crea una sala pública. Slug generado en backend desde `name` (nunca
  enviado por el cliente); `409 ROOM_SLUG_CONFLICT` ante colisión o slug reservado.
- `GET /api/rooms/:slug` — recupera una sala; `404` si no existe.

Ver [ADR-005](../adr/ADR-005-multi-room-chat.md) para el detalle de las decisiones.

## Estado del servidor

- **Presencia** (quién está conectado ahora, por sala): en memoria (`RoomPresenceState`), sin
  persistir `socket.id` ni estado online/offline — ver ADR-004/ADR-005. Consolidada por
  `guestUserId`: varias pestañas del mismo invitado cuentan como una sola presencia visible.
- **Mensajes y salas**: persistidos en PostgreSQL vía Prisma.
- **Identidad invitada** (`GuestUser`): persistida en PostgreSQL, sin autenticación real — ver
  ADR-004 para el detalle y las limitaciones aceptadas.

## Health checks

- `GET /health`: confirma que el proceso está vivo.
- `GET /ready`: confirma que la API puede conectarse a PostgreSQL (`SELECT 1`). `503` si no.

## Código compartido

`packages/shared` contiene:
- `events.ts`: tipos de eventos, payloads, acks, códigos de error, constantes de validación,
  `MessageHistoryResponse`.
- `validation.ts`: funciones puras de validación de nombre y texto de mensaje.

## Base de datos local (desarrollo)

PostgreSQL instalado como servicio de Windows, con autenticación `trust` para conexiones
locales (sin contraseña) — apropiado solo para una máquina de desarrollo de un único usuario.
Dos bases: `realtime_chat_dev` y `realtime_chat_test`. Ver README para el procedimiento completo.

## Infraestructura y despliegue (futuro, fuera de esta fase)

- **Ansible** (`infra/ansible`): aprovisionamiento de la VM Ubuntu y del clúster RKE2.
- **Kubernetes/Kustomize** (`infra/kubernetes`): manifiestos base + overlays por ambiente.
- **Ambientes**: `chat-dev`, `chat-uat`, `chat-prod` (ver [ADR-002](../adr/ADR-002-rke2-namespaces.md)).
- **Docker, GitHub Actions**: no implementados todavía.

## Fuera de alcance en esta fase

Autenticación real, eliminación/edición de salas, salas privadas, roles, membresías
persistentes, Docker, Kubernetes, pipelines CI/CD.
