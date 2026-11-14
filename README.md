# 🚀 Livre Backend

Plataforma **Backend as a Service (BaaS)** — própria, modular, leve e segura.

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
- ✅ **API Pública** por projeto com tokens de acesso
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

![Exemplo de configuração de rotas no EasyPanel](docs/images/easypanel-domains.png)

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

## 📄 Licença

Proprietário — Todos os direitos reservados.