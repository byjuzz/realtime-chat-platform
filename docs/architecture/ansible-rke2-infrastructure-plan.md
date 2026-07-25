# Plan de arquitectura: Infraestructura como código con Ansible y RKE2

## Estado

Diseño (Fase 7.0). Nada de lo descrito aquí está instalado todavía — ver
[ADR-008](../adr/ADR-008-infrastructure-as-code-with-ansible.md) para la decisión formal y
[el runbook de auditoría](../runbooks/ubuntu-rke2-readiness-audit.md) para el estado real de
`devops-lab`.

## Arquitectura actual

```
Windows (desarrollo)
 ├── Edición de código, Git, VirtualBox
 └── VM devops-lab (VirtualBox, Ubuntu 24.04.4 LTS)
      └── Docker Compose (Fase 5) — frontend + API + PostgreSQL, en la máquina de desarrollo,
          NO en devops-lab todavía. devops-lab hoy es una VM vacía de aplicación.
```

`devops-lab` existe como VM, accesible por SSH, pero no corre ningún componente de la
aplicación ni de Kubernetes todavía.

## Arquitectura objetivo

```
Windows (desarrollador)
 │  edición, Git, VirtualBox, acceso SSH
 ▼
WSL / controlador Linux (Fase 7.1, no instalado todavía)
 │  Python, entorno virtual, ansible-core, ansible-lint
 │  ejecuta playbooks vía SSH
 ▼
Ansible  ──────────────────────────────────────────────────►  devops-lab (Ubuntu 24.04)
 │  prerrequisitos de sistema, firewall, instalación de RKE2,        │
 │  configuración de servicios, validaciones, idempotencia           │
 │                                                                    ▼
 │                                                            RKE2 / Kubernetes
 │                                                             (control plane + workloads,
 │                                                              nodo único)
 │                                                                    │
 │                                                    Deployments, Services, Ingress,
 │                                                    ConfigMaps, Secrets, PVCs
 │                                                                    │
 ▼                                                                    ▼
GitHub Actions (CI ya existe; CD futuro)               API + Web + PostgreSQL (workloads)
 solo construye/valida código todavía —
 sin acceso a devops-lab en esta fase
```

## Separación de responsabilidades (quién administra qué)

Esta separación es deliberada — cada capa administra su propia responsabilidad, y **no se
mezclan**:

| Capa | Administra | No administra |
|---|---|---|
| **Windows** | Edición, Git, VirtualBox, acceso del desarrollador | Nada de la VM directamente |
| **WSL/Linux (controlador)** | Python, entorno virtual, `ansible-core`, `ansible-lint`, ejecución de playbooks | No ejecuta la aplicación ni Kubernetes |
| **Ansible** | Paquetes base de Ubuntu, configuración del kernel/firewall, instalación de RKE2, servicios systemd, validaciones, idempotencia del sistema operativo | **No administra pods** — una vez que Kubernetes existe, Ansible no vuelve a tocar los workloads |
| **RKE2/Kubernetes** | Deployments, StatefulSets (cuando corresponda), Services, Ingress, ConfigMaps, Secrets, PersistentVolumeClaims, reconciliación, healthchecks de la aplicación | No configura el sistema operativo subyacente — eso ya lo dejó listo Ansible antes de que Kubernetes exista |
| **GitHub Actions (futuro)** | CI (ya existe), construcción de imágenes, registro de contenedores, CD controlado, promoción entre ambientes | **Sin acceso a `devops-lab` en esta fase** — ninguna Action toca la VM todavía |

Regla explícita: **Ansible no es un sustituto de Kubernetes para gestionar pods**, y
**Kubernetes no se usa para configurar Ubuntu**. Cada herramienta opera en su propia capa.

## Topología propuesta

- **Un solo nodo RKE2**, rol `server` (control plane + workloads en la misma máquina).
- **`etcd` embebido** (no externo) — más simple, apropiado para laboratorio.
- **Sin alta disponibilidad** — es un entorno de práctica/laboratorio, no producción.

### Limitaciones de esta topología, documentadas explícitamente

- **Punto único de fallo**: si `devops-lab` se cae, se cae todo — control plane y workloads
  juntos.
- **Pérdida potencial de la VM** = pérdida del clúster completo, no solo de un componente.
- Por eso el **backup de `etcd`** y el **backup de PostgreSQL** son necesidades
  **independientes entre sí**: perder el clúster (recuperable reinstalando RKE2 + restaurando
  `etcd`) no es lo mismo que perder los datos de la aplicación (recuperables solo si el backup
  de PostgreSQL es independiente del volumen local del nodo).
- Reconstruir infraestructura (correr los playbooks de nuevo) es distinto de restaurar datos
  (requiere backups reales, no solo repetir la automatización).
- El almacenamiento persistente será **local al nodo** en esta fase (sin almacenamiento
  distribuido) — otra razón por la que los backups no pueden depender solo del disco de la VM.
- **Evolución futura posible**: agregar nodos `agent` (workers) o convertir a HA con `etcd`
  externo — explícitamente fuera de alcance de esta fase.

## Flujo de CI/CD (presente y futuro)

- **Hoy**: GitHub Actions corre CI (Quality, Integration, Docker, Required, Dependency
  Review) sobre `develop`/`main`. No construye ni publica imágenes de producción, no toca
  `devops-lab`.
- **Futuro (fuera de alcance de esta fase)**: un pipeline de CD que construya imágenes,
  las publique en un registro (a decidir: GHCR u otro), y las despliegue en `devops-lab` vía
  Kubernetes — probablemente actualizando manifiestos y dejando que RKE2 reconcilie, no vía
  SSH directo desde GitHub Actions.

## Riesgos identificados

- RAM de la VM por debajo de lo recomendado oficialmente para RKE2 (ver runbook de
  auditoría).
- Nodo único sin HA — aceptado conscientemente para un laboratorio, documentado como
  limitación, no como descuido.
- Sin controlador Ansible listo todavía (Fase 7.1 pendiente).
- Ubuntu Desktop en lugar de Server en la VM actual — peso innecesario, no bloqueante.

## Fases siguientes (fuera de alcance de la 7.0)

- **7.1**: preparar el controlador Ansible (WSL con distro de propósito general, Python,
  `ansible-core`, `ansible-lint`).
- **7.2+**: playbooks funcionales de preparación del sistema, instalación de RKE2,
  validación.
- **8.x**: manifiestos de Kubernetes reales para la aplicación (namespaces ya decididos en
  ADR-002: `chat-dev`, `chat-uat`, `chat-prod`).
- **9.x**: CD real, construcción y publicación de imágenes, promoción entre ambientes.

## Decisiones pendientes de aprobación

- Aumentar la RAM de la VM a 8 GiB antes de instalar RKE2 (ver recomendación en el runbook).
- Elección final de CNI e Ingress (propuestas en ADR-008, a confirmar en la fase de
  instalación).
- Estrategia de secretos para laboratorio vs. UAT/producción (ver ADR-008).
- Convertir Ubuntu Desktop → Server, o aceptar el peso extra (no bloqueante, decisión de
  limpieza, no de funcionalidad).
