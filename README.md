# Realtime Chat Platform

Monorepo de una aplicación de sala de chat en vivo, construido de forma incremental por fases.

## Stack

- **Frontend**: React + Vite + TypeScript (`apps/web`)
- **API**: Node.js + TypeScript + Express + Socket.IO (`apps/api`)
- **Shared**: tipos y utilidades compartidas (`packages/shared`)
- **Base de datos** (fase futura): PostgreSQL + Prisma
- **Infraestructura**: Ansible (`infra/ansible`), Kubernetes vía Kustomize (`infra/kubernetes`)
- **Orquestación**: RKE2, con namespaces `chat-dev`, `chat-uat`, `chat-prod`

## Estructura del repositorio

```
apps/web                          Frontend (React + Vite + TS)
apps/api                          API (Express + TS + Socket.IO)
packages/shared                   Código/tipos compartidos entre apps
infra/ansible                     Playbooks de aprovisionamiento (Ubuntu/RKE2)
infra/kubernetes/base             Manifiestos Kustomize base
infra/kubernetes/overlays/dev     Overlay ambiente DEV
infra/kubernetes/overlays/uat     Overlay ambiente UAT
infra/kubernetes/overlays/prod    Overlay ambiente PROD
docs/architecture                 Documentación de arquitectura
docs/adr                          Architecture Decision Records
docs/runbooks                     Guías operativas
docs/ci-cd                        Documentación de CI/CD (pendiente de definir)
scripts                           Scripts auxiliares
.claude                           Configuración de Claude Code para este repo
```

## Estado del proyecto

Este proyecto se desarrolla por fases controladas. Fase actual: **Fase 2 — MVP de chat en
tiempo real, local** (React + Socket.IO + Express, sin persistencia). Aún no se ha implementado
la base de datos, Docker, Kubernetes ni CI/CD.

## Desarrollo local

Requisitos: Node.js >= 20, npm.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

Copia `.env.example` a `.env` y completa los valores locales (nunca commitear `.env`).

### Correr el chat localmente

En dos terminales separadas:

```bash
npm run dev -w apps/api    # API + Socket.IO en http://localhost:3000
npm run dev -w apps/web    # Frontend en http://localhost:5173
```

Abre `http://localhost:5173` en dos o más pestañas del navegador para probar el chat en
tiempo real entre varios usuarios. El estado (usuarios y mensajes) vive en memoria del
proceso de `apps/api` — se pierde al reiniciarlo (ver
[ADR-003](docs/adr/ADR-003-in-memory-state-mvp.md)).

## Entornos

| Ambiente | Namespace K8s | Propósito |
|---|---|---|
| DEV  | `chat-dev`  | Desarrollo activo |
| UAT  | `chat-uat`  | Pruebas de aceptación |
| PROD | `chat-prod` | Producción |

Ver [docs/architecture/overview.md](docs/architecture/overview.md) para más detalle.
