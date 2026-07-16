# Arquitectura — Visión general

> Estado: Fase 2 (MVP de chat en tiempo real, local). Los componentes marcados como futuros
> aún no están implementados.

## Componentes

```
                    ┌─────────────────────┐
                    │   apps/web            │
                    │   React + Vite + TS    │
                    │   Socket.IO client       │
                    └──────────┬───────────┘
                               │ WebSocket (Socket.IO)
                               ▼
                    ┌─────────────────────┐
                    │   apps/api            │
                    │   Express + TS        │
                    │   Socket.IO server      │
                    │   RoomState (memoria)    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  PostgreSQL (futuro)  │
                    │  + Prisma              │
                    └─────────────────────┘
```

`apps/web` corre en `http://localhost:5173` (servido por Vite) y se conecta por WebSocket
a `apps/api` en `http://localhost:3000`, donde vive el servidor de Socket.IO.

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
`ServerToClientEvents`, ver `packages/shared/src/events.ts`).

Reglas de negocio aplicadas en el servidor (`apps/api/src/socket.ts`):

- Un socket no puede enviar `message:send` hasta completar `user:join` con éxito.
- Un socket no puede ejecutar `user:join` dos veces (segunda vez → error `ALREADY_JOINED`).
- Validación de nombre y mensaje (longitud, trim) según `VALIDATION` en `packages/shared`.
- Límite básico de frecuencia de mensajes por socket (rate limiting en memoria).
- Al desconectarse, se limpia el usuario, su estado de rate limiting, y se notifica
  `user:left` + `user:list` actualizado a los demás.

## Estado del servidor

En memoria del proceso (`RoomState`), **sin persistencia** — ver
[ADR-003](../adr/ADR-003-in-memory-state-mvp.md) para el detalle y las limitaciones aceptadas
(sin escalado horizontal, nombres duplicados permitidos).

## Código compartido

`packages/shared` contiene:
- `events.ts`: tipos de eventos, payloads, acks, códigos de error, constantes de validación.
- `validation.ts`: funciones puras de validación de nombre y texto de mensaje, reutilizadas
  por el servidor (y disponibles para el cliente si se necesita validación optimista).

## Infraestructura y despliegue (futuro, fuera de esta fase)

- **Ansible** (`infra/ansible`): aprovisionamiento de la VM Ubuntu y del clúster RKE2.
- **Kubernetes/Kustomize** (`infra/kubernetes`): manifiestos base + overlays por ambiente.
- **Ambientes**: `chat-dev`, `chat-uat`, `chat-prod`, como namespaces separados en el mismo
  clúster RKE2 (ver [ADR-002](../adr/ADR-002-rke2-namespaces.md)).
- **Docker, PostgreSQL, Prisma, GitHub Actions**: no implementados todavía.

## Fuera de alcance en esta fase

Persistencia de mensajes, autenticación real, múltiples salas, Docker, Kubernetes,
pipelines CI/CD.
