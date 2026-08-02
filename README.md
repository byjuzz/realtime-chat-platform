# Realtime Chat Platform

Monorepo de una aplicación de sala de chat en vivo, construido de forma incremental por fases.

## Stack

- **Frontend**: React + Vite + TypeScript (`apps/web`)
- **API**: Node.js + TypeScript + Express + Socket.IO (`apps/api`)
- **Shared**: tipos y utilidades compartidas (`packages/shared`)
- **Base de datos**: PostgreSQL + Prisma (`apps/api/prisma`)
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

El proyecto se desarrolla por fases controladas. La **Fase 6** está completa: runtime
alineado a Node.js 24 LTS (6.0), Integración Continua con GitHub Actions (6.1), y
`develop` protegida mediante required status checks (6.2).

Fase actual: **Checkpoint 7.2A — bootstrap y roles de preparación (modo auditoría)**. El
controlador Ansible vive **dentro de `devops-lab`** (`ansible_connection: local`, decisión
definitiva — no se usa WSL), instalado y validado desde la Fase 7.1. Ya existen el bootstrap
(`infra/bootstrap/bootstrap-controller.sh`) y los playbooks/roles de preparación
(`prepare-server.yml`, `install-rke2.yml`, `validate-rke2.yml`, `site.yml`), pero **todos en
modo auditoría/preflight** — ningún cambio real al sistema operativo todavía.
**RKE2 sigue sin instalarse, Kubernetes no existe todavía, y GitHub Actions no tiene acceso a
la VM.** Próximo checkpoint: aplicar la preparación real del sistema operativo (7.2B/7.2C),
antes de instalar RKE2 (7.3).

Ver [ADR-008](docs/adr/ADR-008-infrastructure-as-code-with-ansible.md), el
[plan de arquitectura](docs/architecture/ansible-rke2-infrastructure-plan.md), la
[guía de RKE2 desde cero](docs/learning/rke2-from-zero.md), el
[runbook de auditoría](docs/runbooks/ubuntu-rke2-readiness-audit.md) y el
[runbook del Checkpoint 7.2A](docs/runbooks/phase-7-2-bootstrap-and-server-preparation.md).

La autenticación real, Kubernetes y el despliegue continuo todavía no se han implementado.

## Desarrollo local

Requisitos: Node.js **24.18.0 LTS** (runtime estándar del proyecto, ver `.nvmrc`), npm,
PostgreSQL local (ver abajo).

Verifica tu versión activa con:

```bash
node --version   # debe mostrar v24.18.0
```

Con un gestor de versiones funcional (`nvm`, `fnm`, etc.), usa `nvm use` / `fnm use` para
activar automáticamente la versión indicada en `.nvmrc`.

En algunos entornos Windows, la activación automática de fnm puede fallar por problemas al
resolver junctions. En ese caso puede utilizarse `fnm exec --using=24.18.0 -- <comando>`.
Esta limitación local no afecta Docker ni GitHub Actions.

Otras versiones de Node pueden permanecer instaladas en el sistema; no son el runtime
soportado del proyecto. Docker y la futura integración continua usan la misma línea
Node 24.18.0 (`node:24.18.0-alpine3.24`).

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

Copia `.env.example` a `apps/api/.env` (variables de la API/Prisma) y completa los valores
locales (nunca commitear `.env`). Ejemplo de `DATABASE_URL` (sin credenciales reales):
```
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/realtime_chat_dev
```

### PostgreSQL local (Windows, sin Docker)

1. Instalar PostgreSQL (ej. `winget install --id PostgreSQL.PostgreSQL.17`).
2. Crear las bases de desarrollo y pruebas:
   ```sql
   CREATE DATABASE realtime_chat_dev;
   CREATE DATABASE realtime_chat_test;
   ```
3. Aplicar migraciones y generar el cliente:
   ```bash
   npm run db:migrate:dev -w apps/api
   ```
4. Sembrar la sala general (idempotente, se puede correr varias veces):
   ```bash
   npm run db:seed -w apps/api
   ```

Otros comandos útiles (todos con `-w apps/api`): `db:generate`, `db:migrate:deploy`,
`db:studio` (solo desarrollo, nunca producción).

