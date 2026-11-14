'use client';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Sidebar, Header } from '@/components/layout/sidebar-layout';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';
import logo from '@/../public/logo-mark.png';
import '../styles/globals.css';

// usePathname() returns paths WITHOUT the basePath ('/admin') prefix.
const publicPaths = ['/', '/login', '/register', '/forgot-password'];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <Image src={logo} alt="Livre Backend" className="mx-auto h-16 w-auto" />
          <div className="animate-spin w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-[#64748B]">Carregando...</p>
        </div>
      </div>
    );
  }

  const isPublic = publicPaths.includes(pathname);
  const isRoot = pathname === '/';
  // Na área de dados o menu principal fica em modo rail (ícones), liberando espaço.
  const railMode = pathname.startsWith('/database');
  const collapsed = sidebarCollapsed || railMode;

  if (!user && !isPublic && !isRoot) {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    return null;
  }

  if (user && isPublic && !isRoot) {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/dashboard';
    }
    return null;
  }

  if (!user || isPublic || isRoot) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Sidebar collapsed={collapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <Header collapsed={collapsed} />
      <main className={`pt-14 sidebar-transition ${collapsed ? 'pl-16' : 'pl-60'}`}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>
          <AuthGuard>{children}</AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}