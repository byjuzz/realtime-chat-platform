# Rol `system_prerequisites`

## Responsabilidad futura

Los requisitos de sistema operativo que RKE2/Kubernetes documentan como
necesarios: módulos del kernel `overlay` y `br_netfilter`, `net.ipv4.ip_forward`
habilitado, política de swap, estado de AppArmor, hora sincronizada, DNS.

## Qué hace en el Checkpoint 7.2A

Solo lee y reporta — ninguna tarea usa `become: true` ni modifica nada:

- `sysctl -n net.ipv4.ip_forward` — valor actual conocido: `0`.
- Presencia de `br_netfilter` en `/proc/modules` — valor actual conocido:
  no cargado.
- `swapon --show` — valor actual conocido: sin swap activo (`0B`).
- `systemctl is-active apparmor` — valor actual conocido: instalado,
  estado de runtime a confirmar (no verificable sin sesión interactiva con
  sudo, según el runbook de auditoría de la Fase 7.0).
- `timedatectl show --property=NTPSynchronized` — sincronización horaria.

Estos valores ya se conocían del
[runbook de auditoría de la Fase 7.0](../../../docs/runbooks/ubuntu-rke2-readiness-audit.md);
este rol los vuelve a leer de forma automatizada y repetible, no los
inventa.

## Variables

| Variable | Default | Significado |
|---|---|---|
| `system_prerequisites_manage_modules` | `false` | Guard — cargar módulos del kernel, deshabilitado |
| `system_prerequisites_manage_sysctl` | `false` | Guard — aplicar `sysctl -w`, deshabilitado |
| `system_prerequisites_manage_swap` | `false` | Guard — modificar swap, deshabilitado |
| `system_prerequisites_required_sysctl` | `{net.ipv4.ip_forward: "1"}` | Valor de referencia documentado por Kubernetes, no aplicado |
| `system_prerequisites_required_modules` | `[overlay, br_netfilter]` | Módulos de referencia, no cargados por este rol todavía |

## Cambios que hará en una fase futura (7.2C)

- Cargar `overlay` y `br_netfilter` de forma persistente
  (`/etc/modules-load.d/`), solo si `system_prerequisites_manage_modules: true`.
- Aplicar `net.ipv4.ip_forward=1` de forma persistente
  (`/etc/sysctl.d/`), solo si `system_prerequisites_manage_sysctl: true`.
- Decidir y aplicar la política de swap, solo si
  `system_prerequisites_manage_swap: true` — **ver nota sobre swap abajo**.

## Idempotencia

Todas las tareas de este checkpoint son lecturas puras (`changed_when: false`
explícito) — correrlas cien veces produce el mismo resultado sin ningún
cambio. Las tareas futuras de escritura usarán módulos idempotentes
(`ansible.builtin.sysctl`, `ansible.builtin.modprobe` con persistencia vía
`community.general` o archivos declarativos en `/etc/modules-load.d/`), no
`shell`/`command` con efectos persistentes.

## Riesgos

- Habilitar `ip_forward` y cargar `br_netfilter` afecta el enrutamiento de
  red del host — bajo riesgo en un nodo de laboratorio, pero se aplicará
  gradualmente y con snapshot previo (ver Fase 7.2C).
- Cambiar la política de swap sin verificar la versión final de
  RKE2/Kubernetes podría ser innecesario: **no se asume que el swap deba
  deshabilitarse** solo porque es la convención histórica — versiones
  recientes de Kubernetes soportan swap bajo feature gates específicos.
  Esta decisión queda pendiente de confirmación explícita antes de tocarla.

## Validación

Lectura de `sysctl`/`/proc/modules`/`swapon`/`systemctl`/`timedatectl`,
expuesta vía `ansible.builtin.debug`. En una fase futura, `validate-rke2.yml`
(rol `validation`) confirmará que los valores aplicados coinciden con los
requeridos.

## Reversión

No aplica en este checkpoint (nada se modifica). En fases futuras: los
módulos cargados vía `/etc/modules-load.d/` se revierten eliminando el
archivo y `sudo modprobe -r <módulo>`; los valores de `sysctl` vía
`/etc/sysctl.d/` se revierten eliminando el archivo y `sysctl --system`.

## Por qué pertenece aquí y no a otro rol

Es el rol dedicado a **requisitos del sistema operativo específicos de
Kubernetes** — a diferencia de `common` (utilidades genéricas sin relación
con Kubernetes) y de `firewall` (reglas de red, no del kernel).
