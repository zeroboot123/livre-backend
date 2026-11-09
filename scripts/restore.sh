#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Script de Restauração
# ==============================================================
# Uso: ./scripts/restore.sh <arquivo_backup.sql.gz>
# Exemplo: ./scripts/restore.sh ./backups/livre_backend_20240101_120000.sql.gz

set -e

if [ -z "$1" ]; then
    echo "❌ Uso: $0 <arquivo_backup.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Arquivo não encontrado: $BACKUP_FILE"
    exit 1
fi

echo "🔵 Restaurando backup: ${BACKUP_FILE}"
echo "⚠️  ATENÇÃO: Isso substituirá TODOS os dados existentes!"
read -p "Continuar? (s/N): " CONFIRM

if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
    echo "❌ Operação cancelada"
    exit 0
fi

# Descomprimir e restaurar
gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres \
    psql -U ${DB_SUPERUSER:-livre_admin} livre_backend

echo "✅ Restauração concluída com sucesso!"
