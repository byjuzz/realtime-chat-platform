# infra/kubernetes

Placeholder para los manifiestos de Kubernetes, gestionados con Kustomize.

## Estructura prevista

```
base/                 Manifiestos base comunes a todos los ambientes
overlays/dev/         Parches específicos del ambiente DEV (namespace chat-dev)
overlays/uat/         Parches específicos del ambiente UAT (namespace chat-uat)
overlays/prod/        Parches específicos del ambiente PROD (namespace chat-prod)
```

Ver [ADR-002](../../docs/adr/ADR-002-rke2-namespaces.md) para la decisión de arquitectura.

## Estado actual

Vacío. No se ha creado ningún manifiesto (`Deployment`, `Service`, `Ingress`, etc.) todavía.
Se implementará en una fase posterior, una vez definida la contenedorización (Docker) de
`apps/web` y `apps/api`.
