import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/pool.js';
import { adminMiddleware } from '../middleware/auth.js';

export async function adminRoutes(app: FastifyInstance) {
  // Todas as rotas de admin exigem autenticação + role admin
  app.addHook('preHandler', adminMiddleware);

  // GET /auth/admin/users - Listar usuários
  app.get('/admin/users', async (request) => {
    const users = await sql`
      SELECT id, email, name, email_confirmed, active, blocked, created_at
      FROM livre_auth.users
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return { users };
  });

  // GET /auth/admin/users/:id
  app.get<{ Params: { id: string } }>('/admin/users/:id', async (request, reply) => {
    const [user] = await sql`
      SELECT id, email, name, email_confirmed, active, blocked, blocked_at, blocked_reason, created_at
      FROM livre_auth.users
      WHERE id = ${request.params.id}
    `;
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
    return { user };
  });

  // PATCH /auth/admin/users/:id/block - Bloquear usuário
  app.patch<{ Params: { id: string } }>('/admin/users/:id/block', async (request, reply) => {
    const body = z.object({ reason: z.string().optional() }).parse(request.body);
    const [user] = await sql`
      UPDATE livre_auth.users
      SET blocked = TRUE, blocked_at = NOW(), blocked_reason = ${body.reason || null}
      WHERE id = ${request.params.id}
      RETURNING id, email, name, blocked, blocked_at, blocked_reason
    `;
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
    return { user, message: 'Usuário bloqueado' };
  });

  // PATCH /auth/admin/users/:id/unblock
  app.patch<{ Params: { id: string } }>('/admin/users/:id/unblock', async (request, reply) => {
    const [user] = await sql`
      UPDATE livre_auth.users
      SET blocked = FALSE, blocked_at = NULL, blocked_reason = NULL
      WHERE id = ${request.params.id}
      RETURNING id, email, name, blocked
    `;
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
    // Revogar todas as sessões
    await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE user_id = ${request.params.id}`;
    return { user, message: 'Usuário desbloqueado' };
  });

  // PATCH /auth/admin/users/:id/deactivate
  app.patch<{ Params: { id: string } }>('/admin/users/:id/deactivate', async (request, reply) => {
    const [user] = await sql`
      UPDATE livre_auth.users
      SET active = FALSE
      WHERE id = ${request.params.id}
      RETURNING id, email, name, active
    `;
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
    await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE user_id = ${request.params.id}`;
    return { user, message: 'Usuário desativado' };
  });

  // PATCH /auth/admin/users/:id/activate
  app.patch<{ Params: { id: string } }>('/auth/admin/users/:id/activate', async (request, reply) => {
    const [user] = await sql`
      UPDATE livre_auth.users
      SET active = TRUE
      WHERE id = ${request.params.id}
      RETURNING id, email, name, active
    `;
    if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });
    return { user, message: 'Usuário ativado' };
  });

  // GET /auth/admin/sessions - Listar sessões ativas
  app.get('/admin/sessions', async () => {
    const sessions = await sql`
      SELECT s.id, s.user_id, u.email, u.name, s.ip_address, s.created_at, s.expires_at
      FROM livre_auth.sessions s
      JOIN livre_auth.users u ON u.id = s.user_id
      WHERE s.revoked = FALSE AND s.expires_at > NOW()
      ORDER BY s.created_at DESC
      LIMIT 100
    `;
    return { sessions };
  });

  // DELETE /auth/admin/sessions/:id - Revogar sessão
  app.delete<{ Params: { id: string } }>('/admin/sessions/:id', async (request, reply) => {
    await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE id = ${request.params.id}`;
    return { message: 'Sessão revogada' };
  });
}