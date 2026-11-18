# 🚀 Livre Backend

Plataforma **Backend as a Service (BaaS)** — própria, modular, leve e segura.

<img width="1355" height="626" alt="livre-backend" src="https://github.com/user-attachments/assets/acecbc01-ff72-4481-9694-99a90a774f56" />





## 📌 Versão e status

| | |
|---|---|
| **Versão atual** | [`0.9.0`](VERSION) |
| **Situação** | 🚧 Em desenvolvimento (série `0.x`) |
| **Autor** | Anderson — [zeroboot.com.br](https://zeroboot.com.br) |
| **Changelog** | [CHANGELOG.md](CHANGELOG.md) |

A série `0.x` é de desenvolvimento: a API pode mudar de forma incompatível em
versões MINOR. `1.0.0` só será lançada quando o contrato estiver estável.

## 📋 Visão Geral

O Livre Backend é uma plataforma BaaS que oferece funcionalidades similares ao Supabase e Bubble.io, mas com arquitetura independente, utilizando PostgreSQL, PostgREST e Node.js.

### Funcionalidades

- ✅ **Projetos com schema dedicado** — cada projeto tem seu próprio banco de dados
- ✅ **Autenticação JWT** com Argon2id e refresh token rotation
- ✅ **Tabela User nativa** em todo projeto
- ✅ **Relacionamentos entre tabelas** como no Bubble.io
- ✅ **Painel Administrativo** web moderno e responsivo
- ✅ **Visual Database Builder** — editor visual de banco de dados
- ✅ **File Manager** com upload, download e links públicos
- ✅ **API Pública** por projeto com tokens de acesso, filtros, ordenação, seleção de colunas e paginação (offset e cursor)
- ✅ **RLS (Row Level Security)** — regras de privacidade por linha
- ✅ **Backup e Restauração** automatizados
- ✅ **Docker Compose** — deploy simplificado

## 🏗️ Arquitetura

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Auth    │  │PostgREST│  │  Admin   │  │  Visual  │
│  Service │  │  REST   │  │  API     │  │  DB      │
│  :3001   │  │ :3000   │  │ :3002    │  │ :3004    │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     └──────────────┴──────────────┴──────────────┘
                        │
                   ┌────▼─────┐
                   │PostgreSQL│
                   │  :5432   │
                   └──────────┘

┌──────────┐  ┌──────────┐
│  MinIO   │  │  Admin   │
│ Storage  │  │  Panel   │
│  :9000   │  │  :3003   │
└──────────┘  └──────────┘
```

---

## 🚀 Instalação no EasyPanel (passo a passo)

### Pré-requisitos

- Uma VPS com **EasyPanel** instalado
- Um **domínio** apontado para o IP da VPS (ex.: `meuapp.com.br`)
- Acesso SSH à VPS ou terminal do EasyPanel

### 1. Criar o projeto no EasyPanel

1. Acesse o painel do EasyPanel
2. Clique em **"Create Project"**
3. Dê um nome ao projeto (ex.: `livre-backend`)
4. Escolha **"Docker Compose"** como tipo

### 2. Fazer upload do código

Via SSH na VPS:

```bash
# Acesse a pasta de projetos do EasyPanel
cd /etc/easypanel/projects/seu-projeto/code

# Clone o repositório
git clone https://github.com/seu-usuario/livre-backend.git .
# ou faça upload manual dos arquivos

# Configure as variáveis de ambiente
cp .env.example .env
nano .env   # Preencha as variáveis (veja abaixo)
```

### 3. Variáveis de ambiente

No EasyPanel, vá em **"Environment"** do seu projeto e adicione:

| Variável | Obrigatória | Descrição | Exemplo |
|---|---|---|---|
| `PUBLIC_URL` | ✅ | URL pública do seu domínio | `https://meuapp.com.br` |
| `DB_SUPERPASS` | ✅ | Senha do PostgreSQL | `senha_forte_123` |
| `JWT_SECRET` | ✅ | Chave para assinar tokens JWT (mínimo 32 caracteres) | `openssl rand -hex 32` |
| `EMAIL_ENCRYPTION_KEY` | ❌ | Chave dedicada para cifrar a senha SMTP em repouso (AES-256-GCM). Se vazia, usa `JWT_SECRET`. Recomendado definir uma própria. | `openssl rand -hex 32` |
| `MINIO_ROOT_USER` | ✅ | Usuário admin do MinIO (storage) | `minio_admin` |
| `MINIO_ROOT_PASSWORD` | ✅ | Senha do MinIO | `outra_senha_forte` |
| `MINIO_BUCKET` | ❌ | Nome do bucket (padrão: `livre-files`) | `meus-arquivos` |

**Como gerar senhas seguras:**
```bash
# Linux/Mac:
openssl rand -hex 32

# Windows PowerShell:
[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))
```

### 4. Configurar os Domínios / Rotas

No EasyPanel, vá em **"Domains"** do projeto. Você vai adicionar **5 rotas** — todas apontando para o **mesmo domínio**, cada uma com um **path prefix** diferente.

| # | Domínio | Path Prefix | Porta | Container | Função |
|---|---|---|---|---|---|
| 1 | `meuapp.com.br` | `/auth` | `3001` | `auth-service` | Login, cadastro, autenticação |
| 2 | `meuapp.com.br` | `/api/rest` | `3000` | `postgrest` | API REST automática |
| 3 | `meuapp.com.br` | `/admin` | `3003` | `admin-panel` | Painel web (Next.js) |
| 4 | `meuapp.com.br` | `/admin/api` | `3002` | `admin-api` | Backend do painel |
| 5 | `meuapp.com.br` | `/admin/visual-db` | `3004` | `visual-db` | Editor visual do banco |

> ⚠️ **Ordem importante:** O EasyPanel processa as rotas por ordem. Coloque `/admin/api` **antes** de `/admin`, e `/admin/visual-db` também antes de `/admin`, para que o Traefik encaminhe corretamente.

**Passo a passo na interface:**
1. Clique em **"Add Domain"**
2. Digite seu domínio (ex.: `meuapp.com.br`)
3. Em **"Path Prefix"**, digite `/auth`
4. Em **"Target Port"**, coloque `3001`
5. Repita para as outras 4 rotas, mudando path e porta conforme a tabela acima

### 5. Implantar

Na tela do projeto, clique em **"Deploy"**. O EasyPanel vai:

1. Construir as imagens Docker de cada serviço
2. Iniciar os containers
3. Configurar o Traefik automaticamente
4. Emitir certificado SSL (Let's Encrypt)

### 6. Primeiro acesso

1. Acesse `https://meuapp.com.br/admin`
2. Você verá a página inicial com **"Entrar"** e **"Criar administrador"**
3. Clique em **"Criar administrador"** e preencha nome, email e senha
4. Pronto! Faça login e comece a usar 🎉

---

## 🛠️ Manutenção / Deploy de atualizações

### Pelo EasyPanel

1. Faça as alterações no código
2. No projeto do EasyPanel, clique em **"Redeploy"**

### Pelo script (via SSH)

```bash
# Na VPS, dentro da pasta do projeto
sudo ./scripts/deploy.sh                 # build + deploy de todos os serviços
sudo ./scripts/deploy.sh admin-api       # apenas um serviço específico
sudo ./scripts/deploy.sh --status        # só verificar status
sudo ./scripts/deploy.sh --no-build      # recriar containers sem rebuildar
```

---

## 🐳 Desenvolvimento local

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/livre-backend.git
cd livre-backend

# Configure as variáveis
cp .env.example .env
# Edite o .env com suas configurações

# Inicie os serviços
docker compose up -d

# Verifique se tudo está rodando
docker compose ps
```

### Acessos locais

| Serviço | URL |
|---|---|
| Painel Admin | `http://localhost:3003` |
| Auth API | `http://localhost:3001/auth` |
| Admin API | `http://localhost:3002` |
| PostgREST | `http://localhost:3000` |
| Visual DB | `http://localhost:3004` |

---

## 🔌 API de dados (por projeto)

Cada projeto expõe as tabelas marcadas como públicas em
`GET/POST/PATCH/DELETE /admin/api/public/:table`, autenticado por
`X-API-Key` (ou `Authorization: Bearer`) com um token do projeto.

```bash
# listar com filtros, seleção e ordenação
curl -H "X-API-Key: lv_xxx" \
  "https://seu-dominio/admin/api/public/faturas?select=id,valor,status&status=eq.VENCIDA&valor=gte.100&order=vencimento.asc&limit=50"

# paginação por cursor (keyset) para tabelas grandes
curl -H "X-API-Key: lv_xxx" \
  "https://seu-dominio/admin/api/public/faturas?order=created_at.desc,id.desc&limit=100&cursor=<next_cursor>"

# desligar o count(*) quando o total não é necessário
curl -H "X-API-Key: lv_xxx" -H "Prefer: count=none" \
  "https://seu-dominio/admin/api/public/faturas?limit=100"
```

A resposta preserva o contrato `{ data, total, limit, offset }` e inclui
`next_cursor`. Operadores suportados: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`,
`like`, `ilike`, `in`, `is` e `not`, além de `or=(...)`. Os valores são sempre
parametrizados e validados pelo tipo da coluna; colunas internas nunca são
expostas. Detalhes em [`docs/api/public-api.md`](docs/api/public-api.md).

`limit` padrão 50 e máximo configurável por `API_MAX_LIMIT` (padrão 1000).
`total` é calculado por padrão; use `Prefer: count=none` para omiti-lo.

A rota `/api/rest` (PostgREST) continua disponível para compatibilidade, mas o
schema `public` não contém tabelas de projeto — os dados dos projetos ficam nos
schemas `proj_*`, servidos pela API acima.

### RPC e transações

```bash
# executar uma função do projeto liberada na allowlist
curl -X POST -H "X-API-Key: lv_xxx" -H "Content-Type: application/json" \
  -d '{"valor": 150}' \
  "https://seu-dominio/admin/api/public/rpc/criar_fatura"

# várias operações atômicas (tudo confirmado ou nada)
curl -X POST -H "X-API-Key: lv_xxx" -H "Content-Type: application/json" \
  -d '{"operations":[{"method":"insert","table":"faturas","data":{"valor":150}},{"method":"insert","table":"auditoria","data":{"evento":"fatura_criada"}}]}' \
  "https://seu-dominio/admin/api/public/transaction"
```

Funções RPC passam por uma **allowlist por projeto** (gerenciada em Banco → API),
precisam ser `SECURITY INVOKER` e receber um único argumento `payload jsonb`.
Detalhes em [`docs/api/rpc-transactions.md`](docs/api/rpc-transactions.md).

---

## 📦 Estrutura do Projeto

```
livre-backend/
├── docker/               # Configurações Docker
│   ├── postgres/         # Init SQL, pg_hba.conf
│   └── traefik/          # Config Traefik (EasyPanel)
├── services/             # Código dos serviços
│   ├── auth/             # Serviço de autenticação (Fastify)
│   ├── admin-api/        # API administrativa (Fastify)
│   └── visual-db/        # Visual Database Builder
├── panel/                # Painel administrativo (Next.js 15)
├── scripts/              # Scripts de deploy e bootstrap
├── docs/                 # Documentação
├── imagens-bubble/       # Referências de UI
├── docker-compose.yml    # Orquestração principal
├── docker-compose.easypanel.yml  # Deploy no EasyPanel
├── VERSION               # Versão atual (fonte da verdade)
├── CHANGELOG.md          # Histórico de versões
├── .env.example          # Template de variáveis de ambiente
└── README.md             # Este arquivo
```

## 🛡️ Segurança

- Senhas com hash **Argon2id** (auth-service) e **scrypt** (admin-api)
- **JWT** assinado com HS256 e issuer verificado
- **Refresh Token** com rotação automática
- Sessões revogadas ao trocar/resetar senha
- **RLS** (Row Level Security) no PostgreSQL
- Rate limiting no login (60 req/min)
- Rede Docker isolada (`internal: true`)
- MinIO sem interface web (`MINIO_BROWSER: off`)
- CORS configurável
- Logs de auditoria

## 🏷️ Versionamento e Releases

O projeto segue [Semantic Versioning](https://semver.org/lang/pt-BR/) e o
arquivo [`VERSION`](VERSION) é a **fonte da verdade** da versão atual.

### Regras

| Tipo | Quando usar | Exemplo |
|---|---|---|
| **PATCH** | Correções e ajustes compatíveis | `0.8.0` → `0.8.1` |
| **MINOR** | Novas funcionalidades compatíveis | `0.8.1` → `0.9.0` |
| **MAJOR** | Mudanças incompatíveis | `0.9.0` → `1.0.0` |

Enquanto o projeto estiver em `0.x`, mudanças incompatíveis podem ocorrer em
MINOR. A versão **nunca** é alterada automaticamente em commits.

### Como atualizar a versão

```bash
# Ver a versão atual (e commit/tag)
./scripts/version.sh show

# Incrementar
./scripts/version.sh bump patch   # 0.8.0 -> 0.8.1
./scripts/version.sh bump minor   # 0.8.0 -> 0.9.0
./scripts/version.sh bump major   # 0.8.0 -> 1.0.0 (somente quando estável)

# Ou definir uma versão exata
./scripts/version.sh set 0.9.0
```

O script sincroniza `VERSION`, os quatro `package.json` e
`panel/src/lib/version.ts` (exibido no painel). Depois:

1. Atualize o `CHANGELOG.md` com a nova seção `## [x.y.z] - AAAA-MM-DD`.
2. Rode `./scripts/version.sh check` (valida a sincronização).
3. Faça commit e deploy em `main`.

### Como publicar uma Release no GitHub

Há um script próprio, **manual e seguro** (não publica nada por padrão):

```bash
./scripts/release.sh                          # dry-run: valida e mostra o plano
./scripts/release.sh --confirm                # cria a tag anotada vX.Y.Z
./scripts/release.sh --confirm --push         # envia a tag ao GitHub
./scripts/release.sh --confirm --push --github-release
                                              # + cria a GitHub Release (gh)
```

O script:

- exige árvore de trabalho limpa e versão sincronizada;
- recusa tags duplicadas (locais ou remotas);
- **nunca** apaga nem move tags existentes;
- roda `./scripts/version.sh check` antes de taguear;
- só cria GitHub Release com a flag explícita `--github-release`;
- marca `0.x` automaticamente como *pre-release*.

Requisito para a Release: `gh` autenticado (`gh auth login`). Sem `gh`, use o
GitHub → **Releases → Draft a new release** apontando para a tag já enviada.

### Como identificar a versão instalada

```bash
cat VERSION                      # versão do código
git describe --tags --always     # tag mais próxima + commit
 git log -1 --oneline            # commit exato em execução
```

No painel, a versão aparece no rodapé do **Dashboard**. Em produção, o
`git log -1` da VPS é a referência do que está no ar (o deploy usa o código da
VPS, não o do GitHub).

### Processo de release

1. Atualize `CHANGELOG.md` (Adicionado / Alterado / Corrigido / Segurança).
2. `./scripts/version.sh bump <patch|minor|major>`.
3. Rode os testes e o deploy em ambiente de validação.
4. `./scripts/release.sh --confirm --push [--github-release]`.
5. Nunca publique versão com falha crítica; nunca execute migração destrutiva
   apenas por causa de uma atualização de versão.

## 🚀 Instalação pelo EasyPanel (GHCR)

O fluxo de produção usa imagens publicadas no GitHub Container Registry:
**GitHub → Actions → GHCR → EasyPanel**. A VPS não compila código.

Resumo:

1. Configure o acesso do host ao GHCR com um PAT `read:packages`.
2. Crie no EasyPanel um serviço **Compose** usando o
   [`docker-compose.easypanel.yml`](docker-compose.easypanel.yml).
3. Defina `APP_VERSION`, `PUBLIC_URL`, `DB_SUPERPASS`, `JWT_SECRET`,
   `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD` em **Ambiente**.
4. Configure os 5 domínios/rotas (`/admin/api`, `/admin/visual-db`, `/admin`,
   `/auth`, `/api/rest`).
5. Clique em **Implantar**.

Guia completo (GHCR, variáveis, volumes, atualização, rollback, backup,
automação e solução de problemas): [`docs/easypanel-ghcr.md`](docs/easypanel-ghcr.md).

## 🛠 Desenvolvimento e publicação

1. Desenvolva e teste localmente (`docker compose up` ou serviços isolados).
2. Atualize `CHANGELOG.md` e a versão (`./scripts/version.sh bump`).
3. Faça commit na `main` e crie a tag: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
4. O workflow **Release images** (`.github/workflows/release-images.yml`)
   executa os testes e publica as imagens no GHCR.
5. No EasyPanel, atualize `APP_VERSION` e reimplante.
6. Valide healthchecks e endpoints; em caso de falha, volte `APP_VERSION`
   para a versão anterior (rollback sem perda de dados).

## 📄 Licença e créditos

**Autor:** Anderson — [https://zeroboot.com.br](https://zeroboot.com.br)

**Copyright © 2026 Anderson. Todos os direitos reservados**, respeitando as
licenças de terceiros.

O Livre Backend é distribuído como software proprietário. As bibliotecas,
imagens e demais dependências de terceiros utilizadas no projeto mantêm suas
próprias licenças e direitos, que não são alterados por este aviso.
