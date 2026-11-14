import { sql } from './pool.js';

const qident = (id: string) => '"' + String(id).replace(/"/g, '""') + '"';

/**
 * Campos embutidos (Built-in) presentes em todas as tabelas de um projeto.
 * Eles não podem ser removidos e são preenchidos automaticamente.
 */
export const BUILTIN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'creator', 'slug']);

/** Campos embutidos da tabela nativa de usuários do projeto. */
export const USER_BUILTIN_FIELDS = new Set([
  'id',
  'email',
  'password_hash',
  'slug',
  'email_confirmed',
  'token_version',
  'created_at',
  'updated_at',
]);

/**
 * Garante que o schema do projeto exista e que a tabela nativa `users`
 * esteja criada com os campos embutidos do Bubble (email, Slug, Created Date,
 * Modified Date) + senha oculta.
 *
 * Idempotente: pode ser chamado na criação do projeto e nas migrações.
 */
export async function ensureProjectSchema(schema: string): Promise<void> {
  const s = qident(schema);

  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${s}`);
  await sql.unsafe(`GRANT USAGE ON SCHEMA ${s} TO authenticated`);

  // Tabela nativa de usuários do projeto.
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${s}."users" (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email text NOT NULL,
    password_hash text NOT NULL,
    slug text,
    email_confirmed boolean NOT NULL DEFAULT false,
    token_version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  // Backfill de colunas internas para projetos criados antes desta versão.
  await sql.unsafe(
    `ALTER TABLE ${s}."users" ADD COLUMN IF NOT EXISTS email_confirmed boolean NOT NULL DEFAULT false`
  );
  await sql.unsafe(
    `ALTER TABLE ${s}."users" ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`
  );
  await sql.unsafe(
    `ALTER TABLE ${s}."users" ADD COLUMN IF NOT EXISTS slug text`
  );
  await sql.unsafe(
    `ALTER TABLE ${s}."users" ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`
  );
  await sql.unsafe(
    `ALTER TABLE ${s}."users" ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`
  );

  // E-mail único sem diferenciar maiúsculas/minúsculas.
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx"
       ON ${s}."users" (lower(email))`
  );

  // A tabela nativa precisa existir para a API pública de autenticação.
  await sql.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${s}."users" TO authenticated`
  );

  // Garante os campos embutidos em tabelas já existentes do projeto.
  const tables = (await sql`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relkind = 'r' AND c.relname <> 'users'
    ORDER BY c.relname
  `) as any[];

  for (const table of tables) {
    const t = qident(table.name);
    await sql.unsafe(
      `ALTER TABLE ${s}.${t} ADD COLUMN IF NOT EXISTS creator uuid REFERENCES ${s}."users"(id) ON DELETE SET NULL`
    );
    await sql.unsafe(`ALTER TABLE ${s}.${t} ADD COLUMN IF NOT EXISTS slug text`);
    await sql.unsafe(
      `ALTER TABLE ${s}.${t} ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`
    );
    await sql.unsafe(
      `ALTER TABLE ${s}.${t} ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`
    );
  }
}

/** Garante as permissões da tabela para o role usado pela API pública. */
export async function grantProjectTable(schema: string, table: string): Promise<void> {
  await sql.unsafe(`GRANT USAGE ON SCHEMA ${qident(schema)} TO authenticated`);
  await sql.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${qident(schema)}.${qident(table)} TO authenticated`
  );
}

/**
 * Reseta o "banco de dados" do projeto: remove todos os objetos do schema
 * (tabelas, views, funções, tipos e sequências) e recria a estrutura nativa,
 * incluindo a tabela `users`.
 *
 * Também limpa metadados que apontam para objetos removidos: histórico de
 * migrations, regras de privacidade (RLS) e tabelas expostas na API. Tokens,
 * arquivos e configurações do projeto são preservados.
 */
export async function resetProjectSchema(schema: string, projectId: string): Promise<void> {
  if (!/^proj_[a-z0-9_]+$/.test(schema)) {
    throw new Error('Schema de projeto inválido.');
  }

  // CASCADE remove tabelas, views, funções, tipos, sequências, políticas etc.
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${qident(schema)} CASCADE`);
  await ensureProjectSchema(schema);

  await sql`DELETE FROM livre_auth.sql_migrations WHERE project_id = ${projectId}`;
  await sql`DELETE FROM livre_auth.project_api_exposed_tables WHERE project_id = ${projectId}`;
  await sql`DELETE FROM livre_auth.rls_rules WHERE project_id = ${projectId}`;
  await sql`
    UPDATE livre_auth.files
    SET attached_table = NULL, attached_id = NULL
    WHERE project_id = ${projectId}
  `;
}
