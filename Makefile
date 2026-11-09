# ==============================================================
# LIVRE BACKEND - Makefile
# ==============================================================

.PHONY: help up down build logs psql migrate backup restore

help:
	@echo "┌─────────────────────────────────────────────┐"
	@echo "│  LIVRE BACKEND - Comandos                   │"
	@echo "├─────────────────────────────────────────────┤"
	@echo "│  make up       - Iniciar todos os serviços  │"
	@echo "│  make down     - Parar todos os serviços    │"
	@echo "│  make build    - Reconstruir imagens         │"
	@echo "│  make logs     - Ver logs de todos serviços │"
	@echo "│  make psql     - Acessar PostgreSQL CLI      │"
	@echo "│  make backup   - Executar backup manual      │"
	@echo "│  make restore  - Restaurar backup            │"
	@echo "│  make migrate  - Executar migrações          │"
	@echo "└─────────────────────────────────────────────┘"

# Iniciar serviços
up:
	docker compose up -d

# Parar serviços
down:
	docker compose down

# Reconstruir e iniciar
build:
	docker compose up -d --build

# Logs
logs:
	docker compose logs -f

# Acessar PostgreSQL
psql:
	docker compose exec postgres psql -U ${DB_SUPERUSER} livre_backend

# Backup manual
backup:
	@echo "Executando backup..."
	docker compose exec postgres pg_dump -U ${DB_SUPERUSER} livre_backend > ./backups/livre_backend_$$(date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup concluído!"

# Restaurar backup (usar: make restore FILE=backup.sql)
restore:
	@if [ -z "$(FILE)" ]; then echo "❌ Use: make restore FILE=backup.sql"; exit 1; fi
	cat ./backups/$(FILE) | docker compose exec -T postgres psql -U ${DB_SUPERUSER} livre_backend
	@echo "✅ Restauração concluída!"

# Migrações
migrate:
	@echo "Executando migrações..."
	cat ./docker/postgres/init.sql | docker compose exec -T postgres psql -U ${DB_SUPERUSER} livre_backend
	@echo "✅ Migrações concluídas!"
