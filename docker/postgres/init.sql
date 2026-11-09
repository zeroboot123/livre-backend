-- ==============================================================
-- LIVRE BACKEND - Inicialização do PostgreSQL
-- ==============================================================

-- Ativar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================
-- SCHEMA PRINCIPAL: livre_auth
-- ==============================================================
CREATE SCHEMA IF NOT EXISTS livre_auth;

-- Usuários da plataforma
CREATE TABLE IF NOT EXISTS livre_auth.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    name            VARCHAR(255) NOT NULL,
    email_confirmed BOOLEAN DEFAULT FALSE,
    email_token     UUID DEFAULT uuid_generate_v4(),
    active          BOOLEAN DEFAULT TRUE,
    blocked         BOOLEAN DEFAULT FALSE,
    blocked_at      TIMESTAMPTZ,
    blocked_reason  TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões de usuários (refresh tokens)
CREATE TABLE IF NOT EXISTS livre_auth.sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES livre_auth.users(id) ON DELETE CASCADE,
    refresh_token   TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    device_info     TEXT,
    ip_address      VARCHAR(45),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON livre_auth.sessions(user_id);
CREATE INDEX idx_sessions_refresh_token_hash ON livre_auth.sessions(refresh_token_hash);

-- Projetos
CREATE TABLE IF NOT EXISTS livre_auth.projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) UNIQUE NOT NULL,
    description     TEXT,
    public_key      UUID DEFAULT uuid_generate_v4(),
    api_base_url    VARCHAR(255),
    config          JSONB DEFAULT '{}',
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Empresas / Tenants
CREATE TABLE IF NOT EXISTS livre_auth.tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL REFERENCES livre_auth.projects(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    schema_name     VARCHAR(63) NOT NULL,
    config          JSONB DEFAULT '{}',
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, slug),
    UNIQUE(project_id, schema_name)
);

-- Usuários de projetos (vinculação)
CREATE TABLE IF NOT EXISTS livre_auth.project_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES livre_auth.users(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES livre_auth.projects(id) ON DELETE CASCADE,
    tenant_id       UUID REFERENCES livre_auth.tenants(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL DEFAULT 'user',
    permissions     JSONB DEFAULT '{}',
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, project_id)
);

-- Logs de auditoria
CREATE TABLE IF NOT EXISTS livre_auth.audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES livre_auth.users(id),
    project_id      UUID REFERENCES livre_auth.projects(id),
    tenant_id       UUID REFERENCES livre_auth.tenants(id),
    action          VARCHAR(100) NOT NULL,
    resource        VARCHAR(255),
    details         JSONB DEFAULT '{}',
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON livre_auth.audit_log(user_id);
CREATE INDEX idx_audit_log_created ON livre_auth.audit_log(created_at);

-- Recuperação de senha
CREATE TABLE IF NOT EXISTS livre_auth.password_resets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES livre_auth.users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================
-- FUNÇÕES AUXILIARES
-- ==============================================================

-- Função para definir o contexto RLS (chamada pelo PostgREST via "SET LOCAL")
CREATE OR REPLACE FUNCTION livre_auth.set_auth_context(
    p_user_id UUID,
    p_project_id UUID,
    p_tenant_id UUID,
    p_role VARCHAR
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, TRUE);
    PERFORM set_config('app.current_project_id', p_project_id::TEXT, TRUE);
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
    PERFORM set_config('app.current_role', p_role, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para criar schema de projeto automaticamente
CREATE OR REPLACE FUNCTION livre_auth.create_tenant_schema(
    p_tenant_id UUID,
    p_schema_name VARCHAR
) RETURNS VOID AS $$
BEGIN
    -- Criar schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

    -- Habilitar RLS no schema (concede para o papel autenticado)
    EXECUTE format('
        GRANT USAGE ON SCHEMA %I TO authenticated;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO authenticated;
    ', p_schema_name, p_schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================
-- PAPÉIS DO BANCO
-- ==============================================================

-- Os usuários são criados dinamicamente via variável de ambiente
-- do PostgreSQL (POSTGRES_USER já cria o superusuário livre_admin)
-- Os demais usuários de serviço precisam ser criados aqui:

-- NOTA: Os usuários livre_auth e livre_admin_api são criados
-- pelo script entrypoint-custom.sh que substitui as variáveis
-- de ambiente no arquivo init.sql antes de executá-lo.

-- Papel anônimo (acesso público mínimo via PostgREST)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
END$$;

-- Papel autenticado (acesso via JWT + RLS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END$$;

-- Conceder permissões básicas
GRANT USAGE ON SCHEMA livre_auth TO anon, authenticated;
GRANT SELECT ON livre_auth.users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON livre_auth.sessions TO authenticated;
GRANT SELECT ON livre_auth.projects TO anon, authenticated;
GRANT SELECT ON livre_auth.tenants TO authenticated;
