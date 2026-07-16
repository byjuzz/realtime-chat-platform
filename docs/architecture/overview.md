# Arquitectura — Visión general

> Estado: Fase 3 (persistencia con PostgreSQL + Prisma). Los componentes marcados como futuros
> aún no están implementados.

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
                    │   RoomState (presencia,  │
                    │     en memoria)            │
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
| `user:join` | cliente → servidor | `JoinAck` (éxito con `PublicUser`, o error tipado) |
| `message:send` | cliente → servidor | `MessageAck` (éxito con `ChatMessage`, o error tipado) |
| `user:joined` | servidor → todos | — |
| `user:left` | servidor → todos | — |
| `user:list` | servidor → todos | — (se reemite completa tras cada entrada/salida) |

`connect_error` es un evento **nativo** del cliente de Socket.IO (no forma parte de
`ServerToClientEvents`).

**Identidad**: `PublicUser.id` es el `socket.id` (presencia, por conexión). `PublicUser.guestUserId`
es el `GuestUser.id` persistente (ver [ADR-004](../adr/ADR-004-postgresql-prisma-persistence.md)).
`ChatMessage.authorId` referencia el `guestUserId`, no el `socket.id`.

Reglas de negocio en `apps/api/src/socket.ts`:

- Un socket no puede enviar `message:send` hasta completar `user:join` con éxito.
- Un socket no puede ejecutar `user:join` dos veces (`ALREADY_JOINED`).
- Validación de nombre y mensaje según `VALIDATION` en `packages/shared`.
- Límite de frecuencia de mensajes por socket (rate limiting, en memoria).
- **`message:new` solo se emite si el mensaje se persistió correctamente en PostgreSQL.** Si la
  escritura falla, se responde `MESSAGE_PERSISTENCE_FAILED` y no se emite nada.
- Al desconectarse: se limpia el usuario de `RoomState` (presencia), se notifica `user:left` +
  `user:list` actualizado. Esto **no** borra al `GuestUser` de la base — su historial persiste.

## Historial de mensajes (REST)

`GET /api/rooms/:roomSlug/messages?limit=&cursor=` — paginación por cursor
(`createdAt + id`, no offset), mensajes en orden cronológico ascendente en la respuesta.
`404` si la sala no existe; `400` si `limit`/`cursor` son inválidos. Ver
`packages/shared/src/events.ts` → `MessageHistoryResponse`.

## Estado del servidor

- **Presencia** (quién está conectado ahora): en memoria (`RoomState`), sin persistir
  `socket.id` ni estado online/offline — ver ADR-004.
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

Autenticación real, múltiples salas (el modelo lo soporta, no hay UI), Docker, Kubernetes,
pipelines CI/CD.
