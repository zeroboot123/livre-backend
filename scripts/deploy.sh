#!/usr/bin/env bash
# ==========================================================================
# LIVRE BACKEND - Deploy seguro no EasyPanel
# --------------------------------------------------------------------------
# Por que este script existe:
#   Ao recriar containers no EasyPanel SEM o docker-compose.override.yml,
#   eles perdem o alias de rede (ex.: livre-backend_livre-backend_admin-api)
#   e o Traefik passa a devolver 502. Este script SEMPRE aplica o override,
#   recria com --force-recreate --no-deps, espera o healthcheck e valida HTTP.
#
# Uso:
#   sudo ./scripts/deploy.sh                 # build + deploy de todos os apps
#   sudo ./scripts/deploy.sh admin-api       # apenas um servico
#   sudo ./scripts/deploy.sh admin-api admin-panel
#   sudo ./scripts/deploy.sh --status        # so verifica (nao altera nada)
#   sudo ./scripts/deploy.sh --no-build      # recria sem rebuildar imagens
#   sudo ./scripts/deploy.sh --help
#
# Variaveis (opcionais):
#   PROJECT      nome do projeto compose   (default: livre-backend_livre-backend)
#   COMPOSE_DIR  pasta com os compose      (default: /etc/easypanel/projects/livre-backend/livre-backend/code)
#   SRC_DIR      pasta do codigo-fonte     (default: /home/adminvps/livre-backend)
#   DOMAIN       dominio publico           (default: livrebackend.gerbox.com.br)
#   APP_SERVICES servicos de aplicacao     (default: admin-api admin-panel auth-service visual-db)
# ==========================================================================
set -euo pipefail

PROJECT="${PROJECT:-livre-backend_livre-backend}"
COMPOSE_DIR="${COMPOSE_DIR:-/etc/easypanel/projects/livre-backend/livre-backend/code}"
SRC_DIR="${SRC_DIR:-/home/adminvps/livre-backend}"
DOMAIN="${DOMAIN:-livrebackend.gerbox.com.br}"
APP_SERVICES="${APP_SERVICES:-admin-api admin-panel auth-service visual-db}"

COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
OVERRIDE_FILE="$COMPOSE_DIR/docker-compose.override.yml"

# Cores (se terminal suportar)
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; C_RST=''
fi

log()  { printf '%s[deploy]%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_YEL" "$C_RST" "$*"; }
err()  { printf '%s[erro]%s %s\n' "$C_RED" "$C_RST" "$*" >&2; }

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# --------------------------------------------------------------------------
# Pre-requisitos
# --------------------------------------------------------------------------
require_docker() {
  command -v docker >/dev/null 2>&1 || { err "docker nao encontrado"; exit 1; }
  docker info >/dev/null 2>&1 || { err "sem acesso ao docker (rode com sudo)"; exit 1; }
}

compose() {
  # Sempre aplica o override (se existir) para preservar os aliases de rede.
  if [ -f "$OVERRIDE_FILE" ]; then
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" "$@"
  else
    warn "override nao encontrado em $OVERRIDE_FILE (aliases podem se perder!)"
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
  fi
}

container_name() {
  # nome real do container do servico no projeto
  printf '%s-%s-1' "$PROJECT" "$1"
}

# --------------------------------------------------------------------------
# Status / healthcheck
# --------------------------------------------------------------------------
service_state() {
  local svc="$1" cname
  cname="$(container_name "$svc")"
  if ! docker inspect "$cname" >/dev/null 2>&1; then
    echo "missing"; return
  fi
  local health
  health="$(docker inspect "$cname" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo unknown)"
  echo "$health"
}

wait_healthy() {
  local svc="$1" timeout="${2:-120}" waited=0 state
  while [ "$waited" -lt "$timeout" ]; do
    state="$(service_state "$svc")"
    case "$state" in
      healthy|running) ok "$svc: $state"; return 0 ;;
      unhealthy|exited|dead|missing)
        err "$svc: $state"; return 1 ;;
    esac
    sleep 3; waited=$((waited + 3))
  done
  err "$svc: timeout (${timeout}s) aguardando healthcheck (estado: $(service_state "$svc"))"
  return 1
}

probe() {
  local path="$1" expect="${2:-200}" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Host: $DOMAIN" "https://127.0.0.1${path}" --insecure || echo 000)"
  if [ "$code" = "$expect" ]; then
    ok "HTTP ${path} -> ${code}"
  else
    err "HTTP ${path} -> ${code} (esperado ${expect})"
    return 1
  fi
}

show_status() {
  log "Status dos containers do projeto ${PROJECT}:"
  docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -E "^${PROJECT}-" || true
  echo
  log "Verificacao HTTP (via 127.0.0.1 com Host: ${DOMAIN}):"
  probe "/admin/login" 200 || true
  probe "/admin/database/records" 200 || true
  probe "/admin/api/health" 200 || true
  probe "/auth/me" 401 || true   # GET sem token -> 401 (servico no ar)
}

# --------------------------------------------------------------------------
# Deploy
# --------------------------------------------------------------------------
main() {
  local do_build=1 status_only=0 services=()

  for arg in "$@"; do
    case "$arg" in
      --help|-h) usage ;;
      --status) status_only=1 ;;
      --no-build) do_build=0 ;;
      -*) err "opcao desconhecida: $arg"; usage ;;
      *) services+=("$arg") ;;
    esac
  done

  require_docker

  if [ "$status_only" -eq 1 ]; then
    show_status
    exit 0
  fi

  [ -f "$COMPOSE_FILE" ] || { err "compose nao encontrado: $COMPOSE_FILE"; exit 1; }

  if [ "${#services[@]}" -eq 0 ]; then
    # shellcheck disable=SC2206
    services=($APP_SERVICES)
  fi

  log "Projeto:   $PROJECT"
  log "Compose:   $COMPOSE_FILE"
  log "Override:  $OVERRIDE_FILE"
  log "Servicos:  ${services[*]}"
  echo

  if [ "$do_build" -eq 1 ]; then
    log "1/4 Buildando imagens..."
    compose build "${services[@]}"
    ok "build concluido"
  else
    warn "1/4 build ignorado (--no-build)"
  fi

  log "2/4 Recriando containers (com override, preservando aliases)..."
  compose up -d --force-recreate --no-deps "${services[@]}"
  ok "containers recriados"

  log "3/4 Aguardando healthcheck..."
  local failed=0
  for svc in "${services[@]}"; do
    wait_healthy "$svc" 150 || failed=1
  done
  if [ "$failed" -ne 0 ]; then
    err "um ou mais servicos nao ficaram saudaveis. Logs:"
    for svc in "${services[@]}"; do
      echo "----- $svc -----"
      docker logs --tail 20 "$(container_name "$svc")" 2>&1 || true
    done
    exit 1
  fi

  log "4/4 Verificando HTTP..."
  local http_failed=0
  probe "/admin/login" 200 || http_failed=1
  probe "/admin/database/records" 200 || http_failed=1
  probe "/admin/api/health" 200 || http_failed=1

  echo
  if [ "$http_failed" -ne 0 ]; then
    err "deploy concluido, mas a verificacao HTTP falhou. Verifique o Traefik/aliases."
    exit 1
  fi
  ok "Deploy concluido com sucesso."
}

main "$@"
