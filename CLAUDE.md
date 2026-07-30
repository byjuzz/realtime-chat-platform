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

## Runtime Node.js

- Runtime estándar del proyecto: **Node.js 24.18.0 LTS** (fijado en `.nvmrc` y en
  `engines.node` de `package.json`: `>=24.18.0 <25`).
- Docker (`node:24.18.0-alpine3.24`) y la futura CI usan la misma línea Node 24.18.0.
- Verificación: `node --version` debe mostrar `v24.18.0`.
- Con un gestor de versiones funcional, `nvm use` / `fnm use` activan `.nvmrc` automáticamente.
- En algunos entornos Windows, la activación automática de fnm puede fallar por problemas al
  resolver junctions. En ese caso puede utilizarse `fnm exec --using=24.18.0 -- <comando>`.
  Esta limitación local no afecta Docker ni GitHub Actions.
- Otras versiones de Node pueden permanecer instaladas globalmente en la máquina; no son el
  runtime soportado del proyecto.

## Entorno de despliegue

- Desarrollo: máquina Windows local (Node/npm disponibles).
- Despliegue: VM Ubuntu 24.04 (`devops-lab`) dentro de VirtualBox, accesible por SSH
  (puerto reenviado `localhost:2222`). RKE2 se instalará ahí en una fase futura.

## Integración Continua (CI)

- Workflows en `.github/workflows/`: `ci.yml` (jobs `CI / Quality`, `CI / Integration`,
  `CI / Docker`, `CI / Required`) y `dependency-review.yml` (`CI / Dependency Review`).
- Triggers: `push`/`pull_request` hacia `develop`/`main`, más `workflow_dispatch` manual.
  `dependency-review.yml` solo en `pull_request`.
- `concurrency:` en `ci.yml` cancela ejecuciones obsoletas del mismo PR/rama.
- `CI / Required` (agrega Quality+Integration+Docker) y `CI / Dependency Review` son
  **required status checks obligatorios en `develop`**, vía el ruleset
  `Require CI checks - develop` (Fase 6.2) — sin bypass, sin excepciones. `main` todavía no
  tiene este ruleset (no tiene los workflows de CI todavía).
- `.github/dependabot.yml`: mantenimiento automatizado semanal (npm y GitHub Actions), no es
  un check de CI.
- Solo **CI**, sin CD: ningún workflow publica imágenes, hace push a un registro, ni toca
  `devops-lab`/Ansible/RKE2/Kubernetes.
- Detalle de diseño: [ADR-007](docs/adr/ADR-007-continuous-integration.md). Diagnóstico de
  fallos: [docs/ci/troubleshooting.md](docs/ci/troubleshooting.md).

## Infraestructura como código (Ansible / RKE2)

- Estado: **diseño únicamente (Fase 7.0)**. Ansible no está instalado (ni en un controlador
  ni en `devops-lab`), RKE2 no está instalado, Kubernetes no existe todavía, y GitHub Actions
  no tiene acceso a `devops-lab`.
- `devops-lab` fue auditada de forma no destructiva (solo comandos de lectura por SSH) —
  resultado: LISTO CON RIESGOS. Ver
  [runbook de auditoría](docs/runbooks/ubuntu-rke2-readiness-audit.md) para el detalle
  completo y un checklist general reutilizable.
- Decisión y versiones propuestas: [ADR-008](docs/adr/ADR-008-infrastructure-as-code-with-ansible.md).
  Arquitectura y separación de responsabilidades:
  [plan de infraestructura](docs/architecture/ansible-rke2-infrastructure-plan.md).
- Separación estricta: Ansible administra el sistema operativo y la instalación de RKE2;
  Kubernetes administra los workloads. Ninguna herramienta invade el territorio de la otra.
- Próxima fase: 7.1, preparación del controlador Ansible (WSL con distro de propósito
  general — hoy solo existe la distro interna `docker-desktop`, no utilizable como
  controlador).

## Convenciones

- Decisiones de arquitectura relevantes van como ADR en `docs/adr/`.

## Estrategia de ramas

- `feature/*` (`feat/*`, `chore/*`, etc.) → `develop`: **squash merge**. El historial detallado
  de commits de una feature no necesita preservarse en `develop`.
- `develop` → `main`: **merge commit** (nunca squash). Esto mantiene a `main` como ancestro real
  de `develop`, para que futuros PRs `develop → main` solo muestren cambios nuevos.
- Si alguna vez se fusiona `develop → main` mediante squash por excepción, `main` debe
  resincronizarse hacia `develop` inmediatamente después con un merge commit real
  (`git merge --no-ff origin/main` en una rama `chore/sync-*`), para reconectar los historiales
  sin reescribir commits ni usar `--force`.
