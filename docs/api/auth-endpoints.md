# Endpoints de Autenticação

## Base URL

```
https://api.livrebackend.com.br/auth
```

## Endpoints

### POST /auth/register
Registrar novo usuário.

```json
{
  "email": "usuario@email.com",
  "password": "senha123",
  "name": "Nome do Usuário"
}
```

**Resposta (201):**
```json
{
  "user": {
    "id": "uuid",
    "email": "usuario@email.com",
    "name": "Nome do Usuário",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "message": "Usuário registrado com sucesso."
}
```

### POST /auth/login
Autenticar usuário.

```json
{
  "email": "usuario@email.com",
  "password": "senha123"
}
```

**Resposta (200):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "abc123...",
  "expires_in": 900,
  "token_type": "Bearer",
  "user": {
    "id": "uuid",
    "email": "usuario@email.com",
    "name": "Nome do Usuário"
  }
}
```

### POST /auth/refresh
Renovar access token usando refresh token.

```json
{
  "refresh_token": "abc123..."
}
```

### POST /auth/logout
Revogar refresh token.

```json
{
  "refresh_token": "abc123..."
}
```

### POST /auth/forgot-password
Solicitar recuperação de senha.

```json
{
  "email": "usuario@email.com"
}
```

### POST /auth/reset-password
Redefinir senha com token.

```json
{
  "token": "token_recebido",
  "password": "nova_senha123"
}
```

### GET /auth/me
Obter dados do usuário autenticado.

**Headers:** `Authorization: Bearer <access_token>`
