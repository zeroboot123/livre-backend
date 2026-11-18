# Changelog

Todas as alterações relevantes do Livre Backend são registradas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

Enquanto o projeto estiver na série `0.x`, mudanças incompatíveis podem ocorrer
em versões MINOR. A partir de `1.0.0`, mudanças incompatíveis exigem MAJOR.

## [Não lançado]

### Planejado
- Chave de criptografia dedicada (`EMAIL_ENCRYPTION_KEY`) nos containers.
- Formato de criptografia versionado com identificador de chave (`enc:v2`).
- Rotação de chaves sem perda de credenciais.
- Execução do worker no deploy do EasyPanel.
- Endurecimento da exposição da porta 3000 do EasyPanel.

## [0.9.1] - 2026-11-18

### Resolvido
- Workflow `release-images.yml` inválido: `env.PUBLIC_URL` era usado dentro de
  `strategy.matrix` (contexto não permitido), impedindo qualquer execução.
  Os build args do painel foram removidos — as URLs são resolvidas em runtime.

## [0.9.0] - 2026-11-18

### Adicionado
- Publicação de imagens Docker no GHCR via GitHub Actions
  (`.github/workflows/release-images.yml`), com tags semver e `latest` apenas
  em releases.
- `docker-compose.easypanel.yml` baseado em imagens (`APP_VERSION`), sem build
  na VPS, com nomes de volumes fixos e volume persistente de backups.
- Configuração pública do painel em **runtime** (`window.__LIVRE_ENV__`),
  permitindo reutilizar a mesma imagem em qualquer domínio.
- Documentação `docs/easypanel-ghcr.md` e seções de instalação/publicação no
  README.
- `.env.example` completo, com variáveis obrigatórias e opcionais.
- `scripts/backup-host.sh`: backup de produção no host (dump do PostgreSQL,
  roles, volume do MinIO, configurações e metadados Docker) com checksum,
  retenção configurável e rotina diária via cron.

### Alterado
- Imagens base fixadas (`node:22.23.5-alpine`, `postgres:16.15-alpine`,
  `postgrest:v16.5`) e MinIO fixado por digest.
- `admin-api` preparado com `/backups` (dono do usuário da aplicação).

## [0.8.0] - 2026-11-17

### Adicionado
- Documentação de deploy (`docs/deploy.md`): procedimento de deploy automático via SSH,
  regra sudoers restrita (`NOPASSWD`) e procedimento de recuperação em caso de falha.

### Resolvido
- Deploy na VPS validado com sucesso (build + recreate + healthcheck + verificação HTTP).

## [0.7.0] - 2026-11-17

### Adicionado
- **Backup**: `scripts/backup.sh` migrado para `pg_dump -Fc` (custom) com checksum
  SHA-256 e retenção configurável.
- **Restauração**: `scripts/restore.sh` usando `pg_restore` com `--clean --if-exists`.
- Documento de DR e recuperação: `docs/backup-restore.md`.

### Pendente
- Teste de restauração em ambiente isolado (banco `livre_backend_restore_test`).

## [0.6.0] - 2026-11-17

### Adicionado
- **Rate limit** no admin-api (`@fastify/rate-limit`, padrão 300 req/min por token/API key/IP via `RATE_LIMIT_MAX`), com `allowList` para o endpoint `/health`.

### Segurança
- **Escopos de token** na API pública: tokens podem receber `permissions` (`read`, `write`, `rpc`, `auth`) no endpoint `POST /admin/api/api-tokens`; as rotas públicas passam a exigir o escopo correspondente (`requireApiToken` com escopo). Tokens legados sem escopo mantêm acesso total (compatibilidade).
- **Auditoria**: gravação em `livre_auth.audit_log` nas operações de escrita da API pública (`insert`, `update`, `delete`, `rpc`).

### Corrigido
- **CORS** no admin-api e visual-db restrito via `CORS_ORIGINS` (lista de origens; `*` liberado por padrão).
- Revogação do grant `SELECT` em `livre_auth.users` para os roles `anon` e `authenticated`.

## [0.5.0] - 2026-11-17

### Adicionado
- **Worker de tarefas** (Fase 5): serviço dedicado em container separado que consome
  a fila `livre_auth.tasks` com `FOR UPDATE SKIP LOCKED`.
- **Tabela de tasks**: `livre_auth.tasks` com status, attempts, max_attempts,
  last_error, run_at, context de RLS por tarefa.
- **Endpoint de criação de task**: `POST /admin/api/tasks`.
- **Endpoint de listagem de tasks**: `GET /admin/api/tasks`.
- Backoff retry (quadrático) com `max_attempts`.

## [0.4.0] - 2026-11-17

### Adicionado
- **RPC** na API pública: `POST /admin/api/public/rpc/:funcao` executa funções
  PostgreSQL do schema do projeto com o contexto RLS do token.
- **Allowlist de RPC** por projeto (`livre_auth.project_rpc_allowed`) e tela no
  painel (Banco → API → RPC) para liberar/revogar funções.
