# RKE2 desde cero

Guía de referencia completa, escrita durante la Fase 7.1. Ver también
[ADR-008](../adr/ADR-008-infrastructure-as-code-with-ansible.md) para las decisiones de
diseño y [el runbook del controlador](../runbooks/ansible-controller-devops-lab-setup.md)
para cómo se preparó el entorno real.

## 1. Kubernetes desde cero

Docker Compose describe contenedores y los levanta en **una sola máquina**. Funciona bien
mientras todo cabe en un servidor y nadie necesita que el sistema se "auto-repare".

Kubernetes resuelve un problema distinto: mantener un sistema corriendo en varias máquinas,
**auto-reparándose**, sin que un humano reaccione manualmente cada vez que algo falla.

- **Contenedor**: igual que en Docker — un proceso aislado con su propio sistema de archivos.
- **Pod**: la unidad mínima que Kubernetes programa. Normalmente un pod = un contenedor, pero
  puede tener varios que *siempre* corren juntos (comparten red y almacenamiento).
- **Deployment**: *"quiero N copias de este pod, siempre corriendo"*. Si un pod muere, el
  Deployment crea otro.
- **Service**: una IP/nombre **estable** que apunta a un grupo de pods, aunque esos pods
  cambien constantemente (se reinicien, se muevan, escalen).

**El corazón de Kubernetes — reconciliación**: tú declaras el **estado deseado** (guardado en
`etcd`). El **controller-manager** revisa constantemente el **estado real** y corrige
desviaciones, en bucle, sin intervención humana. Por esto Kubernetes **no es "Docker con más
comandos"**: Docker Compose ejecuta lo que le pides y se queda quieto; Kubernetes vigila
permanentemente.

## 2. RKE2

**RKE2** = "Rancher Kubernetes Engine 2", de **SUSE/Rancher**. Es una **distribución** de
Kubernetes — Kubernetes empaquetado de forma más fácil de instalar y más segura por defecto,
no un Kubernetes distinto.

| Opción | Qué es | Por qué no se eligió |
|---|---|---|
| Kubernetes upstream (`kubeadm`) | Cada pieza se arma a mano | Más trabajo manual, más superficie de error para un laboratorio de aprendizaje |
| K3s | Otra distribución de Rancher, para dispositivos pequeños/edge | RKE2 es el hermano orientado a seguridad/cumplimiento |
| **RKE2** ✅ | Kubernetes empaquetado, orientado a CIS Benchmark, systemd | Elegido en ADR-002 |
| Docker Compose (ya en uso) | Orquestación de un solo host, sin reconciliación | Es el escalón anterior, no reemplazado todavía |

RKE2 empaqueta `containerd`, un CNI por defecto, un Ingress por defecto y `etcd` embebido —
todo con un solo binario y un servicio systemd. La API, los objetos (`Pod`, `Deployment`,
`Service`) y `kubectl` son **Kubernetes estándar**, sin modificar.

### Tipos de nodo

- **Server**: control plane (API, scheduler, controller-manager) + `etcd`. El "cerebro".
- **Agent/worker**: solo corre workloads, no toma decisiones de orquestación.

**Nuestro laboratorio**: un único nodo `server`, que también ejecuta workloads — comparte los
4 CPU/5.8 GiB de RAM entre el control plane y la aplicación. **No es alta disponibilidad**: si
la VM se cae, se cae todo.

## 3. Topología del laboratorio (arquitectura definitiva, Fase 7.1)

```
Windows
  |  (host de VirtualBox, edición, cliente Git, cliente SSH —
  |   NO controlador Ansible, NO Python de Ansible, NO WSL)
  |
  +-- VirtualBox
        |
        +-- devops-lab (Ubuntu 24.04) — TODO en uno:
              |
              +-- controlador Ansible (venv + ansible-core)
              +-- nodo administrado (ansible_connection: local)
              +-- futuro: rke2-server + embedded etcd + containerd + kubelet
              +-- futuro: control plane + workloads (API, web, PostgreSQL)
```

