import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Criptografia reversível para segredos guardados no banco (senha SMTP).
 *
 * - Algoritmo: AES-256-GCM (confidencialidade + autenticidade).
 * - Chave: EMAIL_ENCRYPTION_KEY (32 bytes derivados por SHA-256). Se não
 *   estiver definida, usa JWT_SECRET como fallback — em ambos os casos a
 *   chave fica FORA do banco de dados (variável de ambiente).
 * - Formato: "enc:v1:<iv b64>:<tag b64>:<dados b64>".
 * - Valores legados em texto puro são aceitos na leitura para permitir
 *   migração transparente (são re-criptografados no próximo save).
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

/** Criptografa um segredo. String vazia permanece vazia. */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = getKey();
  if (!key) {
    // Sem chave configurada o serviço não pode criptografar; mantém o
    // valor como está para não quebrar instalações de desenvolvimento.
    return plain;
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
  );
}

/** Decifra um segredo. Aceita valores legados em texto puro. */
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

/**
 * Normaliza a senha recebida da API.
 * Retorna `null` quando a senha atual deve ser PRESERVADA:
 *  - campo ausente/nulo/vazio;
 *  - valor de máscara (ex.: "********" ou "••••••••") enviado por engano
 *    por algum cliente antigo.
 */
export function normalizeIncomingPassword(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (/^[•*]+$/.test(str)) return null;
  return str;
}
