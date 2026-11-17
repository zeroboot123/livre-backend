# Auditoria Técnica — Fase 1

> Livre Backend · versão `0.2.0` · commit `d87e1d3`
> Data: 2026-11-17 · Escopo: repositório completo + inspeção somente-leitura da VPS de produção

Este documento é a **Fase 1** do plano de evolução. Nenhuma alteração de código foi
feita nesta fase. Ele descreve o que existe hoje, o que está parcialmente
implementado, o que não existe, os riscos e as mudanças propostas por módulo.

---

## 1. Sumário executivo

O Livre Backend **já é uma plataforma BaaS funcional**, com isolamento por schema,
RLS real aplicada por requisição, API pública autenticada por token, painel
administrativo, storage S3 (MinIO), versionamento e deploy automatizado.

O que **não** existe e motiva esta evolução:

| # | Lacuna | Impacto |
|---|---|---|
| 1 | API pública sem filtros/ordenação/`select` (só `search`, `limit`, `offset`) | Cliente precisa baixar dados e filtrar |
| 2 | Limite fixo de 200 registros, `count(*)` sempre executado | Consultas caras em tabelas grandes |
| 3 | Nenhuma transação exposta ao cliente | Concorrência e consistência resolvidas no app |
| 4 | Nenhum RPC genérico (`/public/wf/:name` apenas ecoa o payload) | Lógica crítica fica no cliente |
| 5 | Nenhum mecanismo de lock/idempotência exposto | Risco de processamento duplicado |
| 6 | Nenhuma fila/worker | Retry e tarefas assíncronas inexistentes |
| 7 | Logs da API desligados (`logger: false`), sem métricas | Diagnóstico depende de `docker logs` vazio |
| 8 | `audit_log` existe no schema mas nunca é escrito | Sem rastreabilidade |
| 9 | Rate limit só no auth-service; admin-api sem limite | Superfície de abuso |
| 10 | Backup manual, sem cron, sem verificação, sem teste de restauração | Risco de perda de dados |
| 11 | Zero testes automatizados | Regressões silenciosas |
| 12 | PostgREST rodando com `anon` no schema `public` — que está vazio | Serviço inútil hoje, porém exposto |

---

## 2. Arquitetura observada

| Serviço | Porta | Papel | Observação |
|---|---|---|---|
| `admin-panel` (Next.js) | 3003 | Painel administrativo (`/admin`) | Consome `admin-api` e `auth` |
| `admin-api` (Fastify) | 3002 | API administrativa **+ API pública de dados** | 90 KB em `src/index.ts`, 1 arquivo |
| `auth-service` (Fastify) | 3001 | Login, refresh, reset, setup, admin de usuários | Pino ligado, rate limit 60/min |
| `visual-db` (Fastify) | 3004 | Apenas `/health` | Placeholder |
| `postgres` | 5432 (127.0.0.1) | Dados | `init.sql` + migrações idempotentes |
| `minio` | interno | Storage S3 | bucket `livre-files` |
| `postgrest` | interno | REST automático | **Inutilizado**: schema `public` vazio |

- Proxy: Traefik/EasyPanel; rotas `/admin`, `/admin/api`, `/auth`, `/admin/visual-db`, `/api/rest`.
- Rede Docker interna + rede externa `easypanel`.
- `admin-api` faz `rewriteUrl` para funcionar com ou sem *strip prefix*.

**Achado importante:** a documentação (`docs/api/postgrest-endpoints.md`) descreve
`/api/rest`, mas o schema `public` **não tem nenhuma tabela** (verificado em
produção). Todo o tráfego real de dados usa `/admin/api/public/...`.

---

## 3. Banco de dados e segurança de acesso

### 3.1 Schema `livre_auth`
`users`, `sessions`, `projects`, `tenants`, `project_users`, `audit_log`,
`password_resets`, `files`, `api_tokens`, `api_settings`, `api_exposed_tables`,
`project_api_settings`, `project_api_exposed_tables`, `rls_rules`,
`option_sets`, `option_set_options`, `sql_migrations`, `email_settings`,
`project_email_settings`.

### 3.2 Schemas de projeto
- Um schema `proj_<slug>` por projeto; **25 tabelas** hoje (GBFatura: 22 expostas
  na API; Zeroboot: 3).
