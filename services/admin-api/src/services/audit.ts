// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Gravação de auditoria em `livre_auth.audit_log` (Fase 7).
// A auditoria nunca deve derrubar a operação principal.

import { sql } from '../db/pool.js';

export type AuditEntry = {
  userId?: string | null;
  projectId?: string | null;
  tenantId?: string | null;
  action: string;
  resource?: string | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await sql`
      INSERT INTO libre_auth.audit_log
        (user_id, project_id, tenant_id, action, resource, details, ip_address)
      VALUES
        (${entry.userId ?? null}::uuid, ${entry.projectId ?? null}::uuid, ${entry.tenantId ?? null}::uuid,
         ${entry.action}, ${entry.resource ?? null}, ${JSON.stringify(entry.details ?? {})}::jsonb, ${entry.ipAddress ?? null})
    `;
  } catch {
    // Falhas de auditoria são registradas apenas via logs; não afetam a operação.
  }
}
