'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListTree, Pencil, Plus, KeyRound, Link2, Search, Trash2 } from 'lucide-react';
import { DataShell, useData } from '@/components/data/data-shell';
import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import {
  addColumn,
  columnTypeLabel,
  defaultLabel,
  deleteColumn,
  deleteTable,
  fetchColumns,
  fieldTypeLabel,
  setColumnLogicalType,
  type DataColumn,
} from '@/lib/data-api';

const typeBadge: Record<string, string> = {
  UUID: 'bg-slate-100 text-slate-600',
  Text: 'bg-slate-100 text-slate-600',
  Number: 'bg-green-50 text-green-700',
  Boolean: 'bg-amber-50 text-amber-700',
  Date: 'bg-blue-50 text-blue-700',
  JSON: 'bg-violet-50 text-violet-700',
  File: 'bg-orange-50 text-orange-700',
};

// Campos embutidos do Bubble (não podem ser removidos nem ter o tipo alterado).
const BUILTIN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'creator', 'slug']);
const USER_BUILTIN_FIELDS = new Set(['email', 'password_hash']);

function isBuiltinField(table: string, name: string) {
  return BUILTIN_FIELDS.has(name) || (table === 'users' && USER_BUILTIN_FIELDS.has(name));
}

function descKey(table: string, field: string) {
  return `livre_field_desc:${table}:${field}`;
}
function accessKey(table: string, field: string) {
  return `livre_field_access:${table}:${field}`;
}

