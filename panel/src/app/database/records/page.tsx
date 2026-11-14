'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Layers,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DataShell, useData } from '@/components/data/data-shell';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import {
  deleteRows,
  fetchColumns,
  fetchRows,
  fieldTypeLabel,
  insertRow,
  updateRow,
  type DataColumn,
  type DataRow,
} from '@/lib/data-api';

const LIMIT = 50;

const HIDDEN_COLUMNS = new Set([
  'password_hash',
  'email_confirmed',
  'token_version',
  'refresh_token',
  'refresh_token_hash',
  'email_token',
]);

// Campos embutidos (Built-in) não aparecem no formulário: são preenchidos automaticamente.
const BUILTIN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'creator', 'slug']);

const toolbarBtn =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

function formatCell(value: any) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }
  const s = String(value);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

function parseCsv(text: string): Record<string, string>[] {
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i] ?? '';
    });
    return obj;
  });
}

function csvEscape(value: any) {
  const s =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function AppDataInner() {
  const { selected, saveView } = useData();

  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterColumn, setFilterColumn] = useState('');
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [editRow, setEditRow] = useState<DataRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetchColumns(selected)
      .then((cols) => !cancelled && setColumns(cols))
      .catch(() => !cancelled && setColumns([]));
    return () => {
      cancelled = true;
    };
  }, [selected, refreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchRows(selected, { limit: LIMIT, offset, search, column: filterColumn })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((err) => !cancelled && setError(err?.message || 'Erro ao carregar registros'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, offset, search, filterColumn, refreshKey]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selected, offset, search, filterColumn]);

  const isUsersTable = selected === 'users';

  const editableColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          !HIDDEN_COLUMNS.has(c.name) &&
          !BUILTIN_FIELDS.has(c.name) &&
          !(c.primary && c.default_value)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns]
  );
  const safeColumns = useMemo(() => columns.filter((c) => !HIDDEN_COLUMNS.has(c.name)), [columns]);
  const orderedColumns = useMemo(() => {
    const score = (name: string) => {
      if (!BUILTIN_FIELDS.has(name)) return 0;
      return name === 'id' ? 1 : 2;
    };
    return [...safeColumns].sort((a, b) => score(a.name) - score(b.name));
  }, [safeColumns]);
  const visibleColumns = useMemo(() => orderedColumns.slice(0, 8), [orderedColumns]);
  const hiddenCount = Math.max(orderedColumns.length - visibleColumns.length, 0);

  const refresh = () => setRefreshKey((k) => k + 1);

  const openNew = () => {
    setForm({});
    setFormError('');
    setEditRow(null);
    setNewOpen(true);
  };

  const openEdit = (row: DataRow) => {
    const initial: Record<string, string> = {};
    editableColumns.forEach((c) => {
      const v = row[c.name];
      initial[c.name] =
        v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
    setForm(initial);
    setFormError('');
    setEditRow(row);
    setNewOpen(true);
  };

  const coerceValues = () => {
    const values: Record<string, any> = {};
    for (const col of editableColumns) {
      const raw = form[col.name];
      if (raw === undefined || raw === '') continue;
      const label = fieldTypeLabel(col.type);
      if (label === 'Number') values[col.name] = Number(raw);
      else if (label === 'Boolean') values[col.name] = raw === 'true';
      else if (label === 'JSON') {
        try {
          values[col.name] = JSON.parse(raw);
        } catch {
          values[col.name] = raw;
        }
      } else values[col.name] = raw;
    }
    // Campo virtual de senha da tabela nativa User (o backend gera o hash).
    if (isUsersTable && form.password) values.password = form.password;
    return values;
  };

  const submitForm = async () => {
    if (!selected) return;
    setFormError('');
    if (isUsersTable && !editRow && !form.password?.trim()) {
      setFormError('Informe uma senha para criar o usuário');
      return;
    }
    setSaving(true);
    try {
      const values = coerceValues();
      if (editRow) {
        await updateRow(selected, String(editRow.id), values);
        notify('Registro atualizado com sucesso');
      } else {
        await insertRow(selected, values);
        notify('Registro criado com sucesso');
      }
      setNewOpen(false);
      refresh();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao salvar registro');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!selected || !selectedIds.length) return;
    try {
      const res = await deleteRows(selected, selectedIds);
      notify(`${res?.deleted ?? selectedIds.length} registro(s) excluído(s)`);
      setConfirmDelete(false);
      setSelectedIds([]);
      refresh();
    } catch (err: any) {
      notify(err?.message || 'Erro ao excluir registros', 'error');
    }
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => c.name);
    const lines = rows.map((r) => visibleColumns.map((c) => csvEscape(r[c.name])).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Exportação CSV iniciada');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    try {
      const text = await file.text();
      const entries = parseCsv(text);
      if (!entries.length) {
        notify('CSV vazio ou inválido', 'error');
        return;
      }
      let ok = 0;
      for (const entry of entries.slice(0, 500)) {
        try {
          await insertRow(selected, entry);
          ok++;
        } catch {
          /* ignore invalid row */
        }
      }
      notify(`${ok} de ${entries.length} registro(s) importado(s)`);
      refresh();
    } catch {
      notify('Falha ao importar CSV', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const toggleId = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(String(r.id)));
  const toggleAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(rows.map((r) => String(r.id)));
  };

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + rows.length, total);

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      {/* Cabeçalho */}
      <div className="shrink-0 bg-white px-4 pb-2 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[13px] text-slate-700">
            Application data - All <span className="font-semibold text-slate-900">{selected || '…'}</span> -
            Development version
          </h1>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setViewOpen(true)} className={toolbarBtn}>
            New view
          </button>
          <a href="/admin/database/datatypes" className={toolbarBtn}>
            Edit primary fields
          </a>

          <div className="relative mx-1 min-w-[200px] flex-1">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={filterColumn ? `Search in ${filterColumn}...` : 'Search for data entries'}
              className="w-full rounded border border-slate-300 bg-white py-1.5 pl-3 pr-24 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
            {filterColumn && (
              <button
                onClick={() => setFilterColumn('')}
                className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
              >
                <Filter className="h-2.5 w-2.5" />
                {filterColumn}
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>

          <div className="rounded border border-slate-300 bg-white px-2 py-0.5 text-center text-[10px] leading-tight text-slate-500">
            <div className="font-semibold text-slate-700">
              {total} {total === 1 ? 'entry' : 'entries'}
            </div>
            <div>(displaying {rows.length})</div>
          </div>

          <button onClick={openNew} className={toolbarBtn} disabled={!selected}>
            New entry
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={!selectedIds.length}
            className={toolbarBtn}
          >
            Delete ({selectedIds.length})
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className={`${toolbarBtn} text-green-700`}
            disabled={!selected}
          >
            Upload <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              const row = rows.find((r) => String(r.id) === selectedIds[0]);
              if (row) openEdit(row);
            }}
            disabled={selectedIds.length !== 1}
            className={toolbarBtn}
          >
            Modify
          </button>
          <button onClick={exportCsv} disabled={!rows.length} className={toolbarBtn}>
            Export
          </button>

          <div className="relative">
            <button onClick={() => setBulkOpen((v) => !v)} className={toolbarBtn}>
              Bulk
            </button>
            {bulkOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBulkOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    onClick={() => {
                      toggleAll();
                      setBulkOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {allSelected ? 'Clear selection' : 'Select all'}
                  </button>
                  <button
                    onClick={() => {
                      setBulkOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleUpload} className="hidden" />

      {/* Tabela */}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {hiddenCount > 0 && (
          <div className="py-1.5 text-right text-[11px] text-slate-500">
            {hiddenCount} additional fields
          </div>
        )}

        {error && (
          <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden border border-slate-300 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 bg-[#F3F4F6]">
                  <th className="w-9 border-r border-slate-200 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                  </th>
                  {visibleColumns.map((col) => (
                    <th key={col.name} className="border-r border-slate-200 px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setFilterColumn((c) => (c === col.name ? '' : col.name));
                            setOffset(0);
                          }}
                          title={`Filtrar por ${col.name}`}
                          className={`rounded p-0.5 ${
                            filterColumn === col.name
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                          }`}
                        >
                          <Search className="h-3 w-3" />
                        </button>
                        <span className="whitespace-nowrap text-[12px] font-semibold text-slate-700">
                          {col.name}
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="w-8 px-2" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-3 py-10 text-center text-xs text-slate-400">
                      Carregando registros...
                    </td>
                  </tr>
                )}
                {!loading && !rows.length && (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-3 py-10 text-center">
                      <Table2 className="mx-auto mb-2 h-5 w-5 text-slate-300" />
                      <p className="text-xs text-slate-400">
                        {search ? 'Nenhum registro corresponde à busca.' : 'Nenhum registro ainda. Use “New entry”.'}
                      </p>
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((row, index) => {
                    const id = String(row.id ?? index);
                    const checked = selectedIds.includes(id);
                    return (
                      <tr
                        key={id}
                        className={`border-b border-slate-100 last:border-0 ${
                          index % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                        } ${checked ? '!bg-blue-50' : ''} hover:!bg-slate-100`}
                      >
                        <td className="border-r border-slate-100 px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleId(id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                          />
                        </td>
                        {visibleColumns.map((col) => (
                          <td
                            key={col.name}
                            className="max-w-[260px] truncate border-r border-slate-100 px-3 py-1.5 text-[12px] text-slate-700"
                            title={
                              row[col.name] === null || row[col.name] === undefined
                                ? ''
                                : typeof row[col.name] === 'object'
                                  ? JSON.stringify(row[col.name])
                                  : String(row[col.name])
                            }
                          >
                            {typeof row[col.name] === 'boolean' ? (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  row[col.name] ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {row[col.name] ? 'true' : 'false'}
                              </span>
                            ) : (
                              formatCell(row[col.name])
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={() => openEdit(row)}
                            title="Editar registro"
                            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Paginação */}
      <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500">
        <span>
          Showing {start}–{end} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(Math.max(offset - LIMIT, 0))} disabled={offset === 0} className={toolbarBtn}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <button onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total} className={toolbarBtn}>
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Modal novo/editar */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={editRow ? `Edit entry — ${selected}` : `New entry — ${selected}`}
        size="lg"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editableColumns.map((col) => {
              const label = fieldTypeLabel(col.type);
              return (
                <div key={col.name} className={label === 'JSON' ? 'sm:col-span-2' : ''}>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    {col.name}
                    {col.required && <span className="text-[10px] font-semibold text-amber-600">Req</span>}
                    <span className="text-[10px] font-normal text-slate-400">({label})</span>
                  </label>
                  {label === 'Boolean' ? (
                    <select
                      value={form[col.name] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [col.name]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    >
                      <option value="">—</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : label === 'JSON' ? (
                    <textarea
                      rows={3}
                      value={form[col.name] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [col.name]: e.target.value }))}
                      placeholder='{"chave": "valor"}'
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    />
                  ) : (
                    <input
                      type={label === 'Number' ? 'number' : 'text'}
                      value={form[col.name] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [col.name]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    />
                  )}
                </div>
              );
            })}
            {isUsersTable && (
              <div className="sm:col-span-2">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  password
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-700">
                    Built-in field
                  </span>
                  {!editRow && <span className="text-[10px] font-semibold text-amber-600">Req</span>}
                </label>
                <input
                  type="password"
                  value={form.password ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editRow ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 6 caracteres'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  A senha é armazenada com hash e nunca é exibida.
                </p>
              </div>
            )}
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setNewOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={submitForm}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : editRow ? 'Salvar alterações' : 'Criar registro'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal nova view */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="New view" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Nome da view</label>
            <input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder={`ex: ${selected} recentes`}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
            <p className="mt-1 text-[11px] text-slate-400">A view salva o data type atual na barra lateral.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setViewOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                saveView(viewName);
                setViewName('');
                setViewOpen(false);
                notify('View criada');
              }}
              disabled={!viewName.trim() || !selected}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Criar view
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Excluir registros"
        message={`Tem certeza que deseja excluir ${selectedIds.length} registro(s) de "${selected}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        danger
      />

      <Toast message={toast.message} kind={toast.kind} onClose={() => setToast({ message: null, kind: 'success' })} />
    </div>
  );
}

export default function AppDataPage() {
  return (
    <DataShell>
      <AppDataInner />
    </DataShell>
  );
}
