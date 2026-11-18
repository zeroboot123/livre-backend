#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Backup do host (produção)
# ==============================================================
# Executa no host que roda os containers do EasyPanel.
# Gera um diretório por execução com:
#   - dump do PostgreSQL (pg_dump -Fc) + checksum
#   - roles/usuários do PostgreSQL (pg_dumpall --roles-only)
#   - objetos do MinIO (tar do volume)
#   - metadados Docker (inspect de containers/redes/volumes)
#   - configurações do EasyPanel e do projeto (.env, compose)
#
# Uso:
#   ./scripts/backup-host.sh [retention_days]
#   BACKUP_ROOT=/caminho ./scripts/backup-host.sh 7
#
# Variáveis (opcionais):
#   BACKUP_ROOT, RETENTION_DAYS, PG_CONTAINER, MINIO_VOLUME,
#   DB_NAME, DB_USER, MINIO_IMAGE, EASYPANEL_PROJECT_DIR
#
# O diretório é criado com umask 077 (somente o dono lê).
# ==============================================================
set -euo pipefail

umask 077

RETENTION_DAYS=${1:-${RETENTION_DAYS:-7}}
BACKUP_ROOT=${BACKUP_ROOT:-"$HOME/livre-backend/backups"}
PG_CONTAINER=${PG_CONTAINER:-livre-backend_livre-backend-postgres-1}
MINIO_VOLUME=${MINIO_VOLUME:-livre-backend_livre-backend_minio_data}
DB_NAME=${DB_NAME:-livre_backend}
DB_USER=${DB_USER:-livre_admin}
MINIO_IMAGE=${MINIO_IMAGE:-alpine:3.20}
EASYPANEL_PROJECT_DIR=${EASYPANEL_PROJECT_DIR:-/etc/easypanel/projects/livre-backend}

STAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_ROOT/$STAMP"

log() { printf '%s\n' "$*"; }

mkdir -p "$DEST"
chmod 700 "$BACKUP_ROOT" "$DEST"

log "🔵 Backup iniciado em $DEST"

# ── 1. PostgreSQL: dump lógico (custom) ───────────────────────
DUMP="postgres_${DB_NAME}.dump"
docker exec "$PG_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DEST/$DUMP"
sha256sum "$DEST/$DUMP" | awk '{print $1}' > "$DEST/$DUMP.sha256"

# Valida que o dump é legível e lista o conteúdo (via /tmp no container).
docker cp "$DEST/$DUMP" "$PG_CONTAINER:/tmp/${DUMP}.verify"
docker exec "$PG_CONTAINER" pg_restore -l "/tmp/${DUMP}.verify" > "$DEST/${DUMP}.toc"
docker exec "$PG_CONTAINER" rm -f "/tmp/${DUMP}.verify"
log "  ✔ PostgreSQL: $DUMP ($(du -h "$DEST/$DUMP" | cut -f1)), $(wc -l < "$DEST/${DUMP}.toc") entradas"

# ── 2. Roles e bancos ────────────────────────────────────────
docker exec "$PG_CONTAINER" pg_dumpall -U "$DB_USER" --roles-only > "$DEST/roles.sql"
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "select datname from pg_database where not datistemplate order by 1" > "$DEST/databases.txt"
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "select schema_name from information_schema.schemata order by 1" > "$DEST/schemas.txt"
log "  ✔ Roles: $(grep -c '^CREATE ROLE' "$DEST/roles.sql" || true) papéis"

# ── 3. MinIO: objetos do volume ──────────────────────────────
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "${MINIO_VOLUME}:/data:ro" \
  -v "${DEST}:/out" \
  "$MINIO_IMAGE" tar czf "/out/minio_data.tar.gz" -C /data .
sha256sum "$DEST/minio_data.tar.gz" | awk '{print $1}' > "$DEST/minio_data.tar.gz.sha256"
log "  ✔ MinIO: minio_data.tar.gz ($(du -h "$DEST/minio_data.tar.gz" | cut -f1))"

# ── 4. Metadados Docker (containers, redes, volumes) ─────────
CONTAINERS=$(docker ps -a --format '{{.Names}}' | grep -E '^livre-backend' || true)
{
  for c in $CONTAINERS; do
    docker inspect "$c"
  done
} > "$DEST/docker-containers.json" 2>/dev/null || true

docker volume ls --format '{{.Name}}' | grep -E 'livre-backend' > "$DEST/docker-volumes.txt" || true
docker network inspect easypanel > "$DEST/docker-network-easypanel.json" 2>/dev/null || true
docker ps -a --filter name=livre-backend --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' \
  > "$DEST/docker-ps.txt" 2>/dev/null || true
log "  ✔ Metadados Docker exportados"

# ── 5. Configurações do projeto/EasyPanel ────────────────────
mkdir -p "$DEST/config"
for f in "$HOME/livre-backend/.env" "$HOME/livre-backend/docker-compose.yml" \
         "$HOME/livre-backend/docker-compose.override.yml"; do
  [ -r "$f" ] && cp -p "$f" "$DEST/config/$(basename "$f")"
done
if [ -d "$EASYPANEL_PROJECT_DIR" ] && [ -r "$EASYPANEL_PROJECT_DIR" ]; then
  tar czf "$DEST/config/easypanel-project.tar.gz" -C "$(dirname "$EASYPANEL_PROJECT_DIR")" \
    "$(basename "$EASYPANEL_PROJECT_DIR")" 2>/dev/null || true
fi
if [ -d /etc/easypanel/traefik ] && [ -r /etc/easypanel/traefik ]; then
  tar czf "$DEST/config/traefik.tar.gz" -C /etc/easypanel traefik 2>/dev/null || true
fi
log "  ✔ Configurações copiadas"

# ── 6. Inventário + checksums ───────────────────────────────
{
  echo "data=$(date -Iseconds)"
  echo "host=$(hostname)"
  echo "postgres_container=$PG_CONTAINER"
  echo "db=$DB_NAME user=$DB_USER"
  echo "minio_volume=$MINIO_VOLUME"
  echo "containers:"; printf '  %s\n' $CONTAINERS
} > "$DEST/INFO.txt"

( cd "$DEST" && find . -type f ! -name 'checksums.sha256' -print0 | sort -z | \
    xargs -0 sha256sum > checksums.sha256 )
log "  ✔ checksums.sha256"

# ── 7. Retenção ─────────────────────────────────────────────
find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION_DAYS" \
  -exec rm -rf {} + 2>/dev/null || true

log "✅ Backup concluído: $DEST"
log "   Retenção: ${RETENTION_DAYS} dias | Total: $(du -sh "$BACKUP_ROOT" | cut -f1)"
