import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { sql } from './db/pool.js';
import { signToken, verifyToken } from './utils/crypto.js';
import { hashPassword, verifyPassword } from './utils/password.js';
import { BUILTIN_FIELDS, USER_BUILTIN_FIELDS, ensureProjectSchema } from './db/project-schema.js';
import { runMigrations } from './db/migrate.js';
import {
  BUCKET,
  MAX_UPLOAD_MB,
  ensureBucket,
  isAllowedMime,
  s3,
} from './services/storage.js';

const app = Fastify({
  logger: false,
  bodyLimit: (MAX_UPLOAD_MB + 5) * 1024 * 1024,
  // Aceita tanto os caminhos internos ("/schema") quanto o caminho externo
  // com o prefixo do proxy ("/admin/api/schema"). Assim o serviço funciona
  // com ou sem "strip prefix" no proxy reverso (EasyPanel/Coolify/nginx).
  rewriteUrl: (req) => {
    const base = process.env.API_BASE_PATH || '/admin/api';
    const url = req.url || '/';
    if (url === base) return '/';
    if (url.startsWith(base + '/')) return url.slice(base.length);
    return url;
  },
});
const PORT = parseInt(process.env.PORT || '3002', 10);

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

// Auth middleware
app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/health') return;
  // A API pública usa token próprio (X-API-Key / Bearer), validado na rota.
  if (request.url.startsWith('/public/')) return;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Token não fornecido' });
  }
  try {
    const token = authHeader.slice(7);
    (request as any).user = await verifyToken(token);
  } catch {
    return reply.code(401).send({ error: 'Token inválido' });
  }
});

// Health
app.get('/health', async () => ({
  status: 'ok', service: 'admin-api', timestamp: new Date().toISOString()
}));

// Stats
app.get('/stats', async (request) => {
  const [projects] = await sql`SELECT COUNT(*)::int as count FROM livre_auth.projects`;
  const [users] = await sql`SELECT COUNT(*)::int as count FROM livre_auth.users`;
  const [sessions] = await sql`SELECT COUNT(*)::int as count FROM livre_auth.sessions WHERE revoked = FALSE AND expires_at > NOW()`;
  return { projects: projects.count, users: users.count, sessions: sessions.count };
});

// Listar projetos
app.get('/projects', async () => {
  const projects = (await sql`
    SELECT id, name, slug, description, schema_name, public_key, active, created_at, updated_at
    FROM livre_auth.projects
    ORDER BY created_at DESC
  `) as any[];
  return { projects };
});

const slugify = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'app';

// Criar projeto + schema dedicado (o "database" daquele projeto)
app.post('/projects', async (request: any, reply) => {
  const name = String(request.body?.name || '').trim();
  if (!name) return reply.code(400).send({ error: 'O nome da aplicação é obrigatório' });
  if (name.length > 120) {
    return reply.code(400).send({ error: 'O nome deve ter no máximo 120 caracteres' });
  }

  const baseSlug = slugify(request.body?.slug || name);
  let slug = baseSlug;
  let attempt = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [clash] = (await sql`
      SELECT 1 FROM livre_auth.projects WHERE slug = ${slug} LIMIT 1
    `) as any[];
    if (!clash) break;
    slug = `${baseSlug}-${++attempt}`;
  }

  let schemaName = 'proj_' + slug.replace(/-/g, '_').replace(/[^a-z0-9_]/g, '_').slice(0, 45);
  if (!/^[a-z_]/.test(schemaName)) schemaName = 'p_' + schemaName;
  attempt = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [clash] = (await sql`
      SELECT 1 FROM livre_auth.projects WHERE schema_name = ${schemaName} LIMIT 1
    `) as any[];
    if (!clash) break;
    schemaName = schemaName.replace(/_\d+$/, '') + `_${++attempt}`;
  }

  try {
    await ensureProjectSchema(schemaName);

    const [project] = (await sql`
      INSERT INTO livre_auth.projects (name, slug, schema_name, description)
      VALUES (${name}, ${slug}, ${schemaName}, ${request.body?.description || null})
      RETURNING id, name, slug, description, schema_name, public_key, active, created_at, updated_at
    `) as any[];

    await sql`
      INSERT INTO livre_auth.project_api_settings (project_id)
      VALUES (${project.id})
      ON CONFLICT (project_id) DO NOTHING
    `;

    return { project };
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Já existe um projeto com esse nome' });
    }
    return reply.code(400).send({ error: err.message });
  }
});

// Excluir projeto (schema dedicado + metadados vinculados)
app.delete('/projects/:id', async (request: any, reply) => {
  const id = String(request.params?.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return reply.code(400).send({ error: 'ID de projeto inválido' });
  }

  try {
    const result = await sql.begin(async (tx: any) => {
      const [project] = (await tx`
        SELECT id, name, slug, schema_name
        FROM livre_auth.projects
        WHERE id = ${id}
        FOR UPDATE
      `) as any[];
      if (!project) return null;

      // Objetos do storage (remoção best-effort após o commit).
      const files = (await tx`
        SELECT bucket, object_key FROM livre_auth.files WHERE project_id = ${id}
      `) as any[];

      // Metadados específicos do projeto.
      await tx`DELETE FROM livre_auth.project_api_exposed_tables WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.rls_rules WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.api_tokens WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.option_sets WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.files WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.project_api_settings WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.project_users WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.tenants WHERE project_id = ${id}`;
      await tx`DELETE FROM livre_auth.audit_log WHERE project_id = ${id}`;

      // Remove o "banco de dados" do projeto. CASCADE elimina tabelas,
      // índices, políticas e demais objetos criados dentro do schema.
      if (project.schema_name) {
        await tx.unsafe(`DROP SCHEMA IF EXISTS ${qident(project.schema_name)} CASCADE`);
      }

      await tx`DELETE FROM livre_auth.projects WHERE id = ${id}`;
      return { project, files };
    });

    if (!result) {
      return reply.code(404).send({ error: 'Projeto não encontrado' });
    }

    // Limpa os arquivos do storage sem impedir a exclusão do projeto.
    for (const file of result.files) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: file.bucket, Key: file.object_key })
        );
      } catch {
        /* objeto já inexistente ou storage indisponível */
      }
    }

    return {
      ok: true,
      deleted: {
        id: result.project.id,
        name: result.project.name,
        schema_name: result.project.schema_name,
      },
    };
  } catch (err: any) {
    if (err?.code === '23503' || err?.code === '2BP01') {
      return reply.code(409).send({
        error: 'Não foi possível excluir o projeto porque existem dependências vinculadas a ele.',
      });
    }
    return reply.code(500).send({ error: err.message || 'Erro ao excluir projeto' });
  }
});

// Listar usuários
app.get('/users', async () => {
  const users = await sql`
    SELECT id, email, name, role, email_confirmed, active, blocked, created_at
    FROM livre_auth.users ORDER BY created_at DESC
  `;
  return { users };
});

// Bloquear usuário
app.patch('/users/:id/block', async (request: any, reply) => {
  const { id } = request.params;
  const [user] = await sql`
    UPDATE livre_auth.users SET blocked = TRUE, blocked_at = NOW()
    WHERE id = ${id} RETURNING id, email, name, blocked
  `;
  if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
  return { user };
});

