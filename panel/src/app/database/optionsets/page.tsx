'use client';

import { useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { DataShell } from '@/components/data/data-shell';
import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import {
  createOption,
  createOptionSet,
  deleteOption,
  deleteOptionSet,
  fetchOptionSets,
  updateOption,
  updateOptionSet,
  type OptionSet,
} from '@/lib/data-api';

const LEGACY_KEY = 'livre_option_sets';

function OptionSetsInner() {
  const [sets, setSets] = useState<OptionSet[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [newSetName, setNewSetName] = useState('');
  const [newOption, setNewOption] = useState('');
  const [nameDraft, setNameDraft] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editOptionId, setEditOptionId] = useState('');

  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });
  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  const loadSets = async (preferredId?: string) => {
    const list = await fetchOptionSets();
    setSets(list);
    setSelectedId((current) => {
      const target = preferredId || current;
      return target && list.some((s) => s.id === target) ? target : list[0]?.id || '';
    });
    return list;
  };

  // Carrega do banco. Se o banco estiver vazio e existirem option sets
  // antigos no localStorage, importa uma única vez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        let list = await fetchOptionSets();

        if (!list.length) {
          try {
            const raw = localStorage.getItem(LEGACY_KEY);
            const legacy = raw ? JSON.parse(raw) : null;
            if (Array.isArray(legacy) && legacy.length) {
              for (const item of legacy) {
                if (!item?.name) continue;
                const created = await createOptionSet(String(item.name));
                for (const option of item.options || []) {
                  if (String(option).trim()) {
                    await createOption(created.id, String(option).trim());
                  }
                }
              }
              localStorage.removeItem(LEGACY_KEY);
              list = await fetchOptionSets();
              notify('Option sets locais importados para o banco');
            }
          } catch {
            /* importação é opcional */
          }
        }

        if (cancelled) return;
        setSets(list);
        setSelectedId(list[0]?.id || '');
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Erro ao carregar option sets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = sets.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    setNameDraft(current?.name || '');
  }, [current?.id, current?.name]);

  const filtered = sets.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateSet = async () => {
    const name = newSetName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await createOptionSet(name);
      setNewSetName('');
      await loadSets(created.id);
      notify('Option set criado');
    } catch (err: any) {
      notify(err?.message || 'Erro ao criar option set', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!current) return;
    const name = nameDraft.trim();
    if (!name || name === current.name) {
      setNameDraft(current.name);
      return;
    }
    setBusy(true);
    try {
      await updateOptionSet(current.id, { name });
      await loadSets(current.id);
      notify('Option set renomeado');
    } catch (err: any) {
      setNameDraft(current.name);
      notify(err?.message || 'Erro ao renomear', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSet = async () => {
    if (!current) return;
    if (!window.confirm(`Excluir o option set "${current.name}" e todas as suas opções?`)) return;
    setBusy(true);
    try {
      await deleteOptionSet(current.id);
      await loadSets();
      notify('Option set excluído');
    } catch (err: any) {
      notify(err?.message || 'Erro ao excluir option set', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOption = async () => {
    if (!current) return;
    const display = newOption.trim();
    if (!display) return;
    setBusy(true);
    try {
      await createOption(current.id, display);
      setNewOption('');
      await loadSets(current.id);
      notify('Opção criada');
    } catch (err: any) {
      notify(err?.message || 'Erro ao criar opção', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOption = async () => {
    if (!current || !editOptionId) return;
    const display = editValue.trim();
    if (!display) return;
    setBusy(true);
    try {
      await updateOption(current.id, editOptionId, { display });
      setEditOpen(false);
      await loadSets(current.id);
      notify('Opção atualizada');
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar opção', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!current) return;
    setBusy(true);
    try {
      await deleteOption(current.id, optionId);
      await loadSets(current.id);
      notify('Opção excluída');
    } catch (err: any) {
      notify(err?.message || 'Erro ao excluir opção', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[13px] font-semibold text-slate-800">Option sets</h1>
          <span className="text-[11px] text-slate-400">
            {loading ? 'Carregando...' : `${sets.length} option set(s)`}
          </span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Option sets"
                className="w-full rounded border border-slate-200 py-1 pl-7 pr-2 text-[11px] focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {loading && (
              <p className="px-3 py-2 text-[11px] text-slate-400">Carregando...</p>
            )}
            {!loading &&
              filtered.map((set) => (
                <button
                  key={set.id}
                  onClick={() => setSelectedId(set.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] ${
                    set.id === selectedId
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{set.name}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                    {set.options.length}
                    <Lock className="h-3 w-3 text-slate-300" />
                  </span>
                </button>
              ))}
            {!loading && !filtered.length && (
              <p className="px-3 py-2 text-[11px] text-slate-400">Nenhum option set.</p>
            )}
          </div>

          <div className="border-t border-slate-100 p-2">
            <p className="mb-1 text-[11px] font-medium text-slate-600">New option set</p>
            <div className="flex gap-1">
              <input
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSet()}
                placeholder="nome"
                className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleCreateSet}
                disabled={busy || !newSetName.trim()}
                className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-auto p-4">
          {!loading && !current && (
            <p className="text-xs text-slate-400">Crie ou selecione um option set.</p>
          )}

          {current && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[13px] text-slate-700">
                  Attributes and options for set{' '}
                  <span className="font-semibold text-slate-900">{current.name}</span>
                </h2>
                <button
                  onClick={handleDeleteSet}
                  disabled={busy}
                  title="Excluir option set"
                  className="rounded border border-red-200 bg-white p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px] text-slate-600">Option set name</span>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="w-56 rounded border border-slate-200 px-2 py-1 text-[12px] focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <p className="mb-1 text-[12px] text-slate-600">
                  Attributes (fields that describe each option)
                </p>
                <div className="rounded border border-slate-200 bg-white p-2">
                  <div className="flex items-center gap-3 text-[12px]">
                    <span className="w-24 font-medium text-slate-700">Display</span>
                    <span className="text-slate-500">text</span>
                    <span className="ml-auto text-[10px] text-slate-400">Built-in attribute</span>
                  </div>
                </div>
                <button
                  onClick={() =>
                    notify('Atributos personalizados serão habilitados em uma próxima etapa')
                  }
                  className="mt-2 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Create a new attribute
                </button>
              </div>

              <div>
                <p className="mb-1 text-[12px] text-slate-600">Options</p>
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-2">
                  <span className="text-[12px] text-slate-600">New option</span>
                  <input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateOption()}
                    className="w-52 rounded border border-slate-200 px-2 py-1 text-[12px] focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleCreateOption}
                    disabled={busy || !newOption.trim()}
                    className="rounded border border-blue-400 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>

                <div className="overflow-hidden rounded border border-slate-300 bg-white">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-300 bg-[#F3F4F6]">
                        <th className="w-10 px-2 py-1.5" />
                        <th className="px-2 py-1.5 font-semibold text-slate-600">Display (text)</th>
                        <th className="w-20 px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {current.options.map((option) => (
                        <tr
                          key={option.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => {
                                setEditOptionId(option.id);
                                setEditValue(option.display);
                                setEditOpen(true);
                              }}
                              className="text-slate-400 hover:text-blue-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-slate-700">{option.display}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex justify-end gap-1">
                              <Lock className="h-3.5 w-3.5 text-slate-300" />
                              <button
                                onClick={() => handleDeleteOption(option.id)}
                                disabled={busy}
                                className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!current.options.length && (
                        <tr>
                          <td colSpan={3} className="px-2 py-6 text-center text-[11px] text-slate-400">
                            Nenhuma opção criada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit option" size="sm">
        <div className="space-y-3">
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveOption()}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditOpen(false)}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveOption}
              disabled={busy || !editValue.trim()}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Salvando...' : 'Salvar'}
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

export default function OptionSetsPage() {
  return (
    <DataShell showSidebar={false}>
      <OptionSetsInner />
    </DataShell>
  );
}