- Campos embutidos em todas as tabelas: `id`, `created_at`, `updated_at`,
  `creator`, `slug` (`BUILTIN_FIELDS`).
- Tabela nativa `users` por projeto (senha scrypt, `email_confirmed`, `token_version`).
- 2 projetos, 4 tokens ativos, **0 regras RLS cadastradas**.

### 3.3 Roles
| Role | Login | Super | BYPASSRLS |
|---|---|---|---|
| `livre_admin` | sim | sim | sim |
| `anon` | não | não | não |
| `authenticated` | não | não | não |

- As migrações e o admin-api conectam como **`livre_admin` (superuser)**.
- Cada consulta pública roda em `sql.begin` com `SET LOCAL ROLE authenticated`
  + `set_config('app.current_user_id'/'current_tenant_id')` → **RLS é realmente aplicada**
  nas rotas `/public/*`.
- Sem regras, a tabela fica com RLS **desabilitado** (`applyRlsPolicies`), o que é
  intencional, mas precisa de aviso explícito no painel.

### 3.4 Risco relevante
`anon`/`authenticated` recebem `GRANT SELECT ON livre_auth.users` (`init.sql`).
Não há exposição via PostgREST porque o schema permitido é `public`, mas qualquer
mudança futura de `PGRST_DB_SCHEMA` exporia hashes de senha. **Corrigir o grant.**

---

## 4. Módulo 1 — API REST avançada

### Estado atual
`services/admin-api/src/index.ts:2347` (`GET /public/:table`):

- únicos parâmetros: `search`, `limit` (1–200), `offset`
- ordenação fixa: `id DESC` (ou 1ª coluna)
- colunas: todas, exceto `HIDDEN_COLUMNS`
  (`password_hash`, `token_version`, `refresh_token*`, `email_token`, `email_confirmed`)
- resposta: `{ data, total, limit, offset }`
- `count(*)` executado em **toda** requisição
- token: `X-API-Key` ou `Bearer`; validado por hash SHA-256; `data_api_enabled` e
  tabela em `project_api_exposed_tables` são obrigatórios
- valores **sempre parametrizados** (`$1…$n`); identificadores passam por `qident`
  → não há SQL injection hoje, mas também não há filtros

### Limitações
Sem `eq/neq/gt/gte/lt/lte/like/ilike/in/is/not/or`, sem `order`, sem `select`,
sem paginação por cursor, sem `Prefer: count=...`.

### Mudanças propostas
1. Parser próprio de query string **no admin-api** (não trocar por PostgREST),
   preservando `{data,total,limit,offset}` e a autenticação atual.
2. Allowlist de operadores; cast tipado pelo `data_type` real da coluna; sempre `$n`.
3. `select=col1,col2` validado contra colunas existentes e `HIDDEN_COLUMNS`.
4. `order=col.asc,col2.desc` com allowlist de colunas.
5. `limit` máximo configurável (`API_MAX_LIMIT`, padrão 200, teto 1000) e
   `Prefer: count=none|exact` para evitar `count(*)` desnecessário.
6. Cursor opcional (`?cursor=<created_at>,<id>&limit=`), sem quebrar offset.
7. Testes de injeção (`'; drop table`, `1);--`, `sleep`) e de RLS.

### Riscos
Alterar o formato de resposta quebraria o GBFatura → **nada será removido**, apenas
adicionado. `total` continua vindo por padrão.

---

## 5. Módulo 2 — Transações

### Estado atual
- `sql.begin()` usado internamente (deleção de projeto, RLS, migrações).
- `executeSqlMigration` já usa transação com `SET LOCAL statement_timeout = '120s'`
  (`services/sql-migrations.ts:361`).
- Nenhuma transação exposta ao cliente; nenhum controle de isolamento por requisição.
- `FOR UPDATE` existe apenas na exclusão de projeto (`index.ts:331`).

### Mudanças propostas
- Toda execução de RPC roda em transação com:
  `SET LOCAL statement_timeout`, `SET LOCAL lock_timeout`,
  `SET LOCAL ROLE authenticated`, contexto de usuário/tenant.
- Isolamento configurável por função (`read committed` padrão, `serializable` opcional).
- Erros convertidos em HTTP 4xx/409 com `code`/`detail`, sem vazar SQL.
- Log estruturado de falha (sem parâmetros sensíveis).

---

## 6. Módulo 3 — RPC / Database Functions

