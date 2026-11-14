import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');

export interface JWTPayload {
  sub: string;
  email: string;
  project_id?: string;
  tenant_id?: string;
  role: string;
  type?: string;
  /** Versão do token do usuário do projeto (revogação em logout). */
  v?: number;
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'livre-backend',
  });
  return payload as unknown as JWTPayload;
}

/** Assina um token (usado pelos usuários nativos de cada projeto). */
export async function signToken(payload: JWTPayload, expiresIn = '7d'): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('livre-backend')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}
