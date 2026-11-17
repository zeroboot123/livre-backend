'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  Eye,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { DataShell } from '@/components/data/data-shell';
import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import {
  deleteMigration,
  exportProjectSchema,
  fetchMigration,
  fetchMigrations,
  resetProjectSchema,
  retryMigration,
  runSqlMigration,
  type SqlMigration,
} from '@/lib/data-api';

type QueueStatus = 'pending' | 'running' | 'success' | 'error';

interface QueuedFile {
  key: string;
  filename: string;
  sql: string;
  size: number;
  status: QueueStatus;
  error?: string;
  statements?: number;
  durationMs?: number;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.sql') ? filename : `${filename}.sql`;
  link.click();
  URL.revokeObjectURL(url);
}

const MODEL_SCHEMA_SQL = `-- ============================================================
-- MODELO DE SCHEMA COMPATÍVEL COM O LIVRE BACKEND
-- ------------------------------------------------------------
-- Regras principais:
--   * NÃO crie a tabela "users": ela já existe em todo projeto e é
--     usada pela autenticação nativa do Livre Backend.
--   * Toda tabela precisa de "id uuid PRIMARY KEY DEFAULT uuid_generate_v4()".
--   * "creator", "slug", "created_at" e "updated_at" são adicionados
--     automaticamente pelo painel se não forem declarados.
--   * Não use CREATE SCHEMA nem SET search_path: o arquivo é executado
--     no schema do projeto ativo.
--   * Não use BEGIN/COMMIT: cada arquivo já roda dentro de uma transação.
--   * Para ligar dados ao usuário nativo, use REFERENCES users(id).
--   * Valores monetários: use numeric(14,2), nunca float.
-- ============================================================

-- Categorias (tabela raiz do exemplo)
CREATE TABLE IF NOT EXISTS categorias (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS categorias_nome_idx
  ON categorias (lower(nome));

-- Produtos: relacionamento com categorias
CREATE TABLE IF NOT EXISTS produtos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  categoria_id uuid REFERENCES categorias(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  preco numeric(14,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS produtos_categoria_id_idx ON produtos (categoria_id);

-- Pedidos: relacionamento com a tabela nativa de usuários
CREATE TABLE IF NOT EXISTS pedidos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id uuid REFERENCES users(id) ON DELETE SET NULL,
  produto_id uuid REFERENCES produtos(id) ON DELETE SET NULL,
  quantidade integer NOT NULL DEFAULT 1,
  total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente'
);

CREATE INDEX IF NOT EXISTS pedidos_usuario_id_idx ON pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS pedidos_produto_id_idx ON pedidos (produto_id);
`;

function StatusBadge({ status }: { status: QueueStatus }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
        <CheckCircle2 className="h-3 w-3" /> aplicada
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        <XCircle className="h-3 w-3" /> erro
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
        <Loader2 className="h-3 w-3 animate-spin" /> executando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
      na fila
    </span>
  );
}

