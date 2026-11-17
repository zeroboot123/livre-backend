// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Camada de segurança para execução de funções RPC e transações em lote.
//
// Regras:
//  - nenhuma função pode ser executada sem estar na allowlist do projeto
//    (`livre_auth.project_rpc_allowed`);
//  - a função precisa existir no schema do projeto e aceitar exatamente um
//    argumento `jsonb` (contrato uniforme, sem adivinhação de assinaturas);
//  - funções `SECURITY DEFINER` são rejeitadas: a execução usa as permissões do
//    role `authenticated`, respeitando as políticas RLS do projeto;
//  - o nome da função nunca vem concatenado do input: é validado contra o
//    catálogo (`pg_proc`) e parametrizado na chamada;
//  - transações em lote rodam com `statement_timeout` e `lock_timeout` para
//    não bloquearem o banco.

export class RpcError extends Error {
  statusCode = 400;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'RpcError';
    this.statusCode = statusCode;
  }
}

const qident = (id: string) => '"' + String(id).replace(/"/g, '""') + '"';

/** Nome de função válido (identificador do PostgreSQL, sem aspas). */
const FUNC_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

export function isValidFunctionName(name: unknown): name is string {
  return typeof name === 'string' && FUNC_NAME_RE.test(name);
}

export type RpcFunctionMeta = {
  name: string;
  argCount: number;
  isSecurityDefiner: boolean;
  returnType: string;
};

/**
 * Lê a definição real da função no catálogo do PostgreSQL.
 * Retorna null quando a função não existe no schema informado.
 */
export async function loadRpcFunction(
  tx: any,
  schema: string,
  name: string
): Promise<RpcFunctionMeta | null> {
  const rows = (await tx`
    SELECT p.proname AS name,
           p.pronargs AS arg_count,
           p.prosecdef AS security_definer,
           pg_get_function_result(p.oid) AS return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ${schema} AND p.proname = ${name}
    LIMIT 1
  `) as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    name: r.name as string,
    argCount: Number(r.arg_count),
    isSecurityDefiner: !!r.security_definer,
    returnType: (r.return_type || 'void') as string,
  };
}

/**
 * Verifica se a função pode ser exposta via RPC:
 *  - exatamente 1 argumento, do tipo jsonb;
 *  - não pode ser SECURITY DEFINER;
 *  - deve ter permissão de EXECUTE para o role `authenticated`.
 *
 * Deve ser chamada **fora** da transação com RLS: usa a conexão administrativa
 * para consultar o catálogo, sem depender das permissões do role `authenticated`.
 */
export async function assertRpcCallable(
  db: any,
  schema: string,
  name: string
): Promise<RpcFunctionMeta> {
  if (!isValidFunctionName(name)) {
    throw new RpcError(`Nome de função inválido: "${String(name).slice(0, 64)}"`);
  }

  const meta = await loadRpcFunction(db, schema, name);
  if (!meta) {
    throw new RpcError(`Função não encontrada no projeto: "${name}"`, 404);
  }
  if (meta.isSecurityDefiner) {
    throw new RpcError(
      `A função "${name}" é SECURITY DEFINER e não pode ser exposta via RPC`,
      403
    );
  }
  if (meta.argCount !== 1) {
    throw new RpcError(
      `A função "${name}" deve receber exatamente 1 argumento (jsonb); possui ${meta.argCount}`
    );
  }

  // O argumento precisa ser jsonb e o role da API precisa poder executá-la.
  const [signature] = (await db`
    SELECT pg_get_function_arguments(p.oid) AS args,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ${schema} AND p.proname = ${name}
    LIMIT 1
  `) as any[];

  if (signature) {
    const args = String(signature.args || '').trim();
    if (!/^payload\s+jsonb$/i.test(args)) {
      throw new RpcError(
        `A função "${name}" deve receber um único argumento jsonb (ex.: payload jsonb)`
      );
    }
    if (!signature.can_execute) {
      throw new RpcError(
        `O role da API não pode executar a função "${name}"`,
        403
      );
    }
  }

  return meta;
}

/** Constrói a chamada parametrizada da função (nunca concatena o input). */
export function buildRpcCall(schema: string, name: string): string {
  if (!isValidFunctionName(name)) throw new RpcError('Nome de função inválido');
  return `SELECT * FROM ${qident(schema)}.${qident(name)}($1::jsonb)`;
}

// ============================================================
// Transações em lote
// ============================================================

export type BatchOperation = {
  /** Método HTTP da operação: insert | update | delete | rpc */
  method: 'insert' | 'update' | 'delete' | 'rpc';
  /** Tabela alvo (obrigatória para insert/update/delete). */
  table?: string;
  /** Identificador do registro (obrigatório para update/delete). */
  id?: string;
  /** Corpo dos dados (insert/update). */
  data?: Record<string, any>;
  /** Payload JSONB (rpc). */
  payload?: Record<string, any>;
  /** Nome da função (rpc). */
  function?: string;
};

export const MAX_BATCH_OPERATIONS = 50;

export function parseBatchOperations(body: any): BatchOperation[] {
  const raw = Array.isArray(body) ? body : body?.operations;
  if (!Array.isArray(raw)) {
    throw new RpcError('Envie um array de operações');
  }
  if (!raw.length) {
    throw new RpcError('Nenhuma operação informada');
  }
  if (raw.length > MAX_BATCH_OPERATIONS) {
    throw new RpcError(
      `Máximo de ${MAX_BATCH_OPERATIONS} operações por transação (enviado: ${raw.length})`
    );
  }

  return raw.map((op: any, index: number) => {
    if (!op || typeof op !== 'object') {
      throw new RpcError(`Operação ${index + 1} inválida`);
    }
    const method = String(op.method || '').toLowerCase();
    if (!['insert', 'update', 'delete', 'rpc'].includes(method)) {
      throw new RpcError(
        `Operação ${index + 1}: método inválido "${op.method}" (use insert, update, delete ou rpc)`
      );
    }

    if (method === 'rpc') {
      const fn = op.function ?? op.name;
      if (!isValidFunctionName(fn)) {
        throw new RpcError(`Operação ${index + 1}: nome de função inválido`);
      }
      return {
        method: 'rpc' as const,
        function: fn,
        payload: (op.payload ?? op.data ?? {}) as Record<string, any>,
      };
    }

    const table = String(op.table || '').trim();
    if (!table) {
      throw new RpcError(`Operação ${index + 1}: informe a tabela`);
    }
    if (method === 'update' || method === 'delete') {
      const id = op.id === undefined || op.id === null ? '' : String(op.id).trim();
      if (!id) {
        throw new RpcError(`Operação ${index + 1}: informe o id do registro`);
      }
      return {
        method,
        table,
        id,
        data: (op.data ?? {}) as Record<string, any>,
      };
    }

    return {
      method: 'insert' as const,
      table,
      data: (op.data ?? op.body ?? {}) as Record<string, any>,
    };
  });
}
