# Rol `common`

## Responsabilidad futura

Paquetes de propósito general que otros roles o scripts van a necesitar:
`curl` (descargar artefactos, p. ej. el binario de RKE2 en una fase
futura), `jq` (parsear JSON — checksums, respuestas de API), certificados
CA (verificar TLS), `gnupg` (verificar firmas, si aplica).

## Qué hace en el Checkpoint 7.2A

Solo auditoría: revisa con `dpkg-query` (lectura, sin `become`) cuáles de
los paquetes en `common_packages` ya están instalados y reporta los
ausentes. **Nunca instala nada** en este checkpoint, sin importar el valor
de `common_manage_packages`.

## Variables

| Variable | Default | Significado |
|---|---|---|
| `common_packages` | `[curl, jq, ca-certificates, gnupg]` | Lista propuesta, no aplicada todavía |
| `common_manage_packages` | `false` | Guard — en `false` el rol nunca instala, sin importar esta lista |

## Cambios que hará en una fase futura (7.2C o posterior)

Instalar los paquetes de `common_packages` que falten, vía
`ansible.builtin.apt`, **solo cuando `common_manage_packages: true`** se
apruebe explícitamente.

## Idempotencia

La auditoría (`dpkg-query`) es de solo lectura, siempre `changed=0`. La
instalación futura usará `ansible.builtin.apt` con `state: present`, que ya
es idempotente por diseño (no reinstala paquetes ya presentes).

## Riesgos

Bajo — son paquetes de utilidad general ya comunes en instalaciones Ubuntu
mínimas. El único riesgo real es agregar herramientas innecesarias "por si
acaso", por eso la lista se mantiene deliberadamente corta y cada paquete
tiene un propósito concreto ya identificado.

## Validación

`dpkg-query -W` contra cada paquete de la lista; el resultado se expone vía
`ansible.builtin.debug`, visible en la salida del playbook.

## Reversión

Auditoría: no hay nada que revertir (no modifica nada). Instalación
futura: `apt-get remove <paquete>` por paquete, uno a la vez.

## Por qué pertenece aquí y no a otro rol

Es la única responsabilidad "genérica, sin relación directa con RKE2" del
conjunto de roles — por eso se llama `common`. `system_prerequisites` es
específico de los requisitos de kernel/Kubernetes; `firewall` es reglas de
red; `rke2_server` es RKE2 en sí. Este rol es el único punto de paquetes de
utilidad general que **otros roles podrían asumir que ya existen**.

## Por qué Docker, Helm, Terraform, Node.js y kubectl NO están aquí

- **Docker**: RKE2 trae su propio runtime de contenedores (`containerd`
  embebido). Instalar Docker sería redundante y podría generar conflictos
  de configuración de red/cgroups con el runtime de RKE2.
- **Helm / kubectl**: son herramientas orientadas a interactuar con un
  clúster de Kubernetes que **todavía no existe**. Instalarlas en `common`
  (que corre siempre, incluso antes de que RKE2 exista) no tendría sentido
  — les corresponde a `rke2_server` o a un rol posterior, condicionado a
  que el clúster ya esté instalado.
- **Terraform**: no hay aprovisionamiento de infraestructura en la nube en
  este proyecto — la VM `devops-lab` ya existe, creada manualmente en
  VirtualBox. Terraform no tiene nada que hacer aquí.
- **Node.js**: es parte de la capa de aplicación (corre dentro de
  contenedores/pods, ver `apps/api` y `apps/web`), no del sistema operativo
  del nodo. Instalarlo vía Ansible mezclaría la capa de infraestructura con
  la capa de aplicación, violando la separación de responsabilidades ya
  documentada en `docs/architecture/ansible-rke2-infrastructure-plan.md`.
