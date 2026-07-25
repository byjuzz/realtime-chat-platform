# Runbook: Auditoría de aptitud Ubuntu/RKE2

## Propósito

Este runbook tiene dos partes:

1. Un **checklist general y reutilizable** — válido para cualquier máquina nueva (VM local,
   VM de nube, servidor físico) donde se planee instalar RKE2/Kubernetes, dentro o fuera de
   este proyecto.
2. El **resultado específico** de aplicar ese checklist contra la VM `devops-lab`, en la
   Fase 7.0.

Esta auditoría es de **solo lectura**. No modifica el sistema operativo, no instala software,
no cambia configuración. Su único objetivo es reemplazar suposiciones por evidencia antes de
automatizar nada.

## Parte 1 — Checklist general (reutilizable)

| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | ¿El sistema operativo es una distro/versión soportada? | Compatibilidad oficial del proyecto Kubernetes/RKE2 |
| 2 | ¿Arquitectura de CPU compatible? (x86_64/amd64, arm64) | Los binarios de RKE2 son específicos por arquitectura |
| 3 | ¿CPU y RAM cumplen el mínimo *y* lo recomendado? | El mínimo "sobrevive"; lo recomendado es lo que realmente hay que apuntar |
| 4 | ¿Disco suficiente, con margen para crecimiento? | Imágenes de contenedores, logs, `etcd`, volúmenes crecen con el tiempo |
| 5 | ¿Acceso SSH funcional con usuario administrativo? | Sin esto, ni Ansible ni la instalación pueden operar |
| 6 | ¿Red configurada (IP, ruta, DNS) y hostname estable? | Kubernetes usa el hostname como identidad de nodo |
| 7 | ¿Los puertos que necesitará Kubernetes están libres? | Evita conflictos silenciosos con software ya corriendo |
| 8 | ¿`net.ipv4.ip_forward` habilitado? | Necesario para el enrutamiento de tráfico entre pods/nodos |
| 9 | ¿Módulo `br_netfilter` disponible/cargable? | Necesario para que `iptables` vea el tráfico de los puentes de red |
| 10 | ¿Swap desactivado (o política clara al respecto)? | Requisito histórico/común de Kubernetes |
| 11 | ¿Firewall y AppArmor/SELinux identificados (no necesariamente desactivados)? | Hay que saber qué reglas existen antes de abrir puertos nuevos |
| 12 | ¿Hora sincronizada (NTP)? | Los certificados TLS internos de Kubernetes fallan si el reloj está desfasado |
| 13 | ¿Hay software preexistente que pueda chocar? (Docker, otro Kubernetes, etc.) | Evita conflictos de binarios/puertos/configuración |
| 14 | ¿Topología decidida? (nodo único vs. varios, HA o no) | Decisión de arquitectura, no de infraestructura — se toma antes de instalar |
| 15 | ¿Estrategia de backup/recuperación definida? (etcd, datos de aplicación, snapshots) | Perder el clúster no es lo mismo que perder los datos — son cosas distintas que proteger por separado |

## Parte 2 — Resultado de la auditoría: `devops-lab`

**Fecha**: 2026-07-25
**Alcance**: VM `devops-lab` (VirtualBox), acceso vía SSH `127.0.0.1:2222`, usuario `juzz`.
**Método**: comandos de solo lectura vía SSH; ningún comando de escritura, instalación ni
cambio de configuración fue ejecutado.

### Matriz de aptitud

