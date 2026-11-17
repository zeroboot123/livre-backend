# Auditoria — Fase 5: Tasks e Worker

**Data:** 2026-11-17
**Escopo:** tabela de fila + worker de execução.

---

## 1. Achados iniciais

| Item | Situação |
|---|---|
| Tabela `tasks` | ❌ inexistente |
| Worker/queue | ❌ inexistente |
| Redis | ❌ não usado |

## 2. Implementação entregue

1. **Tabela** `livre_auth.tasks` (migration idempotente em `services/admin-api/src/db/migrate.ts`):
   `id, project_id, name, payload, context_user_id, context_tenant_id, status,
   attempts, max_attempts, last_error, run_at, locked_until, created_at, updated_at`.
2. **Worker** `services/worker/src/index.ts`:
   - Polla `status='pending' AND run_at <= now() ORDER BY run_at ASC LIMIT 5 FOR UPDATE SKIP LOCKED`.
   - Marca `running`, executa `SELECT * FROM <schema>.<fn>($1::jsonb)`.
   - Sucesso → `completed`. Falha → backoff quadrático (`attempts^2` segundos) até `max_attempts` (padrão 3).
3. **Rotas**:
   - `POST /admin/api/tasks` — cria task (valida fn, allowlist, payload, contexto RLS).
   - `GET /admin/api/tasks` — lista tasks do projeto.

## 3. Validações

- admin-api build ✅ · worker build ✅ · admin-api testes 51/51 ✅
- version.sh check: ✅ 0.5.0

## 4. Pendências

- Worker em container separado com `WORKER_AUTO_START=1` (adicionado aos compose).
- Deploy no VPS pendente (falha de conexão SSH durante scp).
- Consumo real de task com função existente em projeto de teste.

---

## 🏁 Fase 5 — Concluída

**Próximo: Auditoria da Fase 6 (logs, health, metrics).**
