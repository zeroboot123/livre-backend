'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import {
  getActiveProjectId,
  setActiveProjectId as persistActiveProjectId,
  type Project,
} from '@/lib/projects';
import { Card, StatCard } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectError, setProjectError] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const data = await apiFetch('/projects');
      const list: Project[] = data.projects || [];
      setProjects(list);
      const stored = getActiveProjectId();
      const active = list.find((p) => p.id === stored) || null;
      if (active) setActiveId(active.id);
      else if (stored && !active) {
        persistActiveProjectId(null);
        setActiveId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    apiFetch('/stats').then(setStats).catch(() => {});
    loadProjects();
  }, [loadProjects]);

  const openCreate = () => {
    setProjectName('');
    setProjectError('');
    setModalOpen(true);
  };

  const selectProject = (project: Project) => {
    persistActiveProjectId(project.id);
    router.push('/database/datatypes');
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) {
      setProjectError('Informe o nome da aplicação');
      return;
    }
    setCreating(true);
    setProjectError('');
    try {
      const data = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      const project: Project = data.project;
      persistActiveProjectId(project.id);
      setProjects((prev) => [project, ...prev]);
      setModalOpen(false);
      setProjectName('');
      router.push('/database/datatypes');
    } catch (err: any) {
      setProjectError(err?.message || 'Erro ao criar projeto');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Olá, {user?.name} 👋</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Bem-vindo ao Livre Backend. Aqui está o resumo da sua plataforma.
        </p>
      </div>

      {/* Projetos */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">Projetos</h2>
            <p className="text-xs text-[#64748B]">
              Cada projeto tem um banco de dados dedicado para a aplicação.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span className="text-base leading-none">+</span>
            Novo projeto
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loadingProjects && (
            <Card className="text-sm text-[#94A3B8]">Carregando projetos...</Card>
          )}

          {!loadingProjects && projects.length === 0 && (
            <Card className="text-sm text-[#64748B] sm:col-span-2 lg:col-span-3 xl:col-span-3">
              Nenhum projeto ainda. Clique em <strong>Novo projeto</strong> para criar o primeiro
              banco de dados da sua aplicação.
            </Card>
          )}

          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                onClick={() => selectProject(project)}
                className={`group relative flex flex-col rounded-xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  active
                    ? 'border-[#2563EB] ring-2 ring-blue-500/15'
                    : 'border-[#E2E8F0] hover:border-blue-300'
                }`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg">
                    📁
                  </div>
                  {active && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                      Ativo
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-semibold text-[#0F172A]" title={project.name}>
                  {project.name}
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-[#94A3B8]" title={project.schema_name || ''}>
                  {project.schema_name || 'banco dedicado'}
                </p>
                <p className="mt-3 text-[11px] text-[#64748B]">
                  {project.created_at
                    ? `Criado em ${new Date(project.created_at).toLocaleDateString('pt-BR')}`
                    : 'Banco de dados'}
                </p>
                <span className="mt-3 text-xs font-medium text-[#2563EB] opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir database →
                </span>
              </button>
            );
          })}

          <button
            onClick={openCreate}
            className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-white/60 p-4 text-[#64748B] transition-colors hover:border-blue-400 hover:text-blue-600"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F9] text-xl">
              +
            </span>
            <span className="text-sm font-medium">Adicionar projeto</span>
            <span className="text-[11px] text-[#94A3B8]">Nome da aplicação</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Projetos" value={stats?.projects ?? '-'} icon="📁" />
        <StatCard label="Usuários" value={stats?.users ?? '-'} icon="👥" />
        <StatCard label="Tabelas" value={stats?.tables ?? '-'} icon="🗄️" />
        <StatCard label="Sessões Ativas" value={stats?.sessions ?? '-'} icon="🔑" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-[#0F172A] mb-4">Acesso Rápido</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <a href="/admin/database/datatypes" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:bg-[#F8FAFC] transition-all">
              <span className="text-2xl">🗄️</span>
              <span className="text-xs font-medium text-[#0F172A]">Data Types</span>
            </a>
            <a href="/admin/database/records" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:bg-[#F8FAFC] transition-all">
              <span className="text-2xl">📋</span>
              <span className="text-xs font-medium text-[#0F172A]">App Data</span>
            </a>
            <a href="/admin/users" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:bg-[#F8FAFC] transition-all">
              <span className="text-2xl">👥</span>
              <span className="text-xs font-medium text-[#0F172A]">Usuários</span>
            </a>
            <a href="/admin/projects" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:bg-[#F8FAFC] transition-all">
              <span className="text-2xl">📁</span>
              <span className="text-xs font-medium text-[#0F172A]">Projetos</span>
            </a>
            <a href="/admin/monitor" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:bg-[#F8FAFC] transition-all">
              <span className="text-2xl">📈</span>
              <span className="text-xs font-medium text-[#0F172A]">Monitor</span>
            </a>
            <a href="/admin/backups" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:bg-[#F8FAFC] transition-all">
              <span className="text-2xl">💾</span>
              <span className="text-xs font-medium text-[#0F172A]">Backups</span>
            </a>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-[#0F172A] mb-4">Informações</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-[#94A3B8]">API Auth</p>
              <p className="text-sm text-[#0F172A] font-mono">/auth</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">API REST</p>
              <p className="text-sm text-[#0F172A] font-mono">/api/rest</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">Status</p>
              <p className="text-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16A34A]"></span>
                Todos os serviços operacionais
              </p>
            </div>
            <hr className="border-[#E2E8F0]" />
            <p className="text-xs text-[#94A3B8]">Versão 1.0.0</p>
          </div>
        </Card>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo projeto" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              Nome da aplicação
            </label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createProject();
              }}
              placeholder="ex: Minha Loja"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Será criado um banco de dados dedicado (schema) só para este projeto.
            </p>
          </div>

          {projectError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {projectError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={createProject}
              disabled={creating || !projectName.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Criando...' : 'Criar projeto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
