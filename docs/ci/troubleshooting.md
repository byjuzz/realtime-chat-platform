# Troubleshooting de CI

Ver también: [ADR-007 — Integración Continua con GitHub Actions](../adr/ADR-007-continuous-integration.md).

## Política de fallos

- Un fallo real **bloquea**. No se usa `|| true` ni `continue-on-error` en ningún paso de
  validación de `ci.yml` — solo en pasos de diagnóstico explícitamente marcados con
  `if: failure()`, que nunca pueden convertir el job en éxito.
- Ante evidencia concreta de fallo transitorio (por ejemplo, un timeout de red puntual), se
  puede **repetir manualmente una sola vez** (`Re-run failed jobs` en GitHub, o
  `workflow_dispatch`).
- Si el fallo se repite al reintentar sin ningún cambio, **no** se vuelve a repetir en bucle:
  se registra como posible *test flaky* y se investiga la causa raíz.
- Nunca fusionar un PR basándose en reintentos repetidos sin entender por qué falló la
  primera vez.
- Corregir la causa raíz, no el síntoma.

## Tabla de fallos

| Fallo | Causas posibles | Qué hacer | Qué no hacer |
|---|---|---|---|
| `npm ci` falla | `package-lock.json` desincronizado del `package.json`; versión de Node incompatible con `engines`; caché de npm corrupta en el runner | Revisar el diff de `package.json`/`package-lock.json` del PR; correr `npm ci` localmente con Node 24.18.0 para reproducir | Usar `npm install` en su lugar; usar `--force` o `--legacy-peer-deps` |
| `lint` falla | Regla de ESLint/Oxlint real violada por el PR | Corregir el código señalado; correr `npm run lint` localmente | Deshabilitar la regla sin justificación; usar `continue-on-error` |
| `typecheck` falla | Error de tipos real introducido por el PR; desincronización con `packages/shared` sin reconstruir | Correr `npm run typecheck` localmente (ya incluye `build:shared` como `pretypecheck`) | Usar `// @ts-ignore` para silenciar sin entender el error |
| Pruebas unitarias fallan | Regresión real; test mal escrito; dependencia de orden entre tests | Reproducir con `npm run test` localmente; revisar si el test es determinista | Marcar el test como `skip`; repetir el job esperando que "pase solo" |
| Pruebas de integración fallan | Regresión real en repositorios/servicios que usan Prisma; migración desalineada con el código | Reproducir localmente con un Postgres temporal y `DATABASE_URL_TEST`; revisar el step de Prisma inmediatamente anterior | Apuntar el test a una base de datos local persistente; usar `prisma db push` en vez de `migrate deploy` |
| PostgreSQL (service container) unhealthy | Imagen `postgres:17-alpine` no arrancó a tiempo; puerto `5432` en conflicto en el runner (poco probable, runner efímero) | Revisar el diagnóstico automático (`docker ps`/`docker logs` del service container) en los pasos `if: failure()` del job Integration | Aumentar `retries`/`interval` indefinidamente sin investigar; ignorar el healthcheck |
| `Prisma generate` falla | `schema.prisma` con error de sintaxis; versión de `@prisma/client` desalineada con `prisma` CLI | Correr `npm run db:generate -w apps/api` localmente | Commitear un cliente Prisma generado manualmente al repo |
| `Prisma migrate deploy` falla | Migración con SQL inválido; migración fuera de orden; `DATABASE_URL` mal formada | Revisar el error de Prisma en el log (nunca imprime la cadena de conexión completa); validar la migración localmente contra un Postgres temporal | Usar `prisma migrate reset` o `db push` como atajo en CI |
| Seed no idempotente | El seed no usa `upsert` o depende de que la tabla esté vacía | Revisar `apps/api/prisma/seed.ts`; el seed debe poder correr más de una vez sin duplicar ni fallar | Envolver el seed en `try/catch` que ignore cualquier error |
| `build` falla | Error de TypeScript real; import roto entre workspaces; `packages/shared` no reconstruido antes | Correr `npm run build` localmente (incluye `prebuild`: `build:shared`) | Comitear artefactos de `dist/` para "saltarse" el build |
| `docker compose config --quiet` falla | YAML de `docker-compose.yml` inválido; variable referenciada sin default y sin `.env` | Correr `docker compose config` localmente (sin `--quiet`) para ver el error completo | Editar el `.env` de CI a mano en el runner para "hacerlo pasar" |
| Docker build falla | Error en algún `Dockerfile`; dependencia de build no disponible; contexto de build incorrecto | Reproducir con `docker compose build --no-cache <servicio>` localmente | Usar una imagen base distinta solo en CI |
| `migrate` termina con código distinto de 0 | Migración fallida contra el Postgres del stack Docker; seed fallido | Revisar el log de `migrate` en los artefactos de diagnóstico (`ci-artifacts/docker/migrate.log`) | Cambiar `restart: "no"` a `restart: always` para "reintentar" |
| `api` unhealthy | La API no llegó a escuchar en el puerto esperado; `DATABASE_URL` de Docker mal configurada; excepción no capturada en el arranque | Revisar `ci-artifacts/docker/api.log` | Extender el `start_period` del healthcheck indefinidamente sin investigar el log |
| `web` unhealthy | Build de Nginx roto; healthcheck apuntando a un host/puerto incorrecto dentro del contenedor (ver ADR-006 y el fix de healthcheck de la Fase 5) | Revisar `ci-artifacts/docker/web.log`; probar `docker compose exec web wget -qO- http://127.0.0.1/` | Quitar el healthcheck de `web` en vez de corregirlo |
| `/ready` falla | La API no completó su inicialización (p. ej. conexión a base de datos); el stack no terminó de arrancar en el orden esperado | Revisar el orden de arranque (`postgres` → `migrate` → `api` → `web`) y los logs de `api` | Saltarse la verificación de `/ready` con `|| true` |
| Socket.IO (smoke test) falla | Proxy de Nginx para `/socket.io/` mal configurado; CORS del lado de la API; timeout real de red; contrato de eventos cambiado en `packages/shared` sin actualizar el smoke test | Revisar la salida de `scripts/ci/socket-smoke.mjs` (indica el paso exacto donde falló); probar el mismo flujo manualmente contra el stack local | Aumentar los timeouts del script indefinidamente en vez de investigar; hacer que el script solo pruebe la API directa (dejaría de validar la ruta real vía Nginx) |
| Timeout de un job | Paso realmente colgado (p. ej. un `wait_for_healthy` que nunca converge); recurso externo lento; bucle de espera sin límite de intentos | Revisar en qué paso se agotó el `timeout-minutes`; confirmar que los bucles de espera tienen `max_attempts` finito | Subir el timeout del job indefinidamente sin diagnosticar la causa |
| Runner cancelado (`cancelled`) | `concurrency.cancel-in-progress` canceló la ejecución por un nuevo push al mismo PR; cancelación manual | Es el comportamiento esperado ante un nuevo commit; revisar la ejecución más reciente, no la cancelada | Interpretar `cancelled` como éxito en `CI / Required` (no lo hace: cuenta como fallo) |
| Caché de npm no ayuda / parece corrupta | Cambio en `package-lock.json` invalida la clave de caché (comportamiento esperado de `cache-dependency-path`); caché de una rama distinta | Es normal que la primera ejecución tras cambiar `package-lock.json` sea más lenta | Deshabilitar la caché en vez de entender por qué cambió la clave |
| Action no encontrada / SHA inválido | Un SHA fijado fue eliminado del historial del repositorio de la Action (muy raro); typo al fijar el SHA | Verificar el SHA contra el repositorio oficial de la Action (`gh api repos/<owner>/<action>/commits/<tag>`) | Volver a un tag flotante (`@v4`, `@main`) para "que funcione" |
| Action sin permisos | El workflow o el job pide un permiso que `permissions: contents: read` no otorga | Revisar si el permiso es realmente necesario para esta fase (no debería serlo: sin despliegue, sin escritura) | Subir los permisos globalmente a `write-all` para resolverlo rápido |
| Dependency Review bloquea el PR | El PR introduce una dependencia nueva con vulnerabilidad `high`/`critical` | Revisar el resumen que la Action publica en el PR; actualizar o reemplazar la dependencia introducida | Bajar `fail-on-severity` para que deje de bloquear; ignorar el hallazgo |
| Test flaky (pasa a veces, falla otras, sin cambios de código) | Dependencia de tiempo real en vez de tiempo simulado; orden de ejecución no determinista; recurso externo inestable | Reintentar manualmente una sola vez para confirmar el patrón; si se confirma, abrir un issue y corregir la causa (no el síntoma) | Marcar el test como `skip` permanentemente; agregar reintentos automáticos al test para "que pase" |
| Fallo transitorio de red (descarga de dependencias, pull de imagen base) | Problema momentáneo de la infraestructura de GitHub o del registro upstream | Reintentar manualmente una sola vez | Reintentar en bucle automatizado; asumir que siempre es red sin revisar el log |

## Diagnóstico disponible por job

- **CI / Integration**: al fallar, muestra `docker ps -a` filtrado por la imagen de Postgres
  y sus logs (sin imprimir `DATABASE_URL`).
- **CI / Docker**: al fallar, genera `ci-artifacts/docker/` con `docker compose ps -a`, logs
  de los cuatro servicios y un resumen de estado/healthcheck, subido como artefacto
  (`actions/upload-artifact`) con retención de 5 días. Nunca incluye `.env`, `node_modules`,
  volúmenes, bases de datos ni tokens.
- **CI / Required**: imprime explícitamente el resultado de los tres jobs de los que depende
  (`Quality: ...`, `Integration: ...`, `Docker: ...`) antes de fallar o pasar.
