import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Criptografia reversível para segredos guardados no banco (senha SMTP).
 * Deve permanecer compatível com services/admin-api/src/utils/secret-box.ts:
 * mesmo algoritmo (AES-256-GCM), mesmo formato e mesma derivação de chave.
 */
const PREFIX = 'enc:v1:';
const IV_BYTES = 12;

function getKey(): Buffer | null {
  const raw = process.env.EMAIL_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function decryptSecret(value: string): string {
  if (!value) return '';
  if (!isEncrypted(value)) return value;

  const key = getKey();
  if (!key) {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY/JWT_SECRET não configurada para decifrar credenciais'
    );
  }

  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de credencial criptografada inválido');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
