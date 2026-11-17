#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Script de Backup Automático
# ==============================================================
# Uso: ./scripts/backup.sh [retention_days]
# Exemplo: ./scripts/backup.sh 7  (mantém backups dos últimos 7 dias)

set -euo pipefail

RETENTION=${1:-7}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="livre_backend_${TIMESTAMP}.dump"
CHECKSUM_FILE="${FILENAME}.sha256"

echo "🔵 Iniciando backup: ${FILENAME}"

# pg_dump no formato custom (-Fc) permite restore/teste com pg_restore.
docker compose exec -T postgres pg_dump \
    -U ${DB_SUPERUSER:-livre_admin} \
    -Fc \
    libre_backend > "${BACKUP_DIR}/${FILENAME}"

# Verificação de integridade: checksum SHA-256.
sha256sum "${BACKUP_DIR}/${FILENAME}" | awk '{print $1}' > "${CHECKSUM_FILE}"
echo "✅ Backup criado: ${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

# Remover backups antigos (além da retentção).
find "${BACKUP_DIR}" -name "livre_backend_*.dump*" -mtime +${RETENTION} -delete
echo "🧹 Backups com mais de ${RETENTION} dias removidos"

echo "✅ Backup concluído com sucesso!"