// Desbloquear usuário
app.patch('/users/:id/unblock', async (request: any, reply) => {
  const { id } = request.params;
  const [user] = await sql`
    UPDATE livre_auth.users SET blocked = FALSE, blocked_at = NULL, blocked_reason = NULL
    WHERE id = ${id} RETURNING id, email, name, blocked
  `;
  if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
  await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE user_id = ${id}`;
  return { user };
});

// Listar permissões
app.get('/project-users', async () => {
  const projectUsers = await sql`
    SELECT pu.*, u.name as user_name, p.name as project_name
    FROM livre_auth.project_users pu
    JOIN livre_auth.users u ON u.id = pu.user_id
    JOIN livre_auth.projects p ON p.id = pu.project_id
    ORDER BY pu.created_at DESC
  `;
  return { projectUsers };
});

// ============================================================
// DATA EXPLORER (introspecção de schema + linhas reais)
// ============================================================
const qident = (id: string) => '"' + String(id).replace(/"/g, '""') + '"';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HIDDEN_COLUMNS = new Set([
  'password_hash',
  'email_confirmed',
  'token_version',
  'refresh_token',
  'refresh_token_hash',
  'email_token',
]);

type ProjectContext = { projectId: string; schema: string };

/** Busca o projeto ativo a partir do header X-Project-Id. */
async function getProjectById(projectId: unknown) {
  const id = Array.isArray(projectId) ? projectId[0] : projectId;
  if (!id || !UUID_RE.test(String(id))) return null;
  const [project] = (await sql`
    SELECT id, name, slug, schema_name
    FROM livre_auth.projects
    WHERE id = ${String(id)}
    LIMIT 1
  `) as any[];
  if (!project || !project.schema_name) return null;
  return project;
}

/**
 * Resolve o projeto da requisição. Sem projeto selecionado, responde 400
 * (os endpoints de dados nunca usam o schema global por engano).
 */
async function requireProject(request: any, reply: any): Promise<ProjectContext | null> {
  const project = await getProjectById(request.headers['x-project-id']);
  if (!project) {
    reply.code(400).send({
      error: 'Nenhum projeto selecionado. Crie ou selecione um projeto.',
    });
    return null;
  }
  return { projectId: project.id, schema: project.schema_name };
}

async function tableExists(schema: string, table: string) {
  const rows = await sql`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relname = ${table} AND c.relkind = 'r'
  `;
  return rows.length > 0;
}

async function columnNames(schema: string, table: string) {
  const rows = await sql`
    SELECT a.attname AS name
    FROM pg_attribute a
    WHERE a.attrelid = ${`${qident(schema)}.${qident(table)}`}::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `;
  return rows.map((r: any) => r.name as string);
}

// ============================================================
// Campos embutidos (Built-in) e preenchimento automático
// ============================================================

/** Nome de data type/tabela reservado para a tabela nativa de usuários. */
const USERS_TABLE = 'users';

function slugifyValue(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Escolhe um campo de texto para gerar o Slug automaticamente. */
function pickSlugSeed(body: Record<string, any>): string {
  const preferred = ['name', 'nome', 'title', 'titulo', 'label', 'email'];
  for (const key of preferred) {
    if (typeof body[key] === 'string' && body[key].trim()) return body[key];
  }
  for (const key of Object.keys(body)) {
    if (
      ['id', 'created_at', 'updated_at', 'creator', 'slug', 'password', 'password_hash'].includes(key)
    ) {
      continue;
    }
    if (typeof body[key] === 'string' && body[key].trim()) return body[key];
  }
  return '';
}

async function uniqueSlug(schema: string, table: string, seed: string): Promise<string> {
  const base = slugifyValue(seed) || 'item';
  let candidate = base;
  for (let i = 2; i <= 30; i++) {
    const [row] = (await sql.unsafe(
      `SELECT 1 FROM ${qident(schema)}.${qident(table)} WHERE slug = $1 LIMIT 1`,
      [candidate]
    )) as any[];
    if (!row) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/**
 * Normaliza o corpo de um INSERT:
 * - nunca aceita id/password_hash vindos do cliente;
 * - na tabela `users`, transforma `password` em hash scrypt;
 * - preenche `creator` com o usuário do contexto do token;
 * - gera `slug` automaticamente quando não informado.
 */
async function prepareInsert(
  schema: string,
  table: string,
  body: Record<string, any>,
  cols: string[],
  contextUserId?: string | null
): Promise<{ keys: string[]; values: any[]; error?: string }> {
  const data: Record<string, any> = { ...(body || {}) };
  delete data.id;
  delete data.password_hash;

  if (table === USERS_TABLE) {
    const password = typeof data.password === 'string' ? data.password : '';
    delete data.password;
    if (!data.email || !String(data.email).trim()) {
      return { keys: [], values: [], error: 'O campo email é obrigatório' };
    }
    data.email = String(data.email).trim();
    if (password) {
      data.password_hash = hashPassword(password);
    } else {
      return { keys: [], values: [], error: 'O campo password é obrigatório' };
    }
  }

  if (cols.includes('creator') && contextUserId && UUID_RE.test(String(contextUserId))) {
    data.creator = contextUserId;
  } else {
    delete data.creator;
  }

  if (cols.includes('slug') && !String(data.slug || '').trim()) {
    const seed = pickSlugSeed(data);
    if (seed) data.slug = await uniqueSlug(schema, table, seed);
  }

  const keys = Object.keys(data).filter(
    (k) =>
      (cols.includes(k) || k === 'password_hash') &&
      data[k] !== '' &&
      data[k] !== null &&
      data[k] !== undefined
  );
  return { keys, values: keys.map((k) => data[k]) };
}

/**
 * Normaliza o corpo de um UPDATE:
 * - id/created_at/creator são imutáveis;
 * - na tabela `users`, `password` vira password_hash (se informado).
 */
function prepareUpdate(
  table: string,
  body: Record<string, any>,
  cols: string[]
): { keys: string[]; values: any[]; error?: string } {
  const data: Record<string, any> = { ...(body || {}) };
  delete data.id;
  delete data.created_at;
  delete data.creator;
  delete data.password_hash;

  if (table === USERS_TABLE) {
    const password = typeof data.password === 'string' ? data.password : '';
    delete data.password;
    if (password) data.password_hash = hashPassword(password);
    if (data.email !== undefined && !String(data.email).trim()) {
      return { keys: [], values: [], error: 'O campo email não pode ficar vazio' };
    }
    if (data.email !== undefined) data.email = String(data.email).trim();
  }

  const keys = Object.keys(data).filter(
    (k) =>
      (cols.includes(k) || k === 'password_hash') &&
      data[k] !== undefined &&
      data[k] !== ''
  );
  return { keys, values: keys.map((k) => data[k]) };
}


// Lista os data types (tabelas) do projeto ativo com contagem real de registros
app.get('/schema', async (request: any) => {
  const project = await getProjectById(request.headers['x-project-id']);
  if (!project) {
    return { tables: [], project: null };
  }
  const schema = project.schema_name as string;

  const tables = (await sql`
    SELECT c.relname AS name,
      (SELECT count(*)::int FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relkind = 'r'
    ORDER BY c.relname
  `) as any[];

  const result: any[] = [];
  for (const t of tables) {
    let entries = 0;
    try {
      const [count] = await sql.unsafe(
        `SELECT count(*)::int AS count FROM ${qident(schema)}.${qident(t.name)}`
      );
      entries = count.count;
    } catch {
      entries = 0;
    }
    result.push({ name: t.name, columns: t.columns, entries });
  }
  return {
    tables: result,
    project: { id: project.id, name: project.name, slug: project.slug },
  };
});

// Colunas de um data type
app.get('/schema/:table/columns', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const columns = (await sql`
    SELECT a.attname AS name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull AS required,
      pg_get_expr(d.adbin, d.adrelid) AS default_value,
      col_description(a.attrelid, a.attnum) AS comment,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = a.attrelid AND con.contype = 'p'
          AND a.attnum = ANY(con.conkey)
      ) AS primary,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = a.attrelid AND con.contype = 'u'
          AND a.attnum = ANY(con.conkey)
      ) AS unique,
      (
        SELECT n2.nspname || '.' || c2.relname
        FROM pg_constraint con
        JOIN pg_class c2 ON c2.oid = con.confrelid
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE con.conrelid = a.attrelid AND con.contype = 'f'
          AND a.attnum = ANY(con.conkey)
        LIMIT 1
      ) AS references
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = ${`${qident(ctx.schema)}.${qident(table)}`}::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `) as any[];

  // O tipo lógico (ex.: "file") é persistido no comentário da coluna,
  // pois o Postgres armazena arquivos como "text".
  const withLogical = columns.map((c) => {
    const match = /^livre_type:([a-z_]+)$/.exec(String(c.comment || ''));
    return { ...c, logical_type: match ? match[1] : null };
  });

  return { columns: withLogical.filter((c) => !HIDDEN_COLUMNS.has(c.name)) };
});

// Linhas de um data type (com busca e paginação)
app.get('/data/:table', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const limit = Math.min(Math.max(parseInt(request.query.limit || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);
  const search = String(request.query.search || '').trim();
  const column = request.query.column ? String(request.query.column) : '';

  const allCols = await columnNames(ctx.schema, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n));
  if (!cols.length) return { rows: [], total: 0, columns: [], limit, offset };

  const params: any[] = [];
  let where = '';
  if (search) {
    const target = column && cols.includes(column) ? [column] : cols;
    where = 'WHERE ' + target.map((n) => `${qident(n)}::text ILIKE $1`).join(' OR ');
    params.push('%' + search + '%');
  }

  const select = cols.map(qident).join(', ');
  const orderCol = allCols.includes('id') ? qident('id') : qident(cols[0]);

  try {
    const rows = await sql.unsafe(
      `SELECT ${select} FROM ${qident(ctx.schema)}.${qident(table)} ${where} ORDER BY ${orderCol} DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [countRow] = await sql.unsafe(
      `SELECT count(*)::int AS count FROM ${qident(ctx.schema)}.${qident(table)} ${where}`,
      params
    );
    return { rows, total: countRow.count, columns: cols, limit, offset };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Inserir registro
app.post('/data/:table', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const body = request.body || {};
  const allCols = await columnNames(ctx.schema, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n));
  const prepared = await prepareInsert(ctx.schema, table, body, cols);
  if (prepared.error) return reply.code(400).send({ error: prepared.error });
  const keys = prepared.keys;
  if (!keys.length) return reply.code(400).send({ error: 'Nenhum campo válido informado' });

  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = prepared.values;
  const returning = cols.map(qident).join(', ');

  try {
    const [row] = await sql.unsafe(
      `INSERT INTO ${qident(ctx.schema)}.${qident(table)} (${keys.map(qident).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${returning}`,
      values
    );
    return { row };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Atualizar registro
app.patch('/data/:table/:id', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table, id } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const body = request.body || {};
  const allCols = await columnNames(ctx.schema, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n) && n !== 'id');
  const prepared = prepareUpdate(table, body, cols);
  if (prepared.error) return reply.code(400).send({ error: prepared.error });
  const keys = prepared.keys;
  if (!keys.length) return reply.code(400).send({ error: 'Nenhum campo válido informado' });

  const sets = keys.map((k, i) => `${qident(k)} = $${i + 1}`);
  if (allCols.includes('updated_at') && !keys.includes('updated_at')) {
    sets.push(`${qident('updated_at')} = NOW()`);
  }
  const values = prepared.values;
  values.push(id);
  const returning = cols.map(qident).join(', ');

  try {
    const [row] = await sql.unsafe(
      `UPDATE ${qident(ctx.schema)}.${qident(table)} SET ${sets.join(', ')} WHERE id::text = $${values.length} RETURNING ${returning}`,
      values
    );
    if (!row) return reply.code(404).send({ error: 'Registro não encontrado' });
    return { row };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Excluir registros
app.delete('/data/:table', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const ids = request.body?.ids;
  if (!Array.isArray(ids) || !ids.length) {
    return reply.code(400).send({ error: 'Nenhum registro selecionado' });
  }

  try {
    const deleted = await sql.unsafe(
      `DELETE FROM ${qident(ctx.schema)}.${qident(table)} WHERE id::text = ANY($1::text[]) RETURNING id`,
      [ids.map(String)]
    );
    return { deleted: deleted.length };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Criar novo data type (tabela)
app.post('/schema', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { name } = request.body || {};
  if (!/^[a-z_][a-z0-9_]*$/i.test(name || '')) {
    return reply.code(400).send({ error: 'Nome do data type inválido' });
  }
  if (String(name).toLowerCase() === USERS_TABLE) {
    return reply.code(409).send({ error: 'O data type User já existe e é nativo do projeto' });
  }
  if (await tableExists(ctx.schema, name)) {
    return reply.code(409).send({ error: 'Já existe um data type com esse nome' });
  }

  try {
    // Toda tabela nasce com os campos embutidos do Bubble.
    await sql.unsafe(`CREATE TABLE ${qident(ctx.schema)}.${qident(name)} (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW(),
      creator uuid REFERENCES ${qident(ctx.schema)}.${qident(USERS_TABLE)}(id) ON DELETE SET NULL,
      slug text
    )`);
    return { ok: true, name };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Excluir um data type (tabela) do projeto
app.delete('/schema/:table', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;

  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Data type não encontrado' });
  }
  if (table === USERS_TABLE) {
    return reply
      .code(400)
      .send({ error: 'O data type User é nativo do projeto e não pode ser excluído' });
  }

  // Não excluir tabelas que são referenciadas por outras (evita perda de dados).
  const dependents = (await sql`
    SELECT src.relname AS source_table
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace sn ON sn.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
    WHERE c.contype = 'f'
      AND tn.nspname = ${ctx.schema}
      AND tgt.relname = ${table}
      AND src.relname <> ${table}
  `) as any[];

  if (dependents.length) {
    const names = [...new Set(dependents.map((d) => d.source_table))].join(', ');
    return reply.code(409).send({
      error: `Este data type é referenciado por: ${names}. Remova os campos de referência antes de excluí-lo.`,
    });
  }

  try {
    await sql.unsafe(`DROP TABLE ${qident(ctx.schema)}.${qident(table)}`);

    // Limpa metadados vinculados ao data type neste projeto.
    await sql`
      DELETE FROM livre_auth.rls_rules
      WHERE project_id = ${ctx.projectId} AND table_name = ${table}
    `;
    await sql`
      DELETE FROM livre_auth.project_api_exposed_tables
      WHERE project_id = ${ctx.projectId} AND table_name = ${table}
    `;

    return { ok: true, deleted: table };
  } catch (err: any) {
    if (err?.code === '2BP01') {
      return reply.code(409).send({
        error:
          'Este data type é usado por outro objeto (view, chave estrangeira, etc.). Remova a dependência antes.',
      });
    }
    return reply.code(400).send({ error: err.message });
  }
});

// Adicionar campo (coluna) a um data type
app.post('/schema/:table/columns', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const { name, type, required, unique, references } = request.body || {};
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name || '')) {
    return reply.code(400).send({ error: 'Nome de campo inválido' });
  }
  const reserved = table === USERS_TABLE ? USER_BUILTIN_FIELDS : BUILTIN_FIELDS;
  if (reserved.has(String(name))) {
    return reply
      .code(409)
      .send({ error: 'Este nome é reservado para um campo embutido (Built-in field)' });
  }

  // Se o usuário escolheu referenciar outra tabela (ex.: campo do tipo "User")
  const refTable = typeof references === 'string' && references.trim()
    ? references.trim()
    : null;

  if (refTable) {
    // Valida se a tabela referenciada existe no schema do projeto
    if (!(await tableExists(ctx.schema, refTable))) {
      return reply.code(400).send({ error: `Tabela "${refTable}" não encontrada` });
    }
    if (refTable === table) {
      return reply.code(400).send({ error: 'Uma tabela não pode referenciar a si mesma' });
    }

    try {
      // Cria coluna UUID com FK para a tabela referenciada
      const ddl = `ALTER TABLE ${qident(ctx.schema)}.${qident(table)}
        ADD COLUMN ${qident(name)} uuid
        REFERENCES ${qident(ctx.schema)}.${qident(refTable)}(id) ON DELETE SET NULL`;
      await sql.unsafe(ddl);

      // Índice para performance em joins
      await sql.unsafe(
        `CREATE INDEX IF NOT EXISTS "${table}_${name}_idx"
         ON ${qident(ctx.schema)}.${qident(table)}(${qident(name)})`
      );

      // Comentário: guarda o tipo lógico como o nome da tabela referenciada
      await sql.unsafe(
        `COMMENT ON COLUMN ${qident(ctx.schema)}.${qident(table)}.${qident(name)}
         IS 'livre_type:${refTable}'`
      ).catch(() => {});

      return { ok: true, references: refTable };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  const typeMap: Record<string, string> = {
    text: 'text',
    number: 'numeric',
    boolean: 'boolean',
    date: 'timestamptz',
    timestamp: 'timestamptz',
    json: 'jsonb',
    uuid: 'uuid',
    file: 'text',
  };
  const pgType = typeMap[String(type || '').toLowerCase()];
  if (!pgType) return reply.code(400).send({ error: 'Tipo de campo inválido' });

  let ddl = `ALTER TABLE ${qident(ctx.schema)}.${qident(table)} ADD COLUMN ${qident(name)} ${pgType}`;
  if (required) ddl += ' NOT NULL';
  if (unique) ddl += ' UNIQUE';

  const logical = String(type || '').toLowerCase();

  try {
    await sql.unsafe(ddl);
    // Persiste o tipo lógico (ex.: "file") no comentário da coluna,
    // pois o Postgres armazena arquivos como "text".
    try {
      await sql.unsafe(
        `COMMENT ON COLUMN ${qident(ctx.schema)}.${qident(table)}.${qident(name)} IS 'livre_type:${logical}'`
      );
    } catch {
      /* comentário é opcional */
    }
    return { ok: true };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Atualiza o tipo lógico de um campo existente (ex.: marcar um "text" como "file")
app.patch('/schema/:table/columns/:column', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table, column } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const cols = await columnNames(ctx.schema, table);
  if (!cols.includes(column)) {
    return reply.code(404).send({ error: 'Campo não encontrado' });
  }

  const reserved = table === USERS_TABLE ? USER_BUILTIN_FIELDS : BUILTIN_FIELDS;
  if (reserved.has(column)) {
    return reply
      .code(400)
      .send({ error: 'Campos embutidos (Built-in) não podem ter o tipo alterado' });
  }

  const logical = String(request.body?.logical_type || '').toLowerCase();
  const allowed = ['text', 'number', 'boolean', 'date', 'timestamp', 'json', 'uuid', 'file'];
  if (!allowed.includes(logical)) {
    return reply.code(400).send({ error: 'Tipo lógico inválido' });
  }

  try {
    await sql.unsafe(
      `COMMENT ON COLUMN ${qident(ctx.schema)}.${qident(table)}.${qident(column)} IS 'livre_type:${logical}'`
    );
    return { ok: true, logical_type: logical };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Remover campo (coluna) de um data type
app.delete('/schema/:table/columns/:column', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table, column } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const cols = await columnNames(ctx.schema, table);
  if (!cols.includes(column)) {
    return reply.code(404).send({ error: 'Campo não encontrado' });
  }

  const reserved = table === USERS_TABLE ? USER_BUILTIN_FIELDS : BUILTIN_FIELDS;
  if (reserved.has(column)) {
    return reply
      .code(400)
      .send({ error: 'Campos embutidos (Built-in) não podem ser removidos' });
  }

  // Não permitir remover a chave primária (nem a coluna "id").
  const [info] = (await sql`
    SELECT a.attname AS name,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = a.attrelid AND con.contype = 'p'
          AND a.attnum = ANY(con.conkey)
      ) AS primary
    FROM pg_attribute a
    WHERE a.attrelid = ${`${qident(ctx.schema)}.${qident(table)}`}::regclass
      AND a.attname = ${column}
      AND a.attnum > 0 AND NOT a.attisdropped
  `) as any[];

  if (!info) return reply.code(404).send({ error: 'Campo não encontrado' });
  if (info.primary || column === 'id') {
    return reply.code(400).send({ error: 'Não é possível remover a chave primária' });
  }

  try {
    // Sem CASCADE: se houver dependências (views, FKs), o Postgres recusa
    // e devolvemos a mensagem, evitando apagar objetos por engano.
    await sql.unsafe(
      `ALTER TABLE ${qident(ctx.schema)}.${qident(table)} DROP COLUMN ${qident(column)}`
    );
    return { ok: true };
  } catch (err: any) {
    if (err?.code === '2BP01') {
      return reply.code(409).send({
        error:
          'Este campo é usado por outro objeto (view, chave estrangeira, etc.). Remova a dependência antes.',
      });
    }
    return reply.code(400).send({ error: err.message });
  }
});

// ============================================================
// OPTION SETS (por projeto)
// ============================================================
async function optionSetOwned(projectId: string, id: string) {
  const [row] = (await sql`
    SELECT 1 FROM livre_auth.option_sets
    WHERE id = ${id} AND project_id = ${projectId} LIMIT 1
  `) as any[];
  return !!row;
}

app.get('/option-sets', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;

  const sets = (await sql`
    SELECT id, name, label, description, created_at, updated_at
    FROM livre_auth.option_sets
    WHERE project_id = ${ctx.projectId}
    ORDER BY name
  `) as any[];

  const options = (await sql`
    SELECT o.id, o.option_set_id, o.display, o.sort_order, o.metadata
    FROM livre_auth.option_set_options o
    JOIN livre_auth.option_sets s ON s.id = o.option_set_id
    WHERE s.project_id = ${ctx.projectId}
    ORDER BY o.sort_order, o.created_at
  `) as any[];

  const bySet = new Map<string, any[]>();
  for (const option of options) {
    const list = bySet.get(option.option_set_id) || [];
    list.push(option);
    bySet.set(option.option_set_id, list);
  }

  return {
    optionSets: sets.map((set) => ({ ...set, options: bySet.get(set.id) || [] })),
  };
});

app.post('/option-sets', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const name = String(request.body?.name || '').trim();
  const label = request.body?.label ? String(request.body.label).trim() : null;

  if (!name || name.length > 120) {
    return reply.code(400).send({ error: 'Nome do option set inválido' });
  }

  try {
    const [optionSet] = await sql`
      INSERT INTO livre_auth.option_sets (project_id, name, label)
      VALUES (${ctx.projectId}, ${name}, ${label})
      RETURNING id, name, label, description, created_at, updated_at
    `;
    return { optionSet: { ...optionSet, options: [] } };
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Já existe um option set com esse nome' });
    }
    return reply.code(400).send({ error: err.message });
  }
});

app.patch('/option-sets/:id', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { id } = request.params;
  const body = request.body || {};
  const sets: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 120) {
      return reply.code(400).send({ error: 'Nome do option set inválido' });
    }
    values.push(name);
    sets.push(`name = $${values.length}`);
  }
  if (body.label !== undefined) {
    values.push(body.label === null ? null : String(body.label));
    sets.push(`label = $${values.length}`);
  }
  if (body.description !== undefined) {
    values.push(body.description === null ? null : String(body.description));
    sets.push(`description = $${values.length}`);
  }
  if (!sets.length) {
    return reply.code(400).send({ error: 'Nenhum campo válido informado' });
  }

  values.push(id, ctx.projectId);
  try {
    const [optionSet] = await sql.unsafe(
      `UPDATE livre_auth.option_sets
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND project_id = $${values.length}
       RETURNING id, name, label, description, created_at, updated_at`,
      values
    );
    if (!optionSet) return reply.code(404).send({ error: 'Option set não encontrado' });
    return { optionSet };
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Já existe um option set com esse nome' });
    }
    return reply.code(400).send({ error: err.message });
  }
});

