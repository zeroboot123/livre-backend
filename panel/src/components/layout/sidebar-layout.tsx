'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getActiveProjectName } from '@/lib/projects';
import { authFetch } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import Image from 'next/image';
import logoSrc from '@/../public/logo-icon.png';

type MenuSection = {
  label: string;
  items: { label: string; href: string; icon: string; match?: string }[];
};

const menuSections: MenuSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '📊' },
      { label: 'Database', href: '/projects', icon: '🗄️', match: '/projects' },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { label: 'Authentication', href: '/users', icon: '👥' },
      { label: 'Permissões', href: '/permissions', icon: '🔐' },
      { label: 'Logs', href: '/logs', icon: '📝' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Backups', href: '/backups', icon: '💾' },
      { label: 'Monitor', href: '/monitor', icon: '📈' },
      { label: 'Configurações', href: '/settings', icon: '⚙️' },
    ],
  },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen z-30 bg-[#0F172A] flex flex-col
        sidebar-transition ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo — barra clara para dar contraste ao logotipo */}
      <div className="h-14 flex items-center px-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-3 min-w-0">
          <Image src={logoSrc} alt="Livre Backend" className="h-7 w-7 shrink-0 object-contain" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0F172A] truncate">Livre Backend</p>
              <p className="text-[10px] text-[#64748B]">Plataforma BaaS</p>
            </div>
          )}
        </div>
        <button onClick={onToggle} className="ml-auto text-[#64748B] hover:text-[#0F172A] p-1 rounded-md hover:bg-[#E2E8F0] shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
        {menuSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-[#475569] uppercase tracking-wider">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.match
                  ? pathname.startsWith(item.match)
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                      ${isActive
                        ? 'bg-[#2563EB] text-white font-medium'
                        : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function Header({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    const read = () => setProjectName(getActiveProjectName());
    read();
    window.addEventListener('livre:project-changed', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('livre:project-changed', read);
      window.removeEventListener('storage', read);
    };
  }, [pathname]);

  const pageName = pathname.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard';
  const crumbs = pathname.split('/').filter(Boolean).map((s, i, arr) => ({
    label: s === 'projects' ? 'Database' : s.replace(/-/g, ' '),
    href: s === 'database' ? '/projects' : '/' + arr.slice(0, i + 1).join('/'),
    isLast: i === arr.length - 1,
    highlight: false,
  }));

  // Dentro da área de dados, mostra o nome do projeto entre "Database" e a aba atual
  // (ex: database / zeroboot / optionsets).
  const showProject = !!projectName && pathname.startsWith('/database');
  const breadcrumbs = showProject
    ? [
        { ...crumbs[0], isLast: false },
        { label: projectName, href: pathname, isLast: false, highlight: true },
        ...crumbs.slice(1).map((c, i, arr) => ({ ...c, isLast: i === arr.length - 1 })),
      ]
    : crumbs;

  const openPasswordModal = () => {
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setPwdError('');
    setPwdSuccess('');
    setPwdOpen(true);
  };

  const handleChangePassword = async () => {
    setPwdError('');
    setPwdSuccess('');
    if (!currentPwd) {
      setPwdError('Informe a senha atual');
      return;
    }
    if (newPwd.length < 8) {
      setPwdError('A nova senha deve ter no mínimo 8 caracteres');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('As senhas não conferem');
      return;
    }
    setPwdSaving(true);
    try {
      await authFetch('/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      setPwdSuccess('Senha alterada com sucesso');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: any) {
      setPwdError(err?.message || 'Erro ao alterar senha');
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <>
    <header
      className={`
        fixed top-0 right-0 h-14 bg-white border-b border-[#E2E8F0] flex items-center px-6 z-20
        sidebar-transition ${collapsed ? 'left-16' : 'left-60'}
      `}
    >
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb) => (
          <span key={crumb.highlight ? `project-${crumb.label}` : crumb.href} className="flex items-center gap-2">
            {!crumb.isLast ? (
              <Link href={crumb.href} className="text-[#64748B] hover:text-[#0F172A] capitalize">
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  crumb.highlight
                    ? 'font-semibold text-[#2563EB]'
                    : 'font-medium capitalize text-[#0F172A]'
                }
              >
                {crumb.label}
              </span>
            )}
            {!crumb.isLast && <span className="text-[#CBD5E1]">/</span>}
          </span>
        ))}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F0FDF4] rounded-full">
          <div className="w-2 h-2 rounded-full bg-[#16A34A]"></div>
          <span className="text-xs font-medium text-[#16A34A]">Online</span>
        </div>

        {user && (
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors">
              <div className="w-7 h-7 bg-[#2563EB] rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-[#0F172A] hidden sm:block">{user.name}</span>
              <svg className="w-3 h-3 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-[#E2E8F0] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
              <div className="p-2">
                <p className="px-3 py-1.5 text-sm text-[#0F172A] font-medium">{user.name}</p>
                <p className="px-3 py-1 text-xs text-[#64748B]">{user.email}</p>
                <hr className="my-1 border-[#E2E8F0]" />
                <button
                  onClick={openPasswordModal}
                  className="w-full text-left px-3 py-1.5 text-sm text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors"
                >
                  Alterar senha
                </button>
                <button onClick={logout} className="w-full text-left px-3 py-1.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors">
                  Sair da conta
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>

    <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Alterar senha" size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">Senha atual</label>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            placeholder="Sua senha atual"
            autoFocus
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">Nova senha</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">Confirmar nova senha</label>
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="Repita a nova senha"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          />
        </div>

        {pwdError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {pwdError}
          </p>
        )}
        {pwdSuccess && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            {pwdSuccess}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => setPwdOpen(false)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
          <button
            onClick={handleChangePassword}
            disabled={pwdSaving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pwdSaving ? 'Salvando...' : 'Salvar senha'}
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
}