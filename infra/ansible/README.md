# infra/ansible

Infraestructura como código para preparar la VM `devops-lab` e instalar RKE2.

## Estado actual (Checkpoint 7.2A)

**El controlador Ansible ya está instalado y validado** (Fase 7.1). Corre **dentro de
`devops-lab`** (no en WSL, no en Windows — ver ADR-008 para el porqué de esta decisión
definitiva).

**Los playbooks y roles de preparación ya existen, pero solo en modo auditoría/preflight**
(Checkpoint 7.2A): ningún rol modifica el sistema todavía — todos sus guards están en
`false`. RKE2 y Kubernetes **no** están instalados; ningún cambio real de
kernel/sysctl/swap/firewall se ha aplicado.

Ver:

- [ADR-008](../../docs/adr/ADR-008-infrastructure-as-code-with-ansible.md) — decisión,
  controlador, versiones.
- [Plan de arquitectura](../../docs/architecture/ansible-rke2-infrastructure-plan.md) —
  separación de responsabilidades y topología.
- [`docs/learning/rke2-from-zero.md`](../../docs/learning/rke2-from-zero.md) — guía completa
  de RKE2/Kubernetes.
- [Runbook del controlador](../../docs/runbooks/ansible-controller-devops-lab-setup.md) —
  cómo se preparó, cómo validarlo, cómo revertirlo.
- [Runbook de auditoría](../../docs/runbooks/ubuntu-rke2-readiness-audit.md) — estado de
  `devops-lab` (Fase 7.0).
- [Runbook del Checkpoint 7.2A](../../docs/runbooks/phase-7-2-bootstrap-and-server-preparation.md) —
  bootstrap, playbooks, roles, guards, criterios para 7.2B/7.2C/7.3.

## Propósito

Automatizar, de forma reproducible e idempotente, sobre `devops-lab`:

- Configuración base del sistema operativo (prerrequisitos de kernel, paquetes base).
- Firewall y hardening mínimo necesario.
- Instalación y configuración de RKE2 (rol `server`; `agent` solo si en el futuro se agregan
  nodos worker).
- Validaciones post-instalación.

**Ansible no administra pods ni workloads de Kubernetes** — eso queda a cargo de los
manifiestos de `infra/kubernetes` una vez que el clúster exista.

## Estructura actual (lo que ya existe)

```
infra/bootstrap/
├── bootstrap-controller.sh          Creado, NO ejecutado todavía (Checkpoint 7.2A)
└── README.md

infra/ansible/
├── README.md                       Este archivo
├── ansible.cfg                     Configuración real, en uso
├── requirements-controller.txt     ansible-core/ansible-lint fijados, en uso
├── inventories/
│   └── lab/
│       ├── hosts.yml.example        Plantilla versionada, con ansible_connection: local
│       ├── hosts.local.yml          Real, ignorado por git (sin secretos: conexión local)
│       └── README.md                Explica el inventario del laboratorio
├── playbooks/
│   ├── validate-connectivity.yml    No destructivo — validado: ok=8 changed=0 (Fase 7.1)
│   ├── prepare-server.yml           Auditoría/preflight (Checkpoint 7.2A) — changed=0 esperado
│   ├── install-rke2.yml             Contrato de futura ejecución, deshabilitado por guard
│   ├── validate-rke2.yml            Confirma RKE2/Kubernetes ausentes — changed=0 esperado
│   └── site.yml                     Orquesta prepare-server + validate-rke2 (sin install-rke2 todavía)
├── roles/
│   ├── common/                      Paquetes base — solo auditoría en 7.2A
│   ├── system_prerequisites/        ip_forward, br_netfilter, swap, AppArmor — solo auditoría
│   ├── firewall/                    Política de ufw — solo auditoría
│   ├── rke2_server/                 Instalación de RKE2 — solo preflight, sin tareas reales
│   └── validation/                  Checks funcionales y no destructivos (CPU/RAM/disco/etc.)
└── examples/
    └── rke2-config.single-node.yaml.example   Ejemplo comentado, no consumido por nada
```

Detalle completo de cada pieza, guards y variables en el
[runbook del Checkpoint 7.2A](../../docs/runbooks/phase-7-2-bootstrap-and-server-preparation.md).

## Estructura futura (roadmap, todavía no implementado)

Las tareas de **instalación real** dentro de los roles de arriba (aplicar `sysctl`, cargar
módulos, habilitar `ufw`, descargar/instalar RKE2) — activadas checkpoint por checkpoint
(7.2B: preparación declarativa validada en `--check`; 7.2C: aplicada en modo normal con
aprobación explícita; 7.3: instalación real de RKE2).

**Objetivo final de esta estructura**: que, tras crear una VM Ubuntu base nueva, sea
suficiente ejecutar el bootstrap y después:

```bash
ansible-playbook \
  -i infra/ansible/inventories/lab/hosts.local.yml \
  infra/ansible/playbooks/site.yml
```

para dejar `devops-lab` completamente preparada y con RKE2 instalado. Ninguno de estos
archivos existe todavía — son el objetivo de las fases 7.2 en adelante.

## Convenciones

- **Conexión local, no SSH**: el controlador vive dentro de `devops-lab`
  (`ansible_connection: local`) — decisión definitiva, ver ADR-008.
- **Roles separados por responsabilidad única** — cada rol hace una cosa, no un rol
  monolítico que hace todo.
- **`site.yml`** (futuro) orquesta los playbooks individuales en orden: preparación →
  instalación → validación.
- **Tags** en tasks para poder correr subconjuntos sin ejecutar el playbook completo.
- **Modo `--check`** para verificar idempotencia antes de aplicar cambios reales — correr dos
  veces sin cambios no debe reportar ningún cambio en la segunda corrida (ya demostrado con
  `validate-connectivity.yml`: `changed=0`).

## Política de secretos

**Nunca en texto plano ni versionados en este repositorio**: claves SSH, tokens de RKE2,
`kubeconfig` real, contraseñas, credenciales de PostgreSQL, secretos de Kubernetes, archivos
`.env` reales.

La clave SSH usada por el desarrollador para entrar a `devops-lab` vive fuera del
repositorio, en Windows, nunca dentro de `infra/ansible/`. Para variables sensibles que un
playbook necesite en el futuro, se usará **Ansible Vault**. Ver ADR-008 para la estrategia
completa, incluyendo opciones futuras para UAT/producción.

## Fases futuras

- **7.2A** (cerrado): bootstrap creado (no ejecutado), playbooks y roles en modo
  auditoría/preflight.
- **7.2B**: preparación declarativa real, validada en `--check` (`changed=0` presentado, sin
  aplicar).
- **7.2C**: aplicación real de los roles de preparación (previa RAM/snapshot/aprobaciones),
  verificando idempotencia.
- **7.3**: instalación real de RKE2, validación del nodo `Ready`.

Hasta que esas fases se aprueben y ejecuten explícitamente, RKE2 y Kubernetes permanecen sin
instalar.
