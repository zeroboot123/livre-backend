import { sql } from './pool.js';

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
}