**Decisión definitiva, no un paso intermedio**: `devops-lab` es controlador y nodo
administrado a la vez, vía `ansible_connection: local`. Windows queda exclusivamente como
anfitrión de VirtualBox y cliente (Git/SSH/edición) — nunca ejecuta Ansible ni Python para
Ansible. Esta decisión se tomó explícitamente por los recursos limitados del host de
desarrollo, aceptando el tradeoff: si `devops-lab` se rompe, se reconstruye desde cero
(Git + bootstrap + Ansible + backups), en vez de depender de un controlador externo que
sobreviva a la VM.

## 4. Cómo arranca RKE2 (conceptual — no ejecutado en esta fase)

| # | Paso | Proceso/componente | Puerto | Archivo clave | Logs | Síntoma si falla |
|---|---|---|---|---|---|---|
| 1 | systemd inicia el servicio | `rke2-server.service` (proceso del host) | — | unidad systemd | `journalctl -u rke2-server` | Nunca queda `active` |
| 2 | Lee configuración | `rke2` | — | `/etc/rancher/rke2/config.yaml` | igual | Falla si el YAML es inválido |
| 3 | Valida entorno | `rke2` | — | — | igual | Aborta si faltan prerrequisitos de kernel |
| 4 | Prepara directorios de datos | `rke2` | — | `/var/lib/rancher/rke2` | igual | Error de permisos |
| 5 | Carga/descarga imágenes del sistema | `rke2` | — | `/var/lib/rancher/rke2/agent/images` | igual | Timeout si depende de red |
| 6 | Inicia el container runtime | `containerd` (host) | socket unix | `/run/k3s/containerd/containerd.sock` | `journalctl -u rke2-server` | Nada puede arrancar |
| 7 | Levanta `etcd` embebido | proceso gestionado | `2379`/`2380`/`2381` | `/var/lib/rancher/rke2/server/db` | igual | El API server no arranca |
| 8 | Levanta el control plane | static pods (`kube-apiserver`, `kube-scheduler`, `kube-controller-manager`) | `6443` (API) | `/var/lib/rancher/rke2/server/manifests` | `journalctl` + `crictl logs` | `kubectl` no conecta |
| 9 | Inicia `kubelet`/`kube-proxy` | procesos del host | `10250` | — | igual | Nodo nunca aparece en `kubectl get nodes` |
| 10 | Despliega componentes empaquetados | Helm controller interno, pods gestionados | — | manifiestos | `kubectl logs` | CNI/CoreDNS/Ingress en `Pending` |
| 11 | Instala el CNI | Canal, DaemonSet | `8472/UDP`, `9099` | manifiestos del CNI | `kubectl logs -n kube-system` | Pods sin IP |
| 12 | Se crea la red de pods | resultado del CNI | — | — | — | Pods sin red no se comunican |
| 13 | CoreDNS disponible | pod gestionado | `53` (interno) | — | `kubectl logs -n kube-system` | Pods no resuelven nombres |
| 14 | Ingress disponible | Traefik, pod gestionado | `80`/`443` | — | `kubectl logs` | Tráfico externo no llega |
| 15 | Nodo pasa a `Ready` | `kubelet` reporta salud | — | — | `kubectl get nodes` | `NotReady` si el CNI no terminó |
| 16 | `kubectl` puede consultar la API | cliente | `6443` | `/etc/rancher/rke2/rke2.yaml` | — | Error de certificado/conexión |
| 17 | Workloads programables | `kube-scheduler` | — | — | — | Pods en `Pending` |

Esta secuencia es el **orden conceptual esperado**, contrastado con la arquitectura
documentada de RKE2 — no una garantía línea por línea del código fuente.

**Qué corre dónde**: procesos del host (`rke2-server`, `containerd`, `kubelet`, `kube-proxy`);
static pods (`kube-apiserver`, `kube-scheduler`, `kube-controller-manager`, `etcd`); pods
gestionados normales (CNI, CoreDNS, Ingress, metrics-server); todos ejecutan, en última
instancia, dentro de `containerd`.

## 5. Componentes internos

