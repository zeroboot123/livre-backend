import { publicEnv } from './public-env';

export async function apiFetch(path: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const projectId =
    typeof window !== 'undefined' ? localStorage.getItem('livre_project_id') : null;
  const API = publicEnv('API_URL');

  // Só envia Content-Type quando existe corpo. Caso contrário (ex.: DELETE sem
  // body) o Fastify rejeita com FST_ERR_CTP_EMPTY_JSON_BODY.
  const headers: Record<string, string> = {
    ...(projectId ? { 'X-Project-Id': projectId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (options?.body !== undefined && options?.body !== null) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/admin/login';
    throw new Error('Sessão expirada');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Erro ${res.status}`);
  }

  return data;
}

/**
 * Chamadas diretas ao serviço de autenticação (usuários do sistema).
 * Usa o mesmo access_token do painel.
 */
export async function authFetch(path: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const AUTH = publicEnv('AUTH_URL');

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (options?.body !== undefined && options?.body !== null) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetch(`${AUTH}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/admin/login';
    throw new Error('Sessão expirada');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Erro ${res.status}`);
  }
  return data;
}
