# infra/bootstrap

## Para qué existe

Ansible necesita Python, un entorno virtual y sus propios paquetes
(`ansible-core`, `ansible-lint`) para poder ejecutarse. Una VM Ubuntu recién
creada no tiene nada de eso instalado. `bootstrap-controller.sh` resuelve
ese primer eslabón — el "problema circular" descrito abajo — sin depender de
Ansible para hacerlo, porque en ese momento Ansible todavía no puede correr.

## El problema circular

No se puede usar Ansible para instalar lo que Ansible necesita para
arrancar (Python, `venv`, `ansible-core`). Por eso este script es una pieza
de shell puro, sin dependencias de Ansible ni de ninguna otra herramienta
que no venga ya en una instalación mínima de Ubuntu (`bash`, `apt-get`,
`dpkg`, `python3` una vez instalado).

## Requisitos previos

- Ubuntu (cualquier versión con `apt-get`), arquitectura `amd64`/`x86_64`.
- Un usuario normal (no root) con `sudo` disponible.
- Un clon de este repositorio (el script confirma que corre dentro de uno
  válido, buscando `.git/` y `infra/ansible/requirements-controller.txt`
  relativos a su propia ubicación).
- Acceso de red para `apt-get` y `pip` (paquetes oficiales de Ubuntu/PyPI,
  nada fuera de eso).

## Qué instala

- Paquetes apt, **solo los que falten**: `python3`, `python3-venv`,
  `python3-pip`, `git`, `ca-certificates`.
- Un entorno virtual de Python (por defecto en `~/.venvs/realtime-chat-ansible`,
  el mismo valor ya documentado en
  [`infra/ansible/requirements-controller.txt`](../ansible/requirements-controller.txt)).
- Dentro de ese venv: las versiones fijadas `ansible-core==2.20.7` y
  `ansible-lint==26.6.0`, leídas de ese mismo archivo — nunca hardcodeadas
  dos veces.

## Qué NO instala

- RKE2, Kubernetes, `kubectl`, `helm`, Docker, `containerd`.
- Nada que toque kernel, `sysctl`, módulos del kernel, swap, firewall
  (`ufw`), o `NetworkManager` — eso es trabajo de los roles de Ansible en
  `infra/ansible/roles/`, no de este script.
- Nada fuera del alcance de "dejar el controlador de Ansible listo".

## Modo `--check`

```bash
./infra/bootstrap/bootstrap-controller.sh --check
```

Audita y reporta qué paquetes apt faltan y si el entorno virtual existe,
**sin ejecutar `apt-get`, sin crear el venv y sin instalar nada de Python**.
Es seguro correrlo en cualquier momento, incluso repetidamente.

Este `--check` solo se ejecutará contra `devops-lab` después de revisar el
script completo y sincronizar la rama — no se ejecuta como parte de este
checkpoint desde Windows (Windows no ejecuta Ansible ni este script, ver
arquitectura en `CLAUDE.md`).

## Ejecución normal (futura)

```bash
./infra/bootstrap/bootstrap-controller.sh
# o con una ruta de venv distinta:
./infra/bootstrap/bootstrap-controller.sh --venv-path /ruta/alternativa
```

Tras terminar, activa el entorno virtual:

```bash
source ~/.venvs/realtime-chat-ansible/bin/activate
ansible --version
ansible-lint --version
```

A partir de ahí, los playbooks de `infra/ansible/playbooks/` pueden
ejecutarse localmente (`ansible_connection: local`, ver ADR-008).

## Entorno virtual

- Ruta por defecto: `~/.venvs/realtime-chat-ansible` — fuera del
  repositorio, para no versionar binarios ni mezclar el venv con el árbol
  de Git.
- Configurable con `--venv-path <ruta>` si alguna vez se necesita otra
  ubicación (por ejemplo, un disco con más espacio).
- El script nunca lo recrea si ya existe y es válido (evita reinstalar
  paquetes Python en cada corrida).

## Idempotencia

Cada paso primero verifica si ya está hecho antes de actuar:

- Paquete apt ya instalado → no se reinstala.
- Venv ya existe y es válido (`bin/python3` ejecutable + `pyvenv.cfg`
  presente) → no se recrea.
- `pip install -r requirements-controller.txt` es en sí mismo idempotente
  (pip no reinstala versiones ya satisfechas).

Ejecutarlo varias veces seguidas sobre un sistema ya preparado no debería
reportar ninguna instalación nueva.

## Logs

El script imprime cada paso con el prefijo `[bootstrap]` (o
`[bootstrap][error]` para fallos) a stdout/stderr — no escribe a un archivo
de log. Si se necesita conservar la salida, redirigir manualmente:

```bash
./infra/bootstrap/bootstrap-controller.sh 2>&1 | tee bootstrap.log
```

## Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `No parece ser un clon válido...` | Se ejecutó fuera del repositorio, o el clon está incompleto | Confirmar `git status` y que `infra/ansible/requirements-controller.txt` existe |
| `Este bootstrap solo soporta Ubuntu` | Distro distinta | Fuera de alcance — este proyecto solo soporta Ubuntu (ver ADR-008) |
| `sudo no está disponible` | Usuario sin `sudo` configurado | Agregar el usuario al grupo `sudo` (fuera del alcance de este script) |
| `apt-get install` falla por red | Sin conectividad de salida | Verificar red de la VM (NAT de VirtualBox) antes de reintentar |
| `pip install` falla por certificados/red | Proxy o firewall corporativo | Revisar configuración de red del host, no del script |

## Rollback

- **Entorno virtual**: `rm -rf ~/.venvs/realtime-chat-ansible` (o la ruta
  usada con `--venv-path`) lo elimina por completo. Es autocontenido, no
  deja rastros fuera de esa carpeta.
- **Paquetes apt** (`python3-venv`, `python3-pip`, `git`,
  `ca-certificates`): son paquetes base de propósito general, normalmente
  seguros de dejar instalados. Si se quieren remover explícitamente:
  `sudo apt-get remove python3-venv python3-pip` (no remover `python3` ni
  `ca-certificates`, son parte del sistema base de Ubuntu).
- No hay cambios de kernel, `sysctl`, firewall ni servicios que revertir —
  este script no los toca.

## Reconstrucción completa desde una VM limpia

```
VM Ubuntu limpia
  → instalar git (apt-get install -y git), o clonar desde otra máquina y copiar
  → git clone <url-del-repositorio>
  → cd realtime-chat-platform
  → ./infra/bootstrap/bootstrap-controller.sh
  → source ~/.venvs/realtime-chat-ansible/bin/activate
  → ansible-playbook infra/ansible/playbooks/prepare-server.yml --syntax-check
  → (checkpoints futuros: preparar Ubuntu de verdad, instalar RKE2, restaurar backups)
```

**RKE2 no se instala en ningún punto de este flujo todavía** — este
documento describe únicamente cómo queda el controlador de Ansible listo,
que es el alcance del Checkpoint 7.2A.
