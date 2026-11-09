import { apiFetch } from './api-client';

export interface DataTable {
  name: string;
  columns: number;
  entries: number;
}

export interface DataColumn {
  name: string;
  type: string;
  required: boolean;
  default_value: string | null;
  primary: boolean;
  unique: boolean;
  references?: string | null;
  logical_type?: string | null;
}

export interface DataRow {
  [key: string]: any;
}

export interface RowsResponse {
  rows: DataRow[];
  total: number;
  columns: string[];
  limit: number;
  offset: number;
}

export async function fetchTables(): Promise<DataTable[]> {
  const data = await apiFetch('/schema');
  return data.tables ?? [];
}

export async function fetchColumns(table: string): Promise<DataColumn[]> {
  if (!table) return [];
  const data = await apiFetch(`/schema/${encodeURIComponent(table)}/columns`);
  return data.columns ?? [];
}

export async function fetchRows(
  table: string,
  opts: { limit?: number; offset?: number; search?: string; column?: string } = {}
): Promise<RowsResponse> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  if (opts.search) qs.set('search', opts.search);
  if (opts.column) qs.set('column', opts.column);
  return apiFetch(`/data/${encodeURIComponent(table)}?${qs.toString()}`);
}

export async function insertRow(table: string, values: Record<string, any>) {
  return apiFetch(`/data/${encodeURIComponent(table)}`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export async function updateRow(table: string, id: string, values: Record<string, any>) {
  return apiFetch(`/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}

export async function deleteRows(table: string, ids: string[]) {
  return apiFetch(`/data/${encodeURIComponent(table)}`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

export async function createTable(name: string) {
  return apiFetch('/schema', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteTable(name: string) {
  return apiFetch(`/schema/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function addColumn(
  table: string,
  values: { name: string; type: string; required?: boolean; unique?: boolean; references?: string }
) {
  return apiFetch(`/schema/${encodeURIComponent(table)}/columns`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export async function deleteColumn(table: string, column: string) {
  return apiFetch(
    `/schema/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}`,
    { method: 'DELETE' }
  );
}

export async function setColumnLogicalType(
  table: string,
  column: string,
  logicalType: string
) {
  return apiFetch(
    `/schema/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}`,
    { method: 'PATCH', body: JSON.stringify({ logical_type: logicalType }) }
  );
}

// Human-friendly type label (Bubble style)
export function fieldTypeLabel(type: string): string {
  const t = (type || '').toLowerCase();
  if (t.startsWith('uuid')) return 'UUID';
  if (t.startsWith('character varying') || t === 'text' || t.startsWith('varchar')) return 'Text';
  if (t.startsWith('timestamp') || t.startsWith('date') || t.startsWith('time')) return 'Date';
  if (t.startsWith('numeric') || t.startsWith('integer') || t.startsWith('bigint') || t.startsWith('smallint') || t.startsWith('real') || t.startsWith('double')) return 'Number';
  if (t.startsWith('bool')) return 'Boolean';
  if (t.startsWith('json')) return 'JSON';
  if (t === 'file') return 'File';
  return type;
}

// Rótulo do campo priorizando o tipo lógico (ex.: "file" gravado como text).
export function columnTypeLabel(col: { type: string; logical_type?: string | null }): string {
  const logical = (col.logical_type || '').toLowerCase();
  const map: Record<string, string> = {
    text: 'Text',
    number: 'Number',
    boolean: 'Boolean',
    date: 'Date',
    timestamp: 'Date',
    json: 'JSON',
    uuid: 'UUID',
    file: 'File',
  };
  if (logical && map[logical]) return map[logical];
  return fieldTypeLabel(col.type);
}

export function defaultLabel(defaultValue: string | null): string {
  if (!defaultValue) return '-';
  const d = defaultValue.toLowerCase();
  if (d.includes('uuid_generate') || d.includes('gen_random_uuid')) return 'Auto';
  if (d.includes('now()') || d.includes('current_timestamp')) return 'Now';
  if (d === 'true' || d === 'false') return defaultValue;
  if (d.startsWith("'")) return d.replace(/^'|'$/g, '');
  return defaultValue.length > 24 ? defaultValue.slice(0, 24) + '…' : defaultValue;
}

// ============================================================
// Option sets
// ============================================================
export interface OptionSetOption {
  id: string;
  option_set_id: string;
  display: string;
  sort_order: number;
  metadata?: Record<string, any>;
}

export interface OptionSet {
  id: string;
  name: string;
  label?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  options: OptionSetOption[];
}

export async function fetchOptionSets(): Promise<OptionSet[]> {
  const data = await apiFetch('/option-sets');
  return data.optionSets ?? [];
}

export async function createOptionSet(name: string, label?: string): Promise<OptionSet> {
  const data = await apiFetch('/option-sets', {
    method: 'POST',
    body: JSON.stringify({ name, label }),
  });
  return data.optionSet as OptionSet;
}

export async function updateOptionSet(
  id: string,
  values: { name?: string; label?: string | null; description?: string | null }
): Promise<OptionSet> {
  const data = await apiFetch(`/option-sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
  return data.optionSet as OptionSet;
}

export async function deleteOptionSet(id: string) {
  return apiFetch(`/option-sets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createOption(
  setId: string,
  display: string,
  metadata?: Record<string, any>
): Promise<OptionSetOption> {
  const data = await apiFetch(`/option-sets/${encodeURIComponent(setId)}/options`, {
    method: 'POST',
    body: JSON.stringify({ display, metadata }),
  });
  return data.option as OptionSetOption;
}

export async function updateOption(
  setId: string,
  optionId: string,
  values: { display?: string; metadata?: Record<string, any> }
): Promise<OptionSetOption> {
  const data = await apiFetch(
    `/option-sets/${encodeURIComponent(setId)}/options/${encodeURIComponent(optionId)}`,
    { method: 'PATCH', body: JSON.stringify(values) }
  );
  return data.option as OptionSetOption;
}

export async function deleteOption(setId: string, optionId: string) {
  return apiFetch(
    `/option-sets/${encodeURIComponent(setId)}/options/${encodeURIComponent(optionId)}`,
    { method: 'DELETE' }
  );
}

// ============================================================
// File manager
// ============================================================
export interface StoredFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  is_private: boolean;
  attached_table: string | null;
  attached_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'https://livrebackend.gerbox.com.br/admin/api';
}

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('access_token');
  const projectId = localStorage.getItem('livre_project_id');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(projectId ? { 'X-Project-Id': projectId } : {}),
  };
}

export async function fetchFiles(
  opts: {
    limit?: number;
    offset?: number;
    search?: string;
    exact?: boolean;
    type?: string;
    privateOnly?: boolean;
  } = {}
): Promise<{ files: StoredFile[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  if (opts.search) qs.set('search', opts.search);
  if (opts.exact) qs.set('exact', 'true');
  if (opts.type && opts.type !== 'all') qs.set('type', opts.type);
  if (opts.privateOnly) qs.set('private', 'true');
  const data = await apiFetch(`/files?${qs.toString()}`);
  return {
    files: data.files ?? [],
    total: data.total ?? 0,
    limit: data.limit ?? opts.limit ?? 50,
    offset: data.offset ?? opts.offset ?? 0,
  };
}

export async function uploadFile(
  file: File,
  opts: { isPrivate?: boolean; attachedTable?: string; attachedId?: string } = {}
): Promise<StoredFile> {
  const form = new FormData();
  form.append('file', file);
  form.append('is_private', opts.isPrivate === false ? 'false' : 'true');
  if (opts.attachedTable) form.append('attached_table', opts.attachedTable);
  if (opts.attachedId) form.append('attached_id', opts.attachedId);

  const res = await fetch(`${apiBase()}/files`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/admin/login';
    throw new Error('Sessão expirada');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha no upload');
  return data.file as StoredFile;
}

export async function deleteFiles(ids: string[]) {
  return apiFetch('/files', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

/** URL pública e permanente do arquivo (funciona em <img src> e compartilhamento). */
export function publicFileUrl(id: string) {
  return `${apiBase()}/public/files/${encodeURIComponent(id)}`;
}

/** Alterna a visibilidade pública/privada de um arquivo. */
export async function toggleFileVisibility(id: string): Promise<{ is_private: boolean }> {
  const data = await apiFetch(`/files/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
  });
  return { is_private: data.file?.is_private ?? true };
}

export async function downloadFile(id: string, fileName: string) {
  const res = await fetch(`${apiBase()}/files/${encodeURIComponent(id)}/download`, {
    headers: authHeader(),
  });

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/admin/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) throw new Error('Falha ao baixar o arquivo');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// API pública (Data API + tokens)
// ============================================================
export interface ApiSettings {
  data_api_enabled: boolean;
  workflow_api_enabled: boolean;
  workflow_root_url: string | null;
  use_display_instead_of_id: boolean;
  hide_swagger: boolean;
  updated_at?: string;
}

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export interface ApiSettingsResponse {
  settings: ApiSettings;
  exposedTables: string[];
  tokens: ApiToken[];
}

export function publicApiBase() {
  return `${apiBase()}/public`;
}

export async function fetchApiSettings(): Promise<ApiSettingsResponse> {
  return apiFetch('/api-settings');
}

export async function updateApiSettings(
  values: Partial<ApiSettings>
): Promise<ApiSettings> {
  const data = await apiFetch('/api-settings', {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
  return data.settings as ApiSettings;
}

export async function setExposedTables(tables: string[]): Promise<string[]> {
  const data = await apiFetch('/api-settings/tables', {
    method: 'PUT',
    body: JSON.stringify({ tables }),
  });
  return data.exposedTables ?? [];
}

export async function createApiToken(
  name: string
): Promise<{ token: string; apiToken: ApiToken }> {
  return apiFetch('/api-tokens', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiToken(id: string) {
  return apiFetch(`/api-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ============================================================
// RLS (privacidade por linha)
// ============================================================
export interface RlsRule {
  id: string;
  table_name: string;
  field: string;
  operator: string;
  value: string | null;
  created_at: string;
}

export async function fetchRls(): Promise<{
  rules: RlsRule[];
  rlsEnabled: Record<string, boolean>;
}> {
  return apiFetch('/rls');
}

export async function createRlsRule(values: {
  table_name: string;
  field: string;
  operator: string;
  value: string | null;
}): Promise<{ rule: RlsRule }> {
  return apiFetch('/rls', {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export async function deleteRlsRule(id: string) {
  return apiFetch(`/rls/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function makeTablePublic(table: string) {
  return apiFetch(`/rls/${encodeURIComponent(table)}/public`, { method: 'POST' });
}
