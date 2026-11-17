import { createHash } from 'node:crypto';
import { sql } from '../db/pool.js';
import { ensureProjectSchema, grantProjectTable } from '../db/project-schema.js';

/**
 * Execução de migrations SQL enviadas pelo painel.
 *
 * Cada arquivo (.sql) é executado dentro de uma transação no schema do
 * projeto. As proteções abaixo impedem que um script atinja o schema global
 * (`livre_auth`), outros projetos ou recursos do servidor de banco.
 */

export type MigrationContext = { projectId: string; schema: string };

export interface SqlMigration {
  id: string;
  project_id?: string;
  filename: string;
  checksum: string;
  status: 'running' | 'success' | 'error';
  statements: number;
  duration_ms: number | null;
  error: string | null;
  executed_at: string | null;
  created_at: string;
  sql_text?: string;
}

const MAX_SQL_BYTES = 1024 * 1024; // 1 MB
const qident = (id: string) => '"' + String(id).replace(/"/g, '""') + '"';

/** Normaliza o nome do arquivo (sem diretórios) e garante a extensão .sql. */
export function normalizeMigrationFilename(value: unknown): string {
  let name = String(value ?? '')
    .replace(/[\\/]+/g, '_')
    .replace(/[^\w.\- ]+/g, '_')
    .trim()
    .slice(0, 180);
  if (!name) name = `migration_${Date.now()}.sql`;
  if (!/\.sql$/i.test(name)) name += '.sql';
  return name;
}

/**
 * Divide um script SQL em comandos individuais respeitando strings, aspas
 * duplas, comentários e blocos dollar-quoted ($$...$$ / $tag$...$tag$).
 */
export function splitSqlStatements(input: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let dollar: string | null = null;
  let mode: 'normal' | 'squote' | 'dquote' | 'line' | 'block' = 'normal';
  let blockDepth = 0;

  const push = () => {
    const trimmed = current.trim();
    current = '';
    if (trimmed && trimmed !== ';') statements.push(trimmed);
  };

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (dollar) {
      if (input.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (mode === 'line') {
      current += ch;
      if (ch === '\n') mode = 'normal';
      i++;
      continue;
    }

    if (mode === 'block') {
      if (ch === '*' && next === '/') {
        current += '*/';
        i += 2;
        blockDepth -= 1;
        if (blockDepth <= 0) mode = 'normal';
        continue;
      }
      if (ch === '/' && next === '*') {
        current += '/*';
        i += 2;
        blockDepth += 1;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (mode === 'squote') {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        mode = 'normal';
      }
      i++;
      continue;
    }

    if (mode === 'dquote') {
      current += ch;
      if (ch === '"') {
        if (next === '"') {
          current += next;
          i += 2;
          continue;
        }
        mode = 'normal';
      }
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      mode = 'line';
      current += '--';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = 'block';
      blockDepth = 1;
      current += '/*';
      i += 2;
      continue;
    }
    if (ch === "'") {
      mode = 'squote';
      current += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      mode = 'dquote';
      current += ch;
      i++;
      continue;
    }
    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(input.slice(i));
      if (match) {
        dollar = match[0];
        current += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (ch === ';') {
      current += ';';
      push();
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  push();
  return statements;
}

const FORBIDDEN: Array<{ re: RegExp; message: string }> = [
  {
    re: /\b(create|drop|alter)\s+(database|role|user|tablespace)\b/i,
    message: 'Comandos de banco de dados/roles não são permitidos em migrations.',
  },
  {
    re: /\bdrop\s+schema\b|\balter\s+schema\b/i,
    message: 'Alterar ou excluir schemas não é permitido. Use o painel para excluir um projeto.',
  },
  {
    // Só bloqueia quando o comando É de controle de transação. Blocos
    // PL/pgSQL (DO $$ BEGIN ... END $$) contêm BEGIN no meio e são válidos.
    re: /^(begin|start\s+transaction|commit|rollback|savepoint)\b/i,
    message:
      'Controle de transação não é permitido: cada arquivo já é executado dentro de uma transação.',
  },
  {
    re: /\bset\s+(local\s+|session\s+)?(role|session\s+authorization|search_path)\b/i,
    message: 'Alterar role ou search_path não é permitido em migrations.',
  },
  {
    re: /\bcopy\b[\s\S]*\bprogram\b/i,
    message: 'COPY ... PROGRAM não é permitido.',
  },
  {
    re: /\blo_(import|export)\b/i,
    message: 'Funções de large object não são permitidas.',
  },
  {
    re: /\bpg_(read|write)_(file|binary_file)\b|\bpg_ls_dir\b/i,
    message: 'Funções de acesso ao filesystem não são permitidas.',
  },
  {
    re: /\bpg_(shadow|authid|terminate_backend|reload_conf)\b/i,
    message: 'Funções internas do PostgreSQL não são permitidas.',
  },
  {
    re: /\bcreate\s+extension\b|\bdrop\s+extension\b/i,
    message: 'Extensões são gerenciadas na instalação e não podem ser alteradas por migrations.',
  },
  {
    re: /\blivre_auth\b/i,
    message: 'O schema interno livre_auth não pode ser acessado por migrations.',
  },
];

/** Remove comentários antes de validar (comentários podem citar termos proibidos). */
function stripComments(statement: string): string {
  return statement.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Prepara os comandos para execução. Dumps externos costumam vir com
 * `CREATE SCHEMA <origem>` e `SET search_path TO <origem>, public` no topo;
 * esses comandos são descartados para que tudo seja criado no schema do
 * projeto ativo (cada projeto tem um schema dedicado).
 */
export function prepareStatements(input: string): string[] {
  return splitSqlStatements(input).filter((statement) => {
    const audit = stripComments(statement).trim();
    if (!audit || audit === ';') return false;
    if (/^create\s+schema\b/i.test(audit)) return false;
    if (/^set\s+(local\s+|session\s+)?search_path\b/i.test(audit)) return false;
    return true;
  });
}

function assertSafeStatement(statement: string, schema: string) {
  const audit = stripComments(statement).trim();

  for (const rule of FORBIDDEN) {
    if (rule.re.test(audit)) throw new Error(rule.message);
  }

  // Nenhuma referência a schemas de outros projetos.
  const refs = audit.match(/\bproj_[a-z0-9_]+/gi) || [];
  for (const ref of refs) {
    if (ref.toLowerCase() !== schema.toLowerCase()) {
      throw new Error(`A migration não pode acessar o schema de outro projeto (${ref}).`);
    }
  }

  // Qualquer schema explícito que não seja o do projeto ou schemas públicos.
  const schemaRefs = audit.match(/\b([a-z_][a-z0-9_]*)\s*\.\s*[a-z_][a-z0-9_]*/gi) || [];
  const allowed = new Set([schema.toLowerCase(), 'public', 'information_schema']);
  for (const ref of schemaRefs) {
    const prefix = ref.split('.')[0].trim().toLowerCase();
    if (
      prefix &&
      !allowed.has(prefix) &&
      !['pg_catalog', 'usage', 'select', 'insert', 'update', 'delete', 'on', 'to', 'from'].includes(prefix)
    ) {
      // Permite prefixos que são apenas nomes de colunas em expressões (ex.: tabela.coluna).
      // Só bloqueia quando parece um schema real (proj_ ou livre_).
      if (/^(proj_|livre_|pg_)/.test(prefix)) {
        throw new Error(`A migration não pode acessar o schema "${prefix}".`);
      }
    }
  }
}

function cleanError(err: any): string {
  const parts = [String(err?.message || err || 'Erro desconhecido')];
  if (err?.detail) parts.push(`DETALHE: ${err.detail}`);
  if (err?.hint) parts.push(`DICA: ${err.hint}`);
  if (err?.position) parts.push(`POSIÇÃO: ${err.position}`);
  return parts.join('\n');
}

/** Após a migration, garante campos embutidos e permissões nas novas tabelas. */
async function afterMigration(schema: string) {
  try {
    await ensureProjectSchema(schema);

    const tables = (await sql`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema} AND c.relkind IN ('r', 'p')
    `) as any[];

    for (const table of tables) {
      await grantProjectTable(schema, table.name);
    }

    await sql.unsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${qident(schema)} TO authenticated`
    );
  } catch (err) {
    // A migration já foi aplicada; falha de pós-processamento não a invalida.
    console.error('[sql-migrations] pós-processamento falhou:', err);
  }
}

export async function executeSqlMigration(
  ctx: MigrationContext,
  filenameInput: unknown,
  sqlInput: unknown,
  opts: { force?: boolean } = {}
): Promise<SqlMigration> {
  const filename = normalizeMigrationFilename(filenameInput);
  const text = String(sqlInput ?? '');
  if (!text.trim()) throw new Error('O arquivo SQL está vazio.');
  if (Buffer.byteLength(text, 'utf8') > MAX_SQL_BYTES) {
    throw new Error('O arquivo SQL excede o limite de 1 MB.');
  }

  const statements = prepareStatements(text);
  if (!statements.length) throw new Error('Nenhum comando SQL encontrado no arquivo.');

  statements.forEach((statement) => assertSafeStatement(statement, ctx.schema));

  const checksum = createHash('sha256').update(text).digest('hex');

  if (!opts.force) {
    const [applied] = (await sql`
      SELECT id FROM livre_auth.sql_migrations
      WHERE project_id = ${ctx.projectId}
        AND filename = ${filename}
        AND status = 'success'
      LIMIT 1
    `) as any[];
    if (applied) {
      throw new Error(
        `A migration "${filename}" já foi aplicada neste projeto. Use "Forçar reexecução" somente se souber o que está fazendo.`
      );
    }
  }

  const [job] = (await sql`
    INSERT INTO livre_auth.sql_migrations
      (project_id, filename, checksum, sql_text, status)
    VALUES (${ctx.projectId}, ${filename}, ${checksum}, ${text}, 'running')
    RETURNING id, created_at
  `) as any[];

  const started = Date.now();
  let executed = 0;

  try {
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SET LOCAL statement_timeout = '120s'`);
      await tx.unsafe(`SET LOCAL search_path TO ${qident(ctx.schema)}, public`);
      for (const statement of statements) {
        await tx.unsafe(statement);
        executed += 1;
      }
    });

    const duration = Date.now() - started;

    const [row] = (await sql`
      UPDATE livre_auth.sql_migrations
      SET status = 'success',
          statements = ${executed},
          duration_ms = ${duration},
          error = NULL,
          executed_at = now()
      WHERE id = ${job.id}
      RETURNING id, project_id, filename, checksum, status, statements,
                duration_ms, error, executed_at, created_at
    `) as any[];

    await afterMigration(ctx.schema);
    return row as SqlMigration;
  } catch (err: any) {
    const duration = Date.now() - started;
    const message = cleanError(err);

    try {
      await sql`
        UPDATE livre_auth.sql_migrations
        SET status = 'error',
            statements = ${executed},
            duration_ms = ${duration},
            error = ${message}
        WHERE id = ${job.id}
      `;
    } catch {
      /* o erro original é o que importa para o painel */
    }

    const failure: any = new Error(message);
    failure.migrationId = job.id;
    failure.statements = executed;
    failure.durationMs = duration;
    throw failure;
  }
}

export async function listMigrations(projectId: string): Promise<SqlMigration[]> {
  const rows = (await sql`
    SELECT id, filename, checksum, status, statements, duration_ms, error,
           executed_at, created_at
    FROM livre_auth.sql_migrations
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
    LIMIT 200
  `) as any[];
  return rows as SqlMigration[];
}

export async function getMigration(
  projectId: string,
  id: string
): Promise<SqlMigration | null> {
  const [row] = (await sql`
    SELECT id, project_id, filename, checksum, sql_text, status, statements,
           duration_ms, error, executed_at, created_at
    FROM livre_auth.sql_migrations
    WHERE project_id = ${projectId} AND id = ${id}
    LIMIT 1
  `) as any[];
  return (row as SqlMigration) || null;
}

export async function deleteMigration(projectId: string, id: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM livre_auth.sql_migrations
    WHERE project_id = ${projectId} AND id = ${id}
    RETURNING id
  `) as any[];
  return rows.length > 0;
}

const quoteIdent = (value: string) => '"' + String(value).replace(/"/g, '""') + '"';
const quoteLiteral = (value: string) => "'" + String(value).replace(/'/g, "''") + "'";

/**
 * Gera um dump DDL do schema do projeto (tabelas, constraints, índices,
 * sequências e comentários) no formato PostgreSQL, pronto para ser
 * reimportado pelo painel.
 */
export async function exportProjectSchema(
  ctx: MigrationContext
): Promise<{ filename: string; sql: string }> {
  const [project] = (await sql`
    SELECT name, slug FROM livre_auth.projects WHERE id = ${ctx.projectId} LIMIT 1
  `) as any[];

  const schema = ctx.schema;

  // search_path apontando para o schema do projeto faz o PostgreSQL gerar
  // constraints/índices SEM qualificar o schema. Assim o arquivo exportado
  // pode ser importado em qualquer projeto.
  const dump = await sql.begin(async (tx: any) => {
    await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);

    const lines: string[] = [];

    lines.push('-- Livre Backend — exportacao de schema');
    lines.push(`-- Projeto: ${project?.name || project?.slug || '-'}`);
    lines.push(`-- Schema de origem: ${schema}`);
    lines.push(`-- Gerado: ${new Date().toISOString()}`);
    lines.push('-- Dialeto: PostgreSQL');
    lines.push('--');
    lines.push('-- Importe pela aba SQL do projeto de destino.');
    lines.push('-- Tabela nativa "users" omitida (criada automaticamente em todo projeto).');
    lines.push('-- Em psql, defina antes: SET search_path TO <schema_destino>, public;');
    lines.push('');

    const tables = (await tx`
      SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema} AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `) as any[];

    for (const table of tables) {
      // A tabela nativa de usuários existe em todo projeto; recriá-la
      // quebraria a importação em outro projeto.
      if (table.name === 'users') continue;

      const qualified = quoteIdent(table.name);
      // Remove a qualificação do schema de origem em definições geradas
      // pelo catálogo (ex.: "ON proj_x.tabela"), para permitir reimportar
      // o dump em outro projeto.
      const unqualify = (value: string) =>
        String(value)
          .split(`${quoteIdent(schema)}.`)
          .join('')
          .split(`${schema}.`)
          .join('');
      const regclassExpr = `to_regclass(format('%I.%I', ${quoteLiteral(
        schema
      )}, ${quoteLiteral(table.name)}))`;

      const columns = (await tx.unsafe(
        `SELECT a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS type,
                a.attnotnull AS not_null,
                a.attidentity AS identity,
                a.attgenerated AS generated,
                pg_get_expr(d.adbin, d.adrelid) AS default_expr
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = ${regclassExpr}
           AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`
      )) as any[];

      if (!columns.length) continue;

      // Sequências usadas por defaults nextval (colunas serial).
      const sequences = new Set<string>();
      const definitions: string[] = [];

      for (const column of columns) {
        const parts = [`  ${quoteIdent(column.name)} ${column.type}`];

        if (column.generated === 's') {
          parts.push(`GENERATED ALWAYS AS (${column.default_expr}) STORED`);
        } else if (column.identity === 'a') {
          parts.push('GENERATED ALWAYS AS IDENTITY');
        } else if (column.identity === 'd') {
          parts.push('GENERATED BY DEFAULT AS IDENTITY');
        } else if (column.default_expr != null) {
          const match = /nextval\('([^']+)'::regclass\)/i.exec(column.default_expr);
          if (match) {
            const sequence = match[1].split('.').pop()!.replace(/"/g, '');
            sequences.add(sequence);
          }
          parts.push(`DEFAULT ${column.default_expr}`);
        }

        if (column.not_null) parts.push('NOT NULL');
        definitions.push(parts.join(' '));
      }

      const constraints = (await tx.unsafe(
        `SELECT conname AS name, pg_get_constraintdef(c.oid, true) AS definition
         FROM pg_constraint c
         WHERE c.conrelid = ${regclassExpr} AND c.contype <> 't'
         ORDER BY CASE c.contype
                    WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END,
                  c.conname`
      )) as any[];

      for (const constraint of constraints) {
        definitions.push(
          `  CONSTRAINT ${quoteIdent(constraint.name)} ${unqualify(constraint.definition)}`
        );
      }

      if (sequences.size) {
        lines.push(`-- Sequencias de ${table.name}`);
        for (const sequence of sequences) {
          lines.push(`CREATE SEQUENCE IF NOT EXISTS ${quoteIdent(sequence)};`);
        }
        lines.push('');
      }

      lines.push(`-- Tabela ${table.name}`);
      lines.push(`CREATE TABLE IF NOT EXISTS ${qualified} (`);
      lines.push(definitions.join(',\n'));
      lines.push(');');
      lines.push('');

      if (table.comment) {
        lines.push(`COMMENT ON TABLE ${qualified} IS ${quoteLiteral(table.comment)};`);
      }

      const columnComments = (await tx.unsafe(
        `SELECT a.attname AS name, col_description(a.attrelid, a.attnum) AS comment
         FROM pg_attribute a
         WHERE a.attrelid = ${regclassExpr}
           AND a.attnum > 0 AND NOT a.attisdropped
           AND col_description(a.attrelid, a.attnum) IS NOT NULL`
      )) as any[];

      for (const column of columnComments) {
        lines.push(
          `COMMENT ON COLUMN ${qualified}.${quoteIdent(column.name)} IS ${quoteLiteral(
            column.comment
          )};`
        );
      }
      if (table.comment || columnComments.length) lines.push('');

      const indexes = (await tx.unsafe(
        `SELECT i.indexname AS name, i.indexdef AS definition
         FROM pg_indexes i
         WHERE i.schemaname = ${quoteLiteral(schema)}
           AND i.tablename = ${quoteLiteral(table.name)}
           AND i.indexname NOT IN (
             SELECT con.conname
             FROM pg_constraint con
             WHERE con.conrelid = ${regclassExpr}
           )
         ORDER BY i.indexname`
      )) as any[];

      if (indexes.length) {
        lines.push(`-- Indices de ${table.name}`);
        for (const index of indexes) {
          // Torna o dump reaplicável sem erro de "já existe".
          const definition = unqualify(
            String(index.definition).replace(
              /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
              (_match: string, unique: string | undefined) =>
                `CREATE ${unique || ''}INDEX IF NOT EXISTS `
            )
          );
          lines.push(`${definition};`);
        }
        lines.push('');
      }
    }

    lines.push('-- Fim do export');
    lines.push('');

    return lines.join('\n');
  });

  return {
    filename: `${schema}_schema.sql`,
    sql: dump,
  };
}

