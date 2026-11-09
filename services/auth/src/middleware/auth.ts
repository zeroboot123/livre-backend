import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, JWTPayload } from '../utils/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

// Middleware para verificar JWT
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Token não fornecido' });
  }

  try {
    const token = authHeader.slice(7);
    request.user = await verifyToken(token);
  } catch {
    return reply.code(401).send({ error: 'Token inválido ou expirado' });
  }
}

// Middleware para verificar role de admin
export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  await authMiddleware(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== 'admin') {
    return reply.code(403).send({ error: 'Acesso não autorizado' });
  }
}