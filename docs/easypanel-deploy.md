# EasyPanel com fonte Git — instalação e operação

Modelo de deploy do Livre Backend: **repositório GitHub → EasyPanel (Fonte Git)
→ `docker compose build` + `up` → containers**.

- Sem GHCR e sem GitHub Actions publicando imagens.
- As imagens dos serviços são construídas pelo próprio EasyPanel a partir dos
  Dockerfiles do repositório.
- Nenhum caminho absoluto (`/home/...`) no compose: todos os `build.context`
  são relativos ao arquivo do compose.

---

## 1. Arquivos relevantes

| Arquivo | Uso |
|---|---|
| `docker-compose.easypanel.yml` | compose usado pelo EasyPanel (build + execução) |
| `docker-compose.yml` | desenvolvimento local (não usar no EasyPanel) |
| `services/*/Dockerfile` | imagens dos serviços |
| `panel/Dockerfile` | painel Next.js (standalone) |
| `docker/postgres/init.sql` | inicialização de banco novo (volume vazio) |

---

## 2. Configuração da tela **Fonte** (EasyPanel)

No serviço Compose do projeto `livre-backend`:

| Campo | Valor |
|---|---|
| Provedor | **GitHub** (use a integração já existente) |
| Repositório | `zeroboot123/livre-backend` |
| Branch | `main` |
| Caminho do Compose | `docker-compose.easypanel.yml` |
| Conexão/Deploy key | a mesma já usada pelo EasyPanel (não criar outra) |

> Se o EasyPanel pedir o caminho relativo do arquivo de compose, informe
> exatamente `docker-compose.easypanel.yml` (raiz do repositório).

Depois de salvar a Fonte, o EasyPanel clona o repositório e executa o compose
a partir da raiz — por isso `./services/auth`, `./panel` e
`./docker/postgres/init.sql` funcionam.

---

## 3. Variáveis de ambiente (aba Ambiente)

Obrigatórias:

| Variável | Descrição |
|---|---|
| `PUBLIC_URL` | URL pública, sem barra final (`https://livrebackend.gerbox.com.br`) |
| `DB_SUPERPASS` | senha do usuário `livre_admin` |
| `JWT_SECRET` | chave longa e aleatória |
| `MINIO_ROOT_USER` | usuário do MinIO |
| `MINIO_ROOT_PASSWORD` | senha do MinIO |

Opcionais (padrões no compose): `DB_SUPERUSER` (`livre_admin`), `PG_MEMORY_LIMIT`,
`MINIO_BUCKET`, `MAX_UPLOAD_MB`, `JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`,
`ARGON2_TIME_COST`, `ARGON2_MEMORY_COST`, `CORS_ORIGINS`,
`EMAIL_ENCRYPTION_KEY`.

> Mantenha **“Criar arquivo .env”** habilitado: o compose lê as variáveis
> `${...}` do ambiente do serviço.

As URLs do painel (`NEXT_PUBLIC_*`) são lidas em **runtime** pelo container
(`window.__LIVRE_ENV__`), então trocar `PUBLIC_URL` não exige rebuild.

---

## 4. Domínios (Traefik)

| Caminho público | Serviço | Porta interna |
|---|---|---|
| `/auth` | `auth-service` | 3001 |
| `/admin/api` | `admin-api` | 3002 |
| `/admin/visual-db` | `visual-db` | 3004 |
| `/admin` | `admin-panel` | 3003 |
| `/api/rest` | `postgrest` | 3000 |

Cadastre `/admin/api` e `/admin/visual-db` **antes** de `/admin` (prefixo mais
específico primeiro). Os aliases e o certificado são gerenciados pelo EasyPanel;
não altere `container_name` no compose para não quebrar os alvos do Traefik.

---

## 5. Volumes

| Volume | Conteúdo |
|---|---|
| `livre-backend_livre-backend_postgres_data` | banco PostgreSQL |
| `livre-backend_livre-backend_minio_data` | arquivos do MinIO |
| `livre-backend_livre-backend_backups` | `/backups` do admin-api |

