#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Script de Backup Automático
# ==============================================================
# Uso: ./scripts/backup.sh [retenção_dias]
# Exemplo: ./scripts/backup.sh 7  (mantém backups dos últimos 7 dias)

set -e

RETENTION=${1:-7}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="livre_backend_${TIMESTAMP}.sql"
COMPRESSED="${FILENAME}.gz"

echo "🔵 Iniciando backup: ${FILENAME}"

# Executar pg_dump via docker
docker compose exec -T postgres pg_dump \
    -U ${DB_SUPERUSER:-livre_admin} \
    --clean \
    --if-exists \
    livre_backend > "${BACKUP_DIR}/${FILENAME}"

# Comprimir
gzip "${BACKUP_DIR}/${FILENAME}"
echo "✅ Backup comprimido: ${COMPRESSED} ($(du -h "${BACKUP_DIR}/${COMPRESSED}" | cut -f1))"

# Remover backups antigos
find "${BACKUP_DIR}" -name "livre_backend_*.sql.gz" -mtime +${RETENTION} -delete
echo "🧹 Backups com mais de ${RETENTION} dias removidos"

echo "✅ Backup concluído com sucesso!"