app.delete('/option-sets/:id', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const [row] = await sql`
    DELETE FROM livre_auth.option_sets
    WHERE id = ${request.params.id} AND project_id = ${ctx.projectId}
    RETURNING id
  `;
  if (!row) return reply.code(404).send({ error: 'Option set não encontrado' });
  return { ok: true };
});

app.post('/option-sets/:id/options', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { id } = request.params;
  const display = String(request.body?.display || '').trim();
  const metadata = request.body?.metadata ?? {};

  if (!display) {
    return reply.code(400).send({ error: 'O texto da opção é obrigatório' });
  }

  try {
    const [option] = await sql`
      INSERT INTO livre_auth.option_set_options (option_set_id, display, sort_order, metadata)
      SELECT
        ${id}::uuid,
        ${display},
        COALESCE((
          SELECT MAX(sort_order) + 1
          FROM livre_auth.option_set_options
          WHERE option_set_id = ${id}::uuid
        ), 0),
        ${JSON.stringify(metadata)}::jsonb
      WHERE EXISTS (
        SELECT 1 FROM livre_auth.option_sets
        WHERE id = ${id}::uuid AND project_id = ${ctx.projectId}
      )
      RETURNING id, option_set_id, display, sort_order, metadata
    `;
    if (!option) return reply.code(404).send({ error: 'Option set não encontrado' });
    return { option };
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Já existe uma opção com esse texto' });
    }
    return reply.code(400).send({ error: err.message });
  }
});

