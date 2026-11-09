'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  Code2,
  Eye,
  FolderOpen,
  ListTree,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';
import { fetchTables, createTable, type DataTable } from '@/lib/data-api';
import { apiFetch } from '@/lib/api-client';
import {
  getActiveProjectId,
  setActiveProjectId as persistActiveProjectId,
  setActiveProjectName,
  type Project,
} from '@/lib/projects';
import { Modal } from '@/components/ui/Modal';

export interface DataView {
  name: string;
  table: string;
}

interface DataContextValue {
  tables: DataTable[];
  selected: string;
  setSelected: (table: string) => void;
  reloadTables: () => Promise<unknown>;
  loadingTables: boolean;
  views: DataView[];
  saveView: (name: string) => void;
  removeView: (name: string) => void;
}

const DataContext = createContext<DataContextValue>({
  tables: [],
  selected: '',
  setSelected: () => {},
  reloadTables: async () => {},
  loadingTables: true,
  views: [],
  saveView: () => {},
  removeView: () => {},
});

export const useData = () => useContext(DataContext);

const tabs = [
  { label: 'App data', href: '/database/records', icon: Table2 },
  { label: 'Data types', href: '/database/datatypes', icon: ListTree },
  { label: 'Privacy', href: '/database/privacy', icon: ShieldCheck },
  { label: 'API', href: '/database/api', icon: Code2 },
  { label: 'Option sets', href: '/database/optionsets', icon: ListTree },
  { label: 'File manager', href: '/database/files', icon: FolderOpen },
];

function readInitialTable(list: DataTable[]): string {
  if (typeof window === 'undefined') return list[0]?.name || '';
  const param = new URLSearchParams(window.location.search).get('table');
  if (param && list.some((t) => t.name === param)) return param;
  return list[0]?.name || '';
}

