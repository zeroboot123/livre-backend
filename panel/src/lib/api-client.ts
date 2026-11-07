export async function apiFetch(path: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://livrebackend.gerbox.com.br/admin/api';

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/admin/login';
    throw new Error('Sessão expirada');
  }

  return res.json();
}