app.patch('/option-sets/:id/options/:optionId', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { id, optionId } = request.params;
  if (!(await optionSetOwned(ctx.projectId, id))) {
    return reply.code(404).send({ error: 'Option set não encontrado' });
  }
  const body = request.body || {};
  const sets: string[] = [];
  const values: any[] = [];

  if (body.display !== undefined) {
    const display = String(body.display).trim();
    if (!display) return reply.code(400).send({ error: 'O texto da opção é obrigatório' });
    values.push(display);
    sets.push(`display = $${values.length}`);
  }
  if (body.metadata !== undefined) {
    values.push(JSON.stringify(body.metadata));
    sets.push(`metadata = $${values.length}::jsonb`);
  }
  if (!sets.length) {
    return reply.code(400).send({ error: 'Nenhum campo válido informado' });
  }

  values.push(optionId, id);
  try {
    const [option] = await sql.unsafe(
      `UPDATE livre_auth.option_set_options
         SET ${sets.join(', ')}
       WHERE id = $${values.length - 1} AND option_set_id = $${values.length}
       RETURNING id, option_set_id, display, sort_order, metadata`,
      values
    );
    if (!option) return reply.code(404).send({ error: 'Opção não encontrada' });
    return { option };
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Já existe uma opção com esse texto' });
    }
    return reply.code(400).send({ error: err.message });
  }
});

