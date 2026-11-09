import postgres from 'postgres';
import { config } from '../config/index.js';

// Pool de conexões PostgreSQL
export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

// Teste de conexão
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
