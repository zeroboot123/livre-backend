# Auditoria — Fase 4: Locks, Idempotência e Concorrência

**Data:** 2026-11-17
**Escopo:** `services/admin-api`, `services/auth`, `docker/postgres/init.sql`
**Método:** leitura do código + verificação do schema em produção (somente leitura)

---

## 1. Resumo executivo

A plataforma **não tem proteção contra requisições duplicadas** (idempotência) e
apresenta **duas race conditions confirmadas** no caminho de autenticação. Os
fluxos de escrita da API pública (CRUD) são seguros por relygar a chave
primária e pelas políticas RLS, mas o `slug` automático tem uma janela de
colisão.

| Severidade | Achado | Onde |
|---|---|---|
| 🔴 Alta | Refresh token pode ser reutilizado em requisições simultâneas | `auth.service.ts:241-278` |
| 🔴 Alta | Sem idempotência: retentativa de rede duplica registros | API pública (todas as rotas de escrita) |
| 🟡 Média | `uniqueSlug` tem janela de colisão entre requisições | `admin-api/src/index.ts:597` |
| 🟡 Média | Sem `version`/lock otimista: última escrita vence silenciosamente | `PATCH /public/:table/:id` |
| 🟡 Média | Sem detecção/retry de deadlock (`40P01`) | todo o `admin-api` |
| 🟢 Baixa | Advisory lock existe apenas no setup inicial | `auth.service.ts:83` |

---

## 2. O que já está correto (não mexer)

| Mecanismo | Onde | Avaliação |
|---|---|---|
| `pg_advisory_xact_lock` no setup inicial | `auth.service.ts:83` | Serializa o "primeiro admin" corretamente |
| `SELECT ... FOR UPDATE` ao excluir projeto | `admin-api/src/index.ts:350` | Evita exclusão concorrente do mesmo projeto |
| Transação única por requisição | `withRlsContext` / `sql.begin` | Falha ⇒ rollback automático |
| `UNIQUE` em e-mail de usuário | `init.sql:17` + índice `lower(email)` | Duplicidade de e-mail barrada pelo banco |
| `lock_timeout` nas transações em lote | Fase 3 | Evita espera indefinida por locks |
| `statement_timeout` em migrations | `sql-migrations.ts:362` | Impede migration travada |

---

## 3. Achado 1 — Race condition no refresh token (🔴 Alta)

### Situação atual

```ts
// auth.service.ts
const [session] = await sql`SELECT ... FROM livre_auth.sessions WHERE refresh_token_hash = $1`;
if (!session || session.revoked || session.expires_at < new Date()) throw ...;

// Revogar token antigo (rotação)
await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE id = ${session.id}`;
// ... depois insere a nova sessão
```

O `SELECT` e o `UPDATE` acontecem em **autocommits separados**. Se duas
requisições com o mesmo refresh token chegam juntas (comum em retry de rede,
app mobile ou abas duplicadas):

1. Ambas leem a sessão com `revoked = false`.
2. Ambas revalidam a sessão.
3. Ambas revogam a sessão antiga.
4. Ambas criam uma **nova sessão válida** → o mesmo refresh token "renasce".

**Impacto:** quebra da garantia de rotação (token reutilizado permanece válido),
permitindo sessions paralelas não desejadas. O `revoked` não impede, porque a
checagem aconteceu antes.

### Correção proposta

Travar a linha da sessão com `SELECT ... FOR UPDATE` **dentro de uma única
transação**, junto com a revogação e a inserção da nova sessão:

```sql
BEGIN;
  SELECT ... FROM livre_auth.sessions WHERE refresh_token_hash = $1 FOR UPDATE;
  -- valida revoked/expired
  UPDATE livre_auth.sessions SET revoked = TRUE WHERE id = $2;
  INSERT INTO livre_auth.sessions (...) VALUES (...);
