// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
import { describe, expect, it } from 'vitest';
import {
  QueryError,
  countModeFromHeader,
  decodeCursor,
  encodeCursor,
  nextCursorFromRow,
  parseListQuery,
  type ColumnMeta,
} from '../src/services/public-query.js';

const columns: ColumnMeta[] = [
  { name: 'id', dataType: 'uuid', notNull: true },
  { name: 'status', dataType: 'text', notNull: true },
  { name: 'nome', dataType: 'text', notNull: true },
  { name: 'valor', dataType: 'numeric(12,2)', notNull: true },
  { name: 'vencimento', dataType: 'date', notNull: false },
  { name: 'created_at', dataType: 'timestamp with time zone', notNull: true },
  { name: 'ativo', dataType: 'boolean', notNull: true },
  { name: 'password_hash', dataType: 'text', notNull: true },
];

const hidden = new Set(['password_hash']);
const opts = { columns, hiddenColumns: hidden, defaultLimit: 50, maxLimit: 1000 };

const parse = (query: Record<string, any>) => parseListQuery(query, opts);

describe('parseListQuery — padrões e compatibilidade', () => {
  it('sem parâmetros: todas as colunas visíveis, ordem id desc, limite 50', () => {
    const q = parse({});
    expect(q.selectSql).toContain('"id"');
    expect(q.selectSql).not.toContain('password_hash');
    expect(q.orderSql).toBe('"id" DESC');
    expect(q.whereSql).toBe('');
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(0);
  });

  it('mantém search textual em todas as colunas visíveis', () => {
    const q = parse({ search: 'silva' });
    expect(q.whereSql).toContain('ILIKE');
    expect(q.params[0]).toBe('%silva%');
    expect(q.whereSql).not.toContain('password_hash');
  });

  it('limita o máximo configurado', () => {
    expect(parse({ limit: '99999' }).limit).toBe(1000);
    expect(parse({ limit: '0' }).limit).toBe(50);
    expect(parse({ limit: '-5' }).limit).toBe(50);
    expect(parse({ limit: 'abc' }).limit).toBe(50);
  });

  it('respeita maxLimit customizado', () => {
    const q = parseListQuery({ limit: '500' }, { ...opts, maxLimit: 200 });
    expect(q.limit).toBe(200);
  });
});

describe('parseListQuery — filtros', () => {
  it('eq', () => {
    const q = parse({ status: 'eq.VENCIDA' });
    expect(q.whereSql).toBe('WHERE "status" = $1::text');
    expect(q.params).toEqual(['VENCIDA']);
  });

  it('exige operador explícito (padrão PostgREST)', () => {
    expect(() => parse({ status: 'VENCIDA' })).toThrow(/campos?\.operador\.valor|Filtro inválido/);
  });

  it('gte numérico', () => {
    const q = parse({ valor: 'gte.100.50' });
    expect(q.whereSql).toBe('WHERE "valor" >= $1::numeric');
    expect(q.params).toEqual(['100.50']);
  });

  it('ilike converte * para %', () => {
    const q = parse({ nome: 'ilike.*silva*' });
    expect(q.whereSql).toBe('WHERE "nome"::text ILIKE $1');
    expect(q.params).toEqual(['%silva%']);
  });

  it('in com lista', () => {
    const q = parse({ status: 'in.(ABERTA,VENCIDA)' });
    expect(q.whereSql).toBe('WHERE "status" IN ($1::text, $2::text)');
    expect(q.params).toEqual(['ABERTA', 'VENCIDA']);
  });

  it('in com valores entre aspas contendo vírgula', () => {
    const q = parse({ status: 'in.("A,B",C)' });
    expect(q.params).toEqual(['A,B', 'C']);
  });

  it('is null / is false', () => {
    expect(parse({ vencimento: 'is.null' }).whereSql).toBe('WHERE "vencimento" IS NULL');
    expect(parse({ ativo: 'is.false' }).whereSql).toBe('WHERE "ativo" IS FALSE');
  });

  it('not.eq e not.is.null', () => {
    expect(parse({ status: 'not.eq.CANCELADA' }).whereSql).toBe('WHERE NOT ("status" = $1::text)');
    expect(parse({ vencimento: 'not.is.null' }).whereSql).toBe('WHERE NOT ("vencimento" IS NULL)');
  });

  it('combina filtros com AND', () => {
    const q = parse({ status: 'eq.ABERTA', valor: 'gt.10' });
    expect(q.whereSql).toBe('WHERE "status" = $1::text AND "valor" > $2::numeric');
    expect(q.params).toEqual(['ABERTA', '10']);
  });

  it('or combina condições', () => {
    const q = parse({ or: '(status.eq.ABERTA,valor.gt.100)' });
    expect(q.whereSql).toContain(' OR ');
    expect(q.params).toEqual(['ABERTA', '100']);
  });

  it('rejeita operador desconhecido', () => {
    expect(() => parse({ status: 'regexp.^a' })).toThrow(QueryError);
  });

  it('rejeita coluna desconhecida e coluna oculta', () => {
    expect(() => parse({ inexistente: 'eq.1' })).toThrow(/Coluna desconhecida/);
    expect(() => parse({ password_hash: 'eq.x' })).toThrow(/Coluna desconhecida/);
  });

  it('rejeita valor inválido para o tipo da coluna', () => {
    expect(() => parse({ valor: 'eq.abc' })).toThrow(/esperado número/);
    expect(() => parse({ id: 'eq.123' })).toThrow(/esperado UUID/);
    expect(() => parse({ vencimento: 'eq.31/12/2026' })).toThrow(/esperado data/);
  });

  it('rejeita ilike em coluna não textual', () => {
    expect(() => parse({ valor: 'ilike.*1*' })).toThrow(/texto/);
  });
});

