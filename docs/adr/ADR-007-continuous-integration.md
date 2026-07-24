# ADR-007: Integración Continua con GitHub Actions

## Estado

Propuesto (Fase 6.1) — pendiente de primera ejecución observada en GitHub y aprobación
para configurar required checks.

## Contexto

Hasta la Fase 6.0, todas las validaciones (lint, typecheck, pruebas, build, stack Docker)
se ejecutaban manualmente y de forma local. No existía ningún mecanismo automático que
bloqueara la integración de cambios defectuosos en `develop` o `main`. La Fase 6.1 agrega
un sistema de Integración Continua (CI) reproducible, con privilegios mínimos y sin ningún
paso de despliegue.

## Decisión

**GitHub Actions**, con dos workflows:

- `.github/workflows/ci.yml` — validación funcional (calidad, integración, Docker).
- `.github/workflows/dependency-review.yml` — revisión de dependencias nuevas en PRs.

### Triggers

`ci.yml` se dispara con:

- `pull_request` hacia `develop` y `main` (incluye `ready_for_review`, para que los PR en
  borrador también ejecuten CI y el comportamiento sea predecible antes de marcarlos listos).
- `push` a `develop` y `main`.
- `workflow_dispatch`, para ejecución manual.

No se usan `pull_request_target`, `repository_dispatch`, `workflow_run` ni `schedule` en
esta fase — el primero en particular expondría el `GITHUB_TOKEN` con permisos del
repositorio base al código de un PR externo, algo explícitamente fuera de alcance.

`dependency-review.yml` solo se dispara con `pull_request` (no tiene sentido en `push`: la
Action compara el diff de dependencias de un PR contra su base).

### Concurrencia

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

Un nuevo commit al mismo PR cancela la ejecución anterior de ese PR (agrupados por número
de PR). PRs distintos tienen grupos distintos y corren en paralelo. `push` a `develop` y
`push` a `main` también tienen grupos distintos entre sí (agrupados por `github.ref`, que
difiere entre ramas), así que un push a una rama nunca cancela la ejecución de la otra.

### Runtime: Node.js 24.18.0

Todos los jobs usan `actions/setup-node` con `node-version-file: .nvmrc`, la misma fuente de
verdad que Docker y el desarrollo local (ver [ADR anterior de alineación de runtime]). No se
fija la versión de Node de forma independiente en el workflow.

### Runner: `ubuntu-24.04`

Se usa explícitamente `ubuntu-24.04`, nunca `ubuntu-latest`:

- **Reproducibilidad**: `ubuntu-latest` cambia de versión subyacente sin previo aviso; fijar
  la versión evita que la CI se rompa por un cambio de imagen fuera de nuestro control.
- **Runner limpio y aislado**: cada ejecución arranca en una VM efímera administrada por
  GitHub, sin estado de ejecuciones anteriores.
- **Separación CI / infraestructura de despliegue**: la CI corre exclusivamente en runners
  de GitHub. Un PR nunca ejecuta código sobre `devops-lab` (la VM de despliegue) ni sobre la
  futura VM de Kubernetes — no hay `self-hosted` runners en esta fase, ni se prevé que la CI
  y el servidor de despliegue compartan recursos.

### Permisos mínimos

```yaml
permissions:
  contents: read
```

A nivel de workflow completo, en ambos archivos. Ningún job solicita permisos de escritura:
no hay commits desde CI, no hay push desde CI, no hay despliegue, no hay acceso SSH a
`devops-lab`, no se usan secretos reales ni tokens personalizados, y no se usa
`pull_request_target` (que expondría permisos elevados a código no confiable de un fork).
`actions/checkout` se ejecuta siempre con `persist-credentials: false`.

### Actions fijadas por SHA completo

Todas las Actions usadas están fijadas a su SHA completo de commit (no a un tag mutable),
con la versión humana en un comentario, verificadas contra el repositorio oficial de cada
Action en el momento de escribir este ADR:

