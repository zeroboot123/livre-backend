'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type MenuSection = {
  label: string;
  items: { label: string; href: string; icon: string; match?: string }[];
};

const menuSections: MenuSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '📊' },
      { label: 'Database', href: '/database/records', icon: '🗄️', match: '/database' },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { label: 'Authentication', href: '/users', icon: '👥' },
      { label: 'Permissões', href: '/permissions', icon: '🔐' },
      { label: 'Projetos', href: '/projects', icon: '📁' },
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
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-[#1E293B]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-[#2563EB] rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">
            L
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Livre Backend</p>
              <p className="text-[10px] text-[#64748B]">Plataforma BaaS</p>
            </div>
          )}
        </div>
        <button onClick={onToggle} className="ml-auto text-[#475569] hover:text-white p-1 rounded-md hover:bg-[#1E293B] shrink-0">
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

  const pageName = pathname.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard';
  const breadcrumbs = pathname.split('/').filter(Boolean).map((s, i, arr) => ({
    label: s.replace(/-/g, ' '),
    href: '/' + arr.slice(0, i + 1).join('/'),
    isLast: i === arr.length - 1,
  }));

  return (
    <header
      className={`
        fixed top-0 right-0 h-14 bg-white border-b border-[#E2E8F0] flex items-center px-6 z-20
        sidebar-transition ${collapsed ? 'left-16' : 'left-60'}
      `}
    >
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-2">
            {!crumb.isLast ? (
              <Link href={crumb.href} className="text-[#64748B] hover:text-[#0F172A] capitalize">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-[#0F172A] font-medium capitalize">{crumb.label}</span>
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
                <button onClick={logout} className="w-full text-left px-3 py-1.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors">
                  Sair da conta
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}