### Estado atual
- Não existe `/public/rpc/:fn`.
- `/public/wf/:name` (`index.ts:2514`) apenas devolve `{ ok, workflow, received }`.

### Mudanças propostas
- Tabela `livre_auth.rpc_functions` (`project_id`, `schema`, `name`, `enabled`,
  `allowed_roles`, descrição, timestamps) como **allowlist explícita**.
- `POST /public/rpc/:name` e `POST /public/rpc/:name/:fn` com body JSON.
- Execução: `SELECT * FROM <schema>.<fn>(<args>)` com binder tipado a partir de
  `pg_proc.proargtypes` (nunca concatenar valores).
- Funções fora da allowlist → 404. Funções internas (`livre_auth.*`, `pg_catalog.*`)
  bloqueadas por construção.
- Suporte a retorno escalar, JSON e conjunto de registros.

---

## 7. Módulo 4 — Concorrência e locks

### Estado atual
- `pg_advisory_xact_lock(741852963)` no setup inicial (`auth.service.ts:83`).
- Nenhum lock otimista (`version`), nenhuma idempotência genérica.

### Mudanças propostas
- Documentar e expor helpers usados pelas funções do projeto:
  `FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, `pg_advisory_xact_lock`.
- Tabela `livre_auth.idempotency_keys` (`project_id`, `key`, `endpoint`,
  `response`, `status`, `created_at`) + suporte a header `Idempotency-Key` em
  `POST /public/:table` e RPC (opt-in, retrocompatível).
- Timeouts de lock para evitar deadlock em cascata; erros `40P01`/`55P03`
  mapeados para 409/503.

---

## 8. Módulo 5 — Filas e workers

### Estado atual
**Inexistente.** Nenhuma menção a fila, worker, Redis ou `SKIP LOCKED` no código.

### Mudanças propostas
- Tabela `livre_auth.tasks` com os campos conceituais do enunciado
  (`project_id`, `queue_name`, `task_type`, `payload`, `status`, `priority`,
  `attempts`, `max_attempts`, `scheduled_at`, `started_at`, `completed_at`,
  `locked_at`, `locked_by`, `last_error`).
- Novo serviço `services/worker` (container próprio, memória baixa) usando
  `FOR UPDATE SKIP LOCKED`, backoff exponencial e recuperação de tarefas com
  lease expirado.
- Endpoints públicos: `POST /public/tasks`, `GET /public/tasks/:id`,
  `POST /public/tasks/:id/cancel`.
- Disparo de tarefa = gravação transacional no Postgres (sem Redis).
- Redis permanece opcional e fora do caminho crítico.

---

## 9. Módulo 6 — Monitoramento e observabilidade

### Estado atual
- `GET /health` em admin-api, auth, visual-db; healthchecks no compose.
- `admin-api` com `logger: false` → **nenhum log de requisição**.
- `auth` com Pino padrão (texto), não configurado como JSON estruturado.
- Nenhuma métrica Prometheus; existe Grafana na VPS, sem datasource do Livre Backend.

### Mudanças propostas
- Pino JSON com `redact` (authorization, x-api-key, password, refresh_token).
- Log por requisição: método, rota, status, duração, `project_id`, `token_id`,
  `request_id` (propagado por header).
- `GET /health` agregado (Postgres, MinIO, PostgREST, worker) e `GET /metrics`
  (prom-client) protegido por token/allowlist de IP no Traefik.
- Métricas: RPS, latência p95, erros 4xx/5xx, conexões PG, tarefas pendentes/falhas,
  execuções de RPC, duração de transações.

---

## 10. Módulo 7 — Segurança e segredos

### Achados
| Severidade | Achado |
|---|---|
| Alta | `admin-api` sem rate limit e com `cors: origin: true` |
| Alta | `anon`/`authenticated` com `SELECT` em `livre_auth.users` |
| Alta | PostgREST publicado em `/api/rest` com role `anon` (schema vazio hoje) |
| Média | `audit_log` nunca escrito; exclusões não rastreáveis |
| Média | Segredos apenas em `.env`/EasyPanel; sem rotação documentada |
| Média | `EMAIL_ENCRYPTION_KEY` vazia ⇒ deriva do `JWT_SECRET` |
| Baixa | `.env.example` incompleto (`PG_*`, `EMAIL_ENCRYPTION_KEY`, `API_BASE_PATH`) |
| Baixa | `visual-db` exposto sem autenticação (só `/health`) |

### Mudanças propostas
- Rate limit distribuído opcional via Redis; **fallback in-memory** por padrão
  (por token, IP e rota) — sem Redis obrigatório.
- Auditoria gravada em `audit_log` nas operações do painel e nos RPCs.
- Token público com escopo (`read`/`write`/`rpc`) e expiração opcional.
- CORS restrito por `CORS_ORIGINS` também no admin-api.
- `statement_timeout`/`lock_timeout` por conexão.
- Documentar rotação de `JWT_SECRET` (com `token_version`) e de senhas.

---

## 11. Módulo 8 — Backup e recuperação

### Estado atual
- `scripts/backup.sh` (`pg_dump | gzip`), retenção por dias, **manual**.
- `scripts/restore.sh` manual, com confirmação.
- Sem cron/systemd timer; sem verificação de integridade; sem cópia offsite.
- `BACKUP_DIR` está no compose mas **não é usado pelo código**.
- Página `/admin/backups` é placeholder.

### Mudanças propostas
- Job de backup (container/cron) com `pg_dump -Fc`, checksum SHA-256 e manifesto.
- Retenção configurável + envio opcional para MinIO/bucket externo.
- Endpoint/CLI de verificação (`pg_restore --list`) e teste de restauração em
  banco temporário (`livre_backend_restore_test`).
- Documento `docs/backup-restore.md` com passo a passo de DR e RPO/RTO.

---

## 12. Testes

**Zero testes automatizados** hoje (nenhum `*.test.ts`, nenhuma dependência de test).
Proposta: Vitest + Postgres efêmero (`docker compose -f docker-compose.test.yml`),
sem tocar em produção, cobrindo API REST, transações, RPC, workers, RLS, rate limit
e idempotência.

---

## 13. Compatibilidade com o GBFatura

Premissas que **não** podem quebrar:

1. Base `/admin/api/public` e autenticação por `X-API-Key`/`Bearer`.
2. Formato `{ data: [...], total, limit, offset }` em listagens.
3. `POST`/`PATCH` retornando `{ data: {...} }`; `DELETE` retornando `{ ok: true }`.
4. Tabelas e schemas existentes intactos.
5. RLS e comportamento de `creator`/`slug`/`updated_at` inalterados.
6. 22 tabelas expostas continuam expostas.

Estratégia: **apenas adições compatíveis**. Se algo precisar mudar, cria-se
`/public/v2/...` e o cliente migra depois.

---

## 14. Roadmap por fases (com critérios de aceite)

| Fase | Entrega | Aceite |
|---|---|---|
| 1 | Esta auditoria | Aprovação |
| 2 | Filtros, ordenação, `select`, paginação configurável e cursor | GBFatura sem alteração; testes de injeção/RLS verdes |
| 3 | RPC allowlist + transações com timeouts | Função de exemplo executa commit/rollback corretamente |
| 4 | Locks, idempotência e mapeamento de deadlock | Teste concorrente sem duplicidade |
| 5 | `tasks` + worker + retry/backoff + recuperação | Tarefa falha reprocessa e conclui; worker morto é recuperado |
| 6 | Logs JSON, health agregado, `/metrics` | Logs sem dados sensíveis; métricas no Grafana |
| 7 | Rate limit, auditoria, escopos de token, CORS | Testes de abuso e isolamento entre projetos |
| 8 | Backup verificado, restauração testada, docs finais | Restauração comprovada em ambiente isolado |

---

## 15. Decisões pendentes (bloqueiam a Fase 2)

1. **Filtros:** estender `/public/:table` no admin-api (recomendado) **ou**
   migrar clientes para PostgREST? *(Recomendo estender: mantém auth, RLS e contrato.)*
2. **`limit` máximo:** manter 200 e permitir override por projeto, ou subir o teto
   global para 1000? *(Recomendo 200 padrão, 1000 máximo configurável.)*
3. **`total`:** manter `count(*)` por padrão e permitir `Prefer: count=none`?
   *(Recomendo sim, compatível.)*
4. **RPC:** allowlist em tabela gerenciada pelo painel, com `SECURITY INVOKER`
   (respeita RLS) por padrão.
5. **Worker:** container separado no compose (recomendado), 128–256 MB.
6. **Backup offsite:** MinIO local apenas, ou também bucket externo?
