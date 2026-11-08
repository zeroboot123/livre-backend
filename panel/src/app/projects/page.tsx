'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  getActiveProjectId,
  setActiveProjectId as persistActiveProjectId,
  type Project,
} from '@/lib/projects';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/projects');
      const list: Project[] = data.projects || [];
      setProjects(list);
      const stored = getActiveProjectId();
      setActiveId(list.find((p) => p.id === stored)?.id || null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      const project: Project = data.project;
      persistActiveProjectId(project.id);
      setName('');
      setShowForm(false);
      await load();
      router.push('/database/datatypes');
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar projeto');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">📁 Projetos</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Cada projeto tem um banco de dados dedicado para a aplicação.
          </p>
        </div>
        <button
          onClick={() => {
            setError('');
            setShowForm(!showForm);
          }}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Novo projeto
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createProject}
          className="mb-6 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-5"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-[#0F172A]">
              Nome da aplicação
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Minha Loja"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              required
              autoFocus
            />
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Será criado um banco de dados dedicado (schema) só para este projeto.
            </p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Criando...' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#475569] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-left text-sm text-[#64748B]">
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Banco de dados</th>
              <th className="p-4 font-medium">Criado em</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#94A3B8]">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && projects.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#64748B]">
                  Nenhum projeto encontrado. Clique em <strong>Novo projeto</strong>.
                </td>
              </tr>
            )}
            {projects.map((p) => {
              const active = p.id === activeProjectId;
              return (
                <tr key={p.id} className="border-b border-[#E2E8F0] text-sm last:border-b-0">
                  <td className="p-4 font-medium text-[#0F172A]">{p.name}</td>
                  <td className="p-4 font-mono text-xs text-[#64748B]">{p.schema_name}</td>
                  <td className="p-4 text-[#64748B]">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        active
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-[#F1F5F9] text-[#64748B]'
                      }`}
                    >
                      {active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href="/database/datatypes"
                      onClick={() => persistActiveProjectId(p.id)}
                      className="text-sm font-medium text-[#2563EB] hover:underline"
                    >
                      Abrir database →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
