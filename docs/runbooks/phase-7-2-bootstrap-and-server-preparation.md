# Runbook: Fase 7.2 — Bootstrap y preparación del servidor (Checkpoint 7.2A)

## Objetivo

Construir, de forma reproducible y explicada, la base declarativa que
permitirá en checkpoints futuros preparar `devops-lab` e instalar RKE2:

- Un bootstrap de shell (`infra/bootstrap/bootstrap-controller.sh`) que
  deja el controlador de Ansible listo desde una VM Ubuntu limpia.
- Playbooks y roles de Ansible que, en este checkpoint, **solo auditan**
  (modo preflight) — ningún cambio real al sistema operativo.

**Estado al cierre de este checkpoint**: bootstrap creado pero no
ejecutado; roles en modo auditoría/preflight; RKE2 no instalado;
Kubernetes inexistente; Ubuntu no preparado todavía (kernel/sysctl/swap/
firewall sin cambios).

## Arquitectura

```
Windows (Y:\Claude)                          devops-lab (Ubuntu, VirtualBox)
 │  copia autoritativa: editar, commit, push  │  controlador Ansible
 │  Git, cliente SSH                          │  ansible_connection: local
 │  NO ejecuta Ansible                        │  nodo administrado
 │                                             │  futuro nodo único RKE2
 └──── git push / git fetch + pull ff-only ───►
```

- Windows nunca ejecuta Ansible ni el bootstrap — solo edita, commitea y
  publica. `devops-lab` es la única máquina donde corre Ansible, sobre sí
  misma (`ansible_connection: local`, decisión definitiva, ver ADR-008).
- No se usa WSL para este proyecto, no se instala Ansible en Windows.

## Árbol de archivos creado en este checkpoint

```
infra/
├── bootstrap/
│   ├── bootstrap-controller.sh   Bootstrap del controlador (creado, no ejecutado)
│   └── README.md
│
└── ansible/
    ├── playbooks/
    │   ├── prepare-server.yml    Orquesta validation+common+system_prerequisites+firewall (audit)
    │   ├── install-rke2.yml      Contrato de futura ejecución, deshabilitado por guard
    │   ├── validate-rke2.yml     Confirma RKE2/Kubernetes ausentes (audit)
    │   └── site.yml               Orquesta prepare-server + validate-rke2 (NO incluye install-rke2 todavía)
    │
    └── roles/
        ├── common/                Paquetes generales — solo auditoría
        ├── system_prerequisites/  Requisitos de kernel/Kubernetes — solo auditoría
        ├── firewall/               Política de ufw — solo auditoría
        ├── rke2_server/            Instalación de RKE2 — solo preflight, sin tareas reales
        └── validation/             Validación funcional y no destructiva (CPU/RAM/disco/etc.)

docs/runbooks/
└── phase-7-2-bootstrap-and-server-preparation.md   Este documento
```

## Bootstrap

Ver [`infra/bootstrap/README.md`](../../infra/bootstrap/README.md) para el
detalle completo. Resumen: paquetes apt mínimos + entorno virtual +
versiones fijadas de `ansible-core`/`ansible-lint`. No instala RKE2, no
toca kernel/sysctl/swap/firewall. Modo `--check` para auditar sin
modificar nada.

## Roles

Cada rol tiene su propio README con: responsabilidad futura, qué hace en
7.2A, variables, cambios futuros, idempotencia, riesgos, validación,
reversión. Resumen de guards (todos en `false` en este checkpoint):

| Rol | Guard(s) | Qué hace en 7.2A |
|---|---|---|
| `common` | `common_manage_packages: false` | Audita paquetes propuestos |
| `system_prerequisites` | `manage_modules`/`manage_sysctl`/`manage_swap: false` | Audita `ip_forward`, `br_netfilter`, swap, AppArmor, NTP |
| `firewall` | `enable_ufw`/`manage_rules: false` | Audita presencia/estado de `ufw` (estado de reglas no determinable sin privilegios en este checkpoint) |
| `rke2_server` | `rke2_install_authorized: false` | Preflight: comprueba ausencia del binario/config/servicio |
| `validation` | — (rol funcional, no un guard) | CPU/RAM/disco/distro/arquitectura/hostname/NTP/DNS/AppArmor/sudo/RKE2/Kubernetes |

## Playbooks

