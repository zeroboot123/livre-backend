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
