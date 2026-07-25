# ADR-007: Integración Continua con GitHub Actions

## Estado

Aceptado. Los cinco checks corren en cada PR hacia `develop`/`main` y han sido observados en
ejecuciones reales.

## Contexto

Hasta la Fase 6.0, todas las validaciones (lint, typecheck, pruebas, build, stack Docker) se
ejecutaban manualmente. No existía ningún mecanismo automático que bloqueara la integración de
cambios defectuosos. La Fase 6.1 agrega Integración Continua (CI) con GitHub Actions —
deliberadamente **solo CI, no CD**: no hay ningún paso de despliegue.

## Decisión

Dos workflows en `.github/workflows/`:

- **`ci.yml`** ("CI"): validación funcional — `CI / Quality`, `CI / Integration`,
  `CI / Docker`, `CI / Required`.
- **`dependency-review.yml`** ("Dependency Review"): revisión de dependencias nuevas en PRs.

Más `.github/dependabot.yml`, mantenimiento automatizado (no es un check de CI).

### Triggers

`ci.yml`: `push` y `pull_request` hacia `develop` y `main` (`develop → main` también se hace
por PR, según la estrategia de ramas ya documentada), más `workflow_dispatch` para ejecución
manual. `dependency-review.yml`: solo `pull_request` — compara el diff de dependencias del PR
contra su base, no tiene sentido en un `push` directo.

### Concurrencia

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

Un nuevo push al mismo PR cancela la ejecución anterior de ese PR. PRs distintos, y pushes a
`develop` vs. `main`, tienen grupos distintos (no se cancelan entre sí). Comportamiento
verificado en vivo: un segundo push canceló efectivamente la ejecución en curso del primero
(`conclusion: cancelled`).

### Runtime y runner

Node.js vía `node-version-file: .nvmrc` en todos los jobs — la misma fuente de verdad que
Docker y el desarrollo local, sin duplicar el número de versión en el workflow.
`runs-on: ubuntu-24.04` explícito (nunca `ubuntu-latest`, que puede cambiar de versión
subyacente sin aviso), sin runners self-hosted.

### Permisos mínimos

```yaml
permissions:
  contents: read
```

A nivel de workflow completo, en ambos archivos. Ningún job escribe en el repositorio, hace
push, despliega, ni usa secretos reales. `actions/checkout` siempre con
`persist-credentials: false`.

### Actions fijadas por SHA completo

| Action | SHA | Versión |
|---|---|---|
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` | v7.0.0 |
| `actions/dependency-review-action` | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | v5.0.0 |

Un tag como `@v5` es un puntero que se puede reasignar a otro commit (incluso de forma
maliciosa si se compromete la cuenta del mantenedor); un SHA completo es inmutable.

## Jobs de `ci.yml`

### `CI / Quality`

`npm ci` → generar cliente de Prisma (necesario porque `@prisma/client` normalmente lo genera
solo vía su propio postinstall, que npm bloquea por seguridad — ver troubleshooting) → lint →
typecheck → unit tests → build. Usa los scripts ya existentes en `package.json`, sin inventar
comandos nuevos.

### `CI / Integration`

Service container `postgres:17-alpine` temporal, credenciales exclusivas de esa ejecución
(`ci_user`/`ci_password`/`realtime_chat_ci`) — no son secretos: no protegen ningún recurso
real y la base se destruye al terminar el job. `prisma migrate deploy` aplica las migraciones
reales, y luego corren las pruebas de integración de `apps/api` contra esa base. El schema de
Prisma lee `DATABASE_URL`; las pruebas de integración leen específicamente
`DATABASE_URL_TEST` (ver `apps/api/vitest.integration.config.ts`) — ambas variables se fijan
al mismo valor en este job.

### `CI / Docker`

Construye y levanta el `docker-compose.yml` real del proyecto (no una versión paralela
simplificada), con un `.env` temporal generado dentro del propio job con valores ficticios
(nunca se copia el `.env` de un desarrollador). El orden de arranque
(`postgres` healthy → `migrate` termina con código 0 → `api`/`web` healthy) se espera con un
script de reintentos con timeout finito, extraído a `scripts/ci/wait-for-docker.sh` para
mantener el workflow legible y poder probarlo localmente sin pasar por GitHub.

Verifica la versión real de Node dentro de `api` (`docker compose exec -T api node --version`
→ `v24.18.0`), los endpoints REST vía Nginx con `curl --fail --show-error --max-time 10`, y la
comunicación Socket.IO de extremo a extremo con `scripts/ci/socket-smoke.mjs`.

#### Smoke test de Socket.IO

Se conecta a `http://127.0.0.1:8080` (Nginx), **no** directo a la API — la misma ruta que usa
un navegador real: cliente → Nginx → Socket.IO → API. Prueba directo contra la API dejaría de
validar que el proxy de Nginx esté correctamente configurado para WebSocket. Usa
`socket.io-client`, ya presente en el monorepo (no se agrega ninguna dependencia nueva), y los
eventos reales de `packages/shared/src/events.ts` (`room:join`, `message:send`,
`message:new`). Dos clientes con identidades distintas, timeouts finitos en cada espera
(conexión, acks, eventos), identificadores aleatorios por corrida (no depende de ejecuciones
anteriores), y cierra ambas conexiones siempre, éxito o fallo.