app.delete('/option-sets/:id/options/:optionId', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { id, optionId } = request.params;
  if (!(await optionSetOwned(ctx.projectId, id))) {
    return reply.code(404).send({ error: 'Option set não encontrado' });
  }
  const [row] = await sql`
    DELETE FROM livre_auth.option_set_options
    WHERE id = ${optionId} AND option_set_id = ${id}
    RETURNING id
  `;
  if (!row) return reply.code(404).send({ error: 'Opção não encontrada' });
  return { ok: true };
});

// ============================================================
// FILE MANAGER (MinIO + metadados no Postgres)
// ============================================================

app.get('/files', async (request: any, reply: any) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const limit = Math.min(Math.max(parseInt(request.query.limit || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);
  const search = String(request.query.search || '').trim();
  const exact = String(request.query.exact || '') === 'true';
  const type = String(request.query.type || 'all');
  const privateOnly =
    String(request.query.private || '') === 'true' ||
    String(request.query.onlyPrivate || '') === 'true';

  const params: any[] = [ctx.projectId];
  const where: string[] = ['project_id = $1'];

  if (search) {
    params.push(exact ? search : '%' + search + '%');
    where.push(`file_name ${exact ? '=' : 'ILIKE'} $${params.length}`);
  }

  if (type === 'image') where.push(`mime_type LIKE 'image/%'`);
  else if (type === 'pdf') where.push(`mime_type = 'application/pdf'`);
  else if (type === 'text') where.push(`(mime_type LIKE 'text/%' OR mime_type = 'application/json')`);
  else if (type && type !== 'all') {
    params.push('%' + type + '%');
    where.push(`mime_type ILIKE $${params.length}`);
  }

  if (privateOnly) where.push(`is_private = TRUE`);

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const files = await sql.unsafe(
      `SELECT id, file_name, mime_type, size_bytes, status, is_private,
              attached_table, attached_id, uploaded_by, created_at
         FROM livre_auth.files
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [count] = await sql.unsafe(
      `SELECT count(*)::int AS count FROM livre_auth.files ${whereSql}`,
      params
    );
    return { files, total: count.count, limit, offset };
  } catch (err: any) {
    return { files: [], total: 0, limit, offset, error: err.message };
  }
});

app.post('/files', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  let data: any;
  try {
    data = await request.file();
  } catch (err: any) {
    return reply.code(400).send({ error: err.message || 'Upload inválido' });
  }
  if (!data) return reply.code(400).send({ error: 'Arquivo não enviado' });

  if (!isAllowedMime(data.mimetype)) {
    return reply.code(415).send({
      error: `Tipo de arquivo não permitido (${data.mimetype || 'desconhecido'})`,
    });
  }

  let buffer: Buffer;
  try {
    buffer = await data.toBuffer();
  } catch {
    return reply.code(413).send({
      error: `Arquivo excede o limite de ${MAX_UPLOAD_MB}MB`,
    });
  }
  if (data.file?.truncated) {
    return reply.code(413).send({
      error: `Arquivo excede o limite de ${MAX_UPLOAD_MB}MB`,
    });
  }

  const original = String(data.filename || 'arquivo');
  const safe = original
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(-120) || 'arquivo';
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}-${safe}`;

  const field = (name: string) => {
    const value = data.fields?.[name];
    if (!value) return null;
    return Array.isArray(value) ? value[0]?.value ?? null : (value as any).value ?? null;
  };

  const isPrivate = String(field('is_private') || 'true') !== 'false';
  const attachedTable = field('attached_table');
  const attachedIdRaw = field('attached_id');
  const attachedId = attachedIdRaw && UUID_RE.test(attachedIdRaw) ? attachedIdRaw : null;
  const uploadedByRaw = (request as any).user?.sub;
  const uploadedBy = uploadedByRaw && UUID_RE.test(uploadedByRaw) ? uploadedByRaw : null;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: data.mimetype,
        ContentLength: buffer.length,
      })
    );
  } catch (err: any) {
    return reply.code(502).send({ error: `Falha ao gravar no storage: ${err.message}` });
  }

  try {
    const [file] = await sql`
      INSERT INTO livre_auth.files (
        project_id, bucket, object_key, file_name, mime_type, size_bytes,
        status, is_private, uploaded_by, attached_table, attached_id
      ) VALUES (
        ${ctx.projectId}, ${BUCKET}, ${key}, ${original}, ${data.mimetype}, ${buffer.length},
        'ready', ${isPrivate}, ${uploadedBy}::uuid, ${attachedTable}, ${attachedId}::uuid
      )
      RETURNING id, file_name, mime_type, size_bytes, status, is_private,
                attached_table, attached_id, uploaded_by, created_at
    `;
    return { file };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.get('/files/:id/download', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const [file] = await sql`
    SELECT id, bucket, object_key, file_name, mime_type
    FROM livre_auth.files
    WHERE id = ${request.params.id} AND project_id = ${ctx.projectId}
  `;
  if (!file) return reply.code(404).send({ error: 'Arquivo não encontrado' });

  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: file.bucket, Key: file.object_key })
    );
    reply.header('Content-Type', file.mime_type || 'application/octet-stream');
    reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
    );
    return reply.send(object.Body as any);
  } catch (err: any) {
    return reply.code(502).send({ error: `Falha ao ler do storage: ${err.message}` });
  }
});

// Link público de arquivo (UUID não adivinhável).
// Usado pelo botão "Copiar link" do File manager e para exibir imagens
// diretamente em <img src="...">.
app.get('/public/files/:id', async (request: any, reply) => {
  const [file] = (await sql`
    SELECT bucket, object_key, file_name, mime_type
    FROM livre_auth.files
    WHERE id::text = ${request.params.id}
      AND status = 'ready'
      AND is_private = false
    LIMIT 1
  `) as any[];
  if (!file) return reply.code(404).send({ error: 'Arquivo não encontrado' });

  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: file.bucket, Key: file.object_key })
    );
    reply.header('Content-Type', file.mime_type || 'application/octet-stream');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
    );
    return reply.send(object.Body as any);
  } catch (err: any) {
    return reply.code(502).send({ error: `Falha ao ler do storage: ${err.message}` });
  }
});

app.delete('/files', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const ids = request.body?.ids;
  if (!Array.isArray(ids) || !ids.length) {
    return reply.code(400).send({ error: 'Nenhum arquivo selecionado' });
  }

  const idList = ids.map(String);
  const rows = (await sql.unsafe(
    `SELECT id, bucket, object_key FROM livre_auth.files
     WHERE id::text = ANY($1::text[]) AND project_id = $2`,
    [idList, ctx.projectId]
  )) as any[];

  for (const row of rows) {
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: row.bucket, Key: row.object_key })
      );
    } catch {
      /* Metadados são removidos mesmo se o objeto já não existir. */
    }
  }

  const removed = await sql.unsafe(
    `DELETE FROM livre_auth.files
     WHERE id::text = ANY($1::text[]) AND project_id = $2 RETURNING id`,
    [idList, ctx.projectId]
  );
  return { deleted: removed.length };
});

// Alternar visibilidade pública/privada de um arquivo
app.patch('/files/:id/visibility', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { id } = request.params;
  if (!id || !UUID_RE.test(id)) {
    return reply.code(400).send({ error: 'ID de arquivo inválido' });
  }

  const [current] = await sql`
    SELECT id, is_private FROM livre_auth.files
    WHERE id = ${id} AND project_id = ${ctx.projectId}
  `;
  if (!current) return reply.code(404).send({ error: 'Arquivo não encontrado' });

  const newValue = !current.is_private;
  const [file] = await sql`
    UPDATE livre_auth.files
    SET is_private = ${newValue}
    WHERE id = ${id} AND project_id = ${ctx.projectId}
    RETURNING id, file_name, is_private
  `;
  return { file };
});

