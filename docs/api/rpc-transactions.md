# RPC e Transações

Base: `https://<seu-dominio>/admin/api/public`

Autenticação (obrigatória):

```http
X-API-Key: lv_xxxxxxxx
# ou
Authorization: Bearer lv_xxxxxxxx
```

---

## 1. RPC (Remote Procedure Call)

Executa uma função PostgreSQL do **schema do projeto** com o contexto do token.

```http
POST /admin/api/public/rpc/criar_fatura
Content-Type: application/json

{
  "cliente_id": "uuid-do-cliente",
  "valor": 150.00
}
```

Resposta:

```json
{ "data": { "id": "…", "status": "ABERTA" } }
```

### Contrato da função

Para ser elegível, a função deve:

| Requisito | Detalhe |
|---|---|
| Estar no schema do projeto | `proj_<slug>` — nunca em `public` ou `livre_auth` |
| Ser `SECURITY INVOKER` | Funções `SECURITY DEFINER` são **rejeitadas** |
| Receber 1 argumento | `payload jsonb` |
| Ter `EXECUTE` para `authenticated` | Concedido automaticamente ao liberar a função |

Exemplo de função válida:

```sql
CREATE OR REPLACE FUNCTION proj_gbfatura.criar_fatura(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  novo_id uuid;
BEGIN
  INSERT INTO proj_gbfatura.faturas (cliente_id, valor, status)
  VALUES ((payload->>'cliente_id')::uuid, (payload->>'valor')::numeric, 'ABERTA')
  RETURNING id INTO novo_id;

  RETURN jsonb_build_object('id', novo_id, 'status', 'ABERTA');
END;
$$;
```

> A função **não** pode ser `SECURITY DEFINER`: assim ela executa com as permissões
> do role `authenticated` e as políticas RLS do projeto são aplicadas.

### Allowlist por projeto

Nenhuma função é executada sem autorização explícita. A allowlist fica em
`livre_auth.project_rpc_allowed` e é gerenciada no painel:

- **Banco → API → RPC (funções do projeto)** — marque/desmarque a função.
- Via API administrativa: `POST /admin/api/rpc-functions/:name` e
  `DELETE /admin/api/rpc-functions/:name`.

Funções listadas como **não elegíveis** no painel (SECURITY DEFINER ou com
argumentos diferentes) não podem ser liberadas.

### Erros

| Situação | HTTP | Corpo |
|---|---|---|
| Sem token / token inválido | 401 | `{ "error": "API token inválido ou ausente" }` |
| Função não está na allowlist | 403 | `{ "error": "Função não autorizada para RPC: …" }` |
| Função inexistente no projeto | 404 | `{ "error": "Função não encontrada no projeto: …" }` |
| Função `SECURITY DEFINER` | 403 | `{ "error": "… é SECURITY DEFINER …" }` |
| Assinatura inválida | 400 | `{ "error": "… deve receber um único argumento jsonb …" }` |
| Erro dentro da função | 400 | `{ "error": "<mensagem do PostgreSQL>" }` |

---

## 2. Transação em lote

Executa várias operações **atomicamente**: ou todas são confirmadas, ou nenhuma.

```http
POST /admin/api/public/transaction
Content-Type: application/json

{
  "operations": [
    { "method": "insert", "table": "faturas", "data": { "cliente_id": "…", "valor": 150 } },
    { "method": "insert", "table": "auditoria", "data": { "evento": "fatura_criada" } },
    { "method": "update", "table": "clientes", "id": "…", "data": { "total_gasto": 150 } }
  ]
}
```

Resposta:

```json
{
  "data": [
    { "method": "insert", "table": "faturas", "data": { "id": "…", … } },
    { "method": "insert", "table": "auditoria", "data": { "id": "…", … } },
    { "method": "update", "table": "clientes", "data": { "id": "…", … } }
  ],
  "committed": true
}
```

### Operações suportadas

| Método | Campos | Efeito |
|---|---|---|
| `insert` | `table`, `data` | Insere um registro (mesmas regras do `POST /public/:table`) |
| `update` | `table`, `id`, `data` | Atualiza um registro (mesmas regras do `PATCH`) |
| `delete` | `table`, `id` | Remove um registro |
| `rpc` | `function`, `payload` | Executa uma função da allowlist |

Exemplo com RPC dentro do lote:

```json
{
  "operations": [
    { "method": "rpc", "function": "criar_fatura", "payload": { "valor": 150 } },
    { "method": "insert", "table": "auditoria", "data": { "evento": "fatura_criada" } }
  ]
}
```

### Regras e garantias

- **Atomicidade:** uma falha em qualquer operação cancela todas (`ROLLBACK`).
- **Ordem:** as operações são executadas na ordem informada.
- **Limite:** até **50 operações** por transação.
- **Timeout:** `statement_timeout = 5s`, `lock_timeout = 2s` e
  `idle_in_transaction_session_timeout = 10s` (configuráveis no futuro).
- **RLS:** tudo roda com `SET LOCAL ROLE authenticated` e o contexto do token —
  as políticas RLS valem para cada operação.
- **Tabelas:** só tabelas **expostas** na API podem ser usadas (`insert`,
  `update`, `delete`); caso contrário, a transação inteira é cancelada.
- **Colunas internas:** `password_hash`, tokens, etc. nunca são aceitos.
- **RPC:** só funções da allowlist, já validadas antes de abrir a transação.

### Erros

| Situação | HTTP | Corpo |
|---|---|---|
| Data API desabilitada | 403 | `{ "error": "Data API desabilitada" }` |
| Payload inválido | 400 | `{ "error": "…" }` |
| Tabela não exposta | 403 | `{ "error": "Tabela não exposta na API: …" }` |
| Registro inexistente | 404 | `{ "error": "Registro não encontrado" }` |
| Falha em qualquer operação | 400 | `{ "error": "…", "committed": false }` |

---

## 4. Idempotência (`Idempotency-Key`)

Todas as rotas de escrita públicas aceitam um header opcional:

```http
Idempotency-Key: 3f9a8b7c-...
```

Regras:

- Chave deve ser única por operação (UUID é recomendado).
- **Mesma chave + mesmo corpo** → a operação **não é repetida**; a resposta
  gravada é devolvida (idempotente).
- **Mesma chave + corpo diferente** → `409 Conflict`.
- **Chave em processamento** (concorrente) → `409 Conflict`.

Endpoints protegidos: `POST /public/:table`, `PATCH /public/:table/:id`,
`DELETE /public/:table/:id`, `POST /public/rpc/:name`, `POST /public/transaction`.

Sem o header, o comportamento é o normal (sem idempotência). A tabela
`livre_auth.idempotency_keys` retém as respostas por até
`IDEMPOTENCY_TTL_HOURS` (padrão 24h).

---

## 3. Isolamento e segurança

- Cada chamada RPC ou transação abre sua própria transação SQL e executa com
  `SET LOCAL ROLE authenticated` — o `livre_admin` (superusuário) nunca executa
  código do cliente.
- O contexto do token (`app.current_user_id`, `app.current_tenant_id`) é aplicado
  com `SET LOCAL`, então as políticas RLS filtram linhas exatamente como nas
  rotas de CRUD.
- Nomes de função e de tabela nunca são concatenados no SQL a partir do input:
  são validados no catálogo (`pg_proc`, `pg_class`) e os valores sempre vão
  como parâmetros.
