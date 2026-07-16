# Arquitectura — Visión general

> Estado: Fase 1 (bootstrap). Este documento describe la arquitectura **prevista**;
> los componentes marcados como futuros aún no están implementados.

## Componentes

```
                    ┌─────────────────────┐
                    │   apps/web           │
                    │   React + Vite + TS  │
                    └──────────┬───────────┘
                               │ HTTP / WebSocket
                               ▼
                    ┌─────────────────────┐
                    │   apps/api            │
                    │   Express + TS        │
                    │   Socket.IO (futuro)  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  PostgreSQL (futuro)  │
                    │  + Prisma              │
                    └─────────────────────┘
```

## Código compartido

`packages/shared` contendrá tipos y utilidades usadas tanto por `apps/web` como por `apps/api`
(ej. tipos de eventos de Socket.IO, DTOs).

## Infraestructura y despliegue (futuro)

- **Ansible** (`infra/ansible`): aprovisionamiento de la VM Ubuntu y del clúster RKE2.
- **Kubernetes/Kustomize** (`infra/kubernetes`): manifiestos base + overlays por ambiente.
- **Ambientes**: `chat-dev`, `chat-uat`, `chat-prod`, como namespaces separados en el mismo
  clúster RKE2 (ver [ADR-002](../adr/ADR-002-rke2-namespaces.md)).

## Fuera de alcance en esta fase

Chat en tiempo real, persistencia, Docker, Kubernetes, pipelines CI/CD. Ver roadmap de fases
en las conversaciones de planeación del proyecto.
