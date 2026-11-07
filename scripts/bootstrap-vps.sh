#!/bin/bash
# ==============================================================
# LIVRE BACKEND - BOOTSTRAP inicial da VPS (USO ÚNICO)
# ==============================================================
# ⚠️  ATENÇÃO: este script é para PROVISIONAMENTO INICIAL apenas.
#     Ele GERA NOVAS SENHAS e SOBRESCREVE o .env da VPS a cada execução,
#     e sobe a stack com `docker compose up -d --build` SEM o override do
#     EasyPanel (o que pode causar 502 por perda de alias de rede).
#
#     Para atualizações do dia a dia use:  ./scripts/deploy.sh
# ==============================================================
# Uso: ./scripts/bootstrap-vps.sh [vps_user@ip]
# Exemplo: ./scripts/bootstrap-vps.sh adminvps@62.171.185.9
# ==============================================================

set -e

VPS="${1:-adminvps@62.171.185.9}"
PROJECT_DIR="/home/adminvps/livre-backend"

echo "🔵 LIVRE BACKEND - Bootstrap inicial na VPS"
echo "──────────────────────────────────────────────"
echo "VPS: ${VPS}"
echo "Destino: ${PROJECT_DIR}"
echo "──────────────────────────────────────────────"

# 1. Gerar senhas seguras
echo ""
echo "🔑 Gerando senhas seguras..."
DB_SUPERPASS=$(openssl rand -hex 20)
PG_AUTHPASS=$(openssl rand -hex 20)
PG_ADMINPASS=$(openssl rand -hex 20)
JWT_SECRET=$(openssl rand -hex 32)

echo "✅ Senhas geradas!"

# 2. Criar .env temporário
echo ""
echo "📝 Criando arquivo .env..."
cat > .env << EOF
# ==============================================================
# LIVRE BACKEND - Variáveis de Ambiente (gerado automaticamente)
# ==============================================================

DOMAIN=api.livrebackend.com.br
PUBLIC_URL=https://\${DOMAIN}

DB_SUPERUSER=livre_admin
DB_SUPERPASS=${DB_SUPERPASS}

PG_AUTHUSER=livre_auth
PG_AUTHPASS=${PG_AUTHPASS}

PG_ADMINUSER=livre_admin_api
PG_ADMINPASS=${PG_ADMINPASS}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

ARGON2_TIME_COST=2
ARGON2_MEMORY_COST=19456

CORS_ORIGINS=*

PG_MEMORY_LIMIT=512M
EOF

echo "✅ .env criado!"
echo "   DB_SUPERPASS: ${DB_SUPERPASS}"
echo "   PG_AUTHPASS: ${PG_AUTHPASS}"
echo "   PG_ADMINPASS: ${PG_ADMINPASS}"
echo "   JWT_SECRET: ${JWT_SECRET}"

# 3. Criar diretório na VPS e copiar arquivos
echo ""
echo "📦 Copiando arquivos para VPS..."
ssh -o StrictHostKeyChecking=accept-new "${VPS}" "mkdir -p ${PROJECT_DIR}"

rsync -avz --progress \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'backups/*.sql.gz' \
    --exclude '.gitignore' \
    ./ "${VPS}:${PROJECT_DIR}/"

# Copiar .env separadamente (não versionado)
scp .env "${VPS}:${PROJECT_DIR}/.env"

echo "✅ Arquivos copiados!"

# 4. Executar deploy na VPS
echo ""
echo "🚀 Iniciando deploy na VPS..."
ssh "${VPS}" "cd ${PROJECT_DIR} && docker compose up -d --build"

echo ""
echo "✅ Deploy concluído com sucesso!"
echo "──────────────────────────────────────────────"
echo "📋 Acessos:"
echo "   Painel Admin: https://api.livrebackend.com.br/admin"
echo "   Auth API: https://api.livrebackend.com.br/auth"
echo "   PostgREST: https://api.livrebackend.com.br/api/rest"
echo ""
echo "⚠️  Configure o DNS do domínio api.livrebackend.com.br"
echo "   apontando para o IP da VPS: 62.171.185.9"
echo "──────────────────────────────────────────────"

# Limpar .env local (já está na VPS)
rm .env
echo "🧹 .env local removido (está seguro na VPS)"