// ============================================================
// API PÚBLICA (Data API + tokens)
// ============================================================
const hashApiToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

async function getApiSettings(projectId: string) {
  await sql`
    INSERT INTO livre_auth.project_api_settings (project_id)
    VALUES (${projectId})
    ON CONFLICT (project_id) DO NOTHING
  `;
  const [settings] = (await sql`
    SELECT * FROM livre_auth.project_api_settings WHERE project_id = ${projectId}
  `) as any[];
  return settings;
}

async function isTableExposed(projectId: string, table: string) {
  const [row] = (await sql`
    SELECT 1 FROM livre_auth.project_api_exposed_tables
    WHERE project_id = ${projectId} AND table_name = ${table}
  `) as any[];
  return !!row;
}

async function authenticateApiToken(request: any) {
  const raw = request.headers['x-api-key'] || request.headers.authorization;
  let token = '';
  if (typeof raw === 'string') {
    token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  }
  if (!token) return null;

  const [row] = (await sql`
    SELECT t.id, t.project_id, t.context_user_id, t.context_tenant_id, p.schema_name
    FROM livre_auth.api_tokens t
    JOIN livre_auth.projects p ON p.id = t.project_id
    WHERE t.token_hash = ${hashApiToken(token)} AND t.revoked = FALSE
      AND t.project_id IS NOT NULL AND p.schema_name IS NOT NULL
    LIMIT 1
  `) as any[];
  if (!row) return null;

  await sql`UPDATE livre_auth.api_tokens SET last_used_at = NOW() WHERE id = ${row.id}`;
  return row;
}

async function requireApiToken(request: any, reply: any) {
  const row = await authenticateApiToken(request);
  if (!row) {
    reply.code(401).send({ error: 'API token inválido ou ausente' });
    return null;
  }
  return row;
}

// ---- RLS: geração de políticas a partir das regras ----
const RLS_OPERATORS = new Set([
  '=', '!=', '>', '<', '>=', '<=', 'contains', 'is_null', 'is_not_null',
]);

function rlsCondition(rule: { field: string; operator: string; value: string | null }): string {
  const f = `${qident(rule.field)}::text`;
  const op = rule.operator;
  const v = rule.value ?? '';

  if (op === 'is_null') return `${qident(rule.field)} IS NULL`;
  if (op === 'is_not_null') return `${qident(rule.field)} IS NOT NULL`;

  // Valores dinâmicos ligados ao contexto do token
  if (v === '{{current_user}}') {
    const ctx = `current_setting('app.current_user_id', true)`;
    if (op === '!=') return `${f} <> ${ctx}`;
    return `${f} = ${ctx}`;
  }
  if (v === '{{current_tenant}}') {
    const ctx = `current_setting('app.current_tenant_id', true)`;
    if (op === '!=') return `${f} <> ${ctx}`;
    return `${f} = ${ctx}`;
  }

  const safe = v.replace(/'/g, "''");
  switch (op) {
    case '=': return `${f} = '${safe}'`;
    case '!=': return `${f} <> '${safe}'`;
    case '>': return `${qident(rule.field)} > '${safe}'`;
    case '<': return `${qident(rule.field)} < '${safe}'`;
    case '>=': return `${qident(rule.field)} >= '${safe}'`;
    case '<=': return `${qident(rule.field)} <= '${safe}'`;
    case 'contains': return `${f} ILIKE '%${safe}%'`;
    default: return 'TRUE';
  }
}

async function grantTableToAuthenticated(schema: string, table: string) {
  await sql.unsafe(`GRANT USAGE ON SCHEMA ${qident(schema)} TO authenticated`);
  await sql.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${qident(schema)}.${qident(table)} TO authenticated`
  );
}

// Aplica as regras de uma tabela como politicas RLS reais.
async function applyRlsPolicies(ctx: ProjectContext, table: string) {
  // Remove politicas antigas da tabela
  const policies = (await sql`
    SELECT policyname FROM pg_policies
    WHERE schemaname = ${ctx.schema} AND tablename = ${table}
  `) as any[];
  for (const p of policies) {
    await sql.unsafe(
      `DROP POLICY IF EXISTS ${qident(p.policyname)} ON ${qident(ctx.schema)}.${qident(table)}`
    );
  }

  const rules = (await sql`
    SELECT field, operator, value FROM livre_auth.rls_rules
    WHERE project_id = ${ctx.projectId} AND table_name = ${table}
    ORDER BY created_at
  `) as any[];

  if (!rules.length) {
    // Sem regras = publicamente visivel (RLS desligado)
    await sql.unsafe(
      `ALTER TABLE ${qident(ctx.schema)}.${qident(table)} DISABLE ROW LEVEL SECURITY`
    );
    await grantTableToAuthenticated(ctx.schema, table);
    return { rls_enabled: false, rules: 0 };
  }

  const cond = rules.map(rlsCondition).join(' AND ');
  await grantTableToAuthenticated(ctx.schema, table);
  await sql.unsafe(`ALTER TABLE ${qident(ctx.schema)}.${qident(table)} ENABLE ROW LEVEL SECURITY`);
  await sql.unsafe(
    `CREATE POLICY livre_rls ON ${qident(ctx.schema)}.${qident(table)}
       FOR ALL TO authenticated USING (${cond}) WITH CHECK (${cond})`
  );
  return { rls_enabled: true, rules: rules.length };
}

// Executa uma query com o contexto do token e o role 'authenticated'
// (nao-superusuario), para que o RLS seja realmente aplicado.
async function withRlsContext(
  tokenRow: { context_user_id?: string | null; context_tenant_id?: string | null },
  fn: (tx: any) => Promise<any>
): Promise<any> {
  const result = await sql.begin(async (tx: any) => {
    await tx`SET LOCAL ROLE authenticated`;
    if (tokenRow.context_user_id) {
      await tx`SELECT set_config('app.current_user_id', ${tokenRow.context_user_id}, true)`;
    }
    if (tokenRow.context_tenant_id) {
      await tx`SELECT set_config('app.current_tenant_id', ${tokenRow.context_tenant_id}, true)`;
    }
    return fn(tx);
  });
  return result;
}

async function requirePublicTable(
  tokenRow: { project_id: string; schema_name: string },
  table: string,
  reply: any
): Promise<boolean> {
  const settings = await getApiSettings(tokenRow.project_id);
  if (!settings?.data_api_enabled) {
    reply.code(403).send({ error: 'Data API desabilitada' });
    return false;
  }
  if (!(await tableExists(tokenRow.schema_name, table))) {
    reply.code(404).send({ error: 'Tabela não encontrada' });
    return false;
  }
  if (!(await isTableExposed(tokenRow.project_id, table))) {
    reply.code(403).send({ error: 'Tabela não exposta na API' });
    return false;
  }
  return true;
}

// ---- Configurações (admin) ----
app.get('/api-settings', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const settings = await getApiSettings(ctx.projectId);
  const exposed = (await sql`
    SELECT table_name FROM livre_auth.project_api_exposed_tables
    WHERE project_id = ${ctx.projectId} ORDER BY table_name
  `) as any[];
  const tokens = (await sql`
    SELECT id, name, token_prefix, created_at, last_used_at, revoked,
           context_user_id, context_tenant_id
    FROM livre_auth.api_tokens
    WHERE project_id = ${ctx.projectId}
    ORDER BY created_at DESC
  `) as any[];
  return {
    settings,
    exposedTables: exposed.map((e) => e.table_name),
    tokens,
  };
});

app.patch('/api-settings', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  await getApiSettings(ctx.projectId); // garante a linha do projeto
  const body = request.body || {};
  const allowed = [
    'data_api_enabled',
    'workflow_api_enabled',
    'workflow_root_url',
    'use_display_instead_of_id',
    'hide_swagger',
  ];
  const sets: string[] = [];
  const values: any[] = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      values.push(body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (!sets.length) return reply.code(400).send({ error: 'Nada para atualizar' });

  values.push(ctx.projectId);
  const [settings] = (await sql.unsafe(
    `UPDATE livre_auth.project_api_settings
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE project_id = $${values.length} RETURNING *`,
    values
  )) as any[];
  return { settings };
});

app.put('/api-settings/tables', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const requested = Array.isArray(request.body?.tables) ? request.body.tables : [];
  const valid: string[] = [];
  for (const t of requested) {
    if (typeof t === 'string' && (await tableExists(ctx.schema, t))) valid.push(t);
  }

  await sql`DELETE FROM livre_auth.project_api_exposed_tables
            WHERE project_id = ${ctx.projectId}`;
  for (const t of valid) {
    await sql`
      INSERT INTO livre_auth.project_api_exposed_tables (project_id, table_name)
      VALUES (${ctx.projectId}, ${t}) ON CONFLICT DO NOTHING
    `;
    // Garante permissao ao role da API e aplica as regras RLS existentes.
    await applyRlsPolicies(ctx, t);
  }
  return { exposedTables: valid };
});

// ---- RLS (privacidade por linha) ----
app.get('/rls', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const rules = (await sql`
    SELECT id, table_name, field, operator, value, created_at
    FROM livre_auth.rls_rules
    WHERE project_id = ${ctx.projectId}
    ORDER BY table_name, created_at
  `) as any[];

  const rlsState = (await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS enabled
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${ctx.schema} AND c.relkind = 'r'
  `) as any[];

  const enabledMap: Record<string, boolean> = {};
  for (const r of rlsState) enabledMap[r.table_name] = r.enabled;

  return { rules, rlsEnabled: enabledMap };
});

