// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Escopos de token da API pública (Fase 7).
// Tokens criados antes desta fase não possuem escopos (campo vazio) e
// recebem acesso completo, mantendo compatibilidade com clientes já ativos.

export const TOKEN_SCOPES = ['read', 'write', 'rpc', 'auth'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Verifica se o token possui o escopo informado. */
export function hasTokenScope(permissions: unknown, scope: string): boolean {
  if (!permissions || typeof permissions !== 'object') return true;
  const perms = permissions as Record<string, unknown>;
  const keys = Object.keys(perms);
  if (!keys.length) return true; // tokens legados sem escopo → acesso total
  return keys.includes(scope) && !!perms[scope];
}
