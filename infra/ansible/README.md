# infra/ansible

Infraestructura como código para preparar la VM `devops-lab` e instalar RKE2.

## Estado actual (Fase 7.1)

**El controlador Ansible ya está instalado y validado.** Corre **dentro de `devops-lab`**
(no en WSL, no en Windows — ver ADR-008 para el porqué de esta decisión definitiva). RKE2 y
Kubernetes **no** están instalados todavía; solo existe un playbook de validación no
destructivo.

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
│   └── validate-connectivity.yml    No destructivo — validado: ok=8 changed=0
└── examples/
    └── rke2-config.single-node.yaml.example   Ejemplo comentado, no consumido por nada
```

## Estructura futura (roadmap, nada de esto existe todavía)

```
infra/bootstrap/
└── bootstrap-controller.sh          Reconstruir el controlador desde una VM Ubuntu limpia

infra/ansible/playbooks/
├── prepare-server.yml               Prerrequisitos de sistema (kernel, paquetes, firewall)
├── install-rke2.yml                 Instalación de RKE2
├── validate-rke2.yml                Validación post-instalación de RKE2
└── site.yml                         Orquesta todo en orden

infra/ansible/roles/
├── common/                          Paquetes base, configuración común
├── system_prerequisites/            ip_forward, br_netfilter, swap, límites de inotify
├── firewall/                        Reglas de firewall específicas de RKE2
├── rke2_server/                     Instalación y configuración del rol server
└── validation/                      Checks post-instalación
```

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

- **7.2+**: `infra/bootstrap/bootstrap-controller.sh` (reconstrucción reproducible del
  controlador desde una VM limpia), los playbooks y roles funcionales listados arriba, e
  instalación real de RKE2.

Hasta que esas fases se aprueben y ejecuten explícitamente, RKE2 y Kubernetes permanecen sin
instalar.
