# ADR-006: Contenerización con Docker Compose

## Estado

Aceptado

## Contexto

Hasta la Fase 4, el sistema solo corría con Node/npm y PostgreSQL instalados directamente en
Windows. La Fase 5 agrega una forma reproducible de correr el sistema completo (frontend, API,
PostgreSQL) con Docker Compose, sin reemplazar el flujo de desarrollo local existente.

## Decisiones

**Dockerfiles multi-stage**, contexto de build = raíz del monorepo (no `apps/api`/`apps/web`
individualmente), porque ambos dependen de `packages/shared` vía npm workspaces.

**Nginx como servidor del frontend compilado**, no un servidor Node ad-hoc: sirve los estáticos
de Vite y actúa como proxy reverso hacia la API para `/api/*`, `/health`, `/ready` y
`/socket.io/*` (con soporte explícito de upgrade a WebSocket). Esto deja disponible una ruta de
mismo origen para evitar CORS.

**`VITE_API_URL`/`VITE_SOCKET_URL` del build de Docker apuntan a `http://localhost:3000`** (el
puerto de la API publicado directamente al host), igual que en desarrollo local — **no** a rutas
relativas vacías. Se decidió así para no modificar el código del frontend en esta fase (los
helpers `lib/rooms.ts`/`useChatSocket.ts` ya usan ese valor como fallback) y evitar el riesgo de
un comportamiento no verificado de `socket.io-client` con una URI vacía. La ruta de proxy de
Nginx (`/socket.io/`, `/api/`) queda configurada y funcional para quien quiera usarla como
mismo origen real; cambiarla es solo un ajuste de las variables de build, no de código.

**Servicio `migrate` *one-shot*** separado del contenedor `api`: corre `prisma migrate deploy`
y el seed idempotente, y termina. `api` depende de `migrate` con
`condition: service_completed_successfully`, y de `postgres` con `condition: service_healthy` —
evita ejecutar migraciones desde múltiples réplicas y separa "preparar la base" de "servir
tráfico".

**`prisma` (CLI) y `tsx` se movieron de `devDependencies` a `dependencies`** en
`apps/api/package.json`, porque el servicio `migrate` los necesita en tiempo de ejecución dentro
de la imagen de producción (antes solo estaban disponibles en desarrollo).

**PostgreSQL oficial (`postgres:17-alpine`)**, con volumen nombrado
(`realtime-chat-postgres-data`) — persiste entre `docker compose down`/`up`, se pierde solo con
`down -v` explícito. Publicado en el host en el puerto `55432` (no `5432`) para no chocar con la
instalación local de PostgreSQL de la Fase 3.

**Healthchecks** en los tres servicios (`pg_isready`, `/health` de la API, `/` de Nginx), usados
por `depends_on: condition: service_healthy` para ordenar el arranque más allá de un simple
`depends_on` sin condición.

**Usuario no root** en el contenedor de la API (`USER node`, ya incluido en `node:20-alpine`).

## Alternativas consideradas

- **URLs relativas (mismo origen puro) para el frontend**: descartado para esta fase por el
  riesgo de tocar código de aplicación sin poder probarlo exhaustivamente contra la versión
  instalada de `socket.io-client`; queda como mejora futura documentada arriba.
- **Servir el frontend con `serve`/Express en vez de Nginx**: descartado; Nginx maneja proxy de
  WebSocket de forma nativa y es el estándar para SPAs.

## Limitaciones

- Docker Compose es un modo **adicional**, no reemplaza el flujo de desarrollo local sin Docker.
- Sin límites de recursos (`deploy.resources`) configurados todavía — se puede agregar sin
  romper nada si se necesita en el futuro.
- No se despliega en la VM Ubuntu (`devops-lab`) en esta fase — sigue siendo solo local.

## Consecuencias

Cuando se implemente la ruta de mismo origen "real" (URLs relativas), habrá que verificar
explícitamente que `socket.io-client` en la versión instalada acepte una URI vacía o relativa,
o ajustar la construcción de la URL en `apps/web/src/hooks/useChatSocket.ts` para usar
`window.location.origin` cuando no se provea una URL absoluta — cambio de código, no de
infraestructura, deliberadamente fuera de esta fase.