- **`prepare-server.yml`**: orquesta `validation` → `common` →
  `system_prerequisites` → `firewall`, todos en modo auditoría.
  `become: false` deliberado — algunos chequeos (p. ej. `ufw status`) no
  son determinables sin privilegios en este checkpoint y se reportan como
  tales, no se evita la limitación escalando privilegios.
- **`install-rke2.yml`**: contrato de futura ejecución. Requiere
  `rke2_install_authorized: true` (default `false`) para invocar el rol
  `rke2_server`, que a su vez todavía no contiene tareas de instalación
  real — doble protección independiente.
- **`validate-rke2.yml`**: invoca `validation`, confirma que RKE2/Kubernetes
  siguen ausentes (estado esperado en 7.2A). No ejecuta `kubectl` porque
  Kubernetes no existe.
- **`site.yml`**: orquesta `prepare-server.yml` + `validate-rke2.yml`
  únicamente. **No incluye `install-rke2.yml` todavía** — ver la lista de
  seis aprobaciones pendientes documentada dentro del propio archivo.

## Variables de seguridad y guards

Todas las variables mutadoras por defecto están en `false`, y viven en
`defaults/main.yml` de cada rol (nunca hardcodeadas dentro de `tasks/`).
Las variables de RKE2 (`rke2_version`, `rke2_checksum`, `rke2_cni`,
`rke2_ingress_controller`) usan el placeholder literal
`"<pendiente-de-aprobación>"` — nunca `latest`, nunca fijadas
silenciosamente.

## Tags

| Tag | Uso |
|---|---|
| `validation` | Solo el rol de validación |
| `common` | Solo el rol de paquetes generales |
| `prerequisites` | Solo el rol de requisitos de kernel |
| `firewall` | Solo el rol de firewall |
| `rke2` | Solo el rol de instalación de RKE2 (deshabilitado por guard) |
| `audit` | Todos los roles en modo auditoría (`validation`, `common`, `prerequisites`, `firewall`) |
| `prepare` | Los roles de `prepare-server.yml` |
| `install` | La tarea de instalación de RKE2 (deshabilitada por guard en 7.2A) |

Ejemplos futuros (no ejecutados en esta sesión):

```bash
ansible-playbook infra/ansible/playbooks/site.yml --tags audit
ansible-playbook infra/ansible/playbooks/prepare-server.yml --check
ansible-playbook infra/ansible/playbooks/install-rke2.yml --tags install  # sigue sin instalar nada: guard en false
```

## Idempotencia

Todas las tareas de este checkpoint son lecturas (`ansible.builtin.stat`,
`ansible.builtin.assert` sobre facts, o `ansible.builtin.command` con
`changed_when: false` explícito) — ejecutar cualquier playbook de este
checkpoint dos veces seguidas debe producir exactamente el mismo
resultado, `changed=0` ambas veces.

## Check mode

`prepare-server.yml`, `validate-rke2.yml` y `site.yml` deben poder
ejecutarse con `--check` sin diferencias respecto al modo normal, porque
ninguno de sus roles tiene todavía tareas que modifiquen el sistema. Esto
se valida en `devops-lab`, no desde Windows (ver flujo abajo).

## Flujo entre Windows y `devops-lab`

1. Editar y crear archivos en Windows (`Y:\Claude`) — copia autoritativa.
2. Revisar el diff (`git status --short`, `git diff --stat`).
3. Commitear y publicar la rama (`git push`).
4. En `devops-lab`: `git fetch origin`, `git switch
   feat/ansible-bootstrap-and-roles`, `git pull --ff-only`, activar el
   venv, ejecutar las validaciones (`bash -n`, `--check`, `--syntax-check`,
   `ansible-lint`, `--check` de los playbooks).
5. Cualquier corrección se hace de nuevo en Windows, nunca en
   `devops-lab` — nunca editar el mismo archivo en ambas copias.
6. Volver a sincronizar `devops-lab` desde Git.

## Copia autoritativa

`Y:\Claude` en Windows. El clon dentro de `devops-lab` es exclusivamente
para *ejecutar y validar* Ansible — nunca para generar commits paralelos
ni recibir archivos copiados manualmente.

## Reconstrucción