| Componente | Qué hace | Dónde corre | Con quién habla | Si falla | RKE2 o estándar |
|---|---|---|---|---|---|
| `kube-apiserver` | Única puerta de entrada al clúster | static pod | `etcd`; todo lo demás lo consulta a él | Clúster "ciego", nada se gestiona (lo que ya corría, sigue corriendo) | Estándar |
| `kube-scheduler` | Decide en qué nodo va cada pod nuevo | static pod | API server | Pods nuevos quedan `Pending` | Estándar |
| `kube-controller-manager` | Bucles de reconciliación | static pod | API server | El clúster deja de auto-repararse | Estándar |
| `kubelet` | Agente local, gestiona pods en su nodo | proceso del host | API server, `containerd` | Nodo `NotReady` | Estándar (binario empaquetado por RKE2) |
| `kube-proxy` | Enruta tráfico de Services | proceso del host | reglas `iptables`/`nftables` | Services dejan de enrutar | Estándar |
| `etcd` | Base de datos del estado del clúster | proceso gestionado | Solo el API server | Clúster inoperante | Estándar, embebido por RKE2 |
| `containerd` | Runtime real de contenedores | proceso del host | `kubelet` | Nada puede correr en el nodo | Proyecto CNCF independiente, empaquetado por RKE2 |
| CoreDNS | Resuelve nombres dentro del clúster | pod gestionado | Consultado por otros pods | Pods no resuelven nombres nuevos | Estándar |
| metrics-server | Uso de CPU/RAM de pods/nodos | pod gestionado | API server | `kubectl top` deja de funcionar (no crítico) | Estándar, opcional |
| Canal (Flannel+Calico) | Red de pods (overlay) + políticas de red | DaemonSet | Entre nodos vía VXLAN | Pods sin red | Default de RKE2, intercambiable |
| Traefik | Ingress — entrada HTTP/HTTPS externa | pod gestionado | Services internos | Tráfico externo no enruta | Default de RKE2 (verificar versión vigente) |
| Helm controller | Instala los componentes empaquetados de RKE2 | interno | API server | Componentes no se auto-instalan | RKE2 |
| Cloud controller manager | Integración con APIs de nube | — | — | No aplica a este laboratorio | Estándar, no usado aquí |
| ServiceLB | "Load balancer" simple sin proveedor de nube | pod gestionado | — | Services `LoadBalancer` no obtienen IP externa | RKE2 |
| CSI | Interfaz estándar de almacenamiento | — | — | Sin volúmenes dinámicos | Estándar; almacenamiento local en este laboratorio |

### Diagrama de comunicación

```
kubectl (o Ansible, en fases futuras)
   |
   v
kube-apiserver  <-- única puerta de entrada
   |
   +--> etcd
   +--> kube-scheduler
   +--> kube-controller-manager
   +--> kubelet
             |
             +--> containerd
                     |
                     +--> pods (API, web, PostgreSQL)
```

## 6. Requisitos (verificados contra documentación oficial, Fase 7.0/7.1)

### Hardware

| Requisito | Mínimo oficial | Recomendado oficial | `devops-lab` |
|---|---|---|---|
| CPU | 2 | 4 | 4 — cumple lo recomendado |
| RAM | 4 GB | 8 GB | 5.8 GiB — entre mínimo y recomendado |

`etcd` es sensible a latencia de disco y consume RAM base incluso sin workloads; sumado al
resto del control plane y a la propia aplicación (todo en un nodo), la RAM es el recurso más
ajustado.

### Sistema operativo / kernel

- systemd, `iptables`/`nftables`, x86_64 — todo confirmado en `devops-lab`.
- `net.ipv4.ip_forward` y `br_netfilter`: **no configurados hoy** (confirmado en la
  auditoría de la Fase 7.0) — se resuelven en la fase de instalación, vía Ansible.
- `overlayfs`, `cgroups` v2, `conntrack`: estándar del kernel de Ubuntu 24.04.
- Límites de `inotify`: relevantes solo con muchos pods — documentado por RKE2, no crítico
  para este laboratorio hoy.

### Seguridad

- AppArmor: **confirmado `enabled`** (Fase 7.1, vía `ansible_facts` — pendiente en la Fase 7.0
  por falta de sudo interactivo, resuelto automáticamente por Ansible).
- Certificados/tokens: los genera RKE2 al instalar (sección 8).
- Firewall: abrir solo lo necesario (sección 7), nunca "todo".

### Red

- DNS, salida a internet, IP estable (`10.0.2.15` vía NAT de VirtualBox): confirmados.
- NetworkManager activo — RKE2 recomienda configurarlo para ignorar interfaces del CNI.

## 7. Puertos de RKE2

