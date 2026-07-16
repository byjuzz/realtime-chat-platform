# ADR-002: Usar RKE2 con namespaces por ambiente

## Estado

Aceptado

## Contexto

El despliegue se hará sobre un único clúster Kubernetes (RKE2) corriendo en una VM Ubuntu
24.04 dentro de VirtualBox (`devops-lab`), como entorno de práctica/laboratorio. Se necesitan
tres ambientes lógicos: DEV, UAT y PROD.

## Decisión

- Usar **RKE2** como distribución de Kubernetes.
- Separar los tres ambientes mediante **namespaces** dentro del mismo clúster:
  `chat-dev`, `chat-uat`, `chat-prod`.
- Gestionar los manifiestos con **Kustomize**: una base común en `infra/kubernetes/base`
  y overlays específicos por ambiente en `infra/kubernetes/overlays/{dev,uat,prod}`.

## Alternativas consideradas

- **Un clúster por ambiente**: descartado por los recursos limitados del laboratorio
  (4 CPU, 5.8 GiB RAM en una sola VM); no es viable correr múltiples clústeres RKE2.
- **Helm en lugar de Kustomize**: se deja abierto para reevaluar; se elige Kustomize
  inicialmente por ser nativo de `kubectl` y no requerir gestión de charts para esta fase.

## Consecuencias

- El aislamiento entre ambientes depende de namespaces + RBAC/NetworkPolicies (a definir
  en la fase de infraestructura), no de aislamiento físico de clúster.
- Los overlays de Kustomize deben mantener la paridad de recursos entre ambientes, variando
  solo configuración (réplicas, límites de recursos, variables de entorno, dominios).
- Actualmente ni RKE2 ni los manifiestos de Kubernetes están instalados/creados; esta ADR
  documenta la decisión para cuando se autorice esa fase.
