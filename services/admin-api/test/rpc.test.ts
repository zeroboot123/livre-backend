// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
import { describe, expect, it } from 'vitest';
import {
  RpcError,
  buildRpcCall,
  isValidFunctionName,
  parseBatchOperations,
} from '../src/services/rpc.js';

describe('isValidFunctionName', () => {
  it('aceita identificadores válidos', () => {
    expect(isValidFunctionName('criar_fatura')).toBe(true);
    expect(isValidFunctionName('fn1')).toBe(true);
    expect(isValidFunctionName('_private')).toBe(true);
  });

  it('rejeita nomes com SQL/injeção ou inválidos', () => {
    expect(isValidFunctionName('fn; DROP TABLE x')).toBe(false);
    expect(isValidFunctionName('schema.fn')).toBe(false);
    expect(isValidFunctionName('"quoted"')).toBe(false);
    expect(isValidFunctionName('1abc')).toBe(false);
    expect(isValidFunctionName('')).toBe(false);
    expect(isValidFunctionName(null)).toBe(false);
    expect(isValidFunctionName(123)).toBe(false);
  });
});

describe('buildRpcCall', () => {
  it('qualifica a função no schema e parametriza o payload', () => {
    expect(buildRpcCall('proj_x', 'criar_fatura')).toBe(
      'SELECT * FROM "proj_x"."criar_fatura"($1::jsonb)'
    );
  });

  it('rejeita nome inválido', () => {
    expect(() => buildRpcCall('proj_x', 'x; drop table y')).toThrow(RpcError);
  });
});

describe('parseBatchOperations', () => {
  it('aceita array direto', () => {
    const ops = parseBatchOperations([
      { method: 'insert', table: 'faturas', data: { valor: 10 } },
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].method).toBe('insert');
    expect(ops[0].table).toBe('faturas');
  });

  it('aceita { operations: [...] }', () => {
    const ops = parseBatchOperations({
      operations: [{ method: 'delete', table: 'faturas', id: 'abc' }],
    });
    expect(ops[0].method).toBe('delete');
    expect(ops[0].id).toBe('abc');
  });

  it('normaliza método em maiúsculas', () => {
    const ops = parseBatchOperations([{ method: 'INSERT', table: 't', data: {} }]);
    expect(ops[0].method).toBe('insert');
  });

  it('rejeita método desconhecido', () => {
    expect(() => parseBatchOperations([{ method: 'drop', table: 't' }])).toThrow(
      /método inválido/
    );
  });

  it('exige tabela para operações de tabela', () => {
    expect(() => parseBatchOperations([{ method: 'insert', data: {} }])).toThrow(
      /informe a tabela/
    );
  });

  it('exige id para update e delete', () => {
    expect(() => parseBatchOperations([{ method: 'update', table: 't', data: {} }])).toThrow(
      /informe o id/
    );
    expect(() => parseBatchOperations([{ method: 'delete', table: 't' }])).toThrow(
      /informe o id/
    );
  });

  it('aceita operação rpc com function + payload', () => {
    const ops = parseBatchOperations([
      { method: 'rpc', function: 'criar_fatura', payload: { valor: 10 } },
    ]);
    expect(ops[0].method).toBe('rpc');
    expect(ops[0].function).toBe('criar_fatura');
    expect(ops[0].payload).toEqual({ valor: 10 });
  });

  it('rejeita nome de função inválido em rpc', () => {
    expect(() =>
      parseBatchOperations([{ method: 'rpc', function: 'x; drop table y' }])
    ).toThrow(/nome de função inválido/);
  });

  it('rejeita payload que não é array', () => {
    expect(() => parseBatchOperations({ foo: 1 })).toThrow(/array de operações/);
  });

  it('rejeita array vazio', () => {
    expect(() => parseBatchOperations([])).toThrow(/Nenhuma operação/);
  });

  it('limita o tamanho do lote', () => {
    const many = Array.from({ length: 51 }, () => ({
      method: 'insert',
      table: 't',
      data: {},
    }));
    expect(() => parseBatchOperations(many)).toThrow(/Máximo de 50 operações/);
  });
});
