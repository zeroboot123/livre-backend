import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Hash de senha com scrypt (nativo do Node, sem dependências extras).
 * Formato: scrypt$<salt-hex>$<hash-hex>
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Confere a senha de um usuário do painel (livre_auth.users). O auth-service
 * grava Argon2; mantemos compatibilidade com hashes scrypt antigos.
 */
export async function verifyAdminPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith('$argon2')) {
    try {
      return await argon2.verify(stored, password);
    } catch {
      return false;
    }
  }
  return verifyPassword(password, stored);
}
