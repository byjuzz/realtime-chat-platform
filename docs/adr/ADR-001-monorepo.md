# ADR-001: Usar un monorepo con npm workspaces

## Estado

Aceptado

## Contexto

El proyecto consta de un frontend (React/Vite), una API (Express/Socket.IO) y código
compartido entre ambos (tipos de eventos, DTOs). El proyecto es de aprendizaje/práctica,
con un único desarrollador y una infraestructura de despliegue (RKE2) que evolucionará junto
con la aplicación.

## Decisión

Usar un **monorepo** gestionado con **npm workspaces**, con la siguiente organización:

- `apps/web` — frontend
- `apps/api` — API
- `packages/shared` — código compartido

## Alternativas consideradas

- **Multi-repo** (un repositorio por app): descartado por la sobrecarga de coordinar
  versiones de tipos compartidos y por ser innecesario para un proyecto de un solo
  desarrollador en fase de práctica.
- **Lerna / Nx / Turborepo**: descartado por ahora para mantener la herramienta mínima;
  npm workspaces es suficiente para el tamaño actual del proyecto. Se puede reevaluar si
  el monorepo crece.

## Consecuencias

- Un solo `git clone` y una sola rama de trabajo por cambio que toque frontend + API.
- `packages/shared` se referencia directamente entre workspaces sin publicar a un registry.
- El build/lint/typecheck se orquesta desde el `package.json` raíz con `--workspaces`.
