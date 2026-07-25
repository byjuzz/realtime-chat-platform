# Troubleshooting de CI

Ver también: [ADR-007 — Integración Continua con GitHub Actions](../adr/ADR-007-continuous-integration.md).

## Política de fallos

- Un fallo real **bloquea**. No se usa `|| true` ni `continue-on-error` en pasos de
  validación.
- Ante evidencia concreta de fallo transitorio (timeout de red puntual), se puede repetir
  manualmente una sola vez.
- Si el fallo se repite al reintentar sin ningún cambio, se registra como posible *test
  flaky* y se investiga la causa raíz — no se vuelve a repetir en bucle.

## Tabla de fallos

| Fallo | Causas posibles | Qué hacer | Qué no hacer |
|---|---|---|---|
| `npm ci` falla | `package-lock.json` desincronizado; versión de Node incompatible con `engines` | Correr `npm ci` localmente con Node 24.18.0 para reproducir | Usar `npm install` en su lugar; usar `--force` |
| Typecheck falla por tipos de Prisma faltantes (`TS2339`, `Property ... does not exist on type 'typeof Prisma'`) | El cliente de Prisma no se generó antes del typecheck — `npm ci` moderno bloquea el postinstall automático de `@prisma/client` por seguridad (`allow-scripts`) | Confirmar que el step "Generar cliente de Prisma" corrió antes del typecheck en ese job | Comitear un cliente Prisma generado manualmente al repo |
| Lint/Unit tests/Build fallan | Regresión real de código | Reproducir localmente con `npm run lint`/`test`/`build` | Deshabilitar la regla o marcar el test como `skip` |
| `CI / Integration` — PostgreSQL nunca queda healthy | Problema del service container, poco común en un runner efímero | Revisar los pasos de diagnóstico automático de ese job (`docker ps`/`docker logs` filtrados por la imagen de Postgres) | Aumentar `retries` indefinidamente sin investigar |
| Pruebas de integración fallan | Regresión real en repositorios/servicios; migración desalineada con el código | Reproducir localmente con un Postgres temporal y `DATABASE_URL_TEST` | Apuntar el test a una base local persistente; usar `prisma db push` en vez de `migrate deploy` |
| `docker compose config` o `docker compose build` fallan | YAML inválido en `docker-compose.yml`; error en algún `Dockerfile` | Reproducir exactamente con `docker compose config` / `docker compose build --no-cache <servicio>` localmente | Editar el `.env` de CI a mano para "hacerlo pasar" |
| `wait-for-docker.sh` hace timeout en algún servicio | El servicio realmente no llegó a `healthy` (o `migrate` no terminó con código 0) a tiempo | Revisar `docker compose ps -a` (el propio script lo imprime al fallar); reproducir localmente con `bash scripts/ci/wait-for-docker.sh` | Subir `max_attempts` indefinidamente sin mirar la causa |
| `api`/`web` unhealthy | Excepción no capturada en el arranque; healthcheck mal apuntado dentro del contenedor (ver el fix de la Fase 5 sobre `localhost` vs `127.0.0.1`) | `docker compose logs api` / `docker compose logs web` localmente | Quitar el healthcheck en vez de corregirlo |
| Endpoints (`curl --fail`) fallan | El stack no terminó de arrancar en el orden esperado; Nginx mal configurado | Confirmar que "Esperar a que el stack esté saludable" pasó antes de este step | Saltarse la verificación con `|| true` |
| Smoke test de Socket.IO falla | Proxy de Nginx para `/socket.io/` mal configurado; CORS de la API; contrato de eventos cambiado en `packages/shared` sin actualizar el script | Correr `node scripts/ci/socket-smoke.mjs` contra el stack local (`SMOKE_BASE_URL=http://127.0.0.1:8080`) | Hacer que el script se conecte directo a la API (dejaría de validar la ruta real vía Nginx) |
| `CI / Required` falla aunque los tres jobs se ven en verde en la UI | Alguno de los tres terminó en `cancelled` o `skipped`, no `success` — la UI a veces no distingue esto a simple vista | Revisar el log del step "Evaluar resultados", imprime los tres resultados explícitamente | Interpretar `cancelled` como éxito |
| Runner cancelado (`cancelled`) | `concurrency.cancel-in-progress` canceló la ejecución por un nuevo push al mismo PR/rama — comportamiento esperado | Revisar la ejecución más reciente, no la cancelada | Nada — es el diseño, no un bug |
| Dependency Review bloquea el PR | El PR introduce una dependencia nueva con vulnerabilidad `high`/`critical` | Revisar el resumen que la Action publica en el PR; actualizar o reemplazar la dependencia | Bajar `fail-on-severity` para que deje de bloquear |
| Dependency Review falla con "Dependency review is not supported on this repository" | El Dependency Graph del repositorio no está habilitado/poblado (Settings → Security → Dependency graph) | Verificar en Insights → Dependency graph que aparezcan dependencias listadas; confirmar el estado del endpoint `GET /repos/{owner}/{repo}/dependency-graph/sbom` | Bajar la severidad o desactivar el workflow para "que pase" |
| Action no encontrada / SHA inválido | Typo al fijar el SHA; muy raro: el SHA fue eliminado del historial del repo de la Action | Verificar contra el repositorio oficial: `gh api repos/<owner>/<action>/commits/<tag>` | Volver a un tag flotante (`@v5`, `@main`) |

## Diagnóstico disponible por job

- **`CI / Integration`**: al fallar, muestra `docker ps -a` filtrado por la imagen de Postgres
  y sus logs — nunca imprime `DATABASE_URL`.
- **`CI / Docker`**: `docker compose ps -a` se imprime siempre como parte del flujo normal; el
  propio `scripts/ci/wait-for-docker.sh` imprime diagnóstico automáticamente si algún servicio
  hace timeout.
- **`CI / Required`**: imprime explícitamente `Quality: <resultado>`, `Integration: <resultado>`,
  `Docker: <resultado>` antes de pasar o fallar.
