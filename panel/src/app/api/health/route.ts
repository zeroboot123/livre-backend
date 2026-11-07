// Endpoint de health do painel (Next.js App Router).
// Usado pelo HEALTHCHECK do docker-compose/Coolify.
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'admin-panel',
    timestamp: new Date().toISOString(),
  });
}
