#!/usr/bin/env bash
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# infra/bootstrap/bootstrap-controller.sh
#
# Prepara una VM Ubuntu limpia para poder ejecutar Ansible LOCALMENTE
# (ansible_connection: local, ver ADR-008 y el runbook del controlador).
#
# Este script SOLO resuelve el primer eslabón (Python + venv + ansible-core +
# ansible-lint). No instala RKE2, no toca kernel/sysctl/swap/firewall — eso
# es responsabilidad de los roles de Ansible (infra/ansible/roles/), no de
# este script.
#
# Uso:
#   ./infra/bootstrap/bootstrap-controller.sh [--check] [--venv-path <ruta>]
#
#   --check           Audita qué faltaría instalar/crear, sin modificar nada:
#                      no ejecuta apt-get, no crea el venv, no instala
#                      paquetes Python.
#   --venv-path <ruta> Ruta del entorno virtual. Por defecto:
#                      ~/.venvs/realtime-chat-ansible (mismo valor documentado
#                      en infra/ansible/requirements-controller.txt).
#
# Ver infra/bootstrap/README.md para la explicación completa: qué problema
# resuelve, qué instala, qué no instala, cómo revertirlo.
# -----------------------------------------------------------------------------

DEFAULT_VENV_PATH="${HOME}/.venvs/realtime-chat-ansible"
CHECK_MODE=false
VENV_PATH="${DEFAULT_VENV_PATH}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      CHECK_MODE=true
      shift
      ;;
    --venv-path)
      VENV_PATH="${2:?"--venv-path requiere un valor"}"
      shift 2
      ;;
    *)
      echo "Argumento desconocido: $1" >&2
      echo "Uso: $0 [--check] [--venv-path <ruta>]" >&2
      exit 1
      ;;
  esac
done

log()  { printf '[bootstrap] %s\n' "$1"; }
fail() { printf '[bootstrap][error] %s\n' "$1" >&2; exit 1; }

# --- 1-2. Resolver la raíz del repo y confirmar que es un clon válido ------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd -P)"
REQUIREMENTS_FILE="${REPO_ROOT}/infra/ansible/requirements-controller.txt"

if [[ ! -d "${REPO_ROOT}/.git" ]] || [[ ! -f "${REQUIREMENTS_FILE}" ]]; then
  fail "No parece ser un clon válido de realtime-chat-platform (falta .git o infra/ansible/requirements-controller.txt bajo ${REPO_ROOT})."
fi
log "Raíz del repositorio: ${REPO_ROOT}"

# --- 3-4. Confirmar que el sistema es Ubuntu -------------------------------
if [[ ! -r /etc/os-release ]]; then
  fail "No se encontró /etc/os-release; no se puede confirmar la distribución."
fi
# shellcheck disable=SC1091
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  fail "Este bootstrap solo soporta Ubuntu (detectado: ID=${ID:-desconocido})."
fi
log "Distribución confirmada: Ubuntu ${VERSION_ID:-desconocida}"

# --- 5. Confirmar arquitectura amd64/x86_64 --------------------------------
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64) ;;
  *) fail "Arquitectura no soportada: ${ARCH} (se espera amd64/x86_64)." ;;
esac
log "Arquitectura confirmada: ${ARCH}"

# --- 6. No ejecutar directamente como root ----------------------------------
if [[ "${EUID}" -eq 0 ]]; then
  fail "No ejecutes este script como root. Hazlo como tu usuario normal; usará sudo solo para instalar paquetes apt puntuales."
fi

# --- 7-8. Confirmar sudo y apt-get disponibles ------------------------------
if ! command -v sudo >/dev/null 2>&1; then
  fail "sudo no está disponible. Este bootstrap lo necesita para instalar paquetes apt mínimos."
fi
if ! command -v apt-get >/dev/null 2>&1; then
  fail "apt-get no está disponible. Este bootstrap solo soporta sistemas basados en APT (Ubuntu)."
fi
log "sudo y apt-get disponibles."

