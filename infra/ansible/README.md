# infra/ansible

Placeholder para los playbooks de aprovisionamiento de infraestructura.

## Propósito futuro

Automatizar, sobre la VM Ubuntu 24.04 (`devops-lab`) y futuras VMs de ambiente:

- Configuración base del sistema operativo.
- Instalación y configuración de RKE2 (server/agent).
- Configuración de namespaces `chat-dev`, `chat-uat`, `chat-prod`.
- Cualquier hardening o dependencia de sistema requerida por el clúster.

## Estado actual

Vacío. No se ha instalado ni ejecutado ningún playbook. Ansible no está instalado aún
en la VM de destino (ver verificación de Fase 0).

## Convenciones previstas (a definir en la fase correspondiente)

- Inventario por ambiente (`inventories/dev`, `inventories/uat`, `inventories/prod`).
- Roles separados por responsabilidad (`common`, `rke2-server`, `rke2-agent`).
- Ningún secreto en texto plano en el repositorio (usar Ansible Vault o equivalente
  cuando se implemente).