export function DataShell({
  children,
  showSidebar = true,
}: {
  children: ReactNode;
  showSidebar?: boolean;
}) {
  const pathname = usePathname();
  const [tables, setTables] = useState<DataTable[]>([]);
  const [selected, setSelectedState] = useState('');
  const [loadingTables, setLoadingTables] = useState(true);
  const [search, setSearch] = useState('');
  const [envOpen, setEnvOpen] = useState(false);
  const [views, setViews] = useState<DataView[]>([]);
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeError, setNewTypeError] = useState('');
  const [savingType, setSavingType] = useState(false);

  // Projeto ativo (cada projeto tem seu próprio schema/database)
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveId] = useState<string | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectError, setProjectError] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  const reloadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const list = await fetchTables();
      setTables(list);
      setSelectedState((current) => current || readInitialTable(list));
      return list;
    } catch {
      return [];
    } finally {
      setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      let list: Project[] = [];
      try {
        const data = await apiFetch('/projects');
        list = data.projects || [];
      } catch {
        list = [];
      }
      setProjects(list);

      const stored = getActiveProjectId();
      const active = list.find((p) => p.id === stored) || list[0] || null;
      persistActiveProjectId(active?.id ?? null);
      setActiveProjectName(active?.name ?? null);
      setActiveId(active?.id ?? null);
      setProjectsLoaded(true);

      await reloadTables();
    })();

    try {
      const stored = localStorage.getItem('livre_data_views');
      if (stored) setViews(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, [reloadTables]);

  const applyProject = async (id: string, name?: string) => {
    const project = projects.find((p) => p.id === id);
    persistActiveProjectId(id);
    setActiveProjectName(name ?? project?.name ?? null);
    setActiveId(id);
    setProjectMenuOpen(false);
    setSelectedState('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('table');
      window.history.replaceState(null, '', url.toString());
    }
    await reloadTables();
  };

  const handleCreateProject = async () => {
    const name = projectName.trim();
    if (!name) {
      setProjectError('Informe o nome da aplicação');
      return;
    }
    setCreatingProject(true);
    setProjectError('');
    try {
      const data = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      const project: Project = data.project;
      setProjects((prev) => [project, ...prev]);
      setProjectModalOpen(false);
      setProjectName('');
      await applyProject(project.id, project.name);
    } catch (err: any) {
      setProjectError(err?.message || 'Erro ao criar projeto');
    } finally {
      setCreatingProject(false);
    }
  };

  const setSelected = (table: string) => {
    setSelectedState(table);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('table', table);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const persistViews = (next: DataView[]) => {
    setViews(next);
    try {
      localStorage.setItem('livre_data_views', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const saveView = (name: string) => {
    const clean = name.trim();
    if (!clean || !selected) return;
    persistViews([...views.filter((v) => v.name !== clean), { name: clean, table: selected }]);
  };

  const removeView = (name: string) => persistViews(views.filter((v) => v.name !== name));

  const handleCreateType = async () => {
    setNewTypeError('');
    setSavingType(true);
    try {
      await createTable(newTypeName.trim());
      await reloadTables();
      const list = await fetchTables();
      const created = list.find((t) => t.name === newTypeName.trim());
      if (created) setSelected(created.name);
      setNewTypeOpen(false);
      setNewTypeName('');
    } catch (err: any) {
      setNewTypeError(err?.message || 'Erro ao criar data type');
    } finally {
      setSavingType(false);
    }
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DataContext.Provider
      value={{ tables, selected, setSelected, reloadTables, loadingTables, views, saveView, removeView }}
    >
      <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col bg-[#F8FAFC]">
        {/* Top bar (dentro da área de dados) */}
        <div className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
          <nav className="flex h-full items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const active = pathname === tab.href;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex h-full items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="relative ml-auto flex shrink-0 items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setProjectMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Projeto ativo"
              >
                <FolderOpen className="h-3.5 w-3.5 text-blue-500" />
                <span className="max-w-[150px] truncate">
                  {activeProject?.name || 'Selecionar projeto'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {projectMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setProjectMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Projetos
                    </p>
                    <div className="max-h-64 overflow-y-auto">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => applyProject(p.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                            p.id === activeProjectId
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{p.name}</span>
                          {p.id === activeProjectId && (
                            <span className="ml-auto text-[10px] font-semibold uppercase">ativo</span>
                          )}
                        </button>
                      ))}
                      {!projects.length && (
                        <p className="px-2.5 py-2 text-xs text-slate-400">
                          Nenhum projeto criado ainda.
                        </p>
                      )}
                    </div>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      onClick={() => {
                        setProjectMenuOpen(false);
                        setProjectError('');
                        setProjectModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Novo projeto
                    </button>
                  </div>
                </>
              )}
            </div>

            <span className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Development version
            </span>
            <button
              onClick={() => setEnvOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Switch to live database
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {envOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setEnvOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Development version</p>
                      <p className="text-[11px] text-slate-500">Ambiente ativo</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 px-2.5 py-2 opacity-60">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-300" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Live database</p>
                      <p className="text-[11px] text-slate-500">Ainda não configurado</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Barra lateral dedicada de dados */}
          {showSidebar && (
          <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search data types..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Data types
                </span>
                <span className="text-[10px] text-slate-400">{filteredTables.length}</span>
              </div>

              <div className="space-y-0.5 px-1.5">
                {loadingTables && (
                  <p className="px-2 py-2 text-xs text-slate-400">Carregando...</p>
                )}
                {!loadingTables && !filteredTables.length && (
                  <p className="px-2 py-2 text-xs text-slate-400">Nenhum data type encontrado.</p>
                )}
                {filteredTables.map((t) => {
                  const active = selected === t.name;
                  return (
                    <div
                      key={t.name}
                      className={`group flex items-center rounded-md ${
                        active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        onClick={() => setSelected(t.name)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px]"
                        title={`${t.name} — ${t.entries} registros`}
                      >
                        <Table2 className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="truncate">{t.name}</span>
                      </button>
                      <Link
                        href={{ pathname: '/database/records', query: { table: t.name } }}
                        onClick={() => setSelected(t.name)}
                        title="Ver dados"
                        className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-blue-100 hover:text-blue-700 group-hover:opacity-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href={{ pathname: '/database/datatypes', query: { table: t.name } }}
                        onClick={() => setSelected(t.name)}
                        title="Editar estrutura"
                        className="mr-1 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-blue-100 hover:text-blue-700 group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>

              {views.length > 0 && (
                <div className="mt-4 px-1.5">
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Views
                  </div>
                  <div className="space-y-0.5">
                    {views.map((v) => (
                      <div key={v.name} className="group flex items-center rounded-md hover:bg-slate-50">
                        <button
                          onClick={() => setSelected(v.table)}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-slate-600"
                        >
                          <ListTree className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{v.name}</span>
                        </button>
                        <button
                          onClick={() => removeView(v.name)}
                          title="Remover view"
                          className="mr-1 rounded p-1 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-2">
              <button
                onClick={() => {
                  setNewTypeError('');
                  setNewTypeOpen(true);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600"
              >
                <Plus className="h-3.5 w-3.5" />
                New data type
              </button>
            </div>
          </aside>
          )}

          {/* Área de trabalho */}
          <main className="min-w-0 flex-1 overflow-hidden">
            {!projectsLoaded ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Carregando projeto...
              </div>
            ) : !activeProjectId ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                  <FolderOpen className="h-7 w-7 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">
                    Nenhum projeto selecionado
                  </h2>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    Crie um projeto para ter um banco de dados dedicado para a sua aplicação. Cada
                    projeto possui suas próprias tabelas, dados e regras.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setProjectError('');
                    setProjectModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Criar projeto
                </button>
              </div>
            ) : (
              <div key={activeProjectId} className="h-full">
                {children}
              </div>
            )}
          </main>
        </div>

        <Modal open={newTypeOpen} onClose={() => setNewTypeOpen(false)} title="New data type" size="sm">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">Nome do data type</label>
              <input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="ex: clientes"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Será criada uma tabela com os campos embutidos Creator, Created Date, Modified Date e
                Slug.
              </p>
            </div>

            {newTypeError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {newTypeError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setNewTypeOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateType}
                disabled={savingType || !newTypeName.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingType ? 'Criando...' : 'Criar data type'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={projectModalOpen}
          onClose={() => setProjectModalOpen(false)}
          title="Novo projeto"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Nome da aplicação
              </label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
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
                onClick={() => setProjectModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateProject}
                disabled={creatingProject || !projectName.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingProject ? 'Criando...' : 'Criar projeto'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </DataContext.Provider>
  );
}
