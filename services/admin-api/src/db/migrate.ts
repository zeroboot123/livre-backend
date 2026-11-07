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
}
