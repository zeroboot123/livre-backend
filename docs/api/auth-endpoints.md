# 🔐 API de Autenticação

Documentação completa da API de autenticação do **Livre Backend** — endpoints
públicos do auth-service (`/auth/*`) e rotas administrativas de usuários e
sessões (`/auth/admin/*`).

Base: prefixo **`/auth`** no auth-service.

---

## Sumário

- [Base URLs](#base-urls)
- [Conceitos e tokens](#conceitos-e-tokens)
- [Fluxo de autenticação](#fluxo-de-autenticação)
- [Endpoints](#endpoints)
- [Segurança](#segurança)
- [Erros](#erros)
- [Exemplos práticos](#exemplos-práticos)

---

## Base URLs

| Ambiente | Auth Service | Admin / Painel |
|---|---|---|
| **Produção** (EasyPanel + Traefik) | `https://<dominio>/auth` | `https://<dominio>/admin` |
| **Local** (docker compose) | `http://localhost:3001/auth` | `http://localhost:3003` |

Exemplos de URLs em produção (com domínio `livrebackend.gerbox.com.br`):

| Endpoint | URL |
|---|---|
| Health check | `https://livrebackend.gerbox.com.br/auth/health` |
| Login | `https://livrebackend.gerbox.com.br/auth/login` |
| Recuperação de senha | `https://livrebackend.gerbox.com.br/auth/forgot-password` |
| Usuários (admin) | `https://livrebackend.gerbox.com.br/auth/admin/users` |

---

## Conceitos e tokens

### Access Token (JWT)

- **Header:** `Authorization: Bearer <access_token>`
- **Validade padrão:** `JWT_EXPIRATION` → **15 minutos**
- **Payload:** `sub` (user id), `email` e `role`
- Expirado/inválido → `401 { "error": "Token inválido ou expirado" }`

### Refresh Token

- **Endpoint:** `POST /auth/refresh` com body `{ "refresh_token": "..." }`
- **Validade padrão:** `JWT_REFRESH_EXPIRATION` → **7 dias**
- **Rotacionamento:** o refresh token antigo é revogado ao emitir um novo par
  (evita reuso; race condition protegida com transação `FOR UPDATE`)
- Armazenado no banco **com hash** (nunca em texto puro) em `libre_auth.sessions`
- Expirado/revogado → `POST /auth/refresh` responde erro e a sessão é invalidada

### Logout

- `POST /auth/logout` com body `{ "refresh_token": "..." }`
- Marca a sessão como revogada (`revoked = TRUE`)

### Reset Token (recuperação de senha)

- Gera-se no `POST /auth/forgot-password` e armazena-se em
  `libre_auth.password_resets` com **expiração de 1 hora**
- **Single-use:** após o reset, o token é marcado como usado
- Válido/inválido → `POST /auth/reset-password` responde erro

---

## Fluxo de autenticação

### 1. Primeira instalação (setup)

```
GET  /auth/setup/status   → { "needsSetup": true }
POST /auth/register        → cria o primeiro admin (role: "admin")
POST /auth/login           → emite tokens
```

Enquanto `needsSetup` for `true`, o cadastro público só permite o **primeiro
administrador**. Depois disso, novos usuários são criados pelo painel
(`POST /auth/admin/users` é feito via admin-api; o auth expõe criação via
`POST /auth/users` com admin).

### 2. Login

```
POST /auth/login  { "email": "...", "password": "..." }
→ { access_token, refresh_token, expires_in, token_type, user }
```

### 3. Requisições autenticadas

```
GET /auth/me
Authorization: Bearer <access_token>
```

### 4. Renovação

```
POST /auth/refresh  { "refresh_token": "..." }
→ novo access_token + refresh_token
```

### 5. Logout

```
POST /auth/logout  { "refresh_token": "..." }
```

### 6. Recuperação de senha

```
POST /auth/forgot-password  { "email": "..." }
→ gera token (1h) + envia e-mail com link /admin/reset-password?token=...

POST /auth/reset-password  { "token": "...", "password": "nova_senha" }
→ valida token, atualiza senha, revoga sessões
```

---

## Endpoints

### Health

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/auth/health` | ❌ | Health check do serviço |

### Setup

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/auth/setup/status` | ❌ | Indica se ainda precisa criar o primeiro admin (`{ "needsSetup": true }`) |
| `POST` | `/auth/register` | ❌ | Cria o **primeiro** admin da instalação (só funciona com `needsSetup = true`) |

**Corpo de `POST /auth/register`:**
```json
{ "email": "admin@email.com", "password": "senha_minimo_8", "name": "Admin" }
```

Resposta: `201 { "user": { … }, "message": "Administrador criado com sucesso." }`
ou `403` com `"Cadastro público desativado. Crie novos usuários pelo painel."`

### Autenticação

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | ❌ | Autentica e emite par de tokens |
| `POST` | `/auth/refresh` | ❌ | Renova tokens (rotação) |
| `POST` | `/auth/logout` | ❌ | Revoga refresh token |
| `GET` | `/auth/me` | ✅ | Dados do usuário autenticado |

**`POST /auth/login`** — corpo:
```json
{ "email": "usuario@email.com", "password": "senha123" }
```

Resposta `200`:
```json
{
  "access_token": "eyJ…",
  "refresh_token": "abc123…",
  "expires_in": 900,
  "token_type": "Bearer",
  "user": { "id": "…", "email": "…", "name": "…", "role": "admin" }
}
```

Erros comuns: credenciais inválidas (`"Credenciais inválidas"`),
usuário desativado (`"Usuário desativado"`) ou bloqueado (`"Usuário bloqueado"`).

**`POST /auth/refresh`** — corpo: `{ "refresh_token": "abc123…" }`.

**`GET /auth/me`** — requer `Authorization: Bearer <access_token>`.

### Troca de senha (usuário autenticado)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/auth/change-password` | ✅ | Altera a própria senha (exige senha atual) |

**Corpo:**
```json
{ "current_password": "senha_atual", "new_password": "nova_senha_minimo_8" }
```

Ao alterar a senha, **todas as sessões do usuário são revogadas**.

### Recuperação de senha

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/auth/forgot-password` | ❌ | Solicita o e-mail de recuperação |
| `POST` | `/auth/reset-password` | ❌ | Redefine a senha com o token |

**`POST /auth/forgot-password`** — corpo: `{ "email": "usuario@email.com" }`
Resposta (sempre, para não vazar existência):
```json
{ "message": "Se o email existir, um link de recuperação será enviado" }
```

**`POST /auth/reset-password`** — corpo:
```json
{ "token": "token_recebido", "password": "nova_senha_minimo_8" }
```
Resposta: `{ "message": "Senha redefinida com sucesso" }`
Erros: `"Token de recuperação inválido ou expirado"`.

### Rotas administrativas

Todas exigem access token **com role `admin`** (`adminMiddleware`):
`Authorization: Bearer <access_token>` + claim `role = "admin"`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/auth/admin/users` | Lista usuários (até 100, ordenados por criação desc) |
| `GET` | `/auth/admin/users/:id` | Detalhe do usuário |
| `PATCH` | `/auth/admin/users/:id/block` | Bloquear (`{ "reason": "…" }` opcional) |
| `PATCH` | `/auth/admin/users/:id/unblock` | Desbloquear (revoga sessões) |
| `PATCH` | `/auth/admin/users/:id/deactivate` | Desativar (revoga sessões) |
| `PATCH` | `/auth/admin/users/:id/activate` | Ativar |
| `GET` | `/auth/admin/sessions` | Lista sessões ativas |
| `DELETE` | `/auth/admin/sessions/:id` | Revogar sessão |

Erros administrativos: `403 { "error": "Acesso não autorizado" }` (sem role
admin) e `404 { "error": "Usuário não encontrado" }`.

---

## Segurança

- **Hash de senha:** Argon2id (`timeCost` 2, `memoryCost` 19456) no auth-service;
  scrypt no admin-api.
- **JWT:** assinado (HS256) com issuer verificado; access token em `Bearer`.
- **Refresh token:** rotacionado a cada uso; hash no banco; sessões com
  `expires_at`.
- **Reset de senha:** token de 1h, single-use; ao redefinir, revoga **todas** as
  sessões do usuário.
- **Bloqueio/desativação:** revoga sessões do usuário.
- **Rate limit:** `@fastify/rate-limit` no auth-service — **60 requisições/min**
  por IP → excesso responde `429`.

---

## Erros

| Código | Significado | Exemplo de corpo |
|---|---|---|
| `400` | Payload inválido / validação Zod / token de reset inválido ou expirado | `{ "error": "Senha deve ter no mínimo 8 caracteres" }` |
| `401` | Token ausente, inválido ou expirado | `{ "error": "Token não fornecido" }` / `{ "error": "Token inválido ou expirado" }` |
| `403` | Sem permissão (admin exigido sem role admin) | `{ "error": "Acesso não autorizado" }` |
| `404` | Recurso não encontrado | `{ "error": "Usuário não encontrado" }` |
| `429` | Rate limit excedido (60 req/min) | — |
| `500` | Erro interno | `{ "error": "…" }` |

---

## Exemplos práticos

### Login

```bash
curl -X POST https://livrebackend.gerbox.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@email.com", "password": "senha123"}'
```

### Renovação

```bash
curl -X POST https://livrebackend.gerbox.com.br/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "abc123"}'
```

### Esqueci minha senha

```bash
curl -X POST https://livrebackend.gerbox.com.br/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@email.com"}'
```

### Redefini minha senha

```bash
curl -X POST https://livrebackend.gerbox.com.br/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123", "password": "nova_senha_minimo_8"}'
```

### Alterar senha (logado)

```bash
curl -X POST https://livrebackend.gerbox.com.br/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"current_password": "senha_atual", "new_password": "nova_senha_minimo_8"}'
```

### Listar usuários (admin)

```bash
curl -X GET https://livrebackend.gerbox.com.br/auth/admin/users \
  -H "Authorization: Bearer <admin_access_token>"
```
