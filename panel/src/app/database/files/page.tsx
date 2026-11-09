'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, File, Link2, Lock, Trash2, Unlock, Upload } from 'lucide-react';
import { DataShell } from '@/components/data/data-shell';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import {
  deleteFiles,
  downloadFile,
  fetchFiles,
  publicFileUrl,
  toggleFileVisibility,
  uploadFile,
  type StoredFile,
} from '@/lib/data-api';

const LIMIT = 50;

function formatSize(bytes: number | null | undefined) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileManagerInner() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [exact, setExact] = useState(false);
  const [privateOnly, setPrivateOnly] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });
  const notify = (message: string, kind: ToastKind = 'success') => setToast({ message, kind });

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchFiles({ limit: LIMIT, offset, search, exact, type: typeFilter, privateOnly })
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files);
        setTotal(res.total);
      })
      .catch((err) => !cancelled && setError(err?.message || 'Erro ao carregar arquivos'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, exact, typeFilter, privateOnly, offset, refreshKey]);

  useEffect(() => {
    setSelected([]);
  }, [search, exact, typeFilter, privateOnly, offset]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const allSelected = files.length > 0 && files.every((f) => selected.includes(f.id));

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files || []);
    event.target.value = '';
    if (!list.length) return;

    setUploading(true);
    let ok = 0;
    let lastError = '';
    for (const file of list) {
      try {
        await uploadFile(file, { isPrivate: true });
        ok += 1;
      } catch (err: any) {
        lastError = err?.message || 'Falha no upload';
      }
    }
    setUploading(false);

    if (ok) {
      notify(`${ok} arquivo(s) enviado(s)${lastError ? ` · ${lastError}` : ''}`);
      setOffset(0);
      refresh();
    } else {
      notify(lastError || 'Nenhum arquivo enviado', 'error');
    }
  };

  const handleDelete = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Excluir ${selected.length} arquivo(s)? O objeto será removido do storage.`)) {
      return;
    }
    try {
      const res = await deleteFiles(selected);
      notify(`${res?.deleted ?? selected.length} arquivo(s) excluído(s)`);
      setSelected([]);
      refresh();
    } catch (err: any) {
      notify(err?.message || 'Erro ao excluir arquivos', 'error');
    }
  };

  const handleDownload = async (file: StoredFile) => {
    try {
      await downloadFile(file.id, file.file_name);
    } catch (err: any) {
      notify(err?.message || 'Erro ao baixar o arquivo', 'error');
    }
  };

  const handleCopyLink = async (file: StoredFile) => {
    const url = publicFileUrl(file.id);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      notify('Link copiado para a área de transferência');
    } catch {
      notify('Não foi possível copiar o link', 'error');
    }
  };

  const handleToggleVisibility = async (file: StoredFile) => {
    try {
      const result = await toggleFileVisibility(file.id);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, is_private: result.is_private } : f
        )
      );
      notify(
        result.is_private
          ? 'Arquivo alterado para privado'
          : 'Arquivo alterado para público'
      );
    } catch (err: any) {
      notify(err?.message || 'Erro ao alterar visibilidade', 'error');
    }
  };

  const start = files.length ? offset + 1 : 0;
  const end = offset + files.length;

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[13px] font-semibold text-slate-800">File manager</h1>
          <button
            onClick={() => notify('Ambiente live ainda não configurado')}
            className="text-[11px] text-blue-700 hover:underline"
          >
            Switch to live database
          </button>
        </div>
      </div>

      <div className="shrink-0 bg-white px-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-slate-600">File name</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name"
            className="w-56 rounded border border-slate-200 px-2 py-1 text-[12px] focus:border-blue-500 focus:outline-none"
          />
          <span className="ml-2 text-[12px] text-slate-600">File type</span>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setOffset(0);
            }}
            className="rounded border border-slate-200 px-2 py-1 text-[12px] focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All files</option>
            <option value="image">Images</option>
            <option value="pdf">PDF</option>
            <option value="text">Text</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={exact}
              onChange={(e) => {
                setExact(e.target.checked);
                setOffset(0);
              }}
              className="rounded border-slate-300"
            />
            Exact match
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={privateOnly}
              onChange={(e) => {
                setPrivateOnly(e.target.checked);
                setOffset(0);
              }}
              className="rounded border-slate-300"
            />
            Only private files
          </label>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                setSearch(searchInput);
                setOffset(0);
              }}
              className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
            >
              Search
            </button>
            <button
              onClick={handleDelete}
              disabled={!selected.length}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {loading ? 'Carregando arquivos...' : `Showing files ${start}–${end} of ${total}`}
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-2">
        <div className="overflow-hidden border border-slate-300 bg-white">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-300 bg-[#F3F4F6] text-slate-600">
                <th className="w-9 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? files.map((f) => f.id) : [])}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                </th>
                <th className="px-2 py-1.5 font-semibold">File name</th>
                <th className="w-24 px-2 py-1.5 font-semibold">Size</th>
                <th className="w-40 px-2 py-1.5 font-semibold">Type</th>
                <th className="w-40 px-2 py-1.5 font-semibold">Upload date</th>
                <th className="w-20 px-2 py-1.5 font-semibold">Visibility</th>
                <th className="w-28 px-2 py-1.5 font-semibold">User ID</th>
                <th className="w-28 px-2 py-1.5 font-semibold">Attached to</th>
                <th className="w-20 px-2 py-1.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file.id}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                    selected.includes(file.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(file.id)}
                      onChange={() => toggle(file.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2 text-slate-700">
                      <File className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate" title={file.file_name}>
                        {file.file_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{formatSize(file.size_bytes)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{file.mime_type || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-600">
                    {new Date(file.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          file.is_private
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {file.is_private ? (
                          <Lock className="h-2.5 w-2.5" />
                        ) : (
                          <Unlock className="h-2.5 w-2.5" />
                        )}
                        {file.is_private ? 'Private' : 'Public'}
                      </span>
                      <button
                        onClick={() => handleToggleVisibility(file)}
                        title={
                          file.is_private
                            ? 'Tornar público'
                            : 'Tornar privado'
                        }
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      >
                        {file.is_private ? (
                          <Unlock className="h-3 w-3" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-400">
                    {file.uploaded_by ? file.uploaded_by.slice(0, 8) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-slate-400">
                    {file.attached_table ? file.attached_table : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyLink(file)}
                        title="Copiar link do arquivo"
                        aria-label={`Copiar link de ${file.file_name}`}
                        className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownload(file)}
                        title="Baixar arquivo"
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !files.length && (
                <tr>
                  <td colSpan={9} className="px-2 py-10 text-center">
                    <Upload className="mx-auto mb-2 h-5 w-5 text-slate-300" />
                    <p className="text-[11px] text-slate-400">
                      {search || privateOnly || typeFilter !== 'all'
                        ? 'Nenhum arquivo corresponde aos filtros.'
                        : 'Nenhum arquivo. Use "Upload" para adicionar.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && files.length < total && (
          <div className="mt-2 text-center">
            <button
              onClick={() => setOffset(offset + LIMIT)}
              className="text-[11px] font-medium text-blue-700 hover:underline"
            >
              Load 50 more items...
            </button>
          </div>
        )}
      </div>

      <Toast
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast({ message: null, kind: 'success' })}
      />
    </div>
  );
}

export default function FileManagerPage() {
  return (
    <DataShell showSidebar={false}>
      <FileManagerInner />
    </DataShell>
  );
}
