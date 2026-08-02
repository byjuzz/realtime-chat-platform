# Rol `firewall`

## Responsabilidad futura

Política de `ufw` de mínimo privilegio para `devops-lab`: conservar acceso
SSH, abrir únicamente los puertos que RKE2/Kubernetes necesitan en este
nodo específico (nodo único, sin agents todavía).

## Qué hace en el Checkpoint 7.2A

Solo auditoría, sin `become: true`:

- Comprueba si `ufw` está instalado (`which ufw`).
- Intenta leer `ufw status` — **esto puede fallar sin privilegios de
  root**, y de hecho falló durante la auditoría de la Fase 7.0 (ver
  [runbook de auditoría](../../../docs/runbooks/ubuntu-rke2-readiness-audit.md),
  fila "Firewall (ufw/nft)": *"no verificable sin sudo interactivo"*). Este
  rol reporta esa limitación tal cual, no la evita escalando privilegios —
  `prepare-server.yml` usa `become: false` deliberadamente en este
  checkpoint.

## Variables

| Variable | Default | Significado |
|---|---|---|
| `firewall_enable_ufw` | `false` | Guard — habilitar `ufw`, deshabilitado |
| `firewall_manage_rules` | `false` | Guard — crear/borrar reglas, deshabilitado |
| `firewall_future_ports` | tabla de 7 puertos (ver `defaults/main.yml`) | Referencia, no aplicada |

## Tabla de puertos futura (documentada, no aplicada)

| Puerto | Protocolo | Alcance | Propósito |
|---|---|---|---|
| 22 | TCP | Administrativo — Windows → `devops-lab` | SSH del desarrollador |
| 6443 | TCP | Nodo único / LAN del laboratorio | API server de Kubernetes |
| 9345 | TCP | Nodo único / LAN del laboratorio | Supervisor RKE2 (relevante si algún día hay agents) |
| 10250 | TCP | Nodo único / LAN del laboratorio | Kubelet |
| 2379 | TCP | Futuro — solo si `etcd` deja de ser embebido | `etcd` cliente |
| 2380 | TCP | Futuro — solo si hay más de un nodo | `etcd` peer |
| 8472 | UDP | **Solo tráfico entre nodos del clúster** | VXLAN (CNI tipo Flannel/Canal) |

**`8472/udp` nunca se propone abrir globalmente/públicamente.** Es tráfico
de la capa de red superpuesta (overlay) entre nodos del clúster — en un
clúster de un solo nodo ni siquiera se usa activamente, y si en el futuro
hay más nodos, ese tráfico debe viajar solo por la red interna/privada
entre ellos, nunca expuesto al NAT público de VirtualBox ni a Internet.

## Diferencia de alcance

- **Nodo único** (topología actual): 6443/9345/10250 solo necesitan ser
  alcanzables desde el propio nodo — no requieren regla de firewall si
  nada externo los consume todavía.
- **Acceso desde Windows**: solo el puerto 22 (SSH) necesita ser alcanzable
  desde la máquina de desarrollo, vía el reenvío de puertos de VirtualBox
  (`127.0.0.1:2222`).
- **Tráfico entre nodos (futuro)**: 8472/udp, 2379-2380/tcp — solo si algún
  día se agregan nodos `agent`, y solo en la red privada entre ellos.
- **Acceso público**: ninguno de estos puertos se expone a Internet en
  ningún escenario de este proyecto (laboratorio, no producción con
  ingreso público planeado en esta fase).
- **NAT de VirtualBox**: el reenvío de puertos del host Windows hacia la VM
  es responsabilidad de VirtualBox, no de `ufw` dentro de la VM — son dos
  capas distintas y no deben confundirse.

## Cambios que hará en una fase futura (7.2C)

Habilitar `ufw` y aplicar la tabla de puertos de arriba, **solo cuando**
`firewall_enable_ufw: true` y `firewall_manage_rules: true` se aprueben
explícitamente, y solo después de auditar las reglas actuales con
privilegios (`become: true` puntual, no global).

## Idempotencia

Las lecturas actuales son `changed_when: false` explícito. Las reglas
futuras usarán el módulo `community.general.ufw` (declarativo, agregar una
regla ya presente no reporta cambio).

## Riesgos

Modificar el firewall es la operación más sensible de todo el checkpoint
futuro: un error puede cortar el acceso SSH y dejar la VM inalcanzable.
Por eso el runbook de la Fase 7.0 ya estableció la regla de **no modificar
firewall y SSH en el mismo cambio**, y de mantener una sesión SSH abierta
como red de seguridad mientras se aplican cambios de red.

## Validación

Lectura de `ufw status` (cuando sea posible) expuesta vía
`ansible.builtin.debug`. En el futuro, `validate-rke2.yml` confirmará que
los puertos requeridos están efectivamente accesibles.

## Reversión

No aplica en este checkpoint (nada se modifica). En el futuro: `ufw` puede
deshabilitarse (`ufw disable`) o cada regla puede borrarse individualmente
(`ufw delete <regla>`) — documentado con más detalle cuando 7.2C lo
implemente.

## Por qué pertenece aquí y no a otro rol

Es el único rol que toca reglas de red del sistema operativo — separado de
`system_prerequisites` (kernel/sysctl) porque el firewall es una capa de
seguridad de red, no un requisito de arranque de Kubernetes en sí.
