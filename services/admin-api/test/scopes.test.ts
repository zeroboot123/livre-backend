// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
import { describe, expect, it } from 'vitest';
import { hasTokenScope, TOKEN_SCOPES } from '../src/services/scopes.js';

describe('Escopos de token (Fase 7)', () => {
  it('tokens sem escopo definido (legados) têm acesso total', () => {
    expect(hasTokenScope({}, 'write')).toBe(true);
    expect(hasTokenScope(undefined, 'read')).toBe(true);
    expect(hasTokenScope(null, 'rpc')).toBe(true);
  });

  it('token com escopo ativo respeita o escopo exigido', () => {
    expect(hasTokenScope({ read: true }, 'read')).toBe(true);
    expect(hasTokenScope({ read: true }, 'write')).toBe(false);
    expect(hasTokenScope({ read: true, write: true }, 'write')).toBe(true);
  });

  it('escopos conhecidos incluem read, write e rpc', () => {
    expect(TOKEN_SCOPES).toContain('read');
    expect(TOKEN_SCOPES).toContain('write');
    expect(TOKEN_SCOPES).toContain('rpc');
  });
});