| Puerto | Protocolo | Origen | Destino | Función | ¿Nodo único? | ¿Desde Windows? | ¿Internet? |
|---|---|---|---|---|---|---|---|
| 22 | TCP | Windows | devops-lab | SSH | Sí | Sí (reenviado `127.0.0.1:2222`) | No |
| 6443 | TCP | clientes autorizados | RKE2 server | API de Kubernetes | Sí | Solo si administras desde Windows | No |
| 9345 | TCP | otros nodos RKE2 | RKE2 server | Registro de nuevos nodos | **No** en nodo único | No | No |
| 10250 | TCP | control plane | kubelet | Métricas/logs | Sí, interno | No | No |
| 2379 | TCP | servers | servers | Cliente etcd | Sí, solo local | No | **Nunca** |
| 2380 | TCP | servers | servers | Peer etcd | **No** en nodo único | No | No |
| 2381 | TCP | servers | servers | Métricas etcd | Opcional | No | No |
| 30000-32767 | TCP | según diseño | nodos | NodePort | Si se usa NodePort | Depende | Evaluar caso por caso |
| 8472 | UDP | nodos | nodos | VXLAN Canal/Flannel | Sí, interno | **No** | **Nunca** |
| 9099 | TCP | nodos | nodos | Healthcheck Canal | Sí, interno | No | No |
| 80 | TCP | clientes | Ingress | HTTP (futuro) | Sí, al exponer la app | Sí | Con cuidado |
| 443 | TCP | clientes | Ingress | HTTPS (futuro) | Sí | Sí | Con cuidado |

### Diferencias de "puerto"

Puerto del host (escucha el SO) ≠ `containerPort` (declarado por el contenedor) ≠ Service
`port` (al que otros pods le pegan) ≠ `targetPort` (a dónde redirige realmente) ≠ NodePort
(puerto abierto en el nodo mismo) ≠ puerto del Ingress (80/443, entrada única) ≠ puerto
reenviado por VirtualBox NAT (`2222→22`, capa aparte) ≠ puerto interno de pod (nunca directo
desde fuera) ≠ puerto del API server (fijo, `6443`).

**El puerto VXLAN (`8472/UDP`) nunca debe exponerse públicamente** — es tráfico interno entre
nodos del clúster.

### Matriz futura de firewall de mínimo privilegio (propuesta, no aplicada)

| Puerto | Regla propuesta |
|---|---|
| 22 | Solo desde el host Windows (ya restringido por el NAT de VirtualBox) |
| 6443 | Solo desde quien administre el clúster |
| 9345, 2379, 2380, 2381, 10250 | Bloqueado desde fuera del nodo |
| 8472/UDP, 9099 | Bloqueado desde fuera del nodo |
| 80, 443 | Abiertos al exponer la app, con reenvío explícito |
| 30000-32767 | Cerrado salvo necesidad específica |

## 8. Redes de Kubernetes

Capas, de afuera hacia adentro: red física → NAT de VirtualBox → port forwarding → IP del
nodo → pod network (CNI) → Service network → Cluster DNS (CoreDNS) → overlay/VXLAN.

- Un **pod** obtiene IP propia porque Kubernetes lo trata como una "mini-máquina" con
  identidad de red propia.
- Un **Service** obtiene otra IP porque los pods son efímeros — el Service es una capa
  estable encima de pods inestables.
- `ClusterIP` **no** se accede desde Windows — solo existe dentro de la red virtual del
  clúster.
- **NodePort** expone un puerto del nodo real — sí alcanzable con el reenvío adecuado.
- **Ingress** enruta por host/path — un único punto de entrada (80/443) que decide a qué
  Service mandar el tráfico, igual rol que hoy cumple Nginx en `docker-compose.yml`.

### Socket.IO específicamente

- Necesita **upgrade de conexión** HTTP → WebSocket (`Connection: Upgrade`).
- El **Ingress debe preservar esos headers** — si no, WebSocket falla o cae a long-polling.
- **CORS no es firewall**: CORS decide qué puede *leer* el navegador; el firewall decide si
  el paquete *llega*. Son capas distintas (lo vivimos configurando el túnel de Cloudflare).
- **DNS no es Ingress**: DNS resuelve nombre→IP; Ingress decide, ya con el tráfico ahí, a
  dónde mandarlo según dominio/ruta.