Cleanup con `docker compose down -v --remove-orphans` (`if: always()`) — seguro únicamente
porque el runner es efímero; **nunca** ejecutar ese comando contra un stack de desarrollo
local, UAT o producción, donde destruiría datos reales.

### `CI / Required`

Depende de `quality`, `integration` y `docker` (`needs:`), con `if: always()` para que corra
incluso si alguna dependencia falla o se cancela (sin `if: always()`, GitHub saltaría este job
en vez de dejarlo dar la cara con un fallo explícito). Solo pasa cuando los tres resultados son
exactamente `success`; cualquier `failure`, `cancelled` o `skipped` lo hace fallar. Candidato a
required check en un futuro ruleset — todavía no configurado.

## Enforcement: ruleset `Require CI checks - develop` (Fase 6.2)

Ruleset de rama independiente (no modifica el `protect-develop` preexistente), target
`refs/heads/develop`, `enforcement: active`, `bypass_actors` vacío — nadie puede saltarse la
regla, ni siquiera administradores. Regla `required_status_checks`, con:

- Checks exigidos: `CI / Required` y `CI / Dependency Review` (fuente fijada explícitamente a
  la app "GitHub Actions" vía `integration_id`, no "any source").
- `strict_required_status_checks_policy: true` — el PR debe evaluarse contra la versión
  actual de `develop` (equivalente a "Require branches to be up to date before merging").

No incluye required reviews, merge queue, signed commits, code scanning ni restricciones de
rutas/nombres — esas responsabilidades quedan fuera de alcance de este ruleset a propósito.

**Validado con una prueba controlada real** (no solo configurado, sino comprobado en vivo):
un PR con un fallo unitario intencional en `apps/api` hizo fallar `CI / Quality`; `CI / Required`
propagó ese fallo correctamente (`needs.quality.result == failure`); GitHub marcó el PR como
`mergeStateStatus: BLOCKED` citando exactamente la regla `required_status_checks` de este
ruleset. Tras retirar el fallo y quedar los cinco checks en verde, el bloqueo desapareció sin
necesidad de bypass.

**`main` queda deliberadamente fuera de alcance**: todavía no contiene los workflows de CI
(`ci.yml`, `dependency-review.yml`), así que exigir esos checks ahí no tendría sentido — se
protegerá con su propio ruleset después de promover la CI a `main`.

## `Dependency Review` vs. otras herramientas

- **Dependency Review**: compara las dependencias de un PR contra su base, bloquea si
  introduce algo nuevo con severidad `high`/`critical` (`fail-on-severity: high`).
- **Dependabot** (`.github/dependabot.yml`): automatización de mantenimiento, no un gate.
  PRs semanales para `npm` (raíz del monorepo, agrupando actualizaciones `patch`/`minor` en un
  solo PR; `major` nunca se agrupa, por el riesgo de cambios incompatibles) y para
  `github-actions` (detecta cuando una Action fijada por SHA tiene una versión nueva).
- **`npm audit`**: deliberadamente no se usa como gate de CI — mezclaría vulnerabilidades
  preexistentes del repo con lo que un PR específico introduce.
- Fuera de alcance de esta fase: CodeQL, escaneo de imágenes Docker, política de licencias.

## Consecuencias

- Todo PR hacia `develop`/`main` ejecuta automáticamente los cinco checks.
- Push repetidos al mismo PR no desperdician minutos de CI en ejecuciones obsoletas.
- Ningún paso de CI puede escribir en el repositorio, desplegar, ni acceder a secretos reales.

## Limitaciones

- `main` todavía sin required status checks (ver sección de enforcement arriba — pendiente
  hasta promover la CI a `main`).
- Sin cobertura de pruebas obligatoria.
- El smoke test de Socket.IO valida un único room (`general`); no valida aislamiento cruzado
  entre dos salas distintas.
- `dependency-review.yml` no tiene `concurrency:` propio (solo `ci.yml` lo tiene).

## Diferencia CI/CD

Esta fase implementa **solo CI**. No publica imágenes, no hace push a ningún registro
(GHCR, Docker Hub), no toca `devops-lab`, Ansible, RKE2 ni Kubernetes. `main` recibe la misma
validación que `develop`, pero eso no lo convierte en un entorno de producción real — eso
requiere un pipeline de CD separado, todavía sin construir.

## Decisiones futuras

- Configurar un ruleset equivalente para `main`, una vez que `main` contenga los workflows de
  CI (`ci.yml`, `dependency-review.yml`, scripts y documentación asociada).
- Evaluar `concurrency:` también en `dependency-review.yml`.
- Evaluar CodeQL y escaneo de imágenes como jobs adicionales.
- Diseñar CD como fase separada, después de que Ubuntu/RKE2/Kubernetes estén implementados.