app.post('/rls', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const table = String(request.body?.table_name || '').trim();
  const field = String(request.body?.field || '').trim();
  const operator = String(request.body?.operator || '').trim();
  const value = request.body?.value === undefined || request.body?.value === null
    ? null
    : String(request.body.value);

  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }
  const cols = await columnNames(ctx.schema, table);
  if (!cols.includes(field)) {
    return reply.code(400).send({ error: 'Campo não encontrado' });
  }
  if (!RLS_OPERATORS.has(operator)) {
    return reply.code(400).send({ error: 'Operador inválido' });
  }

  const [rule] = (await sql`
    INSERT INTO livre_auth.rls_rules (project_id, table_name, field, operator, value)
    VALUES (${ctx.projectId}, ${table}, ${field}, ${operator}, ${value})
    RETURNING id, table_name, field, operator, value, created_at
  `) as any[];

  const applied = await applyRlsPolicies(ctx, table);
  return { rule, applied };
});

app.delete('/rls/:id', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const [rule] = (await sql`
    DELETE FROM livre_auth.rls_rules
    WHERE id = ${request.params.id} AND project_id = ${ctx.projectId}
    RETURNING table_name
  `) as any[];
  if (!rule) return reply.code(404).send({ error: 'Regra não encontrada' });
  const applied = await applyRlsPolicies(ctx, rule.table_name);
  return { ok: true, applied };
});

// Torna a tabela publicamente visivel (remove regras e desliga RLS)
app.post('/rls/:table/public', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const { table } = request.params;
  if (!(await tableExists(ctx.schema, table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }
  await sql`DELETE FROM livre_auth.rls_rules
            WHERE project_id = ${ctx.projectId} AND table_name = ${table}`;
  const applied = await applyRlsPolicies(ctx, table);
  return { ok: true, applied };
});

// ---- Tokens (admin) ----
app.post('/api-tokens', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const name = String(request.body?.name || '').trim() || 'API token';
  const token = 'lv_' + randomBytes(24).toString('hex');
  const prefix = token.slice(0, 10) + '…';

  const ctxUser =
    typeof request.body?.context_user_id === 'string' &&
    UUID_RE.test(request.body.context_user_id)
      ? request.body.context_user_id
      : null;
  const ctxTenant =
    typeof request.body?.context_tenant_id === 'string' &&
    UUID_RE.test(request.body.context_tenant_id)
      ? request.body.context_tenant_id
      : null;

  const [apiToken] = (await sql`
    INSERT INTO livre_auth.api_tokens
      (project_id, name, token_prefix, token_hash, context_user_id, context_tenant_id)
    VALUES (${ctx.projectId}, ${name}, ${prefix}, ${hashApiToken(token)}, ${ctxUser}::uuid, ${ctxTenant}::uuid)
    RETURNING id, name, token_prefix, created_at, last_used_at, revoked,
              context_user_id, context_tenant_id
  `) as any[];

  // O token em texto puro só é retornado UMA vez.
  return { token, apiToken };
});

app.delete('/api-tokens/:id', async (request: any, reply) => {
  const ctx = await requireProject(request, reply);
  if (!ctx) return;
  const [row] = (await sql`
    UPDATE livre_auth.api_tokens SET revoked = TRUE
    WHERE id = ${request.params.id} AND project_id = ${ctx.projectId}
    RETURNING id
  `) as any[];
  if (!row) return reply.code(404).send({ error: 'Token não encontrado' });
  return { ok: true };
});

// ---- Autenticação nativa por projeto (/public/auth/:project/...) ----
// O :project aceita o slug ou a public_key do projeto.

async function getProjectByRef(ref: string) {
  const clean = String(ref || '').trim();
  if (!clean) return null;
  if (UUID_RE.test(clean)) {
    const [project] = (await sql`
      SELECT id, name, slug, schema_name, public_key, active
      FROM livre_auth.projects
      WHERE id = ${clean} OR public_key = ${clean}
      LIMIT 1
    `) as any[];
    return project || null;
  }
  const [project] = (await sql`
    SELECT id, name, slug, schema_name, public_key, active
    FROM livre_auth.projects
    WHERE slug = ${clean}
    LIMIT 1
  `) as any[];
  return project || null;
}

function publicUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    slug: row.slug,
    email_confirmed: row.email_confirmed,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function projectUserFromRequest(request: any, projectId: string) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyToken(header.slice(7));
    if (payload.role !== 'project_user' || payload.project_id !== projectId) return null;
    return payload;
  } catch {
    return null;
  }
}

