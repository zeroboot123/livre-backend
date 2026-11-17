// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Middleware de idempotência para rotas de escrita da API pública.
//
// Uso:
//   import { withIdempotency } from './services/idempotency.js';
//   app.post('/public/:table', withIdempotency, handler);
//
// O header `Idempotency-Key` é opcional. Quando presente:
//   - Mesmo (project_id, key, hash_do_corpo) → devolve resposta gravada.
//   - Mesmo key, corpo diferente → 409 Conflict.
//   - Key em processamento concorrente → 409 Conflict.
//   - Sem header → comportamento normal (sem idempotência).

import { createHash } from 'node:crypto';
import { sql } from '../db/pool.js';

const IDEMPOTENCY_TTL_HOURS = Number(process.env.IDEMPOTENCY_TTL_HOURS ?? 24);

export class IdempotencyError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

export interface IdempotencyResult<T> {
  /** `true` se a resposta veio do cache (requisição idempotente). */
  replayed: boolean;
  /** A resposta (dados) da operação. */
  data: T;
}

/**
 * Executa `fn` protegido por idempotência.
 * `request` é o objeto Fastify request (precisa de headers + body).
 * `tokenRow` contém o project_id do token.
 * `endpoint` é o path da rota (ex.: '/public/faturas').
 * `fn` recebe o `tokenRow` e deve retornar a resposta serializável.
 */
export async function withIdempotency<T>(
  request: any,
  tokenRow: { project_id: string },
  endpoint: string,
  fn: (tokenRow: any) => Promise<T>
): Promise<IdempotencyResult<T>> {
  const key = String(request.headers['idempotency-key'] || '').trim();
  if (!key) {
    // Sem header → sem idempotência, executa normalmente.
    const data = await fn(tokenRow);
    return { replayed: false, data };
  }

  // Hash do corpo da requisição (JSON stringificado de forma determinística).
  const bodyStr = JSON.stringify(request.body ?? {});
  const requestHash = createHash('sha256').update(bodyStr).digest('hex');

  // Tenta inserir a chave. Se já existir, o UNIQUE bloqueia.
  let row;
  try {
    [row] = await sql`
      INSERT INTO livre_auth.idempotency_keys
        (project_id, key, endpoint, request_hash, status)
      VALUES (${tokenRow.project_id}, ${key}, ${endpoint}, ${requestHash}, 'in_progress')
      ON CONFLICT (project_id, key) DO UPDATE
        SET request_hash = EXCLUDED.request_hash,
            endpoint = EXCLUDED.endpoint,
            status = CASE
              WHEN livre_auth.idempotency_keys.status = 'completed'
                AND livre_auth.idempotency_keys.request_hash = EXCLUDED.request_hash
              THEN 'completed'
              ELSE 'in_progress'
            END,
            updated_at = now()
      RETURNING id, status, request_hash, response
    `;
  } catch (err: any) {
    // Violação de UNIQUE em project_id+key (race condition na inserção).
    // Recarrega a linha existente.
    [row] = await sql`
      SELECT id, status, request_hash, response
      FROM livre_auth.idempotency_keys
      WHERE project_id = ${tokenRow.project_id} AND key = ${key}
    `;
  }

  if (!row) {
    // Não deveria acontecer, mas por segurança executa sem cache.
    const data = await fn(tokenRow);
    return { replayed: false, data };
  }

  // Se já completou com o mesmo hash → devolve resposta cached.
  if (row.status === 'completed' && row.request_hash === requestHash) {
    return { replayed: true, data: row.response as T };
  }

  // Mesmo key, hash diferente → erro (o cliente reutilizou a chave).
  if (row.status === 'completed' && row.request_hash !== requestHash) {
    throw new IdempotencyError(
      `Chave de idempotência "${key}" já foi usada com um corpo diferente`
    );
  }

  // Status 'in_progress': outra requisição com a mesma chave está processando.
  if (row.status === 'in_progress') {
    throw new IdempotencyError(
      `Requisição com a mesma chave de idempotência já está em processamento`
    );
  }

  // Executa a função real.
  let response: T;
  try {
    response = await fn(tokenRow);
  } catch (err) {
    // Em caso de erro, marca a chave como falhou (deixa in_progress expirar).
    // Não devolvemos erro cached — cada retry tenta de novo.
    throw err;
  }

  // Grava a resposta de sucesso.
  await sql`
    UPDATE livre_auth.idempotency_keys
    SET status = 'completed', response = ${JSON.stringify(response)}::jsonb,
        completed_at = now()
    WHERE id = ${row.id}
  `;

  return { replayed: false, data: response };
}

/** Limpeza periódica de chaves antigas (executar via cron/job). */
export async function cleanupIdempotencyKeys(): Promise<number> {
  const [row] = await sql`
    DELETE FROM livre_auth.idempotency_keys
    WHERE created_at < now() - ${`${IDEMPOTENCY_TTL_HOURS} hours`}::interval
    RETURNING 1
  `;
  return row?.length ?? 0;
}