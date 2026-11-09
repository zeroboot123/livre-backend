import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getSetupStatus,
  createUser,
  changePassword,
  setUserPassword,
} from '../services/auth.service.js';
import { getUser } from '../services/user.service.js';
import { authMiddleware } from '../middleware/auth.js';

// Schemas de validação
const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
});

const createUserSchema = registerSchema.extend({
  role: z.enum(['admin', 'user']).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Senha atual é obrigatória'),
  new_password: z.string().min(8, 'Nova senha deve ter no mínimo 8 caracteres'),
});

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token é obrigatório'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

export async function authRoutes(app: FastifyInstance) {
  // GET /auth/setup/status - Indica se o primeiro administrador ainda precisa ser criado.
  app.get('/setup/status', async () => getSetupStatus());

  // POST /auth/register - Somente para o primeiro administrador da instalação.
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await register(body);
    return reply.code(201).send(result);
  });

  // POST /auth/users - Criação de usuários do sistema pelo painel.
  app.post('/users', { preHandler: authMiddleware }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    try {
      const result = await createUser(body);
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.code(409).send({ error: 'Já existe um usuário com esse email' });
      }
      throw err;
    }
  });

  // POST /auth/change-password - Alteração da própria senha.
  app.post(
    '/change-password',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      const result = await changePassword(
        request.user!.sub,
        body.current_password,
        body.new_password
      );
      return reply.send(result);
    }
  );

  // POST /auth/users/:id/password - Redefinição de senha pelo painel.
  app.post(
    '/users/:id/password',
    { preHandler: authMiddleware },
    async (request: any, reply) => {
      const body = setPasswordSchema.parse(request.body);
      const result = await setUserPassword(request.params.id, body.password);
      return reply.send(result);
    }
  );

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await login(body);
    return reply.send(result);
  });

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await refresh(body.refresh_token);
    return reply.send(result);
  });

  // POST /auth/logout
  app.post('/logout', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    await logout(body.refresh_token);
    return reply.send({ message: 'Logout realizado com sucesso' });
  });

  // POST /auth/forgot-password
  app.post('/forgot-password', async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    await forgotPassword(body.email);
    return reply.send({ message: 'Se o email existir, um link de recuperação será enviado' });
  });

  // POST /auth/reset-password
  app.post('/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    await resetPassword(body.token, body.password);
    return reply.send({ message: 'Senha redefinida com sucesso' });
  });

  // GET /auth/me
  app.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token não fornecido' });
    }
    const token = authHeader.slice(7);
    const user = await getUser(token);
    return reply.send(user);
  });
}