Os nomes são fixos no compose (`volumes.<nome>.name`) para preservar os dados
existentes. Nunca use `docker compose down -v`.

---

## 6. Primeiro deploy

1. Preencha **Fonte** (seção 2) e **Ambiente** (seção 3).
2. Clique em **Implantar** e acompanhe o log: o EasyPanel executa
   `docker compose build` e `docker compose up -d`.
3. Valide:

```bash
docker ps --filter name=livre-backend
curl -fsS https://SEU_DOMINIO/admin/api/health
curl -o /dev/null -s -w '%{http_code}\n' https://SEU_DOMINIO/admin/login   # 200
```

4. Faça login no painel e teste upload/download em **Arquivos**.

### Instalação nova (volume de banco vazio)

O `docker/postgres/init.sql` é executado automaticamente pelo Postgres. Em
bancos já existentes ele não roda de novo (os dados do volume prevalecem).

---

## 7. Atualização

1. `git push` na `main`.
2. No EasyPanel, clique em **Implantar** (ou use o gatilho de implantação).
3. O EasyPanel puxa o commit, reconstrói apenas o que mudou e recria os
   containers com healthcheck.

**Rollback:** em *Implantações*, reimplante o deploy anterior, ou faça
`git revert` do commit e implante novamente. Os volumes de dados não são
afetados.

---

## 8. Logs

```bash
docker logs -f --tail 200 livre-backend_livre-backend-admin-api-1
docker logs --tail 200 livre-backend_livre-backend-postgrest-1
```

Ou pelo EasyPanel: serviço → **Logs**. O build fica em **Implantações**.

---

## 9. Backup e restauração

Backup de produção no host (dump do PostgreSQL, roles, volume do MinIO,
configurações e metadados Docker):

```bash
BACKUP_ROOT=/home/adminvps/livre-backend/backups ./scripts/backup-host.sh 7
```

Rotina automática diária já instalada (cron 03:15) e restauração testada em
banco isolado. Detalhes e checklist em [`backup-restore.md`](backup-restore.md).

---

## 10. Diagnóstico de falhas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `additional privileges requested: fs.read=...` | `build.context` absoluto no compose | usar `docker-compose.easypanel.yml` (contextos relativos) |
| build falha em `npm ci` | `package-lock.json` ausente/desatualizado | o Dockerfile usa `npm install`; confira o log do passo |
| `relation ... does not exist` | banco vazio ou volume errado | conferir nome do volume e restaurar backup |
| 502 no Traefik | container recriado sem aliases | reimplantar pelo EasyPanel |
| Painel com URLs erradas | `PUBLIC_URL` incorreta | corrigir e reimplantar (runtime, sem rebuild) |
| `DB_SUPERPASS is required` | variável ausente no Ambiente | preencher e reimplantar |
| Deploy antigo preso | imagem em cache | reimplantar com “sem cache” (se disponível) |

### Exposição da porta 3000

O painel do EasyPanel publica `0.0.0.0:3000` (HTTP). Restrinja por firewall/IP
ou publique via Traefik com HTTPS. Nenhum serviço do Livre Backend depende
dessa porta — o `postgrest` só é acessível na rede interna.

---

## 11. Worker (futuro)

O `worker` consome a fila de tarefas no PostgreSQL e não expõe porta. Ele não
faz parte do deploy atual; para ativá-lo, adicione ao compose:

```yaml
  worker:
    build:
      context: ./services/worker
      dockerfile: Dockerfile
    restart: unless-stopped
    networks:
      - easypanel
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${DB_SUPERUSER:-livre_admin}:${DB_SUPERPASS}@postgres:5432/livre_backend
      WORKER_POLL_INTERVAL_MS: ${WORKER_POLL_INTERVAL_MS:-5000}
    deploy:
      resources:
        limits:
          memory: 128M
```
