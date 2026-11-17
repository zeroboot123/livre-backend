// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Worker de tarefas (Fase 5): consome tarefas pendentes do PostgreSQL
// usando `FOR UPDATE SKIP LOCKED` (sem Redis, sem broker externo).

import postgres from 'postgres';

const qident = (id: string) => '"' + String(id).replace(/"/g, '""') + '"';
const DATABASE_URL = process.env.DATABASE_URL || '';
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const MAX_ATTEMPTS = 3;

export type TaskRow = {
  id: string;
  project_id: string;
  name: string;
  payload: any;
  context_user_id: string | null;
  context_tenant_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  run_at: Date;
  locked_until: Date | null;
};

export async function executeTask(task: TaskRow): Promise<{ ok: boolean; skipped?: boolean; rows?: any[] }> {
  const db = postgres(DATABASE_URL, { max: 2, idle_timeout: 30, connect_timeout: 10 });

  const result = await db.begin(async (tx: any) => {
    const [updated] = (await tx`
      UPDATE libre_auth.tasks
      SET status = 'running', updated_at = now()
      WHERE id = ${task.id} AND status = 'pending' AND run_at <= now()
      RETURNING id
    `) as any[];
    if (!updated) return { ok: true, skipped: true };

    const [project] = (await tx`
      SELECT schema_name FROM libre_auth.projects WHERE id = ${task.project_id}
    `) as any[];
    const schema = (project as any)?.schema_name;
    if (!schema) throw new Error(`Projeto sem schema: ${task.project_id}`);

    const rows = (await tx.unsafe(
      `SELECT * FROM ${qident(schema)}.${qident(task.name)}($1::jsonb)`,
      [JSON.stringify(task.payload ?? {})]
    )) as any[];

    await tx`
      UPDATE libre_auth.tasks
      SET status = 'completed', attempts = ${task.attempts + 1},
          completed_at = now(), last_error = NULL, updated_at = now()
      WHERE id = ${task.id}
    `;

    return { ok: true, skipped: false, rows };
  });

  await db.end();
  if ((result as any)?.skipped) return { ok: true, skipped: true };
  return { ok: true, rows: (result as any)?.rows };
}

export async function runWorker() {
  const db = postgres(DATABASE_URL, { max: 5, idle_timeout: 30, connect_timeout: 10 });

  while (true) {
    try {
      const tasks = (await db`
        SELECT id, project_id, name, payload, context_user_id, context_tenant_id,
               status, attempts, max_attempts, last_error, run_at, locked_until
        FROM libre_auth.tasks
        WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      `) as TaskRow[];

      for (const task of tasks) {
        try {
          const res = await executeTask(task);
          if ((res as any)?.skipped) continue;
        } catch (err: any) {
          // Retry com backoff simples (quadrático).
          const attempts = task.attempts + 1;
          const backoffSec = attempts * attempts;
          const status = attempts < (task.max_attempts || MAX_ATTEMPTS) ? 'pending' : 'failed';
          await db`
            UPDATE libre_auth.tasks
            SET status = ${status}, attempts = ${attempts},
                last_error = ${String(err?.message || err)},
                run_at = now() + (${backoffSec} * interval '1 second'),
                updated_at = now()
            WHERE id = ${task.id}
          `;
        }
      }
    } catch (err) {
      // log e continuar polling
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export function startWorker() {
  void runWorker();
  return { ok: true };
}

if (process.env.WORKER_AUTO_START === '1') {
  startWorker();
}
