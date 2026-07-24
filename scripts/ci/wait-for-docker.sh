#!/usr/bin/env bash
# Espera a que el stack de docker-compose.yml quede saludable, con
# reintentos y timeout finito (nunca espera indefinida).
set -euo pipefail

wait_for_healthy() {
  local service="$1"
  local max_attempts=40
  local attempt=0
  local cid status
  until [ "$attempt" -ge "$max_attempts" ]; do
    cid="$(docker compose ps -q "$service")"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "sin-healthcheck")"
      if [ "$status" = "healthy" ]; then
        echo "$service: healthy (intento $attempt)"
        return 0
      fi
    fi
    attempt=$((attempt + 1))
    sleep 3
  done
  echo "Timeout esperando que $service esté healthy"
  docker compose ps -a
  return 1
}

wait_for_exit_zero() {
  local service="$1"
  local max_attempts=40
  local attempt=0
  local cid status code
  until [ "$attempt" -ge "$max_attempts" ]; do
    cid="$(docker compose ps -a -q "$service")"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{.State.Status}}' "$cid")"
      if [ "$status" = "exited" ]; then
        code="$(docker inspect -f '{{.State.ExitCode}}' "$cid")"
        if [ "$code" = "0" ]; then
          echo "$service: completado con código 0 (intento $attempt)"
          return 0
        fi
        echo "$service terminó con código $code"
        docker compose logs --no-color "$service"
        return 1
      fi
    fi
    attempt=$((attempt + 1))
    sleep 3
  done
  echo "Timeout esperando que $service termine"
  docker compose ps -a
  return 1
}

wait_for_healthy postgres
wait_for_exit_zero migrate
wait_for_healthy api
wait_for_healthy web