describe('parseListQuery — projeção e ordenação', () => {
  it('select restrito', () => {
    const q = parse({ select: 'id,valor' });
    expect(q.selectSql).toBe('"id", "valor"');
  });

  it('select inválido', () => {
    expect(() => parse({ select: 'id,password_hash' })).toThrow(/Coluna desconhecida/);
  });

  it('ordenação múltipla', () => {
    const q = parse({ order: 'vencimento.asc,created_at.desc' });
    expect(q.orderSql).toBe('"vencimento" ASC, "created_at" DESC');
  });

  it('ordenação inválida', () => {
    expect(() => parse({ order: 'valor.up' })).toThrow(/Direção inválida/);
    expect(() => parse({ order: 'senha.asc' })).toThrow(/Coluna desconhecida/);
  });
});

describe('parseListQuery — cursor (keyset)', () => {
  it('gera predicado keyset simples', () => {
    const cursor = encodeCursor(['2026-01-01T00:00:00.000Z']);
    const q = parse({ order: 'created_at.asc', cursor });
    expect(q.whereSql).toContain('"created_at" > $1::timestamptz');
  });

  it('gera predicado composto com ordem mista', () => {
    const cursor = encodeCursor(['2026-01-01T00:00:00.000Z', '0f8b7c1e-1111-4a2b-9c3d-1234567890ab']);
    const q = parse({ order: 'created_at.desc,id.asc', cursor });
    expect(q.whereSql).toContain('"created_at" < $1::timestamptz');
    expect(q.whereSql).toContain('"created_at" = $1::timestamptz AND "id" >');
  });

  it('rejeita cursor incompatível com a ordenação', () => {
    const cursor = encodeCursor(['2026-01-01T00:00:00.000Z']);
    expect(() => parse({ order: 'created_at.asc,id.desc', cursor })).toThrow(/Cursor incompatível/);
  });

  it('rejeita cursor inválido', () => {
    expect(() => parse({ cursor: 'nao-e-base64' })).toThrow(/Cursor inválido/);
  });

  it('roundtrip do cursor', () => {
    expect(decodeCursor(encodeCursor(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('não gera cursor quando a linha tem valor nulo na ordenação', () => {
    expect(nextCursorFromRow({ created_at: null, id: 'x' }, [{ name: 'created_at', direction: 'asc' }])).toBeNull();
    expect(
      nextCursorFromRow({ created_at: new Date('2026-01-01T00:00:00Z'), id: 'x' }, [
        { name: 'created_at', direction: 'asc' },
        { name: 'id', direction: 'asc' },
      ])
    ).toBeTruthy();
  });
});

describe('parseListQuery — segurança', () => {
  const attacks = [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    '1); DELETE FROM users; --',
    "\\'; SELECT pg_sleep(5); --",
  ];

  it('valores maliciosos viram parâmetros, nunca SQL', () => {
    for (const attack of attacks) {
      const q = parse({ nome: `eq.${attack}` });
      expect(q.params).toContain(attack);
      expect(q.whereSql).not.toContain('DROP');
      expect(q.whereSql).not.toContain('pg_sleep');
      expect(q.whereSql).not.toContain('DELETE');
    }
  });

  it('nome de coluna malicioso é rejeitado', () => {
    expect(() => parse({ 'id" OR 1=1 --': 'eq.x' })).toThrow(/Coluna desconhecida/);
    expect(() => parse({ select: 'id; DROP TABLE x' })).toThrow(/Coluna desconhecida/);
  });

  it('não permite injeção pelo or', () => {
    const q = parse({ or: '(status.eq.ABERTA,nome.eq.x)' });
    expect(q.params).toEqual(['ABERTA', 'x']);
    expect(q.whereSql).not.toContain(';');
  });
});

describe('countModeFromHeader', () => {
  it('lê Prefer: count=none', () => {
    expect(countModeFromHeader('count=none')).toBe('none');
    expect(countModeFromHeader('count=exact')).toBe('exact');
    expect(countModeFromHeader(undefined)).toBe('exact');
    expect(countModeFromHeader(['count=none', 'return=representation'])).toBe('none');
  });
});
