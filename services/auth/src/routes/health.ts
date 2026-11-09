import { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    return { status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() };
  });
}
