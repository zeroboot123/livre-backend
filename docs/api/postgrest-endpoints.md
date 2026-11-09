# API REST (PostgREST)

## Base URL

```
https://api.livrebackend.com.br/api/rest
```

## Autenticação

Todas as requisições devem incluir o header:

```
Authorization: Bearer <access_token>
```

## Operações

### GET - Listar registros

```http
GET /api/rest/tabela
GET /api/rest/tabela?select=id,nome,email
GET /api/rest/tabela?nome=eq.João
GET /api/rest/tabela?order=created_at.desc
GET /api/rest/tabela?limit=10&offset=0
```

### GET - Registro por ID

```http
GET /api/rest/tabela?id=eq.uuid
```

### POST - Criar registro

```http
POST /api/rest/tabela
Content-Type: application/json

{
  "nome": "João",
  "email": "joao@email.com"
}
```

### PATCH - Atualizar registro

```http
PATCH /api/rest/tabela?id=eq.uuid
Content-Type: application/json

{
  "nome": "João Atualizado"
}
```

### DELETE - Excluir registro

```http
DELETE /api/rest/tabela?id=eq.uuid
```

## Filtros

| Operador | Exemplo |
|---|---|
| eq (igual) | `?campo=eq.valor` |
| neq (diferente) | `?campo=neq.valor` |
| gt (maior que) | `?campo=gt.valor` |
| lt (menor que) | `?campo=lt.valor` |
| gte (maior igual) | `?campo=gte.valor` |
| lte (menor igual) | `?campo=lte.valor` |
| like (contém) | `?campo=like.*valor*` |
| in (em lista) | `?campo=in.(a,b,c)` |
| is (nulo) | `?campo=is.null` |

## Documentação Automática

Acesse `/api/rest/` para visualizar a documentação OpenAPI gerada automaticamente.
