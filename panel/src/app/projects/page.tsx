'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  getActiveProjectId,
  setActiveProjectId as persistActiveProjectId,
  setActiveProjectName,
  type Project,
} from '@/lib/projects';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/projects');
      const list: Project[] = data.projects || [];
      setProjects(list);
      const stored = getActiveProjectId();
      const active = list.find((p) => p.id === stored) || null;
      if (active) {
        setActiveId(active.id);
        setActiveProjectName(active.name);
      } else {
        persistActiveProjectId(null);
        setActiveProjectName(null);
        setActiveId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setError('');
    setModalOpen(true);
  };

  const selectProject = (project: Project) => {
    persistActiveProjectId(project.id);
    setActiveProjectName(project.name);
    router.push('/database/datatypes');
  };

  const createProject = async () => {
    const clean = name.trim();
    if (!clean) {
      setError('Informe o nome da aplicação');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: clean }),
      });
      const project: Project = data.project;
      persistActiveProjectId(project.id);
      setActiveProjectName(project.name);
      setProjects((prev) => [project, ...prev]);
      setModalOpen(false);
      setName('');
      router.push('/database/datatypes');
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar projeto');
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (project: Project) => {
    setDeleteError('');
    setDeletePassword('');
    setDeleteTarget(project);
  };

  const deleteProject = async () => {
    if (!deleteTarget || !deletePassword.trim()) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await apiFetch(`/projects/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      const wasActive = deleteTarget.id === getActiveProjectId();
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (wasActive) {
        persistActiveProjectId(null);
        setActiveProjectName(null);
        setActiveId(null);
      }
      setNotice(`Projeto "${deleteTarget.name}" excluído com sucesso.`);
      setDeleteTarget(null);
      setDeletePassword('');
    } catch (err: any) {
      setDeleteError(err?.message || 'Erro ao excluir projeto');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Projetos</h1>
          <p className="mt-1 text-sm text-[#64748B]">
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

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <span>{notice}</span>
          <button
            onClick={() => setNotice('')}
            className="ml-3 text-green-600 hover:text-green-800"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading && (
          <Card className="text-sm text-[#94A3B8]">Carregando projetos...</Card>
        )}

        {!loading && projects.length === 0 && (
          <Card className="text-sm text-[#64748B] sm:col-span-2 lg:col-span-3 xl:col-span-3">
            Nenhum projeto ainda. Clique em <strong>Novo projeto</strong> para criar o primeiro
            banco de dados da sua aplicação.
          </Card>
        )}

        {projects.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <div
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => selectProject(project)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectProject(project);
                }
              }}
              className={`group relative flex cursor-pointer flex-col rounded-xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                active
                  ? 'border-[#2563EB] ring-2 ring-blue-500/15'
                  : 'border-[#E2E8F0] hover:border-blue-300'
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg">
                  📁
                </div>
                <div className="flex items-center gap-1.5">
                  {active && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                      Ativo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDelete(project);
                    }}
                    title={`Excluir projeto ${project.name}`}
                    aria-label={`Excluir projeto ${project.name}`}
                    className="rounded-md p-1.5 text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="truncate text-sm font-semibold text-[#0F172A]" title={project.name}>
                {project.name}
              </p>
              <p
                className="mt-1 truncate font-mono text-[11px] text-[#94A3B8]"
                title={project.schema_name || ''}
              >
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
            </div>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo projeto" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              Nome da aplicação
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
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
              disabled={saving || !name.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Criando...' : 'Criar projeto'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        title="Excluir projeto"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="text-sm text-red-700">
              <p>
                Tem certeza que deseja excluir o projeto{' '}
                <strong>{deleteTarget?.name}</strong>?
              </p>
              <p className="mt-1 text-xs text-red-600">
                Todas as tabelas, dados, usuários, tokens, regras e arquivos deste projeto
                serão removidos permanentemente. Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>

          {deleteTarget?.schema_name && (
            <p className="font-mono text-[11px] text-slate-500">
              Schema: {deleteTarget.schema_name}
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Digite a senha do administrador para confirmar
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="Senha do administrador"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>

          {deleteError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {deleteError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={deleteProject}
              disabled={deleting || !deletePassword.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Excluindo...' : 'Excluir projeto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
