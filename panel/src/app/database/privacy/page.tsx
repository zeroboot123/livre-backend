'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { DataShell, useData } from '@/components/data/data-shell';
import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import {
  createRlsRule,
  deleteRlsRule,
  fetchColumns,
  fetchRls,
  makeTablePublic,
  type RlsRule,
} from '@/lib/data-api';

const OPERATORS = [
  { value: '=', label: 'é igual a' },
  { value: '!=', label: 'é diferente de' },
  { value: '>', label: 'maior que' },
  { value: '<', label: 'menor que' },
  { value: '>=', label: 'maior ou igual a' },
  { value: '<=', label: 'menor ou igual a' },
  { value: 'contains', label: 'contém' },
  { value: 'is_null', label: 'é vazio' },
  { value: 'is_not_null', label: 'não é vazio' },
];

const DYNAMIC = [
  { value: '', label: '(valor fixo)' },
  { value: '{{current_user}}', label: 'Usuário atual do token' },
  { value: '{{current_tenant}}', label: 'Tenant atual do token' },
];

function ruleLabel(r: RlsRule) {
  if (r.operator === 'is_null') return `${r.field} é vazio`;
  if (r.operator === 'is_not_null') return `${r.field} não é vazio`;
  const op = OPERATORS.find((o) => o.value === r.operator)?.label || r.operator;
  const val =
    r.value === '{{current_user}}'
      ? 'Usuário atual'
      : r.value === '{{current_tenant}}'
        ? 'Tenant atual'
        : r.value;
  return `${r.field} ${op} ${val}`;
}

function PrivacyInner() {
  const { tables, selected, setSelected } = useData();

  const [rules, setRules] = useState<RlsRule[]>([]);
  const [rlsEnabled, setRlsEnabled] = useState<Record<string, boolean>>({});
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [error, setError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('=');
  const [dynamic, setDynamic] = useState('');
  const [value, setValue] = useState('');

  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });
  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchRls();
      setRules(res.rules);
      setRlsEnabled(res.rlsEnabled);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar regras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) {
      setColumns([]);
      return;
    }
    fetchColumns(selected)
      .then((cols) => setColumns(cols.map((c) => c.name)))
      .catch(() => setColumns([]));
  }, [selected]);

  const rulesByTable = useMemo(() => {
    const map: Record<string, RlsRule[]> = {};
    for (const r of rules) {
      (map[r.table_name] ||= []).push(r);
    }
    return map;
  }, [rules]);

  const currentRules = rulesByTable[selected] || [];
  const isPublic = currentRules.length === 0;

  const handleAddRule = async () => {
    if (!selected || !field) return;
    setSaving(true);
    try {
      const finalValue =
        operator === 'is_null' || operator === 'is_not_null'
          ? null
          : dynamic || value.trim();
      await createRlsRule({
        table_name: selected,
        field,
        operator,
        value: finalValue,
      });
      setAddOpen(false);
      setField('');
      setOperator('=');
      setDynamic('');
      setValue('');
      await load();
      notify('Regra criada');
    } catch (err: any) {
      notify(err?.message || 'Erro ao criar regra', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRlsRule(id);
      await load();
      notify('Regra removida');
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover regra', 'error');
    }
  };

  const handlePublic = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `Tornar "${selected}" publicamente visível? Todas as regras serão removidas e todos os registros ficarão acessíveis (com token).`
      )
    )
      return;
    setSaving(true);
    try {
      await makeTablePublic(selected);
      await load();
      notify('Tipo agora é publicamente visível');
    } catch (err: any) {
      notify(err?.message || 'Erro ao tornar público', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isNullOp = operator === 'is_null' || operator === 'is_not_null';

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 py-2">
        {bannerOpen && (
          <div className="mb-2 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
            <p className="flex-1 text-[12px] text-blue-800">
              <span className="font-semibold">Ensure your data is private.</span> As regras abaixo
              viram <b>políticas RLS reais</b> no PostgreSQL e valem para a API pública.
            </p>
            <button className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700">
              Check my app
            </button>
            <button onClick={() => setBannerOpen(false)} className="text-blue-500 hover:text-blue-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <h1 className="text-[13px] font-semibold text-slate-800">Privacy</h1>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-2">
          {tables.map((t) => {
            const count = (rulesByTable[t.name] || []).length;
            const active = t.name === selected;
            return (
              <button
                key={t.name}
                onClick={() => setSelected(t.name)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-[12px] ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                  {count > 0 ? `${count} regra(s)` : 'Publicly visible'}
                </span>
              </button>
            );
          })}
          {loading && <p className="px-4 py-2 text-[11px] text-slate-400">Carregando...</p>}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-[13px] font-semibold text-slate-800">
              {selected || 'Este tipo'} {isPublic ? 'is publicly visible' : 'is private'}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              {isPublic
                ? 'This type is visible by everyone. Create a rule if you want to restrict access.'
                : 'Este tipo só retorna as linhas que satisfazem as regras abaixo.'}
            </p>

            {currentRules.length > 0 && (
              <div className="mt-4 w-full space-y-1.5 rounded border border-slate-200 bg-white p-2 text-left">
                {currentRules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-[11px] text-slate-600"
                  >
                    <span className="truncate">{ruleLabel(r)}</span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="ml-2 shrink-0 text-red-500 hover:text-red-700"
                      title="Remover regra"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  setField(columns[0] || '');
                  setOperator('=');
                  setDynamic('');
                  setValue('');
                  setAddOpen(true);
                }}
                disabled={!selected}
                className="rounded border border-blue-400 bg-white px-3 py-1.5 text-[12px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                Add a rule
              </button>
              {!isPublic && (
                <button
                  onClick={handlePublic}
                  disabled={saving}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Make publicly visible
                </button>
              )}
            </div>

            {!isPublic && (
              <p className="mt-2 text-[10px] text-slate-400">
                RLS ativo nesta tabela:{' '}
                {rlsEnabled[selected] ? (
                  <span className="font-medium text-green-600">sim</span>
                ) : (
                  <span className="font-medium text-slate-500">não</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add privacy rule" size="md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-700">Operator</label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {!isNullOp && (
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-700">Value</label>
                <select
                  value={dynamic}
                  onChange={(e) => setDynamic(e.target.value)}
                  className="mb-1 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {DYNAMIC.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {!dynamic && (
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="valor"
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            A regra vira uma política RLS <code>USING</code>/<code>WITH CHECK</code> no banco. Vários
            fields são combinados com <b>E</b> (AND).
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAddOpen(false)}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddRule}
              disabled={saving || (!isNullOp && !dynamic && !value.trim())}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Add rule'}
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

export default function PrivacyPage() {
  return (
    <DataShell showSidebar={false}>
      <PrivacyInner />
    </DataShell>
  );
}
