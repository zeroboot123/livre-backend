// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Construção segura de consultas para a API pública de dados.
//
// Regras de segurança:
//  - nenhum trecho enviado pelo cliente entra na SQL como texto: valores sempre
//    viram parâmetros ($1..$n) e identificadores só são aceitos se existirem na
//    tabela (validados contra o catálogo do PostgreSQL);
//  - o tipo de cada valor é escolhido a partir do tipo real da coluna e aplicado
//    com um cast fixo (`::uuid`, `::numeric`, ...), nunca interpolado do input;
//  - colunas internas (senhas/tokens) nunca são selecionáveis nem filtráveis.

export type ColumnMeta = {
  name: string;
  dataType: string;
  notNull: boolean;
};

export class QueryError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

/** Parâmetros reservados da query string (não são filtros). */
const RESERVED_PARAMS = new Set([
  'select',
  'order',
  'limit',
  'offset',
  'cursor',
  'search',
  'count',
  'or',
]);

const COMPARISON_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE = /^-?\d+$/;
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
const BOOL_RE = /^(true|false|t|f|1|0)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

export const qident = (id: string) => '"' + String(id).replace(/"/g, '""') + '"';

/** Divide uma string por vírgulas respeitando parênteses e aspas duplas. */
export function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      buf += ch;
      if (ch === '"' && input[i - 1] !== '\\') quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      buf += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(depth - 1, 0);
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

/** `a,b,c` ou `(a,b,c)` → ['a','b','c'] (aspas removidas). */
function parseList(value: string, field: string): string[] {
  const raw = value.trim();
  if (!raw) throw new QueryError(`Valor vazio para "${field}"`);
  const inner = raw.startsWith('(') && raw.endsWith(')') ? raw.slice(1, -1) : raw;
  const parts = splitTopLevel(inner)
    .map((v) => v.trim())
    .map((v) => {
      if (v.startsWith('"') && v.endsWith('"')) {
        return v.slice(1, -1).replace(/\\"/g, '"');
      }
      return v;
    })
    .filter((v) => v !== '');
  if (!parts.length) throw new QueryError(`Lista vazia para "${field}"`);
  return parts;
}

/** Mapeia o tipo do PostgreSQL para um cast fixo e seguro. */
function pgCast(dataType: string): string {
  const t = dataType.toLowerCase();
  if (t === 'uuid') return 'uuid';
  if (t.startsWith('timestamp with time zone')) return 'timestamptz';
  if (t.startsWith('timestamp')) return 'timestamp';
  if (t === 'date') return 'date';
  if (t === 'boolean') return 'boolean';
  if (t === 'smallint') return 'int2';
  if (t === 'integer') return 'int4';
  if (t === 'bigint') return 'int8';
  if (t.startsWith('numeric') || t === 'decimal') return 'numeric';
  if (t === 'real') return 'float4';
  if (t === 'double precision') return 'float8';
  if (t === 'jsonb') return 'jsonb';
  if (t === 'json') return 'json';
  if (t === 'text' || t.startsWith('character varying') || t.startsWith('character')) return 'text';
  return 'text';
}

function validateValue(column: ColumnMeta, value: string): string {
  const cast = pgCast(column.dataType);
  switch (cast) {
    case 'uuid':
      if (!UUID_RE.test(value)) throw new QueryError(`Valor inválido para "${column.name}" (esperado UUID)`);
      break;
    case 'int2':
    case 'int4':
    case 'int8':
      if (!INT_RE.test(value)) throw new QueryError(`Valor inválido para "${column.name}" (esperado inteiro)`);
      break;
    case 'numeric':
    case 'float4':
    case 'float8':
      if (!NUMERIC_RE.test(value)) throw new QueryError(`Valor inválido para "${column.name}" (esperado número)`);
      break;
    case 'boolean':
      if (!BOOL_RE.test(value)) throw new QueryError(`Valor inválido para "${column.name}" (esperado booleano)`);
      break;
    case 'date':
      if (!DATE_RE.test(value)) throw new QueryError(`Valor inválido para "${column.name}" (esperado data AAAA-MM-DD)`);
      break;
    case 'timestamp':
    case 'timestamptz':
      if (!TIMESTAMP_RE.test(value)) throw new QueryError(`Data/hora inválida para "${column.name}"`);
      break;
    case 'jsonb':
    case 'json':
      try {
        JSON.parse(value);
      } catch {
        throw new QueryError(`JSON inválido para "${column.name}"`);
      }
      break;
    default:
      break;
  }
  return value;
}

function isTextType(column: ColumnMeta): boolean {
  return pgCast(column.dataType) === 'text';
}

type Builder = { where: string[]; params: any[] };

function addParam(builder: Builder, value: any): string {
  builder.params.push(value);
  return `$${builder.params.length}`;
}

/** Converte o padrão estilo PostgREST (`*`) para curingas SQL (`%`). */
function likePattern(value: string): string {
  return value.replace(/\*/g, '%');
}

/**
 * Constrói uma condição a partir de `campo.operador.valor`.
 * Lança QueryError para campo/operador/valor inválidos.
 */
function buildCondition(
  raw: string,
  columns: Map<string, ColumnMeta>,
  builder: Builder
): string {
  const text = raw.trim();
  if (!text) throw new QueryError('Condição vazia em "or"');

  const firstDot = text.indexOf('.');
  if (firstDot <= 0) {
    throw new QueryError(`Filtro inválido: "${raw}". Use campo.operador.valor`);
  }
  const field = text.slice(0, firstDot);
  let rest = text.slice(firstDot + 1);

  let negate = false;
  let secondDot = rest.indexOf('.');
  if (secondDot === -1) {
    throw new QueryError(`Filtro inválido: "${raw}". Use campo.operador.valor`);
  }
  let op = rest.slice(0, secondDot).toLowerCase();
  let value = rest.slice(secondDot + 1);

  // `campo=not.operador.valor` → nega o operador seguinte.
  if (op === 'not') {
    negate = true;
    const innerDot = value.indexOf('.');
    if (innerDot <= 0) {
      throw new QueryError(`Filtro "not" inválido: "${raw}"`);
    }
    op = value.slice(0, innerDot).toLowerCase();
    value = value.slice(innerDot + 1);
  }

  const column = columns.get(field);
  if (!column) throw new QueryError(`Coluna desconhecida: "${field}"`);
  if (!COMPARISON_OPS.has(op)) {
    throw new QueryError(`Operador não suportado: "${op}"`);
  }

  const col = qident(column.name);
  const cast = pgCast(column.dataType);
  let condition: string;

  if (op === 'is') {
    const v = value.toLowerCase();
    if (v === 'null') condition = `${col} IS NULL`;
    else if (v === 'true' || v === 'false') condition = `${col} IS ${v.toUpperCase()}`;
    else throw new QueryError(`"is" aceita null, true ou false (recebido: "${value}")`);
    return negate ? `NOT (${condition})` : condition;
  }

  if (op === 'in') {
    const values = parseList(value, field);
    const placeholders = values.map((v) => `${addParam(builder, validateValue(column, v))}::${cast}`);
    condition = `${col} IN (${placeholders.join(', ')})`;
    return negate ? `NOT (${condition})` : condition;
  }

  if (op === 'like' || op === 'ilike') {
    if (!isTextType(column)) {
      throw new QueryError(`"${op}" só é suportado em colunas de texto ("${field}")`);
    }
    const placeholder = addParam(builder, likePattern(value));
    condition = `${col}::text ${op.toUpperCase()} ${placeholder}`;
    return negate ? `NOT (${condition})` : condition;
  }

  if (value === '') throw new QueryError(`Valor vazio para "${field}.${op}"`);
  validateValue(column, value);
  const placeholder = `${addParam(builder, value)}::${cast}`;

  const sqlOp =
    op === 'eq' ? '=' :
    op === 'neq' ? '<>' :
    op === 'gt' ? '>' :
    op === 'gte' ? '>=' :
    op === 'lt' ? '<' :
    '<=';
  condition = `${col} ${sqlOp} ${placeholder}`;
  return negate ? `NOT (${condition})` : condition;
}

export type ParsedListQuery = {
  /** Lista de projeção já escapada (`"a", "b"`). */
  selectSql: string;
  /** Cláusula WHERE completa (`''` quando não há filtros). */
  whereSql: string;
  /** Cláusula ORDER BY já validada (`''` quando não há ordenação). */
  orderSql: string;
  params: any[];
  limit: number;
  offset: number;
  /** `none` desliga o count(*) (via header Prefer). */
  countMode: 'exact' | 'none';
  /** true quando a paginação por cursor foi solicitada. */
  cursorMode: boolean;
  orderFields: { name: string; direction: 'asc' | 'desc' }[];
};

export type ParseOptions = {
  columns: ColumnMeta[];
  hiddenColumns: Set<string>;
  defaultLimit?: number;
  maxLimit?: number;
};

/**
 * Valida e transforma a query string em cláusulas SQL seguras.
 * Compatível com os parâmetros já suportados (`search`, `limit`, `offset`).
 */
export function parseListQuery(
  query: Record<string, any>,
  options: ParseOptions
): ParsedListQuery {
  const { columns, hiddenColumns } = options;
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 1000;

  const visible = columns.filter((c) => !hiddenColumns.has(c.name));
  const byName = new Map(visible.map((c) => [c.name, c]));

  // ---- limite / offset ----
  const rawLimit = parseInt(String(query.limit ?? defaultLimit), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const rawOffset = parseInt(String(query.offset ?? 0), 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  // ---- projeção ----
  let selected = visible.map((c) => c.name);
  if (query.select !== undefined && String(query.select).trim() !== '' && String(query.select).trim() !== '*') {
    const requested = splitTopLevel(String(query.select))
      .map((c) => c.trim())
      .filter(Boolean);
    for (const name of requested) {
      if (!byName.has(name)) throw new QueryError(`Coluna desconhecida em "select": "${name}"`);
    }
    selected = requested;
  }
  if (!selected.length) throw new QueryError('Nenhuma coluna selecionada');

  // ---- ordenação ----
  let orderFields: { name: string; direction: 'asc' | 'desc' }[] = [];
  if (query.order !== undefined && String(query.order).trim() !== '') {
    orderFields = splitTopLevel(String(query.order))
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [rawName, rawDir] = part.split('.');
        const name = (rawName || '').trim();
        const dir = (rawDir || 'asc').trim().toLowerCase();
        if (!byName.has(name)) throw new QueryError(`Coluna desconhecida em "order": "${name}"`);
        if (!['asc', 'desc'].includes(dir)) throw new QueryError(`Direção inválida em "order": "${dir}"`);
        return { name, direction: dir as 'asc' | 'desc' };
      });
    if (!orderFields.length) throw new QueryError('Ordenação vazia');
  }

  const defaultOrder = visible.some((c) => c.name === 'id')
    ? [{ name: 'id', direction: 'desc' as const }]
    : [{ name: visible[0]?.name, direction: 'desc' as const }].filter((o) => !!o.name);

  const effectiveOrder = orderFields.length ? orderFields : defaultOrder;
  const orderSql = effectiveOrder
    .map((o) => `${qident(o.name)} ${o.direction.toUpperCase()}`)
    .join(', ');

  // ---- filtros ----
  const builder: Builder = { where: [], params: [] };

  const search = String(query.search ?? '').trim();
  if (search) {
    // Mantém o comportamento anterior: busca textual em todas as colunas visíveis.
    const targets = visible;
    const placeholder = addParam(builder, `%${search}%`);
    builder.where.push(
      '(' + targets.map((c) => `${qident(c.name)}::text ILIKE ${placeholder}`).join(' OR ') + ')'
    );
  }

  for (const [key, rawValue] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(key)) continue;
    const value = Array.isArray(rawValue) ? String(rawValue[0]) : String(rawValue);
    builder.where.push(buildCondition(`${key}.${value}`, byName, builder));
  }

  if (query.or !== undefined) {
    const raw = String(query.or).trim();
    const inner = raw.startsWith('(') && raw.endsWith(')') ? raw.slice(1, -1) : raw;
    const parts = splitTopLevel(inner).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) throw new QueryError('"or" vazio');
    builder.where.push(
      '(' + parts.map((p) => buildCondition(p, byName, builder)).join(' OR ') + ')'
    );
  }

  // ---- cursor (keyset) ----
  const cursorMode = query.cursor !== undefined;
  if (cursorMode) {
    const decoded = decodeCursor(String(query.cursor));
    if (decoded.length !== effectiveOrder.length) {
      throw new QueryError('Cursor incompatível com a ordenação informada');
    }

    // Registra um parâmetro por coluna de ordenação (posição fixa) antes de montar
    // as comparações, para que os placeholders das colunas anteriores sejam exatos.
    const cursorParams = effectiveOrder.map((fieldInfo, i) => {
      const column = byName.get(fieldInfo.name)!;
      const value = validateValue(column, decoded[i]);
      const placeholder = `${addParam(builder, value)}::${pgCast(column.dataType)}`;
      return { field: fieldInfo, column, placeholder };
    });

    const parts: string[] = [];
    for (let i = 0; i < cursorParams.length; i++) {
      const { field, placeholder } = cursorParams[i];
      const cmp = field.direction === 'asc' ? '>' : '<';
      const equals = cursorParams
        .slice(0, i)
        .map((prev) => `${qident(prev.field.name)} = ${prev.placeholder}`);
      parts.push('(' + [...equals, `${qident(field.name)} ${cmp} ${placeholder}`].join(' AND ') + ')');
    }
    builder.where.push('(' + parts.join(' OR ') + ')');
  }

  return {
    selectSql: selected.map(qident).join(', '),
    whereSql: builder.where.length ? 'WHERE ' + builder.where.join(' AND ') : '',
    orderSql,
    params: builder.params,
    limit,
    offset,
    countMode: 'exact',
    cursorMode,
    orderFields: effectiveOrder,
  };
}

/** Codifica um cursor opaco (base64url de JSON com os valores da ordenação). */
export function encodeCursor(values: any[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decodeCursor(cursor: string): string[] {
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new QueryError('Cursor inválido');
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new QueryError('Cursor inválido');
  return parsed.map((v) => (v instanceof Date ? v.toISOString() : String(v)));
}

/**
 * Gera o cursor da próxima página a partir da última linha.
 * Retorna null quando a ordenação tem valores nulos (keyset ficaria impreciso).
 */
export function nextCursorFromRow(
  row: Record<string, any>,
  orderFields: { name: string; direction: 'asc' | 'desc' }[]
): string | null {
  const values: string[] = [];
  for (const field of orderFields) {
    const value = row[field.name];
    if (value === null || value === undefined) return null;
    values.push(value instanceof Date ? value.toISOString() : String(value));
  }
  return encodeCursor(values);
}

/** Lê o header Prefer: count=exact|planned|estimated|none (padrão exact). */
export function countModeFromHeader(prefer: unknown): 'exact' | 'none' {
  const raw = Array.isArray(prefer) ? prefer.join(',') : String(prefer ?? '');
  if (/count\s*=\s*none/i.test(raw)) return 'none';
  return 'exact';
}
