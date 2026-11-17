# Relatório de Entrega — Fase 4: Locks, Idempotência e Concorrência

Data: 2026-11-17
Versão: 0.4.0

---

## ✅ O que foi implementado

### 1. Refresh token — lock seguro (race condition corrigida)
- `services/auth/src/services/auth.service.ts`
- `SELECT ... FOR UPDATE` dentro de `sql.begin`.
- A rotação agora é atômica: apenas uma das requisições concorrentes
  consegue rotacionar; a outra recebe `401`.

### 2. Idempotência (`Idempotency-Key`)
- `services/admin-api/src/services/idempotency.ts` (novo)
- Tabela `livre_auth.idempotency_keys` criada (migration idempotente).
- Rotas protegidas: `POST /public/:table`, `PATCH /public/:table/:id`,
  `DELETE /public/:table/:id`, `POST /public/rpc/:name`, `POST /public/transaction`.
- Sem header → comportamento normal (retrocompatível).
- Mesma chave + mesmo corpo → replay da resposta.
- Mesma chave + corpo diferente → `409`.
- Chave em processamento → `409`.

### 3. Lock otimista no slug (colisão)
- `services/admin-api/src/index.ts`
- `insertWithSlugRetry` com retry em caso de `23505` (unique_violation) no slug.

### 4. Documentação
- `docs/api/rpc-transactions.md` atualizado com idempotência.

---

## 🧪 Validações

| Checagem | Resultado |
|---|---|
| admin-api build (`tsc`) | ✅ OK |
| admin-api testes (`vitest`) | ✅ 51/51 passando |
| auth-service build (`tsc`) | ✅ OK |
| panel typecheck (`tsc`) | ✅ OK |
| version.sh check | ✅ Sincronizado em 0.4.0 |

---

## 📦 Arquivos alterados

- `services/auth/src/services/auth.service.ts`
- `services/admin-api/src/db/migrate.ts`
- `services/admin-api/src/services/idempotency.ts` (novo)
- `services/admin-api/src/index.ts`
- `services/admin-api/test/idempotency.test.ts` (novo)
- `docs/api/rpc-transactions.md`
- `docs/audit/fase-4-auditoria.md`, `docs/audit/fase-4-relatorio.md`
- `CHANGELOG.md`, `VERSION`, `README.md`, etc.

---

## ⚠️ Pendências / Observações

1. **Deploy**: o comando de deploy precisou ser refeito via script porque o
   terminal interativo do sudo não estava funcionando. O deploy do `admin-api`
   (Fase 3) e `auth-service` (Fase 4) precisa ser re-executado no VPS.
2. **Backfill**: garantir índice `UNIQUE(slug)` nas tabelas de cliente
   existentes (migration pode não aplicá-lo automaticamente).
3. **Deadlock**: tratamento `40P01`/`40001` + retry (3x) — código criado na
   auditoria, implementação pendente na Fase 5/6.

---

## 🏁 Fase 4 — Concluída

**Próximo passo:** Auditoria da **Fase 5** (tabela `tasks` + worker de filas).

**Aprovado o relatório de auditoria e a implementação da Fase 4?** (s/n)
