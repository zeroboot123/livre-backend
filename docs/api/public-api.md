# API pública de dados — consultas avançadas

Base: `https://<seu-dominio>/admin/api/public`

Autenticação (obrigatória):

```http
X-API-Key: lv_xxxxxxxx
# ou
Authorization: Bearer lv_xxxxxxxx
```

Requisitos por projeto: **Data API habilitada** e a tabela marcada como
**exposta** em Configurações → API. A tabela precisa existir no schema do projeto.

---

## 1. Listar registros

```http
GET /admin/api/public/faturas
```

Resposta (formato mantido desde a 0.2.0):

```json
{
  "data": [{ "id": "…", "status": "VENCIDA", "valor": 120.5 }],
  "total": 42,
  "limit": 50,
  "offset": 0,
  "next_cursor": null
}
```

`next_cursor` é sempre presente e só tem valor quando a paginação por cursor é usada.

---

## 2. Filtros

Sintaxe: `?coluna=operador.valor`. Vários filtros são combinados com **AND**.

| Operador | Exemplo | SQL gerado |
|---|---|---|
| `eq` | `?status=eq.VENCIDA` | `"status" = $1` |
| `neq` | `?status=neq.CANCELADA` | `"status" <> $1` |
| `gt` | `?valor=gt.100` | `"valor" > $1` |
| `gte` | `?valor=gte.100.50` | `"valor" >= $1` |
| `lt` | `?vencimento=lt.2026-12-31` | `"vencimento" < $1` |
| `lte` | `?valor=lte.500` | `"valor" <= $1` |
| `like` | `?nome=like.*silva*` | `LIKE '%silva%'` |
| `ilike` | `?nome=ilike.*silva*` | `ILIKE '%silva%'` (sem caixa) |
| `in` | `?status=in.(ABERTA,VENCIDA)` | `IN (...)` |
| `is` | `?pago_em=is.null` | `IS NULL` |
| `not` | `?status=not.eq.CANCELADA` | `NOT (...)` |

Observações:

- `like`/`ilike` usam `*` como curinga (também aceitam `%`) e só funcionam em colunas de texto.
- `is` aceita `null`, `true` e `false`.
- `in` aceita valores entre aspas quando contêm vírgula: `in.("A,B",C)`.
- O **tipo do valor é validado** conforme a coluna (`uuid`, inteiro, numérico,
  booleano, data/hora, JSON). Valor inválido responde `400`.
- Valores são sempre enviados como parâmetros SQL; **nunca** concatenados.
  Tentativas de injeção viram valor literal (ou erro de validação).

### Filtrar por valor nulo

```http
GET /admin/api/public/faturas?pago_em=is.null
```

### Combinar com OR

```http
GET /admin/api/public/faturas?or=(status.eq.ABERTA,valor.gt.1000)
```

Regras dentro de `or`: `coluna.operador.valor`, separados por vírgula. Um `or`
combina com os demais filtros usando AND:

```
(status = 'ABERTA' OR valor > 1000) AND vencimento < '2026-12-31'
```

---

## 3. Selecionar colunas

```http
GET /admin/api/public/faturas?select=id,valor,vencimento,status
```

- Colunas inexistentes → `400 Coluna desconhecida`.
- Colunas internas (`password_hash`, `token_version`, tokens) **nunca** são
  selecionáveis nem filtráveis.

---

## 4. Ordenação

```http
GET /admin/api/public/faturas?order=vencimento.asc,created_at.desc
```

- Direções: `asc` (padrão) e `desc`.
- Sem `order`, a ordem é `id DESC` (comportamento anterior preservado).
- Colunas inexistentes ou direção inválida → `400`.

---

## 5. Paginação

### Offset (compatível)

```http
GET /admin/api/public/faturas?limit=100&offset=200
```

- `limit` padrão: **50**.
- `limit` máximo: **1000** (configurável por `API_MAX_LIMIT`).
- `offset` negativo é tratado como `0`.

### Cursor (keyset, para tabelas grandes)

Indicado quando `offset` alto fica lento. Exige `order` estável (idealmente com
uma coluna única no final, como `id`):

```http
GET /admin/api/public/faturas?order=created_at.desc,id.desc&limit=100&cursor=W...
```

A resposta traz `next_cursor`; envie-o na próxima chamada junto com o **mesmo**
`order`. Quando não há mais páginas, `next_cursor` é `null`.

Limitações do cursor: se a coluna de ordenação tiver valor nulo na última linha,
o cursor não é gerado (use offset nesse caso).

### Contagem de registros

Por padrão `total` é calculado (`count(*)`). Para evitar essa consulta:

```http
GET /admin/api/public/faturas?limit=100
Prefer: count=none
```

Nesse caso `total` vem `null` e a resposta fica mais rápida.

---

## 6. Busca textual (compatível)

```http
GET /admin/api/public/faturas?search=silva
```

Busca `ILIKE '%silva%'` em todas as colunas visíveis — mesmo comportamento da 0.2.0.

---

## 7. Buscar por ID

```http
GET /admin/api/public/faturas/<uuid>
```

Resposta: `{ "data": { ... } }` ou `404`.

---

## 8. Escrita

Métodos e formatos permanecem iguais aos da 0.2.0:

| Método | Rota | Resposta |
|---|---|---|
| `POST` | `/public/:table` | `201`/`200` `{ data }` |
| `PATCH` | `/public/:table/:id` | `{ data }` |
| `DELETE` | `/public/:table/:id` | `{ ok: true }` |

Campos `id`, `created_at` e `creator` são imutáveis; `slug` é gerado
automaticamente quando a tabela tem a coluna.

---

## 9. Erros

| Situação | HTTP | Corpo |
|---|---|---|
| Sem token / token inválido | 401 | `{ "error": "API token inválido ou ausente" }` |
| Data API desabilitada | 403 | `{ "error": "Data API desabilitada" }` |
| Tabela não exposta | 403 | `{ "error": "Tabela não exposta na API" }` |
| Tabela inexistente | 404 | `{ "error": "Tabela não encontrada" }` |
| Filtro/coluna/valor inválido | 400 | `{ "error": "…" }` |

---

## 10. RLS e isolamento

Cada consulta executa com `SET LOCAL ROLE authenticated` e o contexto do token
(`app.current_user_id` / `app.current_tenant_id`). As regras RLS do projeto são
aplicadas pelo PostgreSQL — filtros adicionais **não** contornam RLS.

O token de API pertence a **um** projeto; não existe acesso cruzado entre schemas.
