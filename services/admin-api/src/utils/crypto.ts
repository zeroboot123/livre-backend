import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');

export interface JWTPayload {
  sub: string;
  email: string;
  project_id?: string;
  tenant_id?: string;
  role: string;
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'livre-backend',
  });
  return payload as unknown as JWTPayload;
}