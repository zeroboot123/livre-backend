# EasyPanel + GHCR — Instalação e operação

Este documento descreve o fluxo de produção do Livre Backend:
**GitHub → GitHub Actions → GHCR → EasyPanel → containers**.

O EasyPanel é a fonte operacional de implantação: ele baixa as imagens
publicadas e recria os containers. A VPS **não compila** código.

---

## 1. Pré-requisitos

- VPS Linux com Docker e EasyPanel instalados.
- Repositório no GitHub (`zeroboot123/livre_backend`).
- Acesso ao GHCR com um PAT (token) de leitura de pacotes.
- Domínio apontando para a VPS (ex.: `livrebackend.gerbox.com.br`).

---

## 2. Imagens publicadas

| Serviço | Imagem |
|---|---|
| auth-service | `ghcr.io/zeroboot123/livre-auth-service` |
| admin-api | `ghcr.io/zeroboot123/livre-admin-api` |
| visual-db | `ghcr.io/zeroboot123/livre-visual-db` |
| admin-panel | `ghcr.io/zeroboot123/livre-admin-panel` |
| worker (futuro) | `ghcr.io/zeroboot123/livre-worker` |

**Tags:** `X.Y.Z` (imutável), `X.Y`, `sha-<commit>` e `latest` (somente em
release). Em produção use sempre `X.Y.Z` via `APP_VERSION`.

As imagens são **privadas**. O GitHub Actions publica com `GITHUB_TOKEN`;
nenhum token é gravado no repositório.

---

## 3. Autenticação do EasyPanel no GHCR

O host precisa conseguir baixar imagens privadas. Crie um PAT do GitHub com
permissão **`read:packages`** (escopo mínimo, sem acesso ao código).

No servidor, como root:

```bash
# não use histórico do shell para o token; leia de um arquivo protegido
install -m 600 /dev/null /root/.ghcr-token
# edite /root/.ghcr-token e cole apenas o token

cat /root/.ghcr-token | docker login ghcr.io -u SEU_USUARIO --password-stdin
chmod 600 /root/.docker/config.json
```

Valide:

```bash
docker pull ghcr.io/zeroboot123/livre-admin-api:0.8.0
```

> Se a versão do EasyPanel oferecer credenciais de registry na interface,
> use a mesma credencial (usuário + PAT). O resultado é equivalente.

**Nunca** versionar o token. O arquivo `/root/.docker/config.json` contém a
credencial e deve permanecer `600`.

---

## 4. Criar o projeto no EasyPanel

Arquitetura: o GitHub Actions constrói e publica as imagens; o EasyPanel
**apenas baixa e executa** essas imagens. Não é necessário (nem desejado)
configurar uma segunda integração Git nem gerar outra chave SSH.

1. **Projeto:** `livre-backend`.
2. **Serviço:** tipo **Compose**, nome `livre-backend`.
3. **Fonte:** **conteúdo inline** (editor de Compose do EasyPanel) — cole o
   `docker-compose.easypanel.yml` deste repositório. A fonte Git existente no
   EasyPanel continua sendo a única e não é usada por este serviço.
4. **Ambiente:** configure as variáveis da seção 5 e mantenha
   **“Criar arquivo .env”** habilitado.

> O compose não usa `build:` e não referencia nenhum arquivo do repositório na
> VPS (sem `build.context`, sem bind mount de `init.sql`). Ele funciona apenas
> com imagens publicadas no GHCR e com volumes nomeados.

### Instalação nova (banco vazio)

O `docker/postgres/init.sql` **não** é montado pelo compose (para não exigir o
repositório na VPS). Em uma instalação do zero, aplique-o uma única vez:

```bash
docker exec -i <container_postgres> psql -U livre_admin -d livre_backend \
  < docker/postgres/init.sql
```

Em instalações já existentes isso é desnecessário — os dados estão no volume.

---

## 5. Variáveis de ambiente

Obrigatórias:

