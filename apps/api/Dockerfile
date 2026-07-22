# Build context: raíz del monorepo (docker-compose.yml usa `context: .`),
# porque apps/api depende de packages/shared vía npm workspaces.

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

FROM deps AS build
WORKDIR /repo
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared \
    && npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build -w apps/api

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/node_modules/.prisma node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma node_modules/@prisma
COPY apps/api/prisma apps/api/prisma

WORKDIR /repo/apps/api
USER node

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/index.js"]