### Recorridos completos

```
HTTP normal:
Navegador -> NAT/port forwarding -> Ingress -> Service "web" -> Pod "web"
          -> Service "api" -> Pod "api" -> PostgreSQL

Socket.IO:
Navegador -> Ingress (upgrade WebSocket, headers preservados) -> Service "api"
          -> Pod "api" (servidor Socket.IO) -> sala -> segundo cliente
```

Mismo principio ya validado con `scripts/ci/socket-smoke.mjs` contra Nginx en Docker Compose:
**nunca conectarse directo al pod de la API, siempre a través del punto de entrada público.**

### Valores por defecto de RKE2 (referencia, no configurados)

Pod CIDR `10.42.0.0/16`, Service CIDR `10.43.0.0/16`, Cluster DNS `10.43.0.10`, Cluster
domain `cluster.local`, NodePort range `30000-32767`.

## 9. `config.yaml`

`/etc/rancher/rke2/config.yaml` — lo lee `rke2-server`/`rke2-agent` **solo al arrancar**
(cambios requieren reinicio). Prioridad: banderas de línea de comandos > variables de entorno
> `config.yaml` > valores por defecto.

Valores que deben coincidir entre servers (si hubiera más de uno): `token`, `cluster-cidr`,
`service-cidr`, CNI elegido. Valores que **no** deben cambiar después de crear el clúster:
`cluster-cidr` y `service-cidr` — cambiarlos implica reconstruir el clúster.

Ver el ejemplo comentado completo en
[`infra/ansible/examples/rke2-config.single-node.yaml.example`](../../infra/ansible/examples/rke2-config.single-node.yaml.example).

## 10. Archivos y directorios clave

| Ruta | Contenido | Sensibilidad | ¿Versionable? | ¿Regenerable? |
|---|---|---|---|---|
| `/etc/rancher/rke2/config.yaml` | Configuración del nodo | Media | Como ejemplo sí | Sí |
| `/etc/rancher/rke2/rke2.yaml` | kubeconfig administrativo | **Alta** | **Nunca** | Sí, con nuevos certificados |
| `/etc/rancher/rke2/registries.yaml` | Registros de imágenes privados | Media | Como ejemplo sí | Sí |
| `/var/lib/rancher/rke2` | Todos los datos del clúster | **Muy alta** | No | Parcial sin backup de `etcd` |
| `/var/lib/rancher/rke2/server/node-token` | Token para unir nodos | **Muy alta** | **Nunca** | Sí, se regenera |
| `/var/lib/rancher/rke2/server/manifests` | Manifiestos auto-desplegados | Baja | Como referencia sí | Sí |
| `/run/k3s/containerd/containerd.sock` | Socket de `containerd` | Media | No aplica | Se recrea |
| Unidad systemd `rke2-server` | Definición del servicio | Baja | Sí (estándar del paquete) | Sí |

## 11. Certificados, token y kubeconfig

RKE2 genera su propia **CA interna** al instalar, y firma con ella los certificados de todos
sus componentes. **SAN (`tls-san`)**: un certificado es válido solo para los nombres/IPs
declarados — acceder por uno distinto lo invalida.

**Token de registro** ≠ **kubeconfig administrativo**: el token permite que un nodo se *una*
al clúster; el kubeconfig da *control total*. Ninguno se versiona. Copiar un kubeconfig fuera
de la VM requiere protegerlo igual que una clave SSH privada. Reemplazar `127.0.0.1` por la
dirección administrativa real tiene impacto — el kubeconfig generado en la propia VM suele
apuntar a `127.0.0.1:6443`.

### Modelo de amenazas

| Amenaza | Impacto |
|---|---|
| Robo de clave SSH | Acceso a la VM como `juzz` |
| Robo del token de nodo | Nodo malicioso podría unirse al clúster |
| Robo del kubeconfig administrativo | Control total del clúster — el peor escenario |
| API server expuesto sin restricción | Superficie de ataque directa |
| Firewall demasiado abierto | Amplifica los riesgos anteriores |
| SAN incorrectos | Riesgo de disponibilidad, no de seguridad directa |

## 12. `etcd`, datos y recuperación

```
Snapshot de VM (VirtualBox)  ≠  Snapshot de etcd  ≠  Backup de PostgreSQL  ≠  Manifiestos en Git
```

