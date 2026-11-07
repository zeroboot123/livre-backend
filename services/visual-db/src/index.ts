import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: false });
const PORT = parseInt(process.env.PORT || '3004', 10);

await app.register(cors, { origin: true });

// Health check
app.get('/health', async () => ({
  status: 'ok',
  service: 'visual-db',
  timestamp: new Date().toISOString(),
}));

// Inicialização
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`✅ Visual DB rodando na porta ${PORT}`);
} catch (err) {
  console.error('Erro ao iniciar Visual DB:', err);
  process.exit(1);
}
