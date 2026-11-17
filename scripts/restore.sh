#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Script de Restauração
# ==============================================================
# Uso: ./scripts/restore.sh <arquivo_backup.dump>
# Exemplo: ./scripts/restore.sh ./backups/livre_backend_20261117_150000.dump

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "❌ Uso: $0 <arquivo_backup.dump>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "❌ Arquivo não encontrado: ${BACKUP_FILE}"
    exit 1
fi

echo "🔵 Restaurando backup: ${BACKUP_FILE}"
echo "⚠️  ATENÇÃO: Isso substituirá TODOS os dados existentes!"
read -p "Continuar? (s/N): " CONFIRM

if [ "${CONFIRM}" != "s" ] && [ "${CONFIRM}" != "S" ]; then
    echo "❌ Operação cancelada"
    exit 0
fi

docker cp "${BACKUP_FILE}" postgres:/tmp/livre_backend_restore.dump
docker compose exec -T postgres pg_restore \
    -U ${DB_SUPERUSER:-livre_admin} \
    -d libre_backend \
    --clean \
    --if-exists \
    /tmp/livre_backend_restore.dump
docker compose exec -T postgres rm -f /tmp/livre_backend_restore.dump

echo "✅ Restauração concluída com sucesso!"
