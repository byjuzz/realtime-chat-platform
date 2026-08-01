# Inventario: `lab`

Inventario del laboratorio de un solo nodo (`devops-lab`).

## Archivos

- **`hosts.yml.example`** — versionado, con placeholders. Sirve como plantilla y documentación
  de la estructura esperada.
- **`hosts.local.yml`** (no existe en el repositorio, ignorado por git) — la copia real que
  usa el controlador. Se crea copiando `hosts.yml.example` y ajustando si hiciera falta.

## Por qué `ansible_connection: local`

El controlador de Ansible corre **dentro** de `devops-lab` (decisión de la Fase 7.1, ver
[ADR-008](../../../../docs/adr/ADR-008-infrastructure-as-code-with-ansible.md)), así que
Ansible administra la misma máquina donde se ejecuta — sin SSH de por medio. Esto es distinto
del diseño original contemplado (controlador externo vía WSL), cambiado deliberadamente por
limitaciones de recursos del host de desarrollo.

## Grupo `rke2_servers`

Preparado para cuando este laboratorio tenga más de un host (por ejemplo, si en el futuro se
separan ambientes en VMs distintas) — hoy contiene un único host, `devops-lab`.

## Validar el inventario

Desde `infra/ansible/`, con el entorno virtual activado:

```bash
ansible-inventory --graph
ansible-inventory --host devops-lab
```
