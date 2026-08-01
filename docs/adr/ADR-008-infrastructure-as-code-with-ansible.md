# ADR-008: Infraestructura como código con Ansible para RKE2

## Estado

Aceptado, actualizado en la Fase 7.1. El controlador Ansible ya está instalado y validado
(ver sección "Controlador Ansible" abajo); RKE2 y Kubernetes siguen sin instalarse.

## Contexto

Hasta ahora, la VM `devops-lab` (Ubuntu 24.04, VirtualBox) existe pero no corre ningún
componente de la aplicación ni de Kubernetes. ADR-002 ya decidió usar RKE2 con namespaces por
ambiente (`chat-dev`, `chat-uat`, `chat-prod`) sobre un único clúster, por las limitaciones de
recursos del laboratorio. Esta fase decide **cómo** se va a preparar y administrar esa VM de
forma reproducible, antes de instalar nada.

## Decisión

Usar **Ansible** como herramienta de infraestructura como código para preparar el sistema
operativo e instalar RKE2, con una separación estricta de responsabilidades (ver el
[plan de arquitectura](../architecture/ansible-rke2-infrastructure-plan.md) para el detalle
completo): Ansible administra el sistema operativo y la instalación de RKE2; Kubernetes
administra los workloads; ninguna de las dos herramientas invade el territorio de la otra.

### Controlador Ansible

**Windows no puede ser el controlador** — no es una limitación de este proyecto, es una
limitación documentada del propio proyecto Ansible (no soporta Windows como nodo de control).

Auditoría real del entorno Windows (Fase 7.0): existe WSL instalado, pero la única
distribución presente es `docker-desktop` — una distro interna que usa Docker Desktop para sí
mismo, no un entorno Linux de propósito general utilizable como controlador.

**Alternativa considerada y descartada explícitamente: WSL con una distro de propósito
general.** Era la propuesta original de la Fase 7.0. Se descartó en la Fase 7.1 por decisión
explícita del propietario del proyecto: el host de desarrollo (Windows) tiene recursos
limitados, y agregar un controlador WSL separado significaba una capa más de infraestructura
que mantener sin un beneficio claro para este laboratorio en particular.

**Decisión definitiva**: `devops-lab` cumple **simultáneamente** el rol de controlador
Ansible (vía `ansible_connection: local`) y de nodo administrado. Windows queda
exclusivamente como anfitrión de VirtualBox, entorno de edición, cliente Git y cliente SSH —
nunca ejecuta Ansible ni tiene Python instalado con ese propósito. No se instala Ansible en
Windows, no se instala WSL de propósito general, no existe un runner separado.

**Tradeoff aceptado explícitamente**: con un controlador externo (WSL o similar), si
`devops-lab` se rompe durante una instalación, sigue existiendo una herramienta externa
funcional para diagnosticar/reparar. Con el controlador dentro de la propia VM, si se rompe,
se pierde también la herramienta de reparación. La estrategia de recuperación aceptada para
compensar esto **no** es resiliencia del controlador, sino reconstrucción completa desde cero:
clonar una VM Ubuntu limpia → acceso inicial → clonar el repositorio → bootstrap mínimo →
entorno virtual → Ansible fijado → modo local → preparar el sistema → instalar RKE2 vía
playbooks → aplicar Kubernetes → restaurar backups de `etcd` y PostgreSQL cuando corresponda.
La VM (o una futura OVA/plantilla) puede usarse como acelerador de ese proceso, pero **nunca**
como única fuente de recuperación — **Git y los playbooks son la fuente de verdad**; los
datos requieren backups independientes de la infraestructura (ver la sección de `etcd`/
PostgreSQL en `docs/learning/rke2-from-zero.md`).

Para automatización futura no interactiva (por ejemplo, si se quisiera correr Ansible desde
CI), se evaluará por separado — explícitamente **no** en esta fase, y explícitamente
**GitHub Actions no tiene acceso a `devops-lab`**.

### Versiones — controlador instalado (Fase 7.1) y RKE2 propuesto (no instalado)