# --- 9-10. Detectar e instalar únicamente los paquetes apt faltantes -------
REQUIRED_APT_PACKAGES=(python3 python3-venv python3-pip git ca-certificates)
MISSING_APT_PACKAGES=()
for pkg in "${REQUIRED_APT_PACKAGES[@]}"; do
  if ! dpkg -s "${pkg}" >/dev/null 2>&1; then
    MISSING_APT_PACKAGES+=("${pkg}")
  fi
done

if [[ ${#MISSING_APT_PACKAGES[@]} -eq 0 ]]; then
  log "Paquetes apt requeridos ya presentes: ${REQUIRED_APT_PACKAGES[*]}"
elif [[ "${CHECK_MODE}" == true ]]; then
  log "[--check] Paquetes que la ejecución normal instalaría: ${MISSING_APT_PACKAGES[*]}"
else
  log "Instalando (sudo apt-get install -y): ${MISSING_APT_PACKAGES[*]}"
  sudo apt-get update -y
  sudo apt-get install -y "${MISSING_APT_PACKAGES[@]}"
fi

# --- 11-12. Crear el entorno virtual si no existe o no es válido ----------
VENV_IS_VALID=false
if [[ -x "${VENV_PATH}/bin/python3" ]] && [[ -f "${VENV_PATH}/pyvenv.cfg" ]]; then
  VENV_IS_VALID=true
  log "Entorno virtual ya existe y parece válido: ${VENV_PATH}"
elif [[ "${CHECK_MODE}" == true ]]; then
  log "[--check] La ejecución normal crearía el entorno virtual en: ${VENV_PATH}"
else
  log "Creando entorno virtual: python3 -m venv ${VENV_PATH}"
  mkdir -p -- "$(dirname -- "${VENV_PATH}")"
  python3 -m venv "${VENV_PATH}"
  VENV_IS_VALID=true
fi

# --- 13. Instalar las dependencias fijadas del controlador -----------------
if [[ "${CHECK_MODE}" == true ]]; then
  log "[--check] La ejecución normal usaría: ${VENV_PATH}/bin/pip install -r ${REQUIREMENTS_FILE}"
else
  log "Instalando dependencias fijadas desde: ${REQUIREMENTS_FILE}"
  "${VENV_PATH}/bin/pip" install --upgrade pip
  "${VENV_PATH}/bin/pip" install -r "${REQUIREMENTS_FILE}"
fi

# --- 14. Verificar las herramientas instaladas ------------------------------
if [[ "${CHECK_MODE}" == true ]]; then
  log "[--check] Verificación de versiones omitida (no se instaló nada en este modo)."
elif [[ "${VENV_IS_VALID}" == true ]]; then
  log "Python del venv:     $("${VENV_PATH}/bin/python3" --version)"
  log "pip:                 $("${VENV_PATH}/bin/pip" --version)"
  log "ansible:             $("${VENV_PATH}/bin/ansible" --version | head -n1)"
  log "ansible-playbook:    $("${VENV_PATH}/bin/ansible-playbook" --version | head -n1)"
  log "ansible-lint:        $("${VENV_PATH}/bin/ansible-lint" --version | head -n1)"
fi

# --- 15. Resumen final -------------------------------------------------------
log "----------------------------------------------------------------------"
log "Resumen"
log "  Repositorio:            ${REPO_ROOT}"
if [[ "${CHECK_MODE}" == true ]]; then
  log "  Modo:                    --check (auditoría, sin cambios)"
else
  log "  Modo:                    normal (aplicó los cambios necesarios)"
fi
log "  Paquetes apt faltantes:  ${MISSING_APT_PACKAGES[*]:-ninguno}"
log "  Entorno virtual:         ${VENV_PATH}"
log "  Requirements usados:     ${REQUIREMENTS_FILE}"
log "----------------------------------------------------------------------"
if [[ "${CHECK_MODE}" == true ]]; then
  log "Este fue un --check: no se modificó el sistema. Revisa infra/bootstrap/README.md antes de ejecutar en modo normal."
else
  log "Listo. Activa el entorno virtual con: source ${VENV_PATH}/bin/activate"
fi
