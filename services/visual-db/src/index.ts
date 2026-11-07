import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({
  logger: false,
  // Aceita os caminhos internos ("/health") e o caminho externo com o prefixo
  // do proxy ("/admin/visual-db/..."). Funciona com ou sem "strip prefix".
  rewriteUrl: (req) => {
    const base = process.env.API_BASE_PATH || '/admin/visual-db';
    const url = req.url || '/';
    if (url === base) return '/';
    if (url.startsWith(base + '/')) return url.slice(base.length);
    return url;
  },
});
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
