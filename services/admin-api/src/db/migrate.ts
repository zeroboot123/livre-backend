import { sql } from './pool.js';
import { ensureProjectSchema } from './project-schema.js';

/**
 * Migrações idempotentes aplicadas na inicialização do admin-api.
 * Necessário porque o init.sql do Postgres só roda em bancos novos.
 */
export async function runMigrations() {
  // ── Option sets ────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.option_sets (
      id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        varchar(120) UNIQUE NOT NULL,
      label       varchar(120),
      description text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.option_set_options (
      id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      option_set_id uuid NOT NULL REFERENCES livre_auth.option_sets(id) ON DELETE CASCADE,
      display       text NOT NULL,
      sort_order    int  NOT NULL DEFAULT 0,
      metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (option_set_id, display)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_option_set_options_set
      ON livre_auth.option_set_options(option_set_id, sort_order)
  `;

  // ── Arquivos (metadados do storage) ────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.files (
      id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      bucket         text NOT NULL,
      object_key     text UNIQUE NOT NULL,
      file_name      text NOT NULL,
      mime_type      text,
      size_bytes     bigint,
      status         text NOT NULL DEFAULT 'ready',
      is_private     boolean NOT NULL DEFAULT true,
      uploaded_by    uuid REFERENCES livre_auth.users(id) ON DELETE SET NULL,
      attached_table text,
      attached_id    uuid,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_files_created
      ON livre_auth.files(created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_files_attached
      ON livre_auth.files(attached_table, attached_id)
  `;

  // ── API pública (Data API + tokens) ────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.api_settings (
      id                        int PRIMARY KEY DEFAULT 1,
      data_api_enabled          boolean NOT NULL DEFAULT false,
      workflow_api_enabled      boolean NOT NULL DEFAULT false,
      workflow_root_url         text,
      use_display_instead_of_id boolean NOT NULL DEFAULT false,
      hide_swagger              boolean NOT NULL DEFAULT false,
      updated_at                timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT api_settings_singleton CHECK (id = 1)
    )
  `;

  await sql`
    INSERT INTO livre_auth.api_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.api_exposed_tables (
      table_name text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.api_tokens (
      id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name         text NOT NULL,
      token_prefix text NOT NULL,
      token_hash   text NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      revoked      boolean NOT NULL DEFAULT false
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_api_tokens_hash
      ON livre_auth.api_tokens(token_hash)
  `;

  // Contexto opcional por token (para regras RLS com "usuário/tenant atual")
  await sql`ALTER TABLE livre_auth.api_tokens ADD COLUMN IF NOT EXISTS context_user_id uuid`;
  await sql`ALTER TABLE livre_auth.api_tokens ADD COLUMN IF NOT EXISTS context_tenant_id uuid`;

  // ── RLS (regras de privacidade por linha) ──────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.rls_rules (
      id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      table_name text NOT NULL,
      field      text NOT NULL,
      operator   text NOT NULL,
      value      text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_rls_rules_table
      ON livre_auth.rls_rules(table_name)
  `;

  // ── Projetos: cada projeto tem seu próprio schema (database lógico) ──
  await sql`ALTER TABLE livre_auth.projects ADD COLUMN IF NOT EXISTS schema_name varchar(63)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_schema_name
      ON livre_auth.projects(schema_name) WHERE schema_name IS NOT NULL
  `;

  // Metadados passam a ser isolados por projeto.
  await sql`ALTER TABLE livre_auth.option_sets ADD COLUMN IF NOT EXISTS project_id uuid`;
  // O nome do option set era único globalmente; agora é único por projeto.
  await sql`ALTER TABLE livre_auth.option_sets DROP CONSTRAINT IF EXISTS option_sets_name_key`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_option_sets_project_name
      ON livre_auth.option_sets(project_id, name)
  `;

  await sql`ALTER TABLE livre_auth.files ADD COLUMN IF NOT EXISTS project_id uuid`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_files_project
      ON livre_auth.files(project_id, created_at DESC)
  `;

  await sql`ALTER TABLE livre_auth.api_tokens ADD COLUMN IF NOT EXISTS project_id uuid`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_api_tokens_project
      ON livre_auth.api_tokens(project_id)
  `;

  await sql`ALTER TABLE livre_auth.rls_rules ADD COLUMN IF NOT EXISTS project_id uuid`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_rls_rules_project
      ON livre_auth.rls_rules(project_id, table_name)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.project_api_settings (
      project_id                uuid PRIMARY KEY,
      data_api_enabled          boolean NOT NULL DEFAULT false,
      workflow_api_enabled      boolean NOT NULL DEFAULT false,
      workflow_root_url         text,
      use_display_instead_of_id boolean NOT NULL DEFAULT false,
      hide_swagger              boolean NOT NULL DEFAULT false,
      updated_at                timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.project_api_exposed_tables (
      project_id uuid NOT NULL,
      table_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, table_name)
    )
  `;

  // ── SQL migrations (arquivos .sql enviados pelo painel) ────
  await sql`
    CREATE TABLE IF NOT EXISTS livre_auth.sql_migrations (
      id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id  uuid NOT NULL REFERENCES livre_auth.projects(id) ON DELETE CASCADE,
      filename    text NOT NULL,
      checksum    text NOT NULL,
      sql_text    text NOT NULL,
      status      text NOT NULL DEFAULT 'running',
      statements  int NOT NULL DEFAULT 0,
      duration_ms int,
      error       text,
      executed_at timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sql_migrations_project
      ON livre_auth.sql_migrations(project_id, created_at DESC)
  `;

  // Uma mesma migration bem-sucedida não pode ser aplicada duas vezes.
  // Migrations com erro continuam livres para correção e nova tentativa.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sql_migrations_applied
      ON livre_auth.sql_migrations(project_id, filename)
      WHERE status = 'success'
  `;

  // ── Backfill: garante um schema para projetos antigos ───────
  const sanitize = (value: string) => {
    const base = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 45);
    return base.replace(/^[0-9]/, 'p$&') || 'app';
  };

  const oldProjects = (await sql`
    SELECT id, slug, schema_name FROM livre_auth.projects
  `) as any[];

  for (const project of oldProjects) {
    let schemaName = project.schema_name as string | null;
    if (!schemaName) {
      const base = 'proj_' + sanitize(project.slug || project.id);
      schemaName = base;
      let attempt = 1;
      // Garante unicidade do nome do schema.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const [clash] = (await sql`
          SELECT 1 FROM livre_auth.projects
          WHERE schema_name = ${schemaName} AND id <> ${project.id}
          LIMIT 1
        `) as any[];
        if (!clash) break;
        schemaName = `${base}_${++attempt}`;
      }
      await sql`
        UPDATE livre_auth.projects SET schema_name = ${schemaName}
        WHERE id = ${project.id}
      `;
    }

    // Cria/atualiza o schema do projeto e a tabela nativa `users`.
    // Também adiciona os campos embutidos às tabelas existentes.
    await ensureProjectSchema(schemaName);
  }
}