| Componente | Versión | Estado | Fuente | Fecha de consulta |
|---|---|---|---|---|
| Python (controlador = `devops-lab`) | 3.12.3 | **Instalado** (ya venía con Ubuntu 24.04) | — | Fase 7.0 |
| `ansible-core` | **2.20.7** | **Instalado**, en `~/.venvs/realtime-chat-ansible` | pypi.org, `pip index versions` | 2026-07-31 |
| `ansible-lint` | **26.6.0** | **Instalado**, compatible sin conflictos con `ansible-core==2.20.7` | pypi.org, `pip index versions` | 2026-07-31 |
| RKE2 | `v1.36.2+rke2r1` (última estable) | Propuesto, **no instalado** | github.com/rancher/rke2/releases | 2026-07-25 |
| Kubernetes (incluido en RKE2) | v1.36.2 | Propuesto, **no instalado** | github.com/rancher/rke2/releases | 2026-07-25 |

Nota sobre `ansible-core`: al momento de instalar (2026-07-31) ya existía una serie mayor más
reciente (`2.21.x`). Se mantuvo deliberadamente la serie `2.20` ya propuesta y aprobada en la
Fase 7.0, fijando su **último parche** (`2.20.7`) en vez de saltar silenciosamente a una serie
mayor nunca discutida — actualizar de serie mayor es una decisión aparte, futura.

Ninguna versión usa `latest`, `main` ni un canal flotante sin documentar qué versión resolvió
— mismo principio que el fijado por SHA de las GitHub Actions en la Fase 6.1.

Mecanismo de verificación/checksum de la instalación de RKE2: pendiente de definir en detalle
en la fase de instalación (RKE2 publica checksums junto a cada release; se usarán en el
playbook correspondiente, no ahora).

### Requisitos de RKE2 verificados contra documentación oficial

Según `docs.rke2.io/install/requirements` (consultado 2026-07-25):

- **Mínimo**: 2 CPU, 4 GB RAM.
- **Recomendado**: 4 CPU, 8 GB RAM.
- NetworkManager, si está presente, debe configurarse para ignorar las interfaces gestionadas
  por el CNI.
- La documentación oficial no especifica explícitamente requisitos de swap, `ip_forward` o
  `br_netfilter` como tal (son requisitos generales de Kubernetes/container networking, no
  exclusivos de RKE2) — se preparan de todas formas en la fase de instalación, por ser
  requisitos conocidos del ecosistema de contenedores en Linux.

`devops-lab` cumple el mínimo de CPU y lo recomendado de CPU (4), pero su RAM (5.8 GiB) queda
entre el mínimo (4 GB) y lo recomendado (8 GB) — ver recomendación de aumentar RAM en el
runbook de auditoría.

### CNI, Ingress y almacenamiento (propuestas, no instaladas)

- **CNI**: RKE2 usa **Canal** (Flannel + Calico para políticas de red) como opción por
  defecto históricamente documentada; se propone mantenerlo para el laboratorio salvo que la
  fase de instalación encuentre una razón concreta para cambiarlo. A confirmar contra la
  documentación vigente en el momento de instalar (RKE2 permite elegir explícitamente el CNI).
- **Ingress**: RKE2 incluye un controlador Ingress por defecto (Nginx históricamente; la
  documentación oficial indica que a partir de la v1.36 Traefik pasa a ser el default para
  clústeres nuevos — verificar la versión efectiva al momento de instalar). Debe soportar
  upgrade de conexión a WebSocket, requisito real de este proyecto por Socket.IO. Expuesto
  inicialmente vía el NAT de VirtualBox del laboratorio, en los puertos que se definan (no
  necesariamente 80/443 si chocan con otro uso de la máquina host).
- **Almacenamiento**: local al nodo en esta fase (sin almacenamiento distribuido, dado que es
  un nodo único). PostgreSQL requerirá un `PersistentVolumeClaim` respaldado por
  almacenamiento local; la política de borrado de esos volúmenes y la estrategia de backup se
  definen en la fase de instalación, no aquí.

