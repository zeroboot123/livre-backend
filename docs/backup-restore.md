# Backup e Restauração — Livre Backend

> **Fase 8** do plano de evolução. Política de backup, procedimento de restauração
> e testes de recuperação (DR).

---

## 1. Política de backup

| Item | Regra |
|---|---|
| Formato | `pg_dump -Fc` (custom) — permite `pg_restore` e verificação |
| Local | `./backups/` (volume `backups` do compose) |
| Integridade | SHA-256 (`livre_backend_*.dump.sha256`) |
| Retenção | Configurável (`./scripts/backup.sh [dias]`, padrão 7) |
| Offsite | Opcional (bucket MinIO/S3 via env) |

## 2. Executar backup

```bash
./scripts/backup.sh 7
```

- Gera `livre_backend_<timestamp>.dump` + `.sha256`.
- Remove backups com mais de `RETENTION` dias.

## 3. Verificar backup

```bash
pg_restore -l ./backups/livre_backend_*.dump   # lista conteúdo do custom dump
sha256sum -c ./backups/livre_backend_*.sha256
```

## 4. Restaurar

```bash
./scripts/restore.sh ./backups/livre_backend_<timestamp>.dump
```

O script confirma antes de prosseguir e usa `--clean --if-exists` no `pg_restore`.

## 5. Teste de restauração (checklist)

1. Restaurar o backup em banco **isolado** (`livre_backend_restore_test`).
2. Validar integridade (`pg_restore -l`, checksum).
3. Executar smoke test (health, login, RPC, tasks).
4. Registrar resultado no relatório da fase.

## 6. Recovery (DR)

| Cenário | Ação |
|---|---|
| Perda de arquivo de backup | `scripts/restore.sh` com último dump válido |
| Perda de dados pós-backup | Restore + replay de migrations/idempotência |
| Falha de deploy | Voltar imagem anterior (tag do compose) — restore não é necessário |

## 7. RPO / RTO

| Métrica | Alvo |
|---|---|
| RPO | Até 24h (backups diários) |
| RTO | < 30min (restore validado) |

---

## 8. Backup no host (produção EasyPanel)

Na VPS o backup é feito por `scripts/backup-host.sh`, que **não depende** do
diretório do compose e gera um diretório por execução:

```bash
BACKUP_ROOT=/home/adminvps/livre-backend/backups ./scripts/backup-host.sh 7
```

Conteúdo gerado:

| Item | Arquivo |
|---|---|
| Banco (custom dump) | `postgres_livre_backend.dump` + `.sha256` |
| Índice do dump (validação) | `postgres_livre_backend.dump.toc` |
| Roles/usuários | `roles.sql` |
| Bancos e schemas | `databases.txt`, `schemas.txt` |
| Objetos do MinIO | `minio_data.tar.gz` + `.sha256` |
| Containers/redes/volumes | `docker-containers.json`, `docker-network-easypanel.json` |
| Configurações | `config/` (`.env`, compose, projeto do EasyPanel, Traefik) |
| Inventário e integridade | `INFO.txt`, `checksums.sha256` |

Segurança: o diretório é criado com `umask 077` (somente o dono). Os arquivos
de `config/` contêm segredos e **nunca** devem ser enviados ao GitHub.

### Automação (cron do usuário, testado na VPS)

```cron
15 3 * * * BACKUP_ROOT=/home/adminvps/livre-backend/backups RETENTION_DAYS=7 /home/adminvps/bin/livre-backup.sh >> /home/adminvps/livre-backend/backups/cron.log 2>&1
```

Retenção: diretórios com mais de `RETENTION_DAYS` dias são removidos.

### Teste de restauração (executado em 18/11/2026)

```bash
# em um banco isolado, sem tocar na produção
docker exec <postgres> createdb -U livre_admin livre_restore_test
docker cp backup.dump <postgres>:/tmp/restore.dump
docker exec <postgres> pg_restore -U livre_admin -d livre_restore_test \
  --no-owner --no-privileges /tmp/restore.dump
```

Resultado: 49 tabelas, `livre_auth.users` com a mesma contagem da produção,
schemas `proj_gbfatura` (23 tabelas) e `proj_zeroboot` (3 tabelas) presentes.
Banco de teste removido ao final.