| Action | SHA | Versión |
|---|---|---|
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` | v7.0.0 |
| `actions/upload-artifact` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | v7.0.1 |
| `actions/dependency-review-action` | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | v5.0.0 |

Un tag como `@v4` puede repuntar a un commit distinto en el futuro (incluso de forma
maliciosa si la cuenta del mantenedor se ve comprometida); un SHA completo es inmutable.

## Jobs de `ci.yml`

### `CI / Quality`

`npm ci` → `npm run lint` → `npm run typecheck` → `npm run test` → `npm run build`. Usa los
scripts ya existentes en `package.json` raíz (que a su vez delegan a cada workspace vía
`--workspaces --if-present`); no se inventa ningún script nuevo. `npm run test` excluye las
pruebas de integración (ver `apps/api/package.json`: `test` usa
`--exclude "**/*.integration.test.ts"`), así que Quality e Integration no se solapan.

### `CI / Integration`

Usa un **service container** `postgres:17-alpine` temporal del propio job (no el
`docker-compose.yml` del proyecto), con credenciales ficticias exclusivas de esa ejecución
(`ci_user` / `ci_password` / `realtime_chat_ci`), expuesto solo dentro del runner en
`5432:5432`. Estas credenciales no son secretos: no protegen ningún recurso real y la base
se destruye al terminar el job.

Pasos: `prisma generate` → `prisma migrate deploy` → `npm run test:integration -w apps/api`.
Las pruebas de integración leen `DATABASE_URL_TEST` (ver `apps/api/vitest.integration.config.ts`),
distinto de `DATABASE_URL` que usa el schema de Prisma para generar/migrar — el job fija
ambas variables al mismo valor, apuntando al Postgres temporal del service container.

El seed **no** se ejecuta en este job: su idempotencia se valida en `CI / Docker`, donde ya
existe el servicio `migrate` real del stack (`prisma migrate deploy && seed`).

### `CI / Docker`

Valida el `docker-compose.yml` real del proyecto, no una reconstrucción paralela. Usa
`COMPOSE_PROJECT_NAME=realtime-chat-ci-${{ github.run_id }}-${{ github.run_attempt }}` para
aislar cada ejecución (recursos, red y volúmenes exclusivos de esa ejecución) y evitar
colisión entre ejecuciones concurrentes en distintos runners.

Un `.env` temporal se genera en el propio job a partir de valores ficticios equivalentes a
`.env.docker.example` — nunca se copia el `.env` local de ningún desarrollador, nunca se
imprime su contenido, y se elimina siempre al final del job.

Orden de arranque esperado: `postgres` healthy → `migrate` termina con código 0 → `api`
healthy → `web` healthy — verificado con un bucle de reintentos con máximo de intentos y
pausa corta (nunca una espera indefinida ni un único `sleep` fijo como mecanismo de espera).

Se verifica la versión real de Node dentro del contenedor `api`
(`docker compose exec -T api node --version` → `v24.18.0`), los endpoints REST expuestos por
Nginx (`/`, `/health`, `/ready`, `/api/rooms`) con `curl --fail --show-error` y timeout
explícito, y la comunicación Socket.IO de extremo a extremo con
`scripts/ci/socket-smoke.mjs`.

#### Smoke test de Socket.IO

El script se conecta a `http://127.0.0.1:8080` (Nginx), **no** directamente al puerto de la
API — la misma ruta que usa un navegador real: cliente → Nginx → upgrade/polling Socket.IO →
API. Usa `socket.io-client`, ya presente como dependencia del monorepo (no se agrega ninguna
dependencia nueva), y los eventos/payloads reales definidos en
`packages/shared/src/events.ts` (`room:join`, `room:joined`, `message:send`, `message:new`),
sin inventar nombres de evento.

Verifica: conexión de dos clientes independientes con identidades (`guestUserId`) distintas,
entrada a una sala, recepción de presencia (`room:joined`) del segundo cliente en el primero,
envío y recepción de un mensaje entre ambos, y que el mensaje recibido lleve el `roomId`
esperado (verificación básica de que el mensaje viaja acotado a la sala, dado que el proyecto
actualmente solo siembra la sala `general` por defecto — una verificación de aislamiento
cruzado entre dos salas distintas requeriría crear una segunda sala vía REST y queda fuera
del alcance mínimo de este smoke test). Todas las esperas (conexión, acks, eventos) tienen
timeout finito; los sockets se desconectan siempre, en éxito o en fallo; no depende de
mensajes o estado de ejecuciones anteriores (usa identificadores aleatorios por corrida); no
imprime ni requiere ningún secreto.

#### Idempotencia de `migrate`/seed

`docker compose run --rm migrate` se ejecuta una segunda vez sobre el stack ya migrado y
sembrado. Debe terminar con código 0, demostrando que no quedan migraciones pendientes
problemáticas y que el seed (`prisma.room.upsert` sobre el slug `general`) puede correr más
de una vez sin generar duplicados ni destruir datos.

#### Diagnóstico y artefactos

Si el job `docker` falla, pasos con `if: failure()` capturan `docker compose ps -a`, los
logs de los cuatro servicios (`--no-color`) y un resumen de estado/healthcheck (sin imprimir
variables de entorno) en `ci-artifacts/docker/`, subidos con `actions/upload-artifact`
**solo cuando el job falla**, con retención de 5 días. Nunca se sube `.env`, `node_modules`,
volúmenes, bases de datos, tokens ni imágenes Docker completas.

