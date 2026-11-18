// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Configuração pública em RUNTIME.
//
// O layout do servidor injeta `window.__LIVRE_ENV__` com os valores vindos do
// ambiente do container (definidos no EasyPanel). Assim a MESMA imagem Docker
// pode ser usada por instalações diferentes, sem reconstrução.
//
// Compatibilidade: se a variável de runtime não existir, usa o valor
// NEXT_PUBLIC_* embutido no build (comportamento anterior preservado).

export type PublicEnvKey = 'API_URL' | 'AUTH_URL' | 'VISUAL_DB_URL';

declare global {
  interface Window {
    __LIVRE_ENV__?: Partial<Record<PublicEnvKey, string>>;
  }
}

const FALLBACK: Record<PublicEnvKey, string> = {
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://livrebackend.gerbox.com.br/admin/api',
  AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL || 'https://livrebackend.gerbox.com.br/auth',
  VISUAL_DB_URL:
    process.env.NEXT_PUBLIC_VISUAL_DB_URL || 'https://livrebackend.gerbox.com.br/admin/visual-db',
};

export function publicEnv(key: PublicEnvKey): string {
  if (typeof window !== 'undefined') {
    const value = window.__LIVRE_ENV__?.[key];
    if (value) return value;
  }
  return FALLBACK[key];
}