function DataTypesInner() {
  const { selected, setSelected, reloadTables, tables } = useData();
  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeField, setActiveField] = useState<string>('');
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState('Privado');
  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newReference, setNewReference] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [newUnique, setNewUnique] = useState(false);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  const load = () => {
    if (!selected) return;
    setLoading(true);
    fetchColumns(selected)
      .then((cols) => {
        setColumns(cols);
        setActiveField((current) => current || cols.find((c) => c.primary)?.name || cols[0]?.name || '');
      })
      .catch(() => setColumns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setActiveField('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!selected || !activeField) {
      setDescription('');
      setAccess('Privado');
      return;
    }
    try {
      setDescription(localStorage.getItem(descKey(selected, activeField)) || '');
      setAccess(localStorage.getItem(accessKey(selected, activeField)) || 'Privado');
    } catch {
      setDescription('');
      setAccess('Privado');
    }
  }, [selected, activeField]);

  const active = useMemo(
    () => columns.find((c) => c.name === activeField) || null,
    [columns, activeField]
  );
  const activeBuiltin = !!active && isBuiltinField(selected, active.name);

  const saveDescription = (value: string) => {
    setDescription(value);
    if (selected && activeField) localStorage.setItem(descKey(selected, activeField), value);
  };

  const saveAccess = (value: string) => {
    setAccess(value);
    if (selected && activeField) localStorage.setItem(accessKey(selected, activeField), value);
  };

  const handleAddField = async () => {
    if (!selected) return;
    setAddError('');
    setSaving(true);
    try {
      const ref = newReference?.trim() || undefined;
      await addColumn(selected, {
        name: newName.trim(),
        type: ref ? 'uuid' : newType,
        required: newRequired,
        unique: newUnique,
        references: ref,
      });
      notify('Campo criado com sucesso');
      setAddOpen(false);
      setNewName('');
      setNewType('text');
      setNewReference('');
      setNewRequired(false);
      setNewUnique(false);
      load();
      reloadTables();
    } catch (err: any) {
      setAddError(err?.message || 'Erro ao criar campo');
    } finally {
      setSaving(false);
    }
  };

  const handleLogicalTypeChange = async (value: string) => {
    if (!selected || !activeField) return;
    setSaving(true);
    try {
      await setColumnLogicalType(selected, activeField, value);
      notify('Tipo do campo atualizado');
      load();
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar tipo', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (col: DataColumn) => {    if (!selected) return;
    if (isBuiltinField(selected, col.name)) {
      notify('Campos embutidos (Built-in) não podem ser removidos', 'error');
      return;
    }
    if (col.primary || col.name === 'id') {
      notify('Não é possível remover a chave primária', 'error');
      return;
    }
    if (
      !window.confirm(
        `Remover o campo "${col.name}" de "${selected}"?\n\nOs dados dessa coluna serão perdidos permanentemente.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteColumn(selected, col.name);
      notify(`Campo "${col.name}" removido`);
      if (activeField === col.name) setActiveField('');
      load();
      reloadTables();
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover campo', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async () => {
    if (!selected) return;
    if (selected === 'users') {
      notify('O data type User é nativo do projeto e não pode ser excluído', 'error');
      return;
    }
    if (
      !window.confirm(
        `Excluir o data type "${selected}"?\n\nTodos os registros e campos dessa tabela serão perdidos permanentemente.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteTable(selected);
      notify(`Data type "${selected}" excluído`);
      const list = (await reloadTables()) as { name: string }[];
      const next = list.find((t) => t.name !== selected)?.name || '';
      setSelected(next);
    } catch (err: any) {
      notify(err?.message || 'Erro ao excluir data type', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 pb-2 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[13px] text-slate-700">
            Fields for type <span className="font-semibold text-slate-900">{selected || '…'}</span>
          </h1>
          <button
            onClick={handleDeleteType}
            disabled={!selected || selected === 'users' || saving}
            title={
              selected === 'users'
                ? 'O data type User é nativo do projeto'
                : 'Excluir este data type'
            }
            className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete data type
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Editor central */}
        <div className="min-w-0 flex-1 overflow-auto px-4 pb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2">
            <span className="text-[11px] text-slate-500">Type name</span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-800">
              {selected || '…'}
            </span>
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Filtrar campos..."
                className="w-40 rounded border border-slate-200 bg-white py-1 pl-7 pr-2 text-[11px] focus:border-blue-500 focus:outline-none"
                onChange={(e) => {
                  const q = e.target.value.toLowerCase();
                  if (!q) return;
                  const found = columns.find((c) => c.name.toLowerCase().includes(q));
                  if (found) setActiveField(found.name);
                }}
              />
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add field
            </button>
          </div>

          <div className="overflow-hidden rounded border border-slate-300 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 bg-[#F3F4F6] text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Padrão</th>
                  <th className="px-3 py-2 font-semibold">Config</th>
                  <th className="px-3 py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-400">
                      Carregando campos...
                    </td>
                  </tr>
                )}
                {!loading && !columns.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center">
                      <ListTree className="mx-auto mb-2 h-5 w-5 text-slate-300" />
                      <p className="text-xs text-slate-400">Nenhum campo encontrado.</p>
                    </td>
                  </tr>
                )}
                {!loading &&
                  columns.map((col, index) => {
                    const label = columnTypeLabel(col);
                    const isActive = col.name === activeField;
                    const builtin = isBuiltinField(selected, col.name);
                    const isRef = col.references && !builtin;
                    const refName = isRef ? col.references!.split('.').pop() || col.references! : null;
                    return (
                      <tr
                        key={col.name}
                        onClick={() => setActiveField(col.name)}
                        className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                          index % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                        } ${isActive ? '!bg-blue-50' : ''} hover:!bg-slate-100`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-medium text-slate-800">{col.name}</span>
                            {col.primary && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                                <KeyRound className="h-2.5 w-2.5" />
                                PK
                              </span>
                            )}
                            {builtin && (
                              <span className="inline-flex rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-700">
                                Built-in field
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {isRef ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                              <Link2 className="h-2.5 w-2.5" />
                              {refName}
                            </span>
                          ) : (
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              typeBadge[label] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {label}
                          </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-500">{defaultLabel(col.default_value)}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {col.required && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                                Req
                              </span>
                            )}
                            {col.unique && (
                              <span className="rounded bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-700">
                                Uniq
                              </span>
                            )}
                            {!col.required && !col.unique && <span className="text-[10px] text-slate-300">-</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveField(col.name);
                              }}
                              title="Editar propriedades"
                              className="rounded p-1 text-slate-400 hover:bg-blue-100 hover:text-blue-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteField(col);
                              }}
                              disabled={builtin || saving}
                              title={
                                builtin
                                  ? 'Campo embutido (Built-in) não pode ser removido'
                                  : 'Remover campo'
                              }
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            {columns.length} campos · clique em um campo para editar as propriedades ao lado.
          </p>
        </div>

        {/* Painel de propriedades */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 lg:block">
          <h2 className="mb-3 text-[13px] font-semibold text-slate-800">Propriedades</h2>

          {!active && <p className="text-xs text-slate-400">Selecione um campo.</p>}

          {active && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Nome</label>
                <input
                  readOnly
                  value={active.name}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Tipo</label>
                <div className="flex items-center gap-2">
                  {active.references ? (
                    <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700">
                      <Link2 className="h-3 w-3" />
                      {active.references.split('.').pop() || active.references}
                    </span>
                  ) : (
                  <span
                    className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ${
                      typeBadge[columnTypeLabel(active)] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {columnTypeLabel(active)}
                  </span>
                  )}
                  <span className="text-[10px] text-slate-400">{active.type}</span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Tipo lógico
                </label>
                <select
                  value={(active.logical_type || fieldTypeLabel(active.type)).toLowerCase()}
                  onChange={(e) => handleLogicalTypeChange(e.target.value)}
                  disabled={saving || activeBuiltin}
                  className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="json">JSON</option>
                  <option value="uuid">UUID</option>
                  <option value="file">File</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-400">
                  {activeBuiltin
                    ? 'Campo embutido (Built-in field). O tipo é definido automaticamente.'
                    : 'Define como o campo aparece. “File” é armazenado como texto (URL/chave).'}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Tipo de Acesso</label>
                <select
                  value={access}
                  onChange={(e) => saveAccess(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Privado">Privado</option>
                  <option value="Público">Público</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Descrição</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => saveDescription(e.target.value)}
                  placeholder="Descrição opcional..."
                  className="w-full resize-none rounded border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <hr className="border-slate-200" />

              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Índices
                </h3>
                {active.primary || active.unique ? (
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    {active.primary && (
                      <li className="flex items-center gap-1.5">
                        <KeyRound className="h-3 w-3 text-blue-500" /> Chave primária
                      </li>
                    )}
                    {active.unique && (
                      <li className="flex items-center gap-1.5">
                        <KeyRound className="h-3 w-3 text-green-500" /> Índice único
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-400">Nenhum índice configurado.</p>
                )}
              </div>

              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Relacionamentos
                </h3>
                {active.references ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Link2 className="h-3 w-3 text-blue-500" />
                    {active.references}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">Nenhum relacionamento.</p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add field" size="md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome do campo</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ex: cliente"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Tipo: padrão ou referência a outra tabela */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Tipo</label>
            <select
              value={newType === 'reference' ? `ref:${newReference}` : newType}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('ref:')) {
                  setNewType('reference');
                  setNewReference(val.slice(4));
                } else {
                  setNewType(val);
                  setNewReference('');
                }
              }}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <optgroup label="Tipos primitivos">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
                <option value="timestamp">Timestamp</option>
                <option value="json">JSON</option>
                <option value="uuid">UUID</option>
                <option value="file">File</option>
              </optgroup>
              {tables.filter((t) => t.name !== selected).length > 0 && (
                <optgroup label="Referência a outra tabela">
                  {tables
                    .filter((t) => t.name !== selected)
                    .map((t) => (
                      <option key={t.name} value={`ref:${t.name}`}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            {newType === 'reference' && (
              <p className="mt-1 text-[10px] text-slate-400">
                Cria um campo UUID com chave estrangeira para a tabela <b>{newReference}</b>.
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Required
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newUnique}
                onChange={(e) => setNewUnique(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Unique
            </label>
          </div>

          {addError && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{addError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAddOpen(false)}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddField}
              disabled={saving || !newName.trim() || (newType === 'reference' && !newReference)}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Criando...' : 'Criar campo'}
            </button>
          </div>
        </div>
      </Modal>

      <Toast message={toast.message} kind={toast.kind} onClose={() => setToast({ message: null, kind: 'success' })} />
    </div>
  );
}

export default function DataTypesPage() {
  return (
    <DataShell>
      <DataTypesInner />
    </DataShell>
  );
}
