'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    apiFetch('/projects').then((d) => setProjects(d.projects || [])).catch(() => {});
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    const data = await apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, slug: slug || name.toLowerCase().replace(/\s+/g, '-') }),
    });
    setProjects([data.project, ...projects]);
    setShowForm(false);
    setName('');
    setSlug('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📁 Projetos</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">
          + Novo Projeto
        </button>
      </div>

      {showForm && (
        <form onSubmit={createProject} className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nome</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Slug (identificador)</label>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white text-sm"
                placeholder="Deixe em branco para gerar automático" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm">Criar</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Slug</th>
              <th className="p-4 font-medium">Chave Pública</th>
              <th className="p-4 font-medium">Ativo</th>
              <th className="p-4 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhum projeto encontrado</td></tr>
            )}
            {projects.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50 text-sm">
                <td className="p-4 font-medium">{p.name}</td>
                <td className="p-4 text-gray-400">{p.slug}</td>
                <td className="p-4 text-gray-400 font-mono text-xs">{p.public_key?.slice(0, 16)}...</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${p.active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {p.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="p-4 text-gray-400">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}