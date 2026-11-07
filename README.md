# 🚀 Livre Backend

Plataforma **Backend as a Service (BaaS)** — própria, modular, leve e segura.

## 📋 Visão Geral

O Livre Backend é uma plataforma BaaS que oferece funcionalidades similares ao Supabase, mas com arquitetura independente, utilizando PostgreSQL, PostgREST e Node.js.

### Funcionalidades

- ✅ **API REST Automática** via PostgREST
- ✅ **Autenticação JWT** com Argon2id
- ✅ **Refresh Token** com rotação e revogação
- ✅ **Multiprojeto e Multiempresa** com isolamento RLS
- ✅ **Painel Administrativo** web moderno e responsivo
- ✅ **Visual Database Builder** — editor visual de banco de dados
- ✅ **Gerenciamento de Permissões** com Privacy Rules
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
```

## 🚀 Início Rápido

### Pré-requisitos

- Docker e Docker Compose
- Git

### Instalação

```bash
# Clone o repositório
git clone <seu-repositorio> livre-backend
cd livre-backend

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# Inicie os serviços
docker compose up -d

# Verifique se tudo está rodando
docker compose ps
```

### Acessos

| Serviço | URL |
|---|---|
| Painel Admin | `http://localhost:3003` |
| Auth API | `http://localhost:3001/auth` |
| PostgREST | `http://localhost:3000` |
| Admin API | `http://localhost:3002` |
| Visual DB API | `http://localhost:3004` |

## 📚 Documentação

- [Endpoints de Autenticação](docs/api/auth-endpoints.md)
- [API REST (PostgREST)](docs/api/postgrest-endpoints.md)
- [Integração JavaScript](docs/integrations/javascript.md)
- [Integração Flutter](docs/integrations/flutter.md)
- [Integração Bubble](docs/integrations/bubble.md)

## 🛡️ Segurança

- Senhas com hash **Argon2id**
- **JWT** assinado com algoritmo seguro
- **Refresh Token** com rotação
- **RLS** (Row Level Security) no PostgreSQL
- Rate limiting por IP
- CORS configurável
- Logs de auditoria
- Separação de credenciais admin e públicas

## 📦 Estrutura do Projeto

```
livre-backend/
├── docker/              # Configurações Docker
│   ├── postgres/        # Init SQL, pg_hba.conf
│   └── postgrest/       # Config PostgREST
├── services/            # Código dos serviços
│   ├── auth/            # Serviço de autenticação
│   ├── admin-api/       # API administrativa
│   └── visual-db/       # Visual Database Builder
├── panel/               # Painel administrativo (Next.js)
├── scripts/             # Scripts utilitários
├── docs/                # Documentação
├── docker-compose.yml   # Orquestração principal
└── .env.example         # Template de variáveis
```

## 📄 Licença

Proprietário — Todos os direitos reservados.