| Variável | Descrição |
|---|---|
| `APP_VERSION` | tag exata publicada (ex.: `0.8.0`) |
| `PUBLIC_URL` | URL pública (`https://...`, sem barra final) |
| `DB_SUPERPASS` | senha do usuário `livre_admin` |
| `JWT_SECRET` | chave longa e aleatória |
| `MINIO_ROOT_USER` | usuário do MinIO |
| `MINIO_ROOT_PASSWORD` | senha do MinIO |

Opcionais (valores padrão no compose): `DB_SUPERUSER`,
`MINIO_BUCKET`, `MAX_UPLOAD_MB`, `JWT_EXPIRATION`,
`JWT_REFRESH_EXPIRATION`, `ARGON2_TIME_COST`, `ARGON2_MEMORY_COST`,
`CORS_ORIGINS`, `PG_MEMORY_LIMIT`, `EMAIL_ENCRYPTION_KEY`.

> O compose do EasyPanel usa **`DB_SUPERUSER`/`DB_SUPERPASS`**
> (`livre_admin`) em todos os serviços, preservando os roles atuais.
> Os usuários `PG_AUTHUSER`/`PG_ADMINUSER` pertencem aos composes
> local/VPS e exigiriam migração de roles.

As URLs do painel (`NEXT_PUBLIC_*`) são lidas em **runtime** pelo container.
A mesma imagem serve qualquer domínio — basta definir `PUBLIC_URL` e
reimplantar.

---

## 6. Domínios (Traefik)

Todas as rotas apontam para o mesmo host, com prefixos diferentes:

| Caminho | Serviço interno | Porta |
|---|---|---|
| `/auth` | auth-service | 3001 |
| `/admin/api` | admin-api | 3002 |
| `/admin/visual-db` | visual-db | 3004 |
| `/admin` | admin-panel | 3003 |
| `/api/rest` | postgrest | 3000 |

**Ordem:** cadastre `/admin/api` e `/admin/visual-db` antes de `/admin`.

---

## 7. Volumes persistentes

| Volume | Conteúdo |
|---|---|
| `livre-backend_livre-backend_postgres_data` | banco PostgreSQL |
| `livre-backend_livre-backend_minio_data` | arquivos do MinIO |
| `livre-backend_livre-backend_backups` | destino de backups (`/backups`) |

Os nomes são **fixos** no compose para preservar os dados existentes ao
migrar. Não renomeie volumes nem use `docker compose down -v`.

---

## 8. Primeiro deploy

1. Configure GHCR, variáveis e domínios.
2. Clique em **Implantar**.
3. Acompanhe o log: o EasyPanel executa `docker compose up -d`.
4. Valide:

```bash
docker ps --filter name=livre-backend
curl -fsS https://SEU_DOMINIO/admin/api/health
curl -o /dev/null -s -w '%{http_code}\n' https://SEU_DOMINIO/admin/login   # 200
```

5. Faça login no painel e teste upload/download em **Arquivos**.

---

## 9. Atualização de versão

1. No repositório: atualize `VERSION`, `CHANGELOG.md` e os `package.json`
   (`./scripts/version.sh bump patch|minor|major`).
2. Commit e tag: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. O workflow **Release images** publica as 5 imagens.
4. No EasyPanel, altere `APP_VERSION` para `X.Y.Z` e clique em **Implantar**.
   (`pull_policy: always` garante o download da nova tag.)
5. Valide healthchecks e endpoints.

**Rollback:** basta voltar `APP_VERSION` para a versão anterior e reimplantar.
Os dados permanecem nos volumes.

---

## 10. Backup e restauração

O backup de produção é gerado no host por `scripts/backup-host.sh`
(`pg_dump -Fc` + roles + volume do MinIO + configurações), com checksum
SHA-256, retenção configurável (padrão 7 dias) e diretório protegido
(`umask 077`).

```bash
BACKUP_ROOT=/home/adminvps/livre-backend/backups ./scripts/backup-host.sh 7
```

Rotina automática já instalada na VPS (cron do usuário, diário às 03:15):

```cron
15 3 * * * BACKUP_ROOT=/home/adminvps/livre-backend/backups RETENTION_DAYS=7 /home/adminvps/bin/livre-backup.sh >> /home/adminvps/livre-backend/backups/cron.log 2>&1
```

