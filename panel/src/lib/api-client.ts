export async function apiFetch(path: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://livrebackend.gerbox.com.br/admin/api';

  // Só envia Content-Type quando existe corpo. Caso contrário (ex.: DELETE sem
  // body) o Fastify rejeita com FST_ERR_CTP_EMPTY_JSON_BODY.
  const headers: Record<string, string> = {
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