app.post('/public/auth/:project/signup', async (request: any, reply) => {
  const project = await getProjectByRef(request.params.project);
  if (!project?.schema_name) return reply.code(404).send({ error: 'Projeto não encontrado' });

  const email = String(request.body?.email || '').trim();
  const password = String(request.body?.password || '');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply.code(400).send({ error: 'Informe um e-mail válido' });
  }
  if (password.length < 6) {
    return reply.code(400).send({ error: 'A senha deve ter pelo menos 6 caracteres' });
  }

  try {
    const schema = qident(project.schema_name);
    const [existing] = (await sql.unsafe(
      `SELECT 1 FROM ${schema}."${USERS_TABLE}" WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    )) as any[];
    if (existing) {
      return reply.code(409).send({ error: 'Já existe um usuário com este e-mail' });
    }

    const cols = await columnNames(project.schema_name, USERS_TABLE);
    const data: Record<string, any> = {
      email,
      password_hash: hashPassword(password),
    };

    // Campos adicionais permitidos (ex.: campos criados pelo usuário no data type User).
    const extraBlocked = new Set([
      'id', 'email', 'password', 'password_hash', 'created_at', 'updated_at',
      'email_confirmed', 'token_version',
    ]);
    for (const key of Object.keys(request.body || {})) {
      if (extraBlocked.has(key)) continue;
      if (!cols.includes(key)) continue;
      const value = request.body[key];
      if (value !== undefined && value !== null && value !== '') data[key] = value;
    }

    if (!String(data.slug || '').trim()) {
      data.slug = await uniqueSlug(project.schema_name, USERS_TABLE, email.split('@')[0]);
    }

    const keys = Object.keys(data).filter(
      (k) => cols.includes(k) && data[k] !== undefined && data[k] !== ''
    );
    const [user] = (await sql.unsafe(
      `INSERT INTO ${schema}."${USERS_TABLE}" (${keys.map(qident).join(', ')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING id, email, slug, email_confirmed, created_at, updated_at, token_version`,
      keys.map((k) => data[k])
    )) as any[];

    const token = await signToken({
      sub: user.id,
      email: user.email,
      project_id: project.id,
      role: 'project_user',
      type: 'project_user',
      v: user.token_version || 0,
    });
    return { token, user: publicUser(user) };
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Já existe um usuário com este e-mail' });
    }
    return reply.code(400).send({ error: err.message });
  }
});

app.post('/public/auth/:project/login', async (request: any, reply) => {
  const project = await getProjectByRef(request.params.project);
  if (!project?.schema_name) return reply.code(404).send({ error: 'Projeto não encontrado' });

  const email = String(request.body?.email || '').trim();
  const password = String(request.body?.password || '');
  if (!email || !password) {
    return reply.code(400).send({ error: 'Informe e-mail e senha' });
  }

  try {
    const schema = qident(project.schema_name);
    const [user] = (await sql.unsafe(
      `SELECT id, email, password_hash, slug, email_confirmed, created_at, updated_at, token_version
       FROM ${schema}."${USERS_TABLE}" WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    )) as any[];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return reply.code(401).send({ error: 'E-mail ou senha incorretos' });
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      project_id: project.id,
      role: 'project_user',
      type: 'project_user',
      v: user.token_version || 0,
    });
    return { token, user: publicUser(user) };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.get('/public/auth/:project/me', async (request: any, reply) => {
  const project = await getProjectByRef(request.params.project);
  if (!project?.schema_name) return reply.code(404).send({ error: 'Projeto não encontrado' });

  const payload = await projectUserFromRequest(request, project.id);
  if (!payload) return reply.code(401).send({ error: 'Token de usuário inválido ou ausente' });

  try {
    const schema = qident(project.schema_name);
    const [user] = (await sql.unsafe(
      `SELECT id, email, slug, email_confirmed, created_at, updated_at, token_version
       FROM ${schema}."${USERS_TABLE}" WHERE id = $1 LIMIT 1`,
      [payload.sub]
    )) as any[];
    if (!user || (user.token_version || 0) !== (payload.v || 0)) {
      return reply.code(401).send({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return { user: publicUser(user) };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.post('/public/auth/:project/logout', async (request: any, reply) => {
  const project = await getProjectByRef(request.params.project);
  if (!project?.schema_name) return reply.code(404).send({ error: 'Projeto não encontrado' });

  const payload = await projectUserFromRequest(request, project.id);
  if (!payload) return reply.code(401).send({ error: 'Token de usuário inválido ou ausente' });

  try {
    const schema = qident(project.schema_name);
    // Incrementa a versão do token: invalida os tokens emitidos antes do logout.
    await sql.unsafe(
      `UPDATE ${schema}."${USERS_TABLE}"
       SET token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1`,
      [payload.sub]
    );
    return { ok: true };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// ---- Endpoints públicos (exigem token; sujeitos a RLS) ----
app.get('/public/_meta', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const settings = await getApiSettings(tokenRow.project_id);
  const tables = (await sql`
    SELECT table_name FROM livre_auth.project_api_exposed_tables
    WHERE project_id = ${tokenRow.project_id} ORDER BY table_name
  `) as any[];
  return {
    data_api_enabled: settings?.data_api_enabled ?? false,
    workflow_api_enabled: settings?.workflow_api_enabled ?? false,
    tables: tables.map((t) => t.table_name),
  };
});

app.get('/public/:table', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const { table } = request.params;
  if (!(await requirePublicTable(tokenRow, table, reply))) return;

  const limit = Math.min(Math.max(parseInt(request.query.limit || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);
  const search = String(request.query.search || '').trim();

  const allCols = await columnNames(tokenRow.schema_name, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n));
  if (!cols.length) return { data: [], total: 0, limit, offset };

  const params: any[] = [];
  let where = '';
  if (search) {
    where = 'WHERE ' + cols.map((n) => `${qident(n)}::text ILIKE $1`).join(' OR ');
    params.push('%' + search + '%');
  }

  const select = cols.map(qident).join(', ');
  const orderCol = allCols.includes('id') ? qident('id') : qident(cols[0]);
  const qualified = `${qident(tokenRow.schema_name)}.${qident(table)}`;

  try {
    const result = await withRlsContext(tokenRow, async (tx) => {
      const rows = await tx.unsafe(
        `SELECT ${select} FROM ${qualified} ${where}
         ORDER BY ${orderCol} DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      const [countRow] = (await tx.unsafe(
        `SELECT count(*)::int AS count FROM ${qualified} ${where}`,
        params
      )) as any[];
      return { rows, total: countRow.count };
    });
    return { data: result.rows, total: result.total, limit, offset };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.get('/public/:table/:id', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const { table, id } = request.params;
  if (!(await requirePublicTable(tokenRow, table, reply))) return;

  const allCols = await columnNames(tokenRow.schema_name, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n));
  const qualified = `${qident(tokenRow.schema_name)}.${qident(table)}`;
  try {
    const row = await withRlsContext(tokenRow, async (tx) => {
      const [r] = (await tx.unsafe(
        `SELECT ${cols.map(qident).join(', ')} FROM ${qualified}
         WHERE id::text = $1 LIMIT 1`,
        [id]
      )) as any[];
      return r;
    });
    if (!row) return reply.code(404).send({ error: 'Registro não encontrado' });
    return { data: row };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.post('/public/:table', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const { table } = request.params;
  if (!(await requirePublicTable(tokenRow, table, reply))) return;

  const body = request.body || {};
  const allCols = await columnNames(tokenRow.schema_name, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n));
  const prepared = await prepareInsert(
    tokenRow.schema_name,
    table,
    body,
    cols,
    tokenRow.context_user_id
  );
  if (prepared.error) return reply.code(400).send({ error: prepared.error });
  const keys = prepared.keys;
  if (!keys.length) return reply.code(400).send({ error: 'Nenhum campo válido informado' });

  const qualified = `${qident(tokenRow.schema_name)}.${qident(table)}`;
  try {
    const row = await withRlsContext(tokenRow, async (tx) => {
      const [r] = (await tx.unsafe(
        `INSERT INTO ${qualified} (${keys.map(qident).join(', ')})
         VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
         RETURNING ${cols.map(qident).join(', ')}`,
        prepared.values
      )) as any[];
      return r;
    });
    return { data: row };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.patch('/public/:table/:id', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const { table, id } = request.params;
  if (!(await requirePublicTable(tokenRow, table, reply))) return;

  const body = request.body || {};
  const allCols = await columnNames(tokenRow.schema_name, table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n) && n !== 'id');
  const prepared = prepareUpdate(table, body, cols);
  if (prepared.error) return reply.code(400).send({ error: prepared.error });
  const keys = prepared.keys;
  if (!keys.length) return reply.code(400).send({ error: 'Nenhum campo válido informado' });

  const values = prepared.values;
  values.push(id);
  const qualified = `${qident(tokenRow.schema_name)}.${qident(table)}`;
  const updatedAt = allCols.includes('updated_at') && !keys.includes('updated_at')
    ? `, ${qident('updated_at')} = NOW()`
    : '';
  try {
    const row = await withRlsContext(tokenRow, async (tx) => {
      const [r] = (await tx.unsafe(
        `UPDATE ${qualified}
         SET ${keys.map((k, i) => `${qident(k)} = $${i + 1}`).join(', ')}${updatedAt}
         WHERE id::text = $${values.length}
         RETURNING ${cols.map(qident).join(', ')}`,
        values
      )) as any[];
      return r;
    });
    if (!row) return reply.code(404).send({ error: 'Registro não encontrado' });
    return { data: row };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

app.delete('/public/:table/:id', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const { table, id } = request.params;
  if (!(await requirePublicTable(tokenRow, table, reply))) return;

  const qualified = `${qident(tokenRow.schema_name)}.${qident(table)}`;
  try {
    const deleted = await withRlsContext(tokenRow, async (tx) => {
      const rows = (await tx.unsafe(
        `DELETE FROM ${qualified} WHERE id::text = $1 RETURNING id`,
        [id]
      )) as any[];
      return rows.length;
    });
    if (!deleted) return reply.code(404).send({ error: 'Registro não encontrado' });
    return { ok: true };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Workflow API (placeholder funcional: recebe POST e devolve o payload)
app.post('/public/wf/:name', async (request: any, reply) => {
  const tokenRow = await requireApiToken(request, reply);
  if (!tokenRow) return;
  const settings = await getApiSettings(tokenRow.project_id);
  if (!settings?.workflow_api_enabled) {
    return reply.code(403).send({ error: 'Workflow API desabilitada' });
  }
  return {
    ok: true,
    workflow: request.params.name,
    received: request.body ?? null,
    timestamp: new Date().toISOString(),
  };
});

// Inicialização

try {
  await runMigrations();
  console.log('✅ Migrações aplicadas');
} catch (err) {
  console.error('❌ Falha ao aplicar migrações:', err);
}

try {
  await ensureBucket();
  console.log(`✅ Bucket "${BUCKET}" pronto`);
} catch (err) {
  console.error('❌ MinIO indisponível (uploads desativados):', err);
}

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`✅ Admin API rodando na porta ${PORT}`);
} catch (err) {
  console.error('Erro ao iniciar Admin API:', err);
  process.exit(1);
}