- **Transação em lote**: `POST /admin/api/public/transaction` executa até 50
  operações (insert/update/delete/rpc) de forma atômica, com rollback total em
  caso de falha.
- Timeouts defensivos nas transações (`statement_timeout`, `lock_timeout` e
  `idle_in_transaction_session_timeout`).
- **Idempotência**: rotas de escrita públicas aceitam o header `Idempotency-Key`;
  respostas repetidas são devolvidas do cache (chave+corpo) e conflitos retornam
  `409`.
- **Lock otimista** no refresh token: `SELECT ... FOR UPDATE` dentro de transação
  única (rotação de refresh token concorrente resolvida).
- Documentação de RPC, transações e idempotência em `docs/api/rpc-transactions.md`.
- Testes automatizados do módulo de RPC (15 casos), idempotência (4 casos) e
  consultas (32 casos) — **51 testes** na suíte.

### Segurança
- Funções `SECURITY DEFINER` são rejeitadas pela allowlist de RPC.
- A allowlist exige assinatura única `payload jsonb` e `EXECUTE` para o role
  `authenticated` (concedido no momento da liberação).
- Validação de catálogo executada com a conexão administrativa, antes de abrir
  a transação com RLS — falhas não iniciam transações.

## [0.3.0] - 2026-11-17

### Adicionado
- Filtros na API pública de dados: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`,
  `like`, `ilike`, `in`, `is`, `not` e agrupamento com `or=(...)`.
- Seleção de colunas (`select`) e ordenação múltipla (`order`) na API pública.
- Paginação por cursor (keyset) com `next_cursor`, além de `limit`/`offset`.
- `limit` padrão 50 e máximo configurável por `API_MAX_LIMIT` (padrão 1000).
- Header `Prefer: count=none` para omitir o `count(*)` e o campo `total`.
- Validação de valores por tipo real da coluna (UUID, inteiro, numérico,
  booleano, data/hora e JSON), sempre como parâmetros SQL.
- Testes automatizados do parser de consultas (`vitest`, 32 casos).
- Documentação da API avançada em `docs/api/public-api.md`.

### Segurança
- Colunas internas (senhas/tokens) não podem ser selecionadas nem filtradas.
- Toda consulta continua executando com RLS e no schema do próprio token.

## [0.2.0] - 2026-11-17

### Adicionado
- Página **Início** (`/admin/home`) com apresentação do projeto, autor e créditos.
- Opção **Início** (ícone de casa) no topo do menu principal, responsiva.
- Seção de apoio ao projeto com doação voluntária via PIX.
- Área PIX com chave fixa definida pelo autor, QR Code, botão de copiar e aviso de contribuição voluntária.
- Créditos de autoria no README, nos `package.json` e nos arquivos principais.

## [0.1.0] - 2026-11-17

Primeira versão versionada do projeto. Consolida o estado atual da plataforma
(os itens abaixo resumem o histórico anterior, que não possuía versionamento).

### Adicionado
- Plataforma BaaS com projetos isolados por schema no PostgreSQL.
- Autenticação JWT com Argon2id, refresh token rotation e revogação por `token_version`.
- Tabela `users` nativa em todo projeto.
- Relacionamentos entre tabelas, RLS (Row Level Security) e API pública por projeto.
- Painel administrativo (Next.js) com Visual Database Builder e File Manager.
- Importação e exportação de migrações SQL.
- Configuração de SMTP do painel e por projeto.
- Página de redefinição de senha (`/admin/reset-password`).
- Versão do sistema exibida no rodapé do painel e da tela de login.
- Documentação do contrato de email em `docs/api/email-settings.md`.

### Alterado
- `GET /admin/api/email-settings` e `/email-settings/project` deixaram de retornar
  `smtp_password`; agora retornam `smtp_password_configured` (booleano).
- `PUT` de configurações SMTP preserva a senha quando o campo vem ausente, vazio
  ou como máscara (`********` / `••••••••`).
- `scripts/deploy.sh` continua sendo o único caminho de deploy na VPS.

### Corrigido
- Envio de email de "Esqueceu a senha" (dependência `nodemailer` ausente na imagem
  do auth-service e tag de imagem incorreta no compose).
- Página de redefinição de senha que retornava 404.
- Erro `UNDEFINED_VALUE` em atualizações parciais de configurações de email.
- Problemas de rolagem nas áreas de dados do painel.

### Segurança
- Removida a exposição da senha SMTP nas respostas da API.
- Senha SMTP cifrada em repouso com AES-256-GCM (`EMAIL_ENCRYPTION_KEY`, com
  fallback para `JWT_SECRET`), usando IV aleatório e tag de autenticação.
- Backfill idempotente no startup do admin-api cifra credenciais legadas em texto puro.
- `auth-service` decifra a credencial apenas no momento do envio de email.
- Auditados os logs de admin-api e auth-service: nenhuma credencial é registrada.

<!--
Modelo para novas versões:

## [x.y.z] - AAAA-MM-DD
### Adicionado
### Alterado
### Corrigido
### Segurança
### Removido
-->
