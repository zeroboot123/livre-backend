'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

export default function PermissionsPage() {
  const [projectUsers, setProjectUsers] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/project-users').then((d) => setProjectUsers(d.projectUsers || [])).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">🔐 Permissões</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
              <th className="p-4 font-medium">Usuário</th>
              <th className="p-4 font-medium">Projeto</th>
              <th className="p-4 font-medium">Função</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {projectUsers.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhuma permissão configurada</td></tr>
            )}
            {projectUsers.map((pu: any, i: number) => (
              <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 text-sm">
                <td className="p-4 font-medium">{pu.user_name || pu.user_id?.slice(0, 8)}</td>
                <td className="p-4 text-gray-400">{pu.project_name || pu.project_id?.slice(0, 8)}</td>
                <td className="p-4">
                  <span className="px-2 py-1 rounded-full text-xs bg-blue-900 text-blue-300">{pu.role || 'user'}</span>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${pu.active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {pu.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}