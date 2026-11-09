'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { DataShell, useData } from '@/components/data/data-shell';
import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/api-client';
import { getActiveProjectId } from '@/lib/projects';
import {
  createApiToken,
  fetchApiSettings,
  publicApiBase,
  revokeApiToken,
  setExposedTables,
  updateApiSettings,
  type ApiSettings,
  type ApiToken,
} from '@/lib/data-api';

function ApiInner() {
  const { tables } = useData();

  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [exposed, setExposed] = useState<string[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [projectRef, setProjectRef] = useState('');

  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });
  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApiSettings();
      setSettings(res.settings);
      setExposed(res.exposedTables);
      setTokens(res.tokens);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar configurações da API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Referência do projeto ativo (slug) para exibir os endpoints de autenticação.
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/projects');
        const id = getActiveProjectId();
        const project = (data.projects || []).find((p: any) => p.id === id);
        if (project?.slug) setProjectRef(project.slug);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const patch = async (values: Partial<ApiSettings>) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...values });
    setSaving(true);
    try {
      const updated = await updateApiSettings(values);
      setSettings(updated);
    } catch (err: any) {
      setSettings(prev);
      notify(err?.message || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleTable = async (name: string) => {
    const next = exposed.includes(name)
      ? exposed.filter((t) => t !== name)
      : [...exposed, name];
    setExposed(next);
    setSaving(true);
    try {
      const saved = await setExposedTables(next);
      setExposed(saved);
    } catch (err: any) {
      notify(err?.message || 'Erro ao salvar tabelas expostas', 'error');
      load();
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      notify('Não foi possível copiar', 'error');
    }
  };

  const handleGenerate = async () => {
    setSaving(true);
    try {
      const res = await createApiToken(tokenName.trim() || 'API token');
      setNewToken(res.token);
      setTokens((cur) => [res.apiToken, ...cur]);
      notify('Token gerado. Copie agora — ele não será exibido de novo.');
    } catch (err: any) {
      notify(err?.message || 'Erro ao gerar token', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revogar este token? Integrações que o usam param de funcionar.')) return;
    try {
      await revokeApiToken(id);
      setTokens((cur) => cur.map((t) => (t.id === id ? { ...t, revoked: true } : t)));
      notify('Token revogado');
    } catch (err: any) {
      notify(err?.message || 'Erro ao revogar token', 'error');
    }
  };

  const base = publicApiBase();
  const workflowUrl = `${base}/wf`;
  const authBase = `${base}/auth/${projectRef || ':project'}`;
  const authEndpoints = [
    { method: 'POST', path: `${authBase}/signup`, desc: 'Cria um usuário na tabela User nativa' },
    { method: 'POST', path: `${authBase}/login`, desc: 'Autentica e devolve um token JWT' },
    { method: 'GET', path: `${authBase}/me`, desc: 'Retorna o usuário do token (Bearer)' },
    { method: 'POST', path: `${authBase}/logout`, desc: 'Revoga os tokens do usuário' },
  ];

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[13px] font-semibold text-slate-800">API</h1>
          <span className="text-[11px] text-slate-400">
            {loading ? 'Carregando...' : saving ? 'Salvando...' : 'Salvo'}
          </span>
        </div>
      </div>

      {bannerOpen && (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
          <p className="flex-1 text-[12px] text-blue-800">
            <span className="font-semibold">Confirm your endpoints are secure.</span> Toda tabela
            exposta exige um <b>API token</b> válido para ser acessada.
          </p>
          <button className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700">
            Check my app
          </button>
          <button onClick={() => setBannerOpen(false)} className="text-blue-500 hover:text-blue-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="max-w-4xl space-y-5">
          {/* Workflow API */}
          <div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
              <input
                type="checkbox"
                checked={settings?.workflow_api_enabled ?? false}
                disabled={loading}
                onChange={(e) => patch({ workflow_api_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Enable Workflow API and backend workflows
            </label>
            {settings?.workflow_api_enabled && (
              <div className="ml-6 mt-1 flex items-center gap-2 text-[12px] text-slate-600">
                <span>
                  Workflow API root URL:{' '}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                    {workflowUrl}
                  </code>
                </span>
                <button
                  onClick={() => copy(workflowUrl)}
                  className="text-slate-400 hover:text-slate-700"
                  title="Copiar"
                >
                  {copied === workflowUrl ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Data API */}
          <div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
              <input
                type="checkbox"
                checked={settings?.data_api_enabled ?? false}
                disabled={loading}
                onChange={(e) => patch({ data_api_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Enable Data API
            </label>

            {settings?.data_api_enabled && (
              <div className="ml-6 mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {tables.map((t) => (
                  <label
                    key={t.name}
                    className="flex items-center gap-2 text-[12px] text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={exposed.includes(t.name)}
                      onChange={() => toggleTable(t.name)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
                {!tables.length && (
                  <p className="col-span-full text-[11px] text-slate-400">
                    Nenhum data type encontrado.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Opções */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input
                type="checkbox"
                checked={settings?.use_display_instead_of_id ?? false}
                disabled={loading || !settings?.data_api_enabled}
                onChange={(e) => patch({ use_display_instead_of_id: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
              />
              Use field display instead of ID for key names
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input
                type="checkbox"
                checked={settings?.hide_swagger ?? false}
                disabled={loading}
                onChange={(e) => patch({ hide_swagger: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
              />
              Hide Swagger API documentation access
            </label>
          </div>

          {/* Endpoints */}
          {settings?.data_api_enabled && (
            <div>
              <h2 className="mb-2 text-[13px] font-semibold text-slate-800">Endpoints expostos</h2>
              {!exposed.length && (
                <p className="text-[11px] text-slate-400">
                  Selecione tabelas acima para expor na API.
                </p>
              )}
              <div className="space-y-1">
                {exposed.map((name) => {
                  const url = `${base}/${name}`;
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5"
                    >
                      <span className="w-40 shrink-0 truncate text-[12px] font-medium text-slate-700">
                        {name}
                      </span>
                      <code className="flex-1 truncate text-[11px] text-slate-500">{url}</code>
                      <button
                        onClick={() => copy(url)}
                        title="Copiar link"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        {copied === url ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir (exige token)"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <hr className="border-slate-200" />

          {/* Autenticação nativa do projeto */}
          <div>
            <h2 className="mb-1 text-[15px] font-semibold text-slate-800">Authentication API</h2>
            <p className="mb-3 text-[11px] text-slate-500">
              Todo projeto nasce com a tabela nativa <b>User</b> (email, senha oculta, Slug, Created
              Date e Modified Date). Use os endpoints abaixo para cadastrar e autenticar usuários
              desse projeto.
            </p>
            <div className="space-y-1.5">
              {authEndpoints.map((endpoint) => (
                <div
                  key={endpoint.path + endpoint.method}
                  className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5"
                >
                  <span className="w-12 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-slate-600">
                    {endpoint.method}
                  </span>
                  <code className="flex-1 truncate text-[11px] text-slate-700">{endpoint.path}</code>
                  <span className="hidden shrink-0 text-[10px] text-slate-400 sm:block">
                    {endpoint.desc}
                  </span>
                  <button
                    onClick={() => copy(endpoint.path)}
                    title="Copiar endpoint"
                    className="shrink-0 text-slate-400 hover:text-slate-700"
                  >
                    {copied === endpoint.path ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Exemplo de login
              </p>
              <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-700">{`POST ${authBase}/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "sua-senha"
}`}</pre>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              O retorno inclui <code className="rounded bg-slate-100 px-1">token</code>. Envie-o como{' '}
              <code className="rounded bg-slate-100 px-1">Authorization: Bearer &lt;token&gt;</code>{' '}
              em <code className="rounded bg-slate-100 px-1">/me</code> ou{' '}
              <code className="rounded bg-slate-100 px-1">/logout</code>.
            </p>
          </div>

          <hr className="border-slate-200" />

          {/* Tokens */}
          <div>
            <h2 className="mb-3 text-[15px] font-semibold text-slate-800">Admin API Tokens</h2>

            <button
              onClick={() => {
                setNewToken(null);
                setTokenName('');
                setTokenOpen(true);
              }}
              className="rounded border border-blue-400 bg-white px-3 py-2 text-[12px] font-medium text-blue-700 hover:bg-blue-50"
            >
              Generate a new API token
            </button>

            <div className="mt-3 overflow-hidden rounded border border-slate-300 bg-white">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-300 bg-[#F3F4F6] text-slate-600">
                    <th className="px-3 py-1.5 font-semibold">Nome</th>
                    <th className="px-3 py-1.5 font-semibold">Token</th>
                    <th className="px-3 py-1.5 font-semibold">Criado em</th>
                    <th className="px-3 py-1.5 font-semibold">Último uso</th>
                    <th className="px-3 py-1.5 font-semibold">Status</th>
                    <th className="w-16 px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-1.5 text-slate-700">{t.name}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-500">{t.token_prefix}</td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {new Date(t.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {t.last_used_at ? new Date(t.last_used_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {t.revoked ? (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            revogado
                          </span>
                        ) : (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                            ativo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {!t.revoked && (
                          <button
                            onClick={() => handleRevoke(t.id)}
                            title="Revogar"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!tokens.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[11px] text-slate-400">
                        Nenhum token gerado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Code2 className="h-3.5 w-3.5" />
              Use o token no header <code className="mx-1 rounded bg-slate-100 px-1">X-API-Key</code>{' '}
              ou <code className="mx-1 rounded bg-slate-100 px-1">Authorization: Bearer &lt;token&gt;</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Modal gerar token */}
      <Modal open={tokenOpen} onClose={() => setTokenOpen(false)} title="Generate a new API token" size="md">
        {!newToken ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Nome do token</label>
              <input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="ex: Integração app mobile"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTokenOpen(false)}
                className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Gerando...' : 'Gerar token'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Copie o token agora. Por segurança, ele <b>não será exibido novamente</b>.
            </p>
            <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs text-slate-800">{newToken}</code>
              <button
                onClick={() => copy(newToken)}
                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
              >
                {copied === newToken ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setTokenOpen(false)}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Toast
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast({ message: null, kind: 'success' })}
      />
    </div>
  );
}

export default function ApiPage() {
  return (
    <DataShell showSidebar={false}>
      <ApiInner />
    </DataShell>
  );
}
