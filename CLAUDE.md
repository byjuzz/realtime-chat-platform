# CLAUDE.md

Contexto para Claude Code al trabajar en este repositorio.

## Qué es este proyecto

Monorepo de una aplicación de chat en vivo, construida por fases controladas y explícitamente
aprobadas por el usuario. No asumas autorización para avanzar de fase: cada fase se planea y
se aprueba antes de tocar archivos.

## Reglas del proyecto (vigentes en todas las fases salvo que el usuario indique lo contrario)

1. Presentar el plan y esperar aprobación antes de modificar archivos.
2. No usar `sudo` ni instalar software de sistema sin permiso explícito.
3. No instalar RKE2, Docker ni PostgreSQL hasta que se autorice esa fase.
4. No borrar archivos ni recursos existentes.
5. No hacer push directo a `main` o `develop`; trabajar en ramas `chore/*`, `feat/*`, etc.
6. No usar `git push --force`.
7. No leer, generar ni manejar secretos/tokens/contraseñas reales; usar `.env.example` sin valores.
8. Confirmar antes de avanzar a la siguiente fase del roadmap.

## Stack

- Frontend: React + Vite + TypeScript (`apps/web`)
- API: Node.js + TypeScript + Express + Socket.IO (`apps/api`)
- Shared: `packages/shared`
- DB futura: PostgreSQL + Prisma
- Infra: Ansible (`infra/ansible`), Kubernetes/Kustomize (`infra/kubernetes`), RKE2
- Ambientes: `chat-dev`, `chat-uat`, `chat-prod`

## Entorno de despliegue

- Desarrollo: máquina Windows local (Node/npm disponibles).
- Despliegue: VM Ubuntu 24.04 (`devops-lab`) dentro de VirtualBox, accesible por SSH
  (puerto reenviado `localhost:2222`). RKE2 se instalará ahí en una fase futura.

## Convenciones

- Decisiones de arquitectura relevantes van como ADR en `docs/adr/`.
- No hay CI/CD definido todavía (pendiente de elegir proveedor Git/CI).
