'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/users').then((d) => setUsers(d.users || [])).catch(() => {});
  }, []);

  async function toggleBlock(userId: string, blocked: boolean) {
    const endpoint = blocked ? '/users/' + userId + '/unblock' : '/users/' + userId + '/block';
    await apiFetch(endpoint, { method: 'PATCH' });
    setUsers(users.map(u => u.id === userId ? { ...u, blocked: !blocked } : u));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">👥 Usuários</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Criado em</th>
              <th className="p-4 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhum usuário encontrado</td></tr>
            )}
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-800/50 text-sm">
                <td className="p-4 font-medium">{u.name}</td>
                <td className="p-4 text-gray-400">{u.email}</td>
                <td className="p-4">
                  <div className="flex gap-1.5">
                    {u.blocked && <span className="px-2 py-1 rounded-full text-xs bg-red-900 text-red-300">Bloqueado</span>}
                    {!u.active && <span className="px-2 py-1 rounded-full text-xs bg-yellow-900 text-yellow-300">Inativo</span>}
                    {u.active && !u.blocked && <span className="px-2 py-1 rounded-full text-xs bg-green-900 text-green-300">Ativo</span>}
                    {!u.email_confirmed && <span className="px-2 py-1 rounded-full text-xs bg-gray-800 text-gray-400">Não verificado</span>}
                  </div>
                </td>
                <td className="p-4 text-gray-400">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="p-4">
                  <button
                    onClick={() => toggleBlock(u.id, u.blocked)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      u.blocked
                        ? 'bg-green-900 text-green-300 hover:bg-green-800'
                        : 'bg-red-900 text-red-300 hover:bg-red-800'
                    }`}
                  >
                    {u.blocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}