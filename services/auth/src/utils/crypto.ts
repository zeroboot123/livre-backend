import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config/index.js';

const secret = new TextEncoder().encode(config.jwt.secret);

export interface JWTPayload {
  sub: string;        // user_id
  email: string;
  project_id?: string;
  tenant_id?: string;
  role: string;
}

// Gera Access Token JWT
export async function generateAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwt.expiration)
    .setIssuer('livre-backend')
    .sign(secret);
}

// Gera Refresh Token (opaco, armazenado com hash)
export async function generateRefreshToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Hash do refresh token para armazenamento seguro
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Verifica e decodifica JWT
export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'livre-backend',
  });
  return payload as unknown as JWTPayload;
}