function SqlMigrationsInner() {
  const [history, setHistory] = useState<SqlMigration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorName, setEditorName] = useState('');
  const [editorSql, setEditorSql] = useState('');
  const [editorError, setEditorError] = useState('');

  const [viewing, setViewing] = useState<SqlMigration | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });
  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = async () => {
    const list = await fetchMigrations();
    setHistory(list);
    return list;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchMigrations()
      .then((list) => {
        if (!cancelled) setHistory(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar migrations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) => /\.sql$/i.test(f.name) || f.type === 'text/plain' || f.type === 'application/sql'
    );
    if (!list.length) {
      notify('Selecione arquivos .sql', 'error');
      return;
    }

    const added: QueuedFile[] = [];
    for (const file of list) {
      if (file.size > 1024 * 1024) {
        notify(`${file.name}: arquivo maior que 1 MB`, 'error');
        continue;
      }
      try {
        const text = await file.text();
        added.push({
          key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          filename: file.name,
          sql: text,
          size: file.size,
          status: 'pending',
        });
      } catch {
        notify(`${file.name}: falha ao ler o arquivo`, 'error');
      }
    }

    if (added.length) {
      setQueue((current) => [...current, ...added]);
      notify(`${added.length} arquivo(s) adicionado(s) à fila`, 'info');
    }
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Copia a lista ANTES de limpar o input: o FileList é "vivo" e fica
    // vazio ao definir value = ''.
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) await addFiles(files);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer?.files?.length) await addFiles(event.dataTransfer.files);
  };

  const removeQueued = (key: string) =>
    setQueue((current) => current.filter((item) => item.key !== key));

  const runQueue = async () => {
    const pending = queue.filter((item) => item.status === 'pending' || item.status === 'error');
    if (!pending.length) {
      notify('Nenhum arquivo pendente na fila', 'info');
      return;
    }

    setRunning(true);
    let applied = 0;
    let failed = 0;

    for (const item of pending) {
      setQueue((current) =>
        current.map((q) => (q.key === item.key ? { ...q, status: 'running', error: undefined } : q))
      );
      try {
        const result = await runSqlMigration(item.filename, item.sql);
        applied += 1;
        setQueue((current) =>
          current.map((q) =>
            q.key === item.key
              ? {
                  ...q,
                  status: 'success',
                  statements: result.statements,
                  durationMs: result.duration_ms ?? undefined,
                }
              : q
          )
        );
      } catch (err: any) {
        failed += 1;
        setQueue((current) =>
          current.map((q) =>
            q.key === item.key ? { ...q, status: 'error', error: err?.message || 'Erro' } : q
          )
        );
        break;
      }
    }

    setRunning(false);
    await loadHistory().catch(() => {});
    if (failed) {
      notify('Execução interrompida no primeiro erro. Veja os detalhes na fila.', 'error');
    } else {
      notify(`${applied} migration(s) aplicada(s) com sucesso`);
    }
  };

  const clearFinished = () =>
    setQueue((current) => current.filter((item) => item.status !== 'success'));

  const openEditor = () => {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    setEditorName(`manual_${stamp}.sql`);
    setEditorSql('');
    setEditorError('');
    setEditorOpen(true);
  };

  const runEditorSql = async () => {
    if (!editorSql.trim()) {
      setEditorError('Escreva o SQL antes de executar.');
      return;
    }
    setEditorError('');
    setEditorOpen(false);
    setRunning(true);
    try {
      const result = await runSqlMigration(editorName || 'manual.sql', editorSql);
      notify(
        `SQL aplicado: ${result.statements} comando(s) em ${result.duration_ms ?? 0} ms`
      );
      await loadHistory().catch(() => {});
    } catch (err: any) {
      notify(err?.message || 'Erro ao executar SQL', 'error');
      await loadHistory().catch(() => {});
    } finally {
      setRunning(false);
    }
  };

  const viewSql = async (id: string) => {
    setViewLoading(true);
    setViewing(null);
    try {
      setViewing(await fetchMigration(id));
    } catch (err: any) {
      notify(err?.message || 'Erro ao carregar migration', 'error');
    } finally {
      setViewLoading(false);
    }
  };

  const handleRetry = async (migration: SqlMigration) => {
    if (!window.confirm(`Reexecutar "${migration.filename}"?`)) return;
    setRunning(true);
    try {
      const result = await retryMigration(migration.id);
      notify(`"${result.filename}" aplicada com sucesso`);
      await loadHistory().catch(() => {});
    } catch (err: any) {
      notify(err?.message || 'Erro ao reexecutar migration', 'error');
      await loadHistory().catch(() => {});
    } finally {
      setRunning(false);
    }
  };

  const handleForceRun = async (migration: SqlMigration) => {
    if (
      !window.confirm(
        `Forçar a reexecução de "${migration.filename}"? O script já foi aplicado e pode causar erros ou duplicar dados/objetos.`
      )
    ) {
      return;
    }
    setRunning(true);
    try {
      const full = await fetchMigration(migration.id);
      const result = await runSqlMigration(
        full.filename,
        full.sql_text || '',
        true
      );
      notify(`"${result.filename}" reexecutada (forçado)`);
      await loadHistory().catch(() => {});
    } catch (err: any) {
      notify(err?.message || 'Erro ao reexecutar migration', 'error');
      await loadHistory().catch(() => {});
    } finally {
      setRunning(false);
    }
  };

  const handleDeleteHistory = async (migration: SqlMigration) => {
    if (
      !window.confirm(
        `Remover "${migration.filename}" do histórico? O SQL já aplicado NÃO será desfeito.`
      )
    ) {
      return;
    }
    try {
      await deleteMigration(migration.id);
      notify('Registro removido do histórico');
      setHistory((current) => current.filter((item) => item.id !== migration.id));
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover registro', 'error');
    }
  };

  const handleDownloadModel = () => {
    downloadTextFile('modelo_schema.sql', MODEL_SCHEMA_SQL);
    notify('Modelo de schema baixado');
  };

  const handleResetSchema = async () => {
    if (!resetPassword.trim()) return;
    setResetting(true);
    try {
      await resetProjectSchema(resetPassword);
      setResetOpen(false);
      setResetPassword('');
      setQueue([]);
      await loadHistory().catch(() => {});
      notify('Schema resetado. Apenas a tabela nativa users permanece.');
    } catch (err: any) {
      notify(err?.message || 'Erro ao resetar schema', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleExportSchema = async () => {
    setRunning(true);
    try {
      const dump = await exportProjectSchema();
      downloadTextFile(dump.filename, dump.sql);
      notify(`Schema exportado: ${dump.filename}`);
    } catch (err: any) {
      notify(err?.message || 'Erro ao exportar schema', 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleDownloadMigration = async (migration: SqlMigration) => {
    try {
      const full = migration.sql_text ? migration : await fetchMigration(migration.id);
      downloadTextFile(migration.filename, full.sql_text || '');
    } catch (err: any) {
      notify(err?.message || 'Erro ao baixar SQL', 'error');
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'error').length;

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-blue-600" />
            <h1 className="text-[13px] font-semibold text-slate-800">SQL migrations</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportSchema}
              disabled={running}
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              Exportar schema
            </button>
            <button
              onClick={() => {
                setResetPassword('');
                setResetOpen(true);
              }}
              disabled={running}
              className="flex items-center gap-1 rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Resetar schema
            </button>
            <button
              onClick={openEditor}
              disabled={running}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Novo SQL
            </button>
            <button
              onClick={runQueue}
              disabled={running || !pendingCount}
              className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Executar {pendingCount ? `(${pendingCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-2">
        <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Os arquivos são executados em <strong>transação</strong> no schema do projeto ativo.
            Comandos destrutivos (<code>DROP</code>, <code>ALTER</code>, <code>DELETE</code>) não
            podem ser desfeitos pelo painel. O histórico fica registrado abaixo.
          </p>
        </div>

        <div className="mb-3 overflow-hidden rounded border border-blue-200 bg-blue-50">
          <button
            type="button"
            onClick={() => setGuideOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            Guia: schema compatível com o Livre Backend
            {guideOpen ? (
              <ChevronUp className="ml-auto h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="ml-auto h-3.5 w-3.5" />
            )}
          </button>
          {guideOpen && (
            <div className="border-t border-blue-200 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  A tabela <code className="rounded bg-blue-100 px-1">users</code> já existe em todo
                  projeto (autenticação nativa). <strong>Não a recrie</strong> no arquivo.
                </li>
                <li>
                  Toda tabela precisa de{' '}
                  <code className="rounded bg-blue-100 px-1">
                    id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
                  </code>
                  .
                </li>
                <li>
                  <code className="rounded bg-blue-100 px-1">creator</code>,{' '}
                  <code className="rounded bg-blue-100 px-1">slug</code>,{' '}
                  <code className="rounded bg-blue-100 px-1">created_at</code> e{' '}
                  <code className="rounded bg-blue-100 px-1">updated_at</code> são adicionados
                  automaticamente se faltarem.
                </li>
                <li>
                  Para ligar dados ao usuário nativo use{' '}
                  <code className="rounded bg-blue-100 px-1">
                    REFERENCES users(id) ON DELETE SET NULL
                  </code>
                  .
                </li>
                <li>
                  Não use{' '}
                  <code className="rounded bg-blue-100 px-1">CREATE SCHEMA</code>,{' '}
                  <code className="rounded bg-blue-100 px-1">SET search_path</code> nem{' '}
                  <code className="rounded bg-blue-100 px-1">BEGIN/COMMIT</code>.
                </li>
                <li>
                  Valores monetários: <code className="rounded bg-blue-100 px-1">numeric(14,2)</code>{' '}
                  — nunca <code className="rounded bg-blue-100 px-1">float</code>.
                </li>
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadModel}
                  className="flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Download className="h-3 w-3" />
                  Baixar modelo .sql
                </button>
                <span className="text-[10px] text-blue-700">
                  O modelo cria categorias, produtos e pedidos com relacionamentos.
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'
          }`}
        >
          <Upload className="h-5 w-5 text-slate-400" />
          <p className="text-[12px] font-medium text-slate-700">
            Importar arquivos .sql — arraste ou clique para selecionar
          </p>
          <p className="text-[11px] text-slate-500">
            Ex.: 001_schema.sql, 002_seed.sql · até 1 MB por arquivo
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".sql,text/plain"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {queue.length > 0 && (
          <div className="mb-4 overflow-hidden rounded border border-slate-300 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#F3F4F6] px-3 py-1.5">
              <span className="text-[11px] font-semibold text-slate-700">
                Fila de execução ({queue.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearFinished}
                  className="text-[11px] text-slate-600 hover:underline"
                >
                  Limpar aplicadas
                </button>
                <button
                  onClick={() => setQueue([])}
                  disabled={running}
                  className="text-[11px] text-slate-600 hover:underline disabled:opacity-40"
                >
                  Limpar tudo
                </button>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {queue.map((item) => (
                <li key={item.key} className="px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-800">{item.filename}</span>
                    <span className="text-[11px] text-slate-500">{formatBytes(item.size)}</span>
                    <StatusBadge status={item.status} />
                    {item.status === 'success' && (
                      <span className="text-[11px] text-slate-500">
                        {item.statements} comando(s)
                        {item.durationMs != null ? ` · ${item.durationMs} ms` : ''}
                      </span>
                    )}
                    <button
                      onClick={() => removeQueued(item.key)}
                      disabled={running || item.status === 'running'}
                      title="Remover da fila"
                      className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {item.error && (
                    <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                      {item.error}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-1.5 flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-slate-500" />
          <h2 className="text-[12px] font-semibold text-slate-700">Histórico do projeto</h2>
          <button
            onClick={() => loadHistory().catch(() => {})}
            title="Atualizar histórico"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="overflow-hidden rounded border border-slate-300 bg-white">
          {loading ? (
            <p className="px-3 py-6 text-center text-[12px] text-slate-400">
              Carregando histórico...
            </p>
          ) : !history.length ? (
            <p className="px-3 py-6 text-center text-[12px] text-slate-400">
              Nenhuma migration executada neste projeto ainda.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map((migration) => (
                <li key={migration.id} className="px-3 py-2 text-[12px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-800">{migration.filename}</span>
                    <StatusBadge status={migration.status} />
                    <span className="text-[11px] text-slate-500">
                      {formatDate(migration.executed_at || migration.created_at)}
                    </span>
                    {migration.status === 'success' && (
                      <span className="text-[11px] text-slate-500">
                        {migration.statements} comando(s)
                        {migration.duration_ms != null ? ` · ${migration.duration_ms} ms` : ''}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => handleDownloadMigration(migration)}
                        title="Baixar .sql"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => viewSql(migration.id)}
                        title="Ver SQL"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {migration.status === 'error' && (
                        <button
                          onClick={() => handleRetry(migration)}
                          disabled={running}
                          title="Reexecutar"
                          className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {migration.status === 'success' && (
                        <button
                          onClick={() => handleForceRun(migration)}
                          disabled={running}
                          title="Forçar reexecução"
                          className="rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-30"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteHistory(migration)}
                        disabled={running}
                        title="Remover do histórico"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {migration.error && (
                    <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                      {migration.error}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="Novo SQL"
        size="lg"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome do arquivo</label>
            <input
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="001_schema.sql"
              className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">SQL</label>
            <textarea
              value={editorSql}
              onChange={(e) => setEditorSql(e.target.value)}
              rows={16}
              spellCheck={false}
              placeholder={'CREATE TABLE categorias (\n  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\n  nome text NOT NULL\n);'}
              className="w-full rounded border border-slate-200 px-2.5 py-1.5 font-mono text-[12px] focus:border-blue-500 focus:outline-none"
            />
          </div>
          {editorError && <p className="text-xs text-red-600">{editorError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditorOpen(false)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={runEditorSql}
              disabled={running}
              className="rounded bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Executar SQL
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!viewing || viewLoading}
        onClose={() => {
          setViewing(null);
          setViewLoading(false);
        }}
        title={viewing?.filename || 'Carregando...'}
        size="lg"
      >
        {viewLoading || !viewing ? (
          <p className="py-6 text-center text-xs text-slate-400">Carregando SQL...</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <StatusBadge status={viewing.status} />
              <span>{viewing.statements} comando(s)</span>
              {viewing.duration_ms != null && <span>{viewing.duration_ms} ms</span>}
              <span>{formatDate(viewing.executed_at || viewing.created_at)}</span>
            </div>
            {viewing.error && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                {viewing.error}
              </pre>
            )}
            <pre className="max-h-[45vh] overflow-auto whitespace-pre rounded bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-100">
              {viewing.sql_text}
            </pre>
            <div className="flex justify-end">
              <button
                onClick={() => handleDownloadMigration(viewing)}
                className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar .sql
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => {
          if (!resetting) setResetOpen(false);
        }}
        title="Resetar schema do projeto"
        size="md"
      >
        <div className="space-y-3 text-[12px] text-slate-700">
          <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Isso apaga <strong>todas as tabelas e todos os dados</strong> do projeto,
              incluindo a tabela nativa <code className="rounded bg-red-100 px-1">users</code>,
              além de views, funções e tipos. O histórico de migrations, as regras de
              privacidade e as tabelas expostas na API também serão limpos. Tokens de API,
              arquivos e configurações do projeto são mantidos.
            </p>
          </div>
          <p>
            Esta ação <strong>não pode ser desfeita</strong>. O schema voltará apenas com a
            estrutura nativa (tabela <code className="rounded bg-slate-100 px-1">users</code>{' '}
            vazia).
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-700">
              Digite a senha do administrador para confirmar
            </label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="Senha do administrador"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-[12px] focus:border-red-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setResetOpen(false)}
              disabled={resetting}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleResetSchema}
              disabled={resetting || !resetPassword.trim()}
              className="flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              {resetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Resetar schema
            </button>
          </div>
        </div>
      </Modal>

      <Toast
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast({ message: null, kind: 'success' })}
      />
    </div>
  );
}

export default function SqlMigrationsPage() {
  return (
    <DataShell showSidebar={false}>
      <SqlMigrationsInner />
    </DataShell>
  );
}