> O volume `/backups` do `admin-api` existe e tem permissão de escrita, mas
> **o serviço ainda não gera backups** — a geração real é feita no host.

Validação:

```bash
pg_restore -l <dump>          # ou: docker exec <postgres> pg_restore -l /caminho
( cd <dir_do_backup> && sha256sum -c checksums.sha256 )
```

Restauração (sempre testar antes em banco isolado):

```bash
docker exec <postgres> createdb -U livre_admin livre_restore_test
docker cp <dump> <postgres>:/tmp/restore.dump
docker exec <postgres> pg_restore -U livre_admin -d livre_restore_test \
  --no-owner --no-privileges /tmp/restore.dump
# validar e remover o banco de teste
docker exec <postgres> dropdb -U livre_admin livre_restore_test
```

Para o banco de produção use `scripts/restore.sh` (confirma antes de aplicar e
usa `--clean --if-exists`). Detalhes em [`backup-restore.md`](backup-restore.md).

---

## 11. Automação pelo OpenCode

### 11.1 Deploy Trigger (webhook)

Cada serviço Compose possui uma URL em **Implantações → Gatilho de
Implantação**:

```bash
curl -fsS -X POST "http://PAINEL:3000/api/compose/deploy/<TOKEN>"
```

- Guarde o token em arquivo protegido na VPS (nunca no repositório).
- O endpoint dispara o mesmo deploy do botão.

### 11.2 API do EasyPanel

A API fica em `https://PAINEL/api` e usa `Authorization: Bearer <token>`.
Endpoints confirmados na instalação atual (2.38.0) via `GET /api/openapi.json`:

| Operação | Endpoint |
|---|---|
| Login | `POST /api/login` |
| Sessão | `GET /api/getSession` |
| Projetos/serviços | `GET /api/listProjectsAndServices` |
| Variáveis do projeto | `POST /api/updateProjectEnv` |
| Deploy do Compose | `POST /api/deployComposeService` |

Armazene o token em `/etc/easypanel-api.token` (root, `600`) ou em um
secret manager. O script de automação deve ler o arquivo, nunca o token
literal.

### 11.3 Fluxo completo

1. `git push` da `main` + tag `vX.Y.Z`.
2. Actions: testes → build → push no GHCR → validação do manifest.
3. OpenCode aguarda o workflow (API do GitHub ou `git` + verificação).
4. OpenCode atualiza `APP_VERSION` no painel (API) e dispara o deploy.
5. OpenCode aguarda os containers ficarem `healthy` e valida os endpoints.
6. Relatório final sem expor segredos.

---

## 12. Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `unauthorized` ao baixar imagem | GHCR sem login no host | refazer `docker login` com PAT `read:packages` |
| `additional privileges requested: fs.read=../home` | compose antigo com `build.context` absoluto | usar este compose (sem `build:`) |
| 502 no Traefik | container recriado sem aliases | reimplantar pelo EasyPanel |
| `relation ... does not exist` | banco vazio ou volume errado | conferir nome do volume e restaurar backup |
| Painel com URLs erradas | `PUBLIC_URL` incorreta | corrigir e reimplantar (runtime, sem rebuild) |
| `APP_VERSION is required` | variável ausente | definir a versão exata no Ambiente |

### Exposição da porta 3000

O painel do EasyPanel (`easypanel/easypanel`) publica `0.0.0.0:3000`
(HTTP) no host. O acesso administrativo deve ser restrito (firewall/IP
allowlist) ou publicado via Traefik com HTTPS. A porta não é usada pelos
serviços do Livre Backend — o `postgrest` só é acessível na rede interna
(`postgrest:3000`). Alterar isso exige janela de manutenção e autorização.

---

## 13. Worker (futuro)

O `worker` consome a fila de tarefas no PostgreSQL
(`FOR UPDATE SKIP LOCKED`) e não expõe porta. Ele **não** faz parte do
deploy atual do EasyPanel. A imagem é publicada para permitir a inclusão
futura como serviço no compose, com `DATABASE_URL` apontando para
`postgres:5432`.
