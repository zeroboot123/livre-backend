import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { testConnection } from './db/pool.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { healthRoutes } from './routes/health.js';

const app = Fastify({
  logger: config.nodeEnv !== 'test',
});

// Plugins
await app.register(cors, {
  origin: config.cors.origins,
  credentials: true,
});

await app.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
});

// Rotas
await app.register(healthRoutes, { prefix: '/health' });
await app.register(authRoutes, { prefix: '/auth' });
await app.register(adminRoutes, { prefix: '/auth' });

// Inicialização
try {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('Falha na conexão com PostgreSQL');
    process.exit(1);
  }
  console.log('✅ Conectado ao PostgreSQL');

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`✅ Auth Service rodando na porta ${config.port}`);
} catch (err) {
  console.error('Erro ao iniciar:', err);
  process.exit(1);
}
