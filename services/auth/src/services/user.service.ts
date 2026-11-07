import { verifyToken } from '../utils/crypto.js';
import { sql } from '../db/pool.js';

export async function getUser(token: string) {
  const payload = await verifyToken(token);

  const [user] = await sql`
    SELECT id, email, name, email_confirmed, active, created_at
    FROM livre_auth.users
    WHERE id = ${payload.sub}
  `;

  if (!user) {
    throw new Error('Usuário não encontrado');
  }

  return user;
}
