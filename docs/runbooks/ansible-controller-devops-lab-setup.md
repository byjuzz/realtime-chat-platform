# Runbook: controlador Ansible dentro de `devops-lab`

## Decisión de arquitectura (definitiva, Fase 7.1)

El controlador Ansible **vive dentro de `devops-lab`**, no en WSL ni en ninguna otra máquina
separada. `devops-lab` cumple simultáneamente el rol de controlador (`ansible_connection:
local`) y de nodo administrado. Windows queda exclusivamente como anfitrión de VirtualBox,
entorno de edición, cliente Git y cliente SSH — **nunca** ejecuta Ansible ni tiene Python
instalado con ese propósito.

**Por qué**: el host de desarrollo (Windows) tiene recursos limitados, y la estrategia de
recuperación aceptada es reconstruir la VM completa desde cero (Git + bootstrap + Ansible +
backups) en vez de depender de un controlador externo que sobreviva a la pérdida de la VM.
Ver [ADR-008](../adr/ADR-008-infrastructure-as-code-with-ansible.md) para el detalle completo
del análisis y la alternativa descartada (WSL).

## Qué existe hoy (Fase 7.1)

- Entorno virtual de Python en `~/.venvs/realtime-chat-ansible` dentro de `devops-lab`.
- `ansible-core` y `ansible-lint` fijados a versiones explícitas (ver
  `infra/ansible/requirements-controller.txt`).
- Una copia del repositorio clonada dentro de `devops-lab` (para poder ejecutar
  `ansible-playbook` localmente contra los playbooks versionados).
- Estructura mínima de Ansible: `ansible.cfg`, inventario, un playbook de validación no
  destructivo.
- `sudo` sin contraseña, **acotado únicamente a `/usr/bin/apt-get`** — no root total.

## Qué NO existe todavía

Roles funcionales, RKE2 instalado, Kubernetes, firewall configurado, `sysctl`/kernel
preparado para contenedores. Ver la sección "Próximas fases" del
[plan de arquitectura](../architecture/ansible-rke2-infrastructure-plan.md).

## Preparación paso a paso (lo que ya se ejecutó)

### 1. Paquetes del sistema (vía `apt`, con `sudo` acotado)

```bash
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip
```

### 2. Entorno virtual

```bash
python3 -m venv ~/.venvs/realtime-chat-ansible
```

Por qué un venv y no instalar global: aísla las dependencias de Ansible del Python del
sistema operativo (del que Ubuntu mismo depende), permite fijar versiones exactas, y hace el
rollback trivial — se borra la carpeta y no queda rastro en el sistema.

### 3. `ansible-core`/`ansible-lint` fijados

```bash
~/.venvs/realtime-chat-ansible/bin/pip install -r infra/ansible/requirements-controller.txt
```

Versiones instaladas: ver `infra/ansible/requirements-controller.txt` (fuente de verdad —
no se repite el número aquí para no tener que mantenerlo en dos lugares).

### 4. Repositorio clonado dentro de `devops-lab`

```bash
git clone https://github.com/byjuzz/realtime-chat-platform.git
```

Vía HTTPS, sin credenciales (repositorio público, solo lectura para clonar).

### 5. Inventario local

```bash
cp infra/ansible/inventories/lab/hosts.yml.example infra/ansible/inventories/lab/hosts.local.yml
```

`hosts.local.yml` está en `.gitignore` — aunque en este diseño (conexión local, sin SSH) no
contiene ningún secreto real, se mantiene la separación ejemplo/real como convención
consistente con el resto del proyecto.

## Activar el entorno para trabajar

```bash
source ~/.venvs/realtime-chat-ansible/bin/activate
cd ~/realtime-chat-platform/infra/ansible
```

Con el entorno activado, `ansible`, `ansible-playbook`, `ansible-lint`, `python`, `pip`
resuelven automáticamente a las versiones del venv, sin necesidad de rutas completas.

## Comandos de validación

```bash
ansible-inventory --graph
ansible-inventory --host devops-lab
ansible-lint .
ansible-playbook playbooks/validate-connectivity.yml --syntax-check
ansible rke2_servers -m ansible.builtin.ping
ansible-playbook playbooks/validate-connectivity.yml --check
ansible-playbook playbooks/validate-connectivity.yml
```

Resultado esperado del último comando: `ok=8 changed=0 unreachable=0 failed=0` — confirmado
en esta fase, dos veces (modo `--check` y ejecución real).

## Actualización

Para traer cambios nuevos del repositorio (una vez fusionados en `develop`):

```bash
cd ~/realtime-chat-platform
git pull --ff-only origin develop
```

Para actualizar las versiones fijadas de Ansible, editar
`infra/ansible/requirements-controller.txt` (con una razón documentada, nunca `latest`
implícito) y volver a instalar dentro del venv.

## Rollback / eliminación del controlador

El entorno virtual se puede eliminar sin dejar rastro en el sistema:

```bash
rm -rf ~/.venvs/realtime-chat-ansible
```

Para revertir el `sudo` sin contraseña configurado en esta fase:

```bash
sudo rm /etc/sudoers.d/juzz-apt-nopasswd
```

El repositorio clonado se puede eliminar igual de simple (`rm -rf ~/realtime-chat-platform`)
— no contiene estado que no exista ya en GitHub.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `ansible_env is undefined` al usar `ansible_python_interpreter` | Referenciar un fact remoto (`ansible_env`) antes de que se haya recopilado — dependencia circular | Usar la variable mágica `ansible_playbook_python` en su lugar (ya corregido en `hosts.yml.example`) |
| `sudo -n apt-get ...` pide contraseña | La regla de `/etc/sudoers.d/juzz-apt-nopasswd` no existe o tiene permisos incorrectos | Verificar con `sudo visudo -c`; el archivo debe tener permisos `440` |
| `ansible-playbook` no encuentra el inventario | No se copió `hosts.yml.example` a `hosts.local.yml`, o no se corre desde `infra/ansible/` | Confirmar la ruta relativa en `ansible.cfg` y el directorio de trabajo actual |
| `ping` falla con error de conexión | El venv no está activado o `ansible_connection`/`ansible_python_interpreter` mal configurados en el inventario | Revisar `hosts.local.yml`, confirmar que el venv esté activo |

## Importante: qué es esto y qué NO es

Este runbook documenta la preparación del **controlador**. **No** instala RKE2, **no**
prepara el sistema operativo para contenedores (`sysctl`, `br_netfilter`, firewall), **no**
crea Kubernetes. Esos pasos son responsabilidad de fases futuras (roles todavía no
construidos — ver el plan de arquitectura), y requieren su propia aprobación explícita antes
de ejecutarse.
