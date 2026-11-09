'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Card, StatCard } from '@/components/ui/Card';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    apiFetch('/stats').then(setStats).catch(() => {});
  }, []);

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Projetos" value={stats?.projects ?? '-'} icon="📁" />
        <StatCard label="Usuários" value={stats?.users ?? '-'} icon="👥" />
        <StatCard label="Tabelas" value={stats?.tables ?? '-'} icon="🗄️" />
        <StatCard label="Sessões Ativas" value={stats?.sessions ?? '-'} icon="🔑" />
      </div>

      {/* Quick Actions + Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-[#0F172A] mb-4">Acesso Rápido</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
    </div>
  );
}
