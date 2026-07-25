# infra/ansible

Infraestructura como código para preparar la VM `devops-lab` (y futuras VMs de ambiente) e
instalar RKE2.

## Estado actual (Fase 7.0)

**Diseño únicamente. No existen playbooks funcionales todavía.** Ansible no está instalado
ni en el controlador ni en la VM de destino. Nada de la estructura descrita abajo se ha creado
salvo este archivo. Ver:

- [ADR-008](../../docs/adr/ADR-008-infrastructure-as-code-with-ansible.md) — decisión y
  versiones propuestas.
- [Plan de arquitectura](../../docs/architecture/ansible-rke2-infrastructure-plan.md) —
  separación de responsabilidades y topología.
- [Runbook de auditoría](../../docs/runbooks/ubuntu-rke2-readiness-audit.md) — estado real
  de `devops-lab`.

## Propósito

Automatizar, de forma reproducible e idempotente, sobre la VM Ubuntu 24.04 (`devops-lab`) y
futuras VMs de ambiente:

- Configuración base del sistema operativo (prerrequisitos de kernel, paquetes base).
- Firewall y hardening mínimo necesario.
- Instalación y configuración de RKE2 (rol `server`, y `agent` si en el futuro se agregan
  nodos worker).
- Validaciones post-instalación.

**Ansible no administra pods ni workloads de Kubernetes** — eso queda a cargo de los
manifiestos de `infra/kubernetes` una vez que el clúster exista.

## Estructura futura (propuesta, ninguno de estos archivos existe todavía)

```
infra/ansible/
├── README.md                       Este archivo
├── ansible.cfg                     Configuración del proyecto (no funcional todavía)
├── requirements.yml                Colecciones de Ansible necesarias (no funcional todavía)
├── inventories/
│   └── lab/
│       ├── hosts.yml                Inventario del laboratorio (sin datos reales todavía)
│       ├── group_vars/
│       │   ├── all.yml              Variables comunes a todo el inventario
│       │   └── rke2_servers.yml     Variables específicas del grupo rke2_servers
│       └── host_vars/               Variables específicas por host, si hicieran falta
├── playbooks/
│   ├── audit.yml                    Auditoría de solo lectura (equivalente automatizado del runbook)
│   ├── prepare.yml                  Prerrequisitos de sistema (kernel, paquetes, firewall)
│   ├── install-rke2.yml             Instalación de RKE2
│   ├── validate.yml                 Validación post-instalación
│   └── site.yml                     Orquesta los playbooks anteriores en orden
└── roles/
    ├── common/                      Paquetes base, configuración común
    ├── system_prerequisites/        ip_forward, br_netfilter, swap, límites de inotify
    ├── firewall/                    Reglas de firewall específicas de RKE2
    ├── rke2_server/                 Instalación y configuración del rol server
    └── validation/                  Checks post-instalación
```

## Convenciones previstas

- **Inventarios por ambiente**: un directorio por ambiente dentro de `inventories/` (empieza
  con `lab/` para el laboratorio actual de un solo nodo; `dev`/`uat`/`prod` se agregarán si
  algún día dejan de ser namespaces del mismo clúster y pasan a ser VMs separadas).
- **Variables**: `group_vars`/`host_vars` para configuración específica de ambiente; nada de
  valores reales (IPs, tokens, contraseñas) comiteado en texto plano.
- **Roles separados por responsabilidad única** — cada rol hace una cosa (preparar el
  sistema, instalar RKE2, validar), no un rol monolítico que hace todo.
- **`site.yml`** como punto de entrada que orquesta los playbooks individuales en el orden
  correcto (auditoría → preparación → instalación → validación).
- **Tags** en tasks para poder correr subconjuntos (`--tags prepare`, `--tags validate`) sin
  ejecutar el playbook completo.
- **Modo `--check`** (dry-run) para verificar idempotencia antes de aplicar cambios reales —
  correr dos veces sin cambios no debe reportar ningún cambio en la segunda corrida.

## Política de secretos

**Nunca en texto plano ni versionados en este repositorio**: claves SSH, tokens de RKE2,
`kubeconfig` real, contraseñas, credenciales de PostgreSQL, secretos de Kubernetes, archivos
`.env` reales.

La clave SSH usada para administrar `devops-lab` vive fuera del repositorio (en el `~/.ssh/`
de cada desarrollador), nunca dentro de `infra/ansible/`. Para variables sensibles que un
playbook necesite en el futuro, se usará **Ansible Vault**. Ver ADR-008 para la estrategia
completa, incluyendo opciones futuras para UAT/producción.

## Fases futuras

- **7.1**: preparar el controlador Ansible (WSL con distro de propósito general, Python,
  `ansible-core`, `ansible-lint`) — todavía no ejecutado.
- **7.2+**: crear los playbooks y roles funcionales listados arriba, e instalar RKE2.

Hasta que esas fases se aprueben y ejecuten explícitamente, este directorio permanece como
documentación de diseño, sin automatización real.
