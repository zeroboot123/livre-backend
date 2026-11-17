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
