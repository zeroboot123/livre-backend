# Auditoria — Fase 7: Rate Limit, Auditoria, Escopos de Token, CORS, Grants

**Data:** 2026-11-17
**Versão auditada:** `0.5.0`
**Escopo:** módulos de segurança/permissões do backend.

---

## 1. Achados por item do escopo

### 1.1 Rate limit

| Item | Situação | Severidade |
|---|---|---|
| Auth service (`services/auth`) | ✅ `@fastify/rate-limit` registrado: `max: 60, timeWindow: '1 minute'` | OK |
| Admin API (`services/admin-api`) | ❌ **Nenhum rate limit** registrado (nem para token Bearer do painel, nem para `/public/*`) | **Alta** |
| Visual DB (`services/visual-db`) | ❌ Sem rate limit verificado | Baixa |

- O admin-api é o único serviço com superfície pública grande (API pública por
  token `X-API-Key`/`Bearer` + endpoints administrativos por JWT). Sem rate limit,
  um token vazado ou um script malicioso pode esvaziar tabelas via `SELECT`/`DELETE`.
- A dependência `@fastify/rate-limit` **não está** nas dependências do admin-api
  (só do auth).

### 1.2 Auditoria (`audit_log`)

| Item | Situação |
|---|---|
| Tabela `livre_auth.audit_log` | ✅ Existe (`docker/postgres/init.sql:88`) com `user_id`, `project_id`, `tenant_id`, `action`, `resource`, `details`, `ip_address`, `created_at` + índices |
| Escrita em operações | ❌ **Nunca escrita** (apenas seed em `auth/src/db/migrations/002_roles.sql:11`) |
| DELETE de projeto | ✅ Já remove do `audit_log` |

- Lacuna herdada da Fase 1 (item 8) **permanece aberta**: nenhuma operação do painel
  ou da API pública gera registro de auditoria (login, refresh, create/update/delete,
  RPC, task).

### 1.3 Escopos de token

| Item | Situação |
|---|---|
| `api_tokens.permissions` (JSONB) | ✅ Definido no schema, mas **nunca consultado** |
| `api_tokens.context_user_id` / `context_tenant_id` | ✅ Adicionados via migração (Fase 4) e usados no RLS |
| Validação em `requireApiToken` (`admin-api/src/index.ts:1886`) | ❌ Apenas checa `token_hash`, `revoked`, `project_id`, `schema_name` — **ignora `permissions`** |
| JWT do painel (`utils/crypto.ts`) | `sub, email, project_id, tenant_id, role, type, v` — sem claims de escopo além do `role` |

- Um token emitido com escopos restritos (ex.: somente `read`) continua podendo
  executar `DELETE` — **fail-open** na camada de autorização.

### 1.4 CORS

| Item | Situação |
|---|---|
| Auth service | ✅ `origin: config.cors.origins` (`CORS_ORIGINS`, com `credentials: true`) |
| Admin API | ❌ `cors({ origin: true })` — reflete **qualquer** origem |
| Visual DB | ❌ `cors({ origin: true })` |

- O admin-api aceita requisições de qualquer origem (`Access-Control-Allow-Origin: *`),
  incluindo a API pública consumida pela GBFatura. Recomenda-se restringir via
  `CORS_ORIGINS` (padrão seguro: origem do front-end).

### 1.5 Grants

| Item | Situação |
|---|---|
| `GRANT SELECT ON libre_auth.users TO anon, authenticated` (`init.sql:179`) | ❌ **Presente** — expõe hash de senha a `authenticated` |
| `GRANT SELECT ON libre_auth.projects TO anon, authenticated` (`init.sql:182`) | ⚠️ Presente (anon legítimo pode ler projetos via PostgREST, hoje sem dados) |
| Grants por tabela em schemas de projeto (`grantTableToAuthenticated`) | ✅ `SELECT/INSERT/UPDATE/DELETE` ao role `authenticated` (com RLS aplicado depois) |
| PostgREST + role `anon` | ⚠️ Publicado em `/api/rest` (Fase 1); schema `public` vazio hoje — risco residual se config mudar |

---

## 2. Prioridades recomendadas para a Fase 7

1. **Rate limit no admin-api** (in-memory via `@fastify/rate-limit`, por IP/token),
   reaproveitando o padrão do auth.
2. **Auditoria**: gravar em `audit_log` nas operações de escrita (públicas, painel e
   RPC), com `action`, `resource`, `details`, `user_id`, `project_id`, `ip_address`.
3. **Escopos de token**: validar `permissions` (`read`/`write`/`rpc`) no `requireApiToken`
   e nos handlers críticos (DELETE exige `write`; SELECT/RPC exigem permissão).
4. **CORS**: admin-api e visual-db com `origin` a partir de `CORS_ORIGINS`.
5. **Grants**: remover o grant amplo sobre `livre_auth.users`.

---

## 🏁 Fase 7 — Concluída (auditoria)

**Achados confirmados:** rate limit ausente no admin-api; auditoria não escrita;
escopos de token ignorados; CORS permissivo no admin-api/visual-db; grant amplo
`users` mantido.

**Próximo:** implementação da Fase 7 (rate limit, auditoria, escopos, CORS, grants).

**Aprovado o relatório de auditoria e a implementação da Fase 7? (s/n)**