Ver el flujo completo en
[`infra/bootstrap/README.md`](../../infra/bootstrap/README.md#reconstrucción-completa-desde-una-vm-limpia):
VM limpia → Git → clonar → bootstrap → activar venv → validar Ansible →
(checkpoints futuros) preparar Ubuntu → instalar RKE2 → restaurar backups.

## Riesgos

- Ninguno de los roles de este checkpoint modifica el sistema — el riesgo
  real queda diferido a los checkpoints 7.2B/7.2C, cuando los guards se
  activen.
- Riesgo de proceso: que un guard se active por error antes de tiempo. Se
  mitiga con doble protección donde aplica (p. ej. `rke2_server`: guard +
  ausencia de tareas reales).
- No se pudo ejecutar `ansible-lint`, `--syntax-check` ni `--check` reales
  en esta sesión por no tener acceso SSH a `devops-lab` desde este
  entorno — ver "Decisiones pendientes".

## Decisiones pendientes

- **Grupo de inventario**: los playbooks de este checkpoint usan
  `rke2_servers` (el grupo ya definido y validado en la Fase 7.1), no
  `devops_lab` como se mencionó en la solicitud original de este
  checkpoint — para no romper `validate-connectivity.yml` ni reescribir el
  inventario sin autorización explícita. Renombrar el grupo, si se desea,
  es un cambio de una línea pendiente de aprobación aparte.
- Validación real en `devops-lab` (`bash -n`, `--check`,
  `--syntax-check`, `ansible-lint`, `--check` de los playbooks) —
  **pendiente de ejecutarse en `devops-lab`**, no se pudo hacer desde esta
  sesión de Windows por falta de acceso SSH a la VM.
- Aumento de RAM de `devops-lab` a 8 GiB (o aprobación explícita de
  continuar con la RAM actual).
- Snapshot de VirtualBox antes de cualquier cambio real en 7.2C.
- Política final de swap (no asumir que debe deshabilitarse sin verificar
  la versión final de RKE2/Kubernetes).
- Estado y reglas activas de `ufw` — no determinable sin sesión
  interactiva con privilegios en este checkpoint.
- CNI e Ingress final (`rke2_cni`, `rke2_ingress_controller` — placeholders
  pendientes).
- Versión y checksum final de RKE2 (`rke2_version`, `rke2_checksum` —
  placeholders pendientes, se fijarán verificando la documentación oficial
  en el momento real de instalar, no copiando lo visto hoy).

## Criterios para pasar a 7.2B

- Este checkpoint (7.2A) fusionado a `develop` vía PR revisado, con los
  cinco checks de CI en `success`.
- `bash -n` limpio (ya confirmado en esta sesión) y `--check` del bootstrap
  validado en `devops-lab` con cero cambios.
- `--syntax-check` limpio en los cuatro playbooks, ejecutado en
  `devops-lab`.
- `ansible-lint` sin fallos sobre `infra/ansible/`, ejecutado en
  `devops-lab`.
- `--check` de `prepare-server.yml`, `validate-rke2.yml` y `site.yml` con
  `changed=0`, ejecutado en `devops-lab`.
- Autorización explícita para empezar a implementar la preparación
  declarativa real de Ubuntu (7.2B trabaja en el modo normal — todavía no
  aplica cambios reales, según el alcance ya definido para esa fase).

## Criterios para pasar a 7.2C

- 7.2B cerrado: preparación declarativa validada en `--check` con el
  cambio esperado presentado y aprobado, sin aplicar todavía.
- Decisión tomada y documentada sobre RAM (aumentar a 8 GiB o continuar
  con la actual).
- Snapshot de VirtualBox creado antes de aplicar cualquier cambio real.
- Auditoría de `ufw` completada con privilegios (fuera de este checkpoint).
- Aprobación explícita para aplicar los roles de preparación (`common`,
  `system_prerequisites`, `firewall`) en modo normal, verificando
  idempotencia (segunda corrida con `changed=0`).

## Criterios para iniciar 7.3

- 7.2C cerrado: Ubuntu realmente preparado (kernel/sysctl/swap/firewall
  aplicados y verificados idempotentes).
- Versión y checksum de RKE2 fijados y verificados contra la documentación
  oficial en ese momento.
- CNI e Ingress decididos.
- Autorización explícita para `rke2_install_authorized: true` y para
  agregar tareas de instalación real al rol `rke2_server`.
- Backup de `etcd`/PostgreSQL con estrategia definida antes de tener un
  clúster real que proteger.