**Si una migración falla**: no ejecutar `prisma migrate reset` sin estar seguro de querer
borrar todos los datos locales. Revisar el error de `prisma migrate dev`, corregir el schema
o la migración generada, y volver a intentar. Ver [ADR-004](docs/adr/ADR-004-postgresql-prisma-persistence.md#riesgos-y-limitaciones)
para más contexto.

### Correr el chat localmente

En dos terminales separadas:

```bash
npm run dev -w apps/api    # API + Socket.IO en http://localhost:3000
npm run dev -w apps/web    # Frontend en http://localhost:5173
```

Abre `http://localhost:5173` en dos o más pestañas para probar el chat en tiempo real. Los
mensajes y las salas persisten en PostgreSQL — sobreviven a un reinicio de `apps/api`. La
presencia (quién está conectado ahora mismo) sigue en memoria, ver
[ADR-003](docs/adr/ADR-003-in-memory-state-mvp.md),
[ADR-004](docs/adr/ADR-004-postgresql-prisma-persistence.md) y
[ADR-005](docs/adr/ADR-005-multi-room-chat.md).

Usa el selector de salas (sidebar en desktop, drawer en móvil) para crear salas nuevas y
cambiar entre ellas. Cada sala tiene su propio historial y su propia lista de conectados.

> Nota de prueba manual: si abres varias pestañas del mismo navegador para simular usuarios
> distintos, ten en cuenta que `localStorage` se comparte por origen, no por pestaña — usa
> `localStorage.clear()` + recargar antes de unirte con un nombre distinto en cada pestaña,
> o usa ventanas de incógnito separadas.

### Pruebas de integración (requieren PostgreSQL local)

```bash
npm run test:integration -w apps/api
```

Corre contra `DATABASE_URL_TEST` (`realtime_chat_test`), separada de la base de desarrollo.

## Docker Compose (modo alternativo, no reemplaza el desarrollo local)

Levanta frontend + API + PostgreSQL contenerizados, con migraciones y seed automáticos:

```bash
cp .env.docker.example .env
docker compose build
docker compose up -d
```

Frontend en `http://localhost:8080` (o el `WEB_PORT` que definas), API en `http://localhost:3000`,
PostgreSQL publicado en `55432` (para no chocar con tu instalación local de la Fase 3).

Otros comandos:
```bash
docker compose ps
docker compose logs -f [servicio]
docker compose restart [servicio]
docker compose run --rm migrate    # correr migraciones/seed a demanda
docker compose down                # detiene contenedores, conserva el volumen
docker compose down -v             # BORRA el volumen — nunca sin confirmarlo explícitamente
```

Ver [ADR-006](docs/adr/ADR-006-containerization.md) para las decisiones de diseño.

## Integración Continua (CI)

Workflows en `.github/workflows/`:

- **`ci.yml`** ("CI"): se dispara en `push` y `pull_request` hacia `develop`/`main`, además de
  `workflow_dispatch` manual. Jobs:
  - `CI / Quality` — `npm ci`, lint, typecheck, pruebas unitarias, build.
  - `CI / Integration` — pruebas de integración de `apps/api` contra un PostgreSQL temporal
    del propio job.
  - `CI / Docker` — construye y levanta el `docker-compose.yml` real, valida healthchecks,
    endpoints REST y Socket.IO de extremo a extremo (a través de Nginx).
  - `CI / Required` — check final agregado: pasa solo si los tres anteriores terminan en
    `success`.
- **`dependency-review.yml`** ("Dependency Review"): en `pull_request` hacia `develop`/`main`,
  bloquea dependencias nuevas con severidad `high`/`critical`.

Mantenimiento automatizado (no es un check de CI): `.github/dependabot.yml` abre PRs semanales
de actualización de dependencias npm y de GitHub Actions.

Esta fase implementa **solo CI**. No existe todavía CD (entrega/despliegue continuo): ningún
workflow publica imágenes, hace push a un registro, ni toca `devops-lab`, Ansible, RKE2 ni
Kubernetes.

Detalle completo de diseño en [ADR-007](docs/adr/ADR-007-continuous-integration.md); guía de
diagnóstico de fallos en [docs/ci/troubleshooting.md](docs/ci/troubleshooting.md).

## Entornos

| Ambiente | Namespace K8s | Propósito |
|---|---|---|
| DEV  | `chat-dev`  | Desarrollo activo |
| UAT  | `chat-uat`  | Pruebas de aceptación |
| PROD | `chat-prod` | Producción |

Ver [docs/architecture/overview.md](docs/architecture/overview.md) para más detalle.
