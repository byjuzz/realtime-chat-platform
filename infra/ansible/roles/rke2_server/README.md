# Rol `rke2_server`

## Responsabilidad futura

Instalación y configuración real de RKE2 en modo `server` (control plane +
`etcd` embebido, nodo único): descarga con checksum verificado, escritura
de `/etc/rancher/rke2/config.yaml`, gestión del servicio `rke2-server`,
extracción de `kubeconfig`, validación post-instalación, y procedimiento de
desinstalación/rollback documentado.

## Qué hace en el Checkpoint 7.2A

Únicamente preflight de solo lectura:

- Verifica si el binario `/usr/local/bin/rke2` existe.
- Verifica si `/etc/rancher/rke2` existe.
- Verifica si la unidad systemd `rke2-server.service` existe.
- Reporta las variables placeholder pendientes de aprobación.

**No descarga nada, no escribe nada bajo `/etc/rancher/rke2`, no toca
ningún servicio.** Esto es deliberado y con dos capas de protección
independientes:

1. `install-rke2.yml` solo invoca este rol si `rke2_install_authorized: true`.
2. Aunque ese guard se activara, este archivo (`tasks/main.yml`) **todavía
   no contiene ninguna tarea de instalación real** — solo los tres `stat` y
   el `debug` de arriba. No hay nada que ejecutar aunque el guard esté en
   `true`.

## Variables

| Variable | Default | Significado |
|---|---|---|
| `rke2_install_authorized` | `false` | Guard principal — controla si `install-rke2.yml` siquiera invoca este rol |
| `rke2_version` | `"<pendiente-de-aprobación>"` | Nunca `latest` — se fija explícitamente cuando se autorice instalar |
| `rke2_checksum` | `"<pendiente-de-aprobación>"` | Checksum SHA256 del binario, verificado contra la versión fijada |
| `rke2_cni` | `"<pendiente-de-aprobación>"` | CNI a usar (propuestas en ADR-008, a confirmar en la instalación) |
| `rke2_ingress_controller` | `"<pendiente-de-aprobación>"` | Ingress a usar (idem) |

Ninguna de estas variables se completa "silenciosamente" en un checkpoint
futuro copiando la última versión vista hoy — se verifica de nuevo contra
la documentación oficial de RKE2 en el momento real de instalar.

## Cambios que hará en una fase futura (7.2C/7.3)

- Descargar el binario de RKE2 en la versión fijada, verificando el
  checksum antes de usarlo.
- Escribir `/etc/rancher/rke2/config.yaml` (CNI, ingress, flags del
  servidor).
- Habilitar e iniciar el servicio `rke2-server`.
- Extraer y proteger el `kubeconfig` generado.
- Documentar el procedimiento de desinstalación (`rke2-uninstall.sh`,
  provisto por el propio instalador oficial de RKE2) como parte del
  rollback.

## Idempotencia

Los `stat` de este checkpoint son de solo lectura, siempre `changed=0`. La
instalación futura usará el instalador oficial de RKE2 (que ya es
idempotente — reinstalar la misma versión no reinicia servicios
innecesariamente) más módulos declarativos de Ansible
(`ansible.builtin.template` para `config.yaml`, `ansible.builtin.systemd`
para el servicio).

## Riesgos

Es el rol de mayor impacto de todos — instalar RKE2 crea un clúster de
Kubernetes de un solo nodo, con `etcd` embebido, y modifica red/`iptables`
del host. Por eso requiere: RAM aumentada o aprobada explícitamente,
snapshot de VirtualBox previo, versión y checksum fijados y verificados, y
autorización explícita del checkpoint correspondiente (7.2C en adelante).

## Validación

En este checkpoint: los tres `stat` + `debug` de arriba. En el futuro:
`validate-rke2.yml` confirmará que el servicio está activo, el nodo
reporta `Ready` vía `kubectl get nodes`, y los componentes core del
clúster están sanos.

## Reversión

No aplica en este checkpoint (nada se instala). En el futuro: el propio
instalador de RKE2 provee `rke2-uninstall.sh`; además, el snapshot de
VirtualBox tomado antes de instalar permite volver al estado previo
completo si algo sale mal.

## Relación con RKE2/Kubernetes

Es, literalmente, el rol que instala RKE2 (la distribución de Kubernetes
elegida para este proyecto, ver ADR-008) — por eso es el único rol
nombrado explícitamente por la herramienta, a diferencia de los demás que
se nombran por su responsabilidad genérica (`common`,
`system_prerequisites`, `firewall`, `validation`).
