import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { sql } from './db/pool.js';
import { verifyToken } from './utils/crypto.js';
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
  const projects = await sql`SELECT * FROM livre_auth.projects ORDER BY created_at DESC`;
  return { projects };
});

// Criar projeto
app.post('/projects', async (request: any, reply) => {
  const { name, slug, description } = request.body || {};
  if (!name || !slug) return reply.code(400).send({ error: 'Nome e slug são obrigatórios' });
  
  const [project] = await sql`
    INSERT INTO livre_auth.projects (name, slug, description)
    VALUES (${name}, ${slug}, ${description || null})
    RETURNING *
  `;
  return { project };
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

const HIDDEN_COLUMNS = new Set([
  'password_hash',
  'refresh_token',
  'refresh_token_hash',
  'email_token',
]);

async function tableExists(table: string) {
  const rows = await sql`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'livre_auth' AND c.relname = ${table} AND c.relkind = 'r'
  `;
  return rows.length > 0;
}

async function columnNames(table: string) {
  const rows = await sql`
    SELECT a.attname AS name
    FROM pg_attribute a
    WHERE a.attrelid = ${'livre_auth.' + qident(table)}::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `;
  return rows.map((r: any) => r.name as string);
}

// Lista os data types (tabelas) com contagem real de registros
app.get('/schema', async () => {
  const tables = (await sql`
    SELECT c.relname AS name,
      (SELECT count(*)::int FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'livre_auth' AND c.relkind = 'r'
    ORDER BY c.relname
  `) as any[];

  const result: any[] = [];
  for (const t of tables) {
    let entries = 0;
    try {
      const [count] = await sql.unsafe(
        `SELECT count(*)::int AS count FROM livre_auth.${qident(t.name)}`
      );
      entries = count.count;
    } catch {
      entries = 0;
    }
    result.push({ name: t.name, columns: t.columns, entries });
  }
  return { tables: result };
});

// Colunas de um data type
app.get('/schema/:table/columns', async (request: any, reply) => {
  const { table } = request.params;
  if (!(await tableExists(table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const columns = await sql`
    SELECT a.attname AS name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull AS required,
      pg_get_expr(d.adbin, d.adrelid) AS default_value,
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
    WHERE a.attrelid = ${'livre_auth.' + qident(table)}::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `;

  return { columns };
});

// Linhas de um data type (com busca e paginação)
app.get('/data/:table', async (request: any, reply) => {
  const { table } = request.params;
  if (!(await tableExists(table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const limit = Math.min(Math.max(parseInt(request.query.limit || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);
  const search = String(request.query.search || '').trim();
  const column = request.query.column ? String(request.query.column) : '';

  const allCols = await columnNames(table);
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
      `SELECT ${select} FROM livre_auth.${qident(table)} ${where} ORDER BY ${orderCol} DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [countRow] = await sql.unsafe(
      `SELECT count(*)::int AS count FROM livre_auth.${qident(table)} ${where}`,
      params
    );
    return { rows, total: countRow.count, columns: cols, limit, offset };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Inserir registro
app.post('/data/:table', async (request: any, reply) => {
  const { table } = request.params;
  if (!(await tableExists(table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const body = request.body || {};
  const allCols = await columnNames(table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n));
  const keys = Object.keys(body).filter(
    (k) => cols.includes(k) && body[k] !== '' && body[k] !== null && body[k] !== undefined
  );
  if (!keys.length) return reply.code(400).send({ error: 'Nenhum campo válido informado' });

  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = keys.map((k) => body[k]);
  const returning = cols.map(qident).join(', ');

  try {
    const [row] = await sql.unsafe(
      `INSERT INTO livre_auth.${qident(table)} (${keys.map(qident).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${returning}`,
      values
    );
    return { row };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Atualizar registro
app.patch('/data/:table/:id', async (request: any, reply) => {
  const { table, id } = request.params;
  if (!(await tableExists(table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const body = request.body || {};
  const allCols = await columnNames(table);
  const cols = allCols.filter((n) => !HIDDEN_COLUMNS.has(n) && n !== 'id');
  const keys = Object.keys(body).filter((k) => cols.includes(k));
  if (!keys.length) return reply.code(400).send({ error: 'Nenhum campo válido informado' });

  const sets = keys.map((k, i) => `${qident(k)} = $${i + 1}`);
  const values = keys.map((k) => body[k]);
  values.push(id);
  const returning = cols.map(qident).join(', ');

  try {
    const [row] = await sql.unsafe(
      `UPDATE livre_auth.${qident(table)} SET ${sets.join(', ')} WHERE id::text = $${values.length} RETURNING ${returning}`,
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
  const { table } = request.params;
  if (!(await tableExists(table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const ids = request.body?.ids;
  if (!Array.isArray(ids) || !ids.length) {
    return reply.code(400).send({ error: 'Nenhum registro selecionado' });
  }

  try {
    const deleted = await sql.unsafe(
      `DELETE FROM livre_auth.${qident(table)} WHERE id::text = ANY($1::text[]) RETURNING id`,
      [ids.map(String)]
    );
    return { deleted: deleted.length };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Criar novo data type (tabela)
app.post('/schema', async (request: any, reply) => {
  const { name } = request.body || {};
  if (!/^[a-z_][a-z0-9_]*$/i.test(name || '')) {
    return reply.code(400).send({ error: 'Nome do data type inválido' });
  }
  if (await tableExists(name)) {
    return reply.code(409).send({ error: 'Já existe um data type com esse nome' });
  }

  try {
    await sql.unsafe(`CREATE TABLE livre_auth.${qident(name)} (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW()
    )`);
    return { ok: true, name };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Adicionar campo (coluna) a um data type
app.post('/schema/:table/columns', async (request: any, reply) => {
  const { table } = request.params;
  if (!(await tableExists(table))) {
    return reply.code(404).send({ error: 'Tabela não encontrada' });
  }

  const { name, type, required, unique } = request.body || {};
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name || '')) {
    return reply.code(400).send({ error: 'Nome de campo inválido' });
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

  let ddl = `ALTER TABLE livre_auth.${qident(table)} ADD COLUMN ${qident(name)} ${pgType}`;
  if (required) ddl += ' NOT NULL';
  if (unique) ddl += ' UNIQUE';

  try {
    await sql.unsafe(ddl);
    return { ok: true };
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// ============================================================
// OPTION SETS
// ============================================================
app.get('/option-sets', async () => {
  const sets = (await sql`
    SELECT id, name, label, description, created_at, updated_at
    FROM livre_auth.option_sets
    ORDER BY name
  `) as any[];

  const options = (await sql`
    SELECT id, option_set_id, display, sort_order, metadata
    FROM livre_auth.option_set_options
    ORDER BY sort_order, created_at
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
  const name = String(request.body?.name || '').trim();
  const label = request.body?.label ? String(request.body.label).trim() : null;

  if (!name || name.length > 120) {
    return reply.code(400).send({ error: 'Nome do option set inválido' });
  }

  try {
    const [optionSet] = await sql`
      INSERT INTO livre_auth.option_sets (name, label)
      VALUES (${name}, ${label})
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

  values.push(id);
  try {
    const [optionSet] = await sql.unsafe(
      `UPDATE livre_auth.option_sets
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
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
  const [row] = await sql`
    DELETE FROM livre_auth.option_sets
    WHERE id = ${request.params.id}
    RETURNING id
  `;
  if (!row) return reply.code(404).send({ error: 'Option set não encontrado' });
  return { ok: true };
});

app.post('/option-sets/:id/options', async (request: any, reply) => {
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
      WHERE EXISTS (SELECT 1 FROM livre_auth.option_sets WHERE id = ${id}::uuid)
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
  const { id, optionId } = request.params;
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
  const { id, optionId } = request.params;
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/files', async (request: any) => {
  const limit = Math.min(Math.max(parseInt(request.query.limit || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);
  const search = String(request.query.search || '').trim();
  const exact = String(request.query.exact || '') === 'true';
  const type = String(request.query.type || 'all');
  const privateOnly =
    String(request.query.private || '') === 'true' ||
    String(request.query.onlyPrivate || '') === 'true';

  const params: any[] = [];
  const where: string[] = [];

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
        bucket, object_key, file_name, mime_type, size_bytes,
        status, is_private, uploaded_by, attached_table, attached_id
      ) VALUES (
        ${BUCKET}, ${key}, ${original}, ${data.mimetype}, ${buffer.length},
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
  const [file] = await sql`
    SELECT id, bucket, object_key, file_name, mime_type
    FROM livre_auth.files
    WHERE id = ${request.params.id}
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

app.delete('/files', async (request: any, reply) => {
  const ids = request.body?.ids;
  if (!Array.isArray(ids) || !ids.length) {
    return reply.code(400).send({ error: 'Nenhum arquivo selecionado' });
  }

  const idList = ids.map(String);
  const rows = (await sql.unsafe(
    `SELECT id, bucket, object_key FROM livre_auth.files WHERE id::text = ANY($1::text[])`,
    [idList]
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
    `DELETE FROM livre_auth.files WHERE id::text = ANY($1::text[]) RETURNING id`,
    [idList]
  );
  return { deleted: removed.length };
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