## Idempotencia

Los playbooks futuros deben ser **idempotentes**: ejecutarlos dos veces seguidas sin cambios
no debe producir ningún cambio en la segunda corrida. Esto se validará con `--check` (modo de
simulación de Ansible) antes de aplicar cambios reales, una vez que existan playbooks
funcionales (fuera de alcance de esta fase).

## Secretos

**No se versionarán en el repositorio**: claves SSH, tokens de RKE2, `kubeconfig` real,
contraseñas, credenciales de PostgreSQL, secretos de Kubernetes en texto plano, ni archivos
`.env` reales.

**Estrategia inicial (laboratorio)**: mantener la clave SSH fuera del repositorio (como ya es
el caso — vive en `~/.ssh/` de la máquina del desarrollador, nunca en `infra/ansible/`), y usar
**Ansible Vault** para cualquier variable sensible que un playbook necesite (a implementar
cuando existan playbooks funcionales).

**Estrategia futura (UAT/producción)**, a evaluar en una fase posterior:
- GitHub Environments + secretos cifrados de GitHub, para lo que consuma CI/CD.
- SOPS con `age`, o Sealed Secrets/External Secrets, para secretos de Kubernetes gestionados
  como código de forma segura.

Ninguna de estas opciones se implementa en esta fase.

## Recuperación y snapshot

Ver el procedimiento completo en el
[runbook de auditoría](../runbooks/ubuntu-rke2-readiness-audit.md#procedimiento-de-snapshot-a-ejecutar-antes-de-modificar-la-vm-no-en-esta-fase).
Resumen de las reglas clave: snapshot de VM antes de cambios grandes, no modificar firewall y
SSH en el mismo cambio, no reiniciar sin aprobación, y backup de `etcd` y de PostgreSQL como
mecanismos independientes entre sí.

## Alternativas consideradas

- **`kubeadm` en vez de RKE2**: descartado — ADR-002 ya fijó RKE2 como distribución elegida,
  no se reabre esa decisión aquí.
- **Terraform/OpenTofu para aprovisionar la VM**: no aplica en esta fase — la VM ya existe
  (creada manualmente en VirtualBox); Ansible se usa para *configurar* la VM existente, no
  para *crear* infraestructura desde cero. Podría reevaluarse si en el futuro se migra a un
  proveedor de nube.
- **Chef/Puppet en vez de Ansible**: descartado por simplicidad — Ansible no requiere agente
  instalado en el nodo administrado, solo SSH y Python, que ya están disponibles.

## Consecuencias

- Ninguna herramienta puede saltarse la separación de capas documentada (Ansible no gestiona
  pods, Kubernetes no configura el sistema operativo).
- Las versiones fijadas explícitamente evitan el problema de "funcionaba ayer, hoy no" por un
  canal `latest` que cambió silenciosamente — mismo principio que el fijado por SHA de las
  GitHub Actions.
- El controlador Ansible ya no es un bloqueante — quedó instalado y validado dentro de
  `devops-lab` en la Fase 7.1 (`ping` → `pong`, `changed=0` en el primer playbook real).

## Limitaciones

- Nodo único, sin alta disponibilidad — aceptado para laboratorio, no para producción.
- RAM de la VM por debajo de lo recomendado oficialmente; pendiente de aumentar antes de
  instalar RKE2.
- CNI e Ingress finales sujetos a confirmación contra la documentación vigente en el momento
  real de instalación (las versiones de software evolucionan; lo aquí propuesto es la mejor
  información disponible a la fecha de esta auditoría).

## Referencias oficiales

- RKE2 — requisitos: `docs.rke2.io/install/requirements` (consultado 2026-07-25).
- RKE2 — releases: `github.com/rancher/rke2/releases` (consultado 2026-07-25).
- Ansible — ciclo de vida y soporte de Python: `docs.ansible.com/ansible/latest/reference_appendices/release_and_maintenance.html` (consultado 2026-07-25).