- **`etcd`**: guarda el estado *de Kubernetes* (qué debería existir), **no** los datos de la
  aplicación.
- **PostgreSQL**: guarda los datos reales (mensajes, salas, usuarios) — completamente aparte.
- Snapshot de VM: protege el sistema operativo/instalación completa, grano grueso.
- Snapshot de `etcd`: protege específicamente el estado de Kubernetes.
- Backup de PostgreSQL: protege los datos reales, independiente de todo lo anterior.
- Manifiestos en Git: la "receta" para reconstruir la estructura — sin datos.

| Se pierde | Impacto |
|---|---|
| `/var/lib/rancher/rke2` sin backup | Reinstalar RKE2 desde cero (recuperable vía Ansible) |
| Token | Se regenera, solo afecta nodos por unir |
| kubeconfig | Se puede regenerar/recopiar mientras la VM viva |
| `etcd` sin snapshot | Se pierde la config de Kubernetes — reconstruir desde manifiestos Git |
| Volumen de PostgreSQL sin backup | **Se pierden los datos reales** — lo más grave |
| Repositorio Git | Mitigado: GitHub es en sí mismo un backup remoto del código |

## 13. Alta disponibilidad

**Quorum**: en `etcd`, las decisiones requieren **mayoría** — por eso siempre número **impar**
de servers (1, 3, 5). Con 3, se puede perder 1 y seguir con mayoría (2 de 3); con 2 (par),
perder 1 deja empate.

- **1 server** (nuestro caso): sin HA, simple, frágil.
- **3 servers**: HA real, sobrevive a la pérdida de cualquiera.
- Un diseño HA necesitaría además un **load balancer** delante de `6443`/`9345`, y
  posiblemente `agent` nodes dedicados a workloads con `taints` que excluyan al control plane.

**Nuestro laboratorio**: un nodo, **no es HA**, **no debe describirse como producción**,
**sí puede reconstruirse completo vía IaC**, y **sigue necesitando backups de datos reales**
de forma independiente — IaC reconstruye infraestructura, no devuelve datos nunca
respaldados.

## 14. Observabilidad (referencia, no implementada)

`metrics-server` (uso de CPU/RAM), `kubectl top`, logs vía `kubectl logs`/`journalctl`. Una
pila más completa (Prometheus/Grafana) queda fuera de alcance de esta fase — mencionada aquí
solo como referencia de qué existiría en un clúster más maduro.

## 15. Relación con Ansible

| Acción manual | Módulo Ansible declarativo |
|---|---|
| Instalar paquetes | `ansible.builtin.apt` |
| Crear directorios | `ansible.builtin.file` |
| Copiar configuración | `ansible.builtin.template` |
| Cargar módulos del kernel | `community.general.modprobe` (o mecanismo aprobado) |
| Persistir `sysctl` | `ansible.posix.sysctl` |
| Configurar firewall | módulo correspondiente al firewall elegido |
| Descargar/verificar RKE2 | `get_url` + checksum, o método aprobado |
| Habilitar servicio | `ansible.builtin.systemd_service` |
| Validar puertos | `wait_for` |
| Verificar nodo `Ready` | `command`/`kubernetes.core.k8s_info` (fase futura) |

### Ejemplo: de comando manual a tarea idempotente

**Manual**: `sudo apt install apparmor-parser`

**Declarativo (correcto)**:
```yaml
- name: Asegurar apparmor-parser instalado
  ansible.builtin.apt:
    name: apparmor-parser
    state: present
    update_cache: true
```
Ansible verifica el estado *antes* de actuar — si ya está instalado, no hace nada
(`changed: false`). Ejecutarlo dos veces produce el mismo resultado la segunda vez
(**idempotencia**).

**Ejemplo incorrecto**:
```yaml
- name: Instalar apparmor-parser (mal)
  ansible.builtin.shell: apt install apparmor-parser
```
Esto **no es idempotente de forma confiable** (reporta `changed` siempre, sin verificar
estado real), no distingue error real de "ya estaba instalado", y pierde toda la validación
que el módulo `apt` ya hace (nombres de paquete, manejo de errores de `apt`, etc.). `shell`/
`command` se reservan para cuando **no existe** un módulo declarativo equivalente.

