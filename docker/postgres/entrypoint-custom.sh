#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Entrypoint customizado para PostgreSQL
# ==============================================================
# Substitui variáveis de ambiente no init.sql antes de executar
# ==============================================================

set -e

# Cria usuários de serviço se as senhas estiverem definidas
if [ -n "$PG_AUTHPASS" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'livre_auth') THEN
                CREATE ROLE livre_auth LOGIN PASSWORD '${PG_AUTHPASS}';
            END IF;
        END
        \$\$;
EOSQL
    echo "✅ Usuário livre_auth criado"
fi

if [ -n "$PG_ADMINPASS" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'livre_admin_api') THEN
                CREATE ROLE livre_admin_api LOGIN PASSWORD '${PG_ADMINPASS}';
            END IF;
        END
        \$\$;
EOSQL
    echo "✅ Usuário livre_admin_api criado"
fi

# Executa o entrypoint original do PostgreSQL
exec /usr/local/bin/docker-entrypoint.sh postgres "$@"
