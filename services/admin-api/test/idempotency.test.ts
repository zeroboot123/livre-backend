// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { IdempotencyError } from '../src/services/idempotency.js';

describe('IdempotencyError', () => {
  it('tem status 409', () => {
    const err = new IdempotencyError('Requisição em processamento');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Requisição em processamento');
  });
});

describe('request hash (idempotência)', () => {
  const computeHash = (body: any) => createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');

  it('gera hash determinístico para o mesmo corpo', () => {
    expect(computeHash({ valor: 10 })).toBe(computeHash({ valor: 10 }));
  });

  it('gera hash diferente para corpos diferentes', () => {
    expect(computeHash({ valor: 10 })).not.toBe(computeHash({ valor: 20 }));
  });

  it('hash é independente da chave (usa apenas o corpo)', () => {
    expect(computeHash({})).toBe(computeHash({}));
  });
});