### Conceptos de Ansible

- **Idempotencia**: correr algo N veces da el mismo resultado que correrlo una vez.
- **`changed`/`ok`/`failed`**: si una tarea *modificó* algo, si *no hizo falta* modificar
  nada, o si *falló*.
- **`handler`/`notify`**: una tarea puede *notificar* a un handler (ej. "reiniciar servicio")
  que solo corre si algo realmente cambió — evita reinicios innecesarios.
- **Check mode** (`--check`): simula sin aplicar cambios reales.
- **Diff mode** (`--diff`): muestra qué cambiaría exactamente.
- **Tags**: permiten correr subconjuntos de tareas (`--tags firewall`).
- **Inventory**: la lista de hosts a administrar, agrupados.
- **`group_vars`/`host_vars`**: variables por grupo o por host específico.
- **Role**: una unidad reutilizable de tareas/variables/templates con una responsabilidad.
- **Playbook**: un archivo que orquesta plays (grupos de tareas contra hosts).
- **Collection**: un paquete distribuible de roles/módulos/plugins.
- **Module**: la unidad mínima de acción (`apt`, `file`, `template`, `assert`, etc.).

## 16. Troubleshooting (referencia rápida)

| Síntoma | Dónde mirar primero |
|---|---|
| `rke2-server` no arranca | `journalctl -u rke2-server` |
| Nodo en `NotReady` | Estado del CNI (`kubectl get pods -n kube-system`) |
| Pods en `Pending` sin IP | CNI no terminó de configurarse |
| `kubectl` no conecta | Certificado (`tls-san`), o el API server no arrancó |
| Servicio no resuelve por DNS | CoreDNS (`kubectl logs -n kube-system -l k8s-app=kube-dns`) |
| Tráfico externo no llega | Ingress, reglas de firewall, reenvío de VirtualBox |
| WebSocket de Socket.IO falla | Headers `Upgrade`/`Connection` no preservados por el Ingress |

## 17. Glosario

- **Pod**: unidad mínima programable, uno o más contenedores que siempre corren juntos.
- **Deployment**: declaración de "N réplicas de este pod, siempre".
- **Service**: IP/nombre estable que enruta hacia pods, aunque cambien.
- **Ingress**: punto de entrada HTTP/HTTPS externo, enruta por host/path.
- **`etcd`**: base de datos del estado del clúster.
- **CNI**: plugin que da red a los pods.
- **CSI**: interfaz estándar de almacenamiento.
- **Namespace**: partición lógica dentro de un clúster (ver ADR-002: `chat-dev`/`chat-uat`/`chat-prod`).
- **Node**: una máquina (VM o física) que forma parte del clúster.
- **Control plane**: los componentes que administran el clúster (API, scheduler, controller-manager, `etcd`).
- **Reconciliación**: el bucle que corrige el estado real hacia el estado deseado.
- **kubeconfig**: archivo de configuración de acceso a un clúster.
- **Idempotencia**: aplicar una operación varias veces produce el mismo resultado que aplicarla una vez.

## 18. Preguntas de comprobación

1. ¿Por qué Kubernetes no es "Docker con más comandos"?
2. ¿Qué diferencia hay entre un pod y un Service, y por qué existen ambos conceptos por separado?
3. ¿Qué corre como proceso del host, qué como static pod, y qué como pod gestionado normal?
4. ¿Por qué el puerto VXLAN (`8472/UDP`) nunca debe exponerse públicamente?
5. ¿Por qué `ClusterIP` no es accesible directamente desde Windows?
6. ¿Qué diferencia hay entre CORS y un firewall?
7. ¿Por qué `cluster-cidr`/`service-cidr` no deben cambiarse después de crear el clúster?
8. ¿Qué diferencia hay entre el token de registro de nodo y el kubeconfig administrativo?
9. ¿Por qué un snapshot de VM no sustituye un backup de PostgreSQL?
10. ¿Por qué un número impar de servers, y no simplemente "más servers es mejor"?
11. ¿Por qué `shell: apt install ...` es peor que el módulo `ansible.builtin.apt`?
12. En nuestro laboratorio, si `devops-lab` se pierde por completo, ¿qué se necesita para reconstruirlo, y qué **no** se recupera solo con eso?
