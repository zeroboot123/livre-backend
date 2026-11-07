# Integração Bubble

## Configuração no Bubble

### 1. Plugin API Connector

Adicione o plugin **API Connector** no Bubble.

### 2. Configurar Chamadas

#### Autenticação (Login)

```
POST https://api.livrebackend.com.br/auth/login

Headers:
  Content-Type: application/json

Body:
  email: usuário@email.com
  password: senha123

Initial call: No
```

**Mapear resposta:**
- `access_token` → Text
- `refresh_token` → Text
- `user.id` → Text
- `user.name` → Text
- `user.email` → Text

#### Consultar Dados

```
GET https://api.livrebackend.com.br/api/rest/tabela

Headers:
  Authorization: Bearer <<Result of previous step's access_token>>
  Content-Type: application/json

Initial call: No
```

#### Criar Registro

```
POST https://api.livrebackend.com.br/api/rest/tabela

Headers:
  Authorization: Bearer <<access_token>>
  Content-Type: application/json

Body:
  nome: João
  email: joao@email.com
```

### 3. Armazenar Token

Crie um **Custom State** no elemento principal:
- `currentToken` (text) — guardar o access_token
- `currentUser` (text) — guardar o user.id

### 4. Workflow de Login

1. Chamar API Connector → Login
2. Estado Custom → Definir `currentToken` = resultado `access_token`
3. Navegar para página principal