#### Cleanup

`docker compose down -v --remove-orphans` corre siempre (`if: always()`), seguido de borrar
el `.env` temporal. Este uso de `down -v` es seguro **únicamente** porque el runner es
efímero y `COMPOSE_PROJECT_NAME` es exclusivo de la ejecución — los volúmenes pertenecen solo
a ese job. Este comando **no debe copiarse** para ejecutarlo contra un stack de desarrollo
local, UAT o producción, donde destruiría datos reales.

### `CI / Required`

Job de agregación (`if: always()`) que depende de `quality`, `integration` y `docker`, y solo
tiene éxito cuando los tres resultados son exactamente `success`. Cualquier `failure`,
`cancelled` o `skipped` en alguno de los tres hace fallar `CI / Required` explícitamente
(un script de shell compara `needs.*.result` contra `success`, sin usar `continue-on-error`
ni convertir cancelaciones en éxito). Es el check estable candidato a configurarse como
required en un futuro ruleset — no se configura todavía en esta fase.

## `Dependency Review` vs. otras herramientas

- **Dependency Review** (`actions/dependency-review-action`, esta fase): compara el manifiesto
  de dependencias de un PR contra su base y bloquea si introduce una dependencia **nueva**
  con severidad `high` o `critical`. Solo mira el diff del PR, no el estado histórico del
  repositorio.
- **Dependabot** (`.github/dependabot.yml`, esta fase): automatización de mantenimiento, no
  un gate de CI. Abre PRs semanales para actualizar dependencias de `npm` (agrupando patch y
  minor, sin agrupar major automáticamente) y de GitHub Actions.
- **`npm audit`**: escanea todo `package-lock.json` en un punto en el tiempo, incluyendo
  vulnerabilidades preexistentes que el PR no introdujo. Deliberadamente **no** se usa como
  gate de CI en esta fase — mezclaría "el PR introdujo un problema" con "el repositorio ya
  tenía un problema", y bloquear PRs no relacionados por deuda preexistente no es el objetivo
  de esta fase.
- **CodeQL / Trivy / SonarQube**: análisis estático de código/imágenes — explícitamente fuera
  de alcance de la Fase 6.1 (ver más abajo).
- **Secret scanning**: función nativa de GitHub a nivel de repositorio, independiente de estos
  workflows; no se configura ni se modifica en esta fase.

## Consecuencias

- Todo PR hacia `develop`/`main` (incluidos borradores) ejecuta automáticamente Quality,
  Integration, Docker y Dependency Review.
- Ningún paso de CI puede escribir en el repositorio, desplegar, ni acceder a secretos reales.
- El feedback de un fallo real es inmediato: ningún paso usa `|| true` ni
  `continue-on-error` para enmascarar errores.
- La validación del stack Docker completo (incluyendo Socket.IO de extremo a extremo) corre
  en cada PR, no solo localmente antes de un commit.

## Limitaciones

- Esta fase **no** configura required status checks ni modifica rulesets de rama — se hará en
  una fase posterior, después de observar ejecuciones reales estables.
- No hay cobertura de pruebas obligatoria (`coverage` gate) todavía.
- `npm audit` no es un gate; solo Dependency Review bloquea dependencias nuevas de alta
  severidad.
- El smoke test de Socket.IO valida un único room (`general`); no valida aislamiento cruzado
  entre dos salas distintas.
- Sin CodeQL, sin escaneo de imágenes Docker (Trivy u otro), sin política de licencias.

## Diferencia CI/CD

Esta fase implementa **solo CI** (Integración Continua): valida que cada cambio compila,
pasa pruebas y funciona en un stack Docker efímero. **No** implementa CD (Entrega/Despliegue
Continuo): no publica imágenes, no hace push a ningún registro (GHCR, Docker Hub), no toca
`devops-lab`, no usa SSH, Ansible, RKE2 ni Kubernetes. Esos elementos permanecen fuera de
alcance hasta que la CI esté validada como estable.

## Decisiones futuras

- Fijar Actions por SHA con una política de actualización explícita (posiblemente vía
  Dependabot, que ya está configurado para `github-actions`).
- Evaluar required status checks y un ruleset de rama sobre `CI / Required`, después de
  observar ejecuciones reales.
- Evaluar CodeQL, escaneo de imágenes y política de licencias como jobs adicionales.
- Evaluar actualizaciones Docker en Dependabot junto con una estrategia de imágenes y
  digests (fuera de alcance de esta fase, ver `.github/dependabot.yml`).
- Diseñar CD como fase separada, después de que Ubuntu/RKE2/Kubernetes estén implementados.