COMMIT;
```

A segunda requisição passa a esperar o lock e, ao adquirir, enxerga
`revoked = true` → é rejeitada com 401. Determinístico e sem serviço externo.

---

## 4. Achado 2 — Ausência de idempotência (🔴 Alta)

### Situação atual

Nenhuma rota de escrita aceita uma chave de idempotência. Se o cliente enviar
`POST /public/faturas` e a resposta se perder na rede, o retry (comum em
integrações e apps móveis) cria **uma segunda fatura**.

O mesmo vale para `POST /public/transaction`, que pode executar um lote
inteiro duas vezes.

### Correção proposta

1. **Tabela de chaves** (em `livre_auth`, fora do schema do cliente):
   ```sql
   CREATE TABLE livre_auth.idempotency_keys (
     id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     project_id     uuid NOT NULL REFERENCES livre_auth.projects(id) ON DELETE CASCADE,
     key            text NOT NULL,
     endpoint       text NOT NULL,
     request_hash   text NOT NULL,   -- SHA-256 do corpo
     status         text NOT NULL DEFAULT 'in_progress',
     response       jsonb,
     created_at     timestamptz NOT NULL DEFAULT now(),
     completed_at   timestamptz,
     UNIQUE (project_id, key)
   );
   ```
2. **Header opcional** `Idempotency-Key: <uuid/texto>` nas rotas de escrita.
   Sem o header, o comportamento atual permanece (retrocompatível).
3. **Semântica:**
   * Mesma chave + **mesmo** corpo → devolve a resposta gravada (sem reexecutar).
   * Mesma chave + **corpo diferente** → `409 Conflict`.
   * Chave em andamento (`in_progress`) → `409` (requisição duplicada concorrente).
4. **Limpeza:** chaves concluídas são descartadas após 24h (job de limpeza na
   Fase 5, ou `DELETE` oportunista por chance).

---

## 5. Achado 3 — Colisão de `slug` (🟡 Média)

### Situação atual

`uniqueSlugWith` faz `SELECT 1 ... WHERE slug = $1` e, se não existir, devolve o
candidato. Duas requisições simultâneas com o mesmo texto podem gerar o mesmo
slug. Se a coluna `slug` **não** tiver índice `UNIQUE`, as duas linhas são
criadas com o mesmo slug (dado duplicado). Se tiver `UNIQUE`, a segunda falha
com erro 500 genérico em vez de retry.

### Correção proposta

* Garantir índice `UNIQUE (slug)` por tabela de projeto na criação da tabela.
* No `INSERT`, capturar o erro de violação de unicidade (`23505`) e tentar o
  próximo candidato (`-2`, `-3`, …) até 30 tentativas, como já feito na
  geração do slug.

---

## 6. Achado 4 — Escritas concorrentes sem lock otimista (🟡 Média)

### Situação atual

`PATCH /public/:table/:id` executa `UPDATE ... WHERE id::text = $1`. Dois
clients que editam o mesmo registro simultaneamente: o **último a chegar
vence**, e o cliente que perdeu a edição não recebe aviso — apenas salva dados
antigos por cima de dados novos.

### Correção proposta

Adicionar **versionamento otimista opcional**, sem quebrar o contrato atual:

* Se o cliente enviar `updated_at` (ou uma coluna `version`) no corpo do
  `PATCH`, o `UPDATE` passa a incluir `AND updated_at = <valor>`.
* Se nenhuma linha for afetada por causa do conflito, responder `409 Conflict`
  com mensagem clara ("registro alterado por outro usuário").
* Sem o campo: comportamento atual (última escrita vence) é preservado.

---

## 7. Achado 5 — Deadlocks sem tratamento (🟡 Média)

### Situação atual

Nenhum código trata o código de erro PostgreSQL `40P01` (deadlock detected) ou
`40001` (serialization failure). Em caso de deadlock, a resposta ao cliente é um
`400` genérico com a mensagem interna do PostgreSQL, e **não há retry**.

A ordem de acesso às tabelas dentro de uma transação em lote é a ordem das
operações do cliente — o que é exatamente a condição que gera deadlocks
clássicos (A→B em uma transação e B→A em outra).

### Correção proposta

1. **Detecção:** reconhecer `40P01` e `40001` e responder `409` com mensagem
   clara ("conflito de concorrência; tente novamente").
2. **Retry seguro:** repetir a transação em lote até **3 vezes** com backoff
   exponencial (50ms, 100ms, 200ms). Retry só é seguro porque a transação
   inteira foi revertida.
3. **Ordem canônica:** opcionalmente ordenar as operações por tabela para
   reduzir a chance de deadlock — mas isso muda a semântica, então será
   implementado apenas se a taxa de deadlock justificar.

---

## 8. Proposta de implementação (Fase 4)

### Entregas

| # | Entrega | Escopo |
|---|---|---|
| 1 | Refresh token seguro | `auth.service.ts`: `FOR UPDATE` + transação única |
| 2 | Tabela `idempotency_keys` | `migrate.ts` + `init.sql` |
| 3 | Middleware de idempotência | Novo serviço `idempotency.ts`, aplicado às escritas |
| 4 | Slug com retry | `uniqueSlugWith` + índice `UNIQUE` por tabela |
| 5 | Lock otimista | `PATCH` com `updated_at` → `409` em conflito |
| 6 | Tratamento de deadlock | Detecção `40P01`/`40001` + retry (3x) |

### Garantias de compatibilidade

* Nenhum header novo é **obrigatório**: sem `Idempotency-Key`, tudo funciona
  como hoje.
* A resposta pública mantém `{ data, total, limit, offset }`.
* O `PATCH` sem `updated_at` mantém o comportamento atual.
* A tabela nova fica em `livre_auth` — invisível para os clientes.

### Configuração

```env
# Tempo de retenção das chaves de idempotência (horas)
IDEMPOTENCY_TTL_HOURS=24
# Número máximo de tentativas em caso de deadlock
DEADLOCK_MAX_RETRIES=3
```

### Testes previstos

* Refresh token concorrente: duas chamadas simultâneas → apenas uma válida.
* Idempotência: mesma chave + mesmo corpo → resposta igual, 1 execução.
* Idempotência: mesma chave + corpo diferente → `409`.
* Idempotência: chave concorrente → `409` (não duplica).
* Slug: 20 inserções simultâneas com o mesmo seed → slugs únicos.
* Lock otimista: `PATCH` com `updated_at` desatualizado → `409`.
* Deadlock: transação injetada com `40P01` → retry e sucesso.

---

## 9. Pendências e riscos

| Item | Observação |
|---|---|
| Tabelas de cliente sem `UNIQUE(slug)` | Precisa backfill: verificar e criar índice nas tabelas existentes |
| Idempotência e `POST /public/transaction` | A chave precisa cobrir o lote inteiro (hash do array de operações) |
| Redis | **Não necessário** — advisory locks e unique constraints do PostgreSQL resolvem o caso |
| Ordem das operações no lote | Mantida como o cliente enviou (sem reordenar) — mudaria a semântica |

---

## 10. Conclusão

A Fase 4 é **essencial** antes de expor transações e RPC a integrações reais:
hoje, um retry de rede pode duplicar dados e o refresh token pode ser
reutilizado. As correções propostas são **localizadas** (2 arquivos de serviço
+ 1 migration), **retrocompatíveis** (tudo opcional por header) e **sem
dependência externa**.

**Recomendação:** aprovar a Fase 4 conforme a proposta acima.