| Requisito | Estado observado | Clasificación | Acción futura |
|---|---|---|---|
| Distribución | Ubuntu 24.04.4 LTS (noble) | Cumple | — |
| Arquitectura | x86_64 / amd64 | Cumple | — |
| systemd | presente, `is-system-running` = `degraded` (1 unidad fallida: `vboxadd.service`) | Cumple con riesgo | Investigar el Guest Additions fuera de esta fase; no bloqueante para RKE2 |
| CPU | 4 núcleos (Intel i7-8700, 1 hilo/núcleo) | Cumple (recomendado RKE2: 4) | — |
| RAM | 5.8 GiB total, ~5.0 GiB disponible | Cumple con riesgo | Ver recomendación de RAM más abajo |
| Disco | 60 GB, 47 GB libres (16% uso), ext4 | Cumple | Monitorear crecimiento tras instalar |
| Inodos | 8% en uso | Cumple | — |
| Hostname | `devops-lab`, estático | Cumple | — |
| Sincronización horaria | NTP activo, reloj sincronizado | Cumple | — |
| Acceso sudo | `juzz` en grupo `sudo`; requiere contraseña interactiva | Cumple | Ansible deberá usar `--ask-become-pass` en el futuro |
| AppArmor | paquete `apparmor` instalado; estado de runtime no verificable sin sudo interactivo | No determinado | Confirmar en fase de preparación |
| NetworkManager | activo y habilitado | Cumple con riesgo | RKE2 recomienda configurarlo para ignorar interfaces gestionadas por el CNI |
| systemd-networkd | inactivo, deshabilitado | Cumple (sin conflicto con NetworkManager) | — |
| Firewall (ufw/nft) | no verificable sin sudo interactivo | No determinado | Confirmar en fase de preparación |
| `net.ipv4.ip_forward` | `0` (deshabilitado) | No cumple | Habilitar en la fase de preparación (Ansible) |
| `br_netfilter` | módulo no cargado, ruta sysctl inexistente | No cumple | Cargar el módulo en la fase de preparación |
| Swap | `0B`, sin entradas en `/etc/fstab` | Cumple | — |
| DNS | resuelve correctamente vía `systemd-resolved` | Cumple | — |
| Conectividad de salida | ruta por defecto vía NAT de VirtualBox (`10.0.2.2`) | Cumple | — |
| Python remoto | 3.12.3 en `/usr/bin/python3` | Cumple (rango Ansible: 3.9–3.14) | — |
| Docker/containerd preexistente | no instalado | Cumple (lienzo limpio) | — |
| Kubernetes/RKE2/kubectl/helm preexistente | no instalado | Cumple (lienzo limpio) | — |
| ansible preexistente | no instalado | Cumple | Se instalará en el controlador, no en el nodo |
| Puertos futuros de RKE2 (6443, 9345, etc.) | libres (solo 22 y 631 en uso) | Cumple | — |
| Naturaleza de la instalación de Ubuntu | paquetes `snap` de escritorio presentes (GNOME, Firefox) — es Ubuntu Desktop, no Server | Cumple con riesgo | Innecesario para un nodo de Kubernetes; no bloqueante |
| Controlador Ansible (Windows) | sin distro WSL de uso general (solo `docker-desktop`, interna) | No cumple | Instalar una distro WSL de propósito general en la Fase 7.1 |
| CNI | no instalado todavía | No aplica | Se decide en fase de instalación (ver ADR-008 y el plan de arquitectura) |
| Ingress | no instalado todavía | No aplica | Idem |
| Almacenamiento persistente | no configurado | No aplica | Idem |
| kubeconfig | no existe | No aplica | Se genera al instalar RKE2 |
| Token del clúster | no existe | No aplica | Se genera al instalar RKE2 |
| Snapshot de VM previo a cambios | no realizado todavía | No aplica | Ver procedimiento de snapshot más abajo — se ejecuta antes de la Fase 7.1, no en esta fase |
| Backup de etcd | no aplica todavía (etcd no existe) | No aplica | Se define al instalar RKE2 |
| Backup de PostgreSQL | fuera de alcance de esta fase | No determinado | Ya existe una estrategia parcial vía volumen Docker (Fase 5); revisar al migrar a Kubernetes |

### Clasificación final

**LISTO CON RIESGOS.**

Ningún hallazgo es bloqueante, pero hay pendientes reales antes de instalar RKE2:

1. RAM por debajo de lo recomendado oficialmente (5.8 GiB vs. 8 GiB recomendados) — ver
   recomendación explícita abajo.
2. `ip_forward` y `br_netfilter` sin configurar (normal en una VM limpia; se resuelve en la
   fase de preparación con Ansible, no ahora).
3. Sin controlador Ansible disponible en Windows todavía (Fase 7.1).
4. `ufw` y AppArmor no verificables sin sesión interactiva con contraseña — pendiente de
   confirmar antes de tocar el firewall.
5. Ubuntu Desktop en lugar de Server — no bloqueante, pero es peso innecesario para un nodo
   de Kubernetes.

### Recomendación de RAM

RKE2 documenta oficialmente 4 GB como mínimo y **8 GB como recomendado** para un nodo server.
Esta VM tendrá, además del control plane y `etcd` embebido, los propios workloads de la
aplicación (API, frontend, PostgreSQL) — todo en un solo nodo. **Recomendación: aumentar a
8 GiB antes de instalar RKE2**, para dejar margen real bajo carga, en vez de operar justo en
el límite mínimo documentado. Este cambio de configuración de VirtualBox no se realizó en
esta fase (fuera de alcance — es una fase de auditoría de solo lectura); queda como decisión
pendiente de aprobación para antes de la Fase 7.1 o 7.2.

## Procedimiento de snapshot (a ejecutar antes de modificar la VM, no en esta fase)

1. Validar que la conexión SSH sigue funcionando.
2. Apagar Ubuntu de forma segura (`sudo shutdown now`, no forzar el apagado desde VirtualBox).
3. Crear un snapshot de VirtualBox, con nombre y fecha descriptivos (ej.
   `devops-lab-pre-rke2-2026-07-25`).
4. Encender la VM.
5. Verificar nuevamente la conexión SSH.
6. A partir de ahí, aplicar cambios de forma gradual (rol por rol de Ansible), verificando
   conectividad después de cada uno.

Reglas adicionales:

- No modificar firewall y SSH en el mismo cambio — si algo sale mal, hay que poder distinguir
  cuál de los dos rompió el acceso.
- Mantener una sesión SSH abierta mientras se aplican cambios de red, como red de seguridad.
- No reiniciar la VM automáticamente sin aprobación explícita.
- Backup de `etcd` y snapshot de VM son mecanismos distintos y complementarios: el snapshot
  protege contra "rompí el sistema operativo o la instalación de RKE2"; el backup de `etcd`
  protege contra "perdí el estado del clúster pero el sistema operativo sigue sano"; el backup
  de PostgreSQL protege los datos de la aplicación, independientemente de los otros dos.
