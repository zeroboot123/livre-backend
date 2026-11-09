'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Shield, ShieldOff, Users } from 'lucide-react';
import { apiFetch, authFetch } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastKind } from '@/components/ui/Toast';

type SystemUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  active?: boolean;
  blocked?: boolean;
  email_confirmed?: boolean;
  created_at?: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string | null; kind: ToastKind }>({
    message: null,
    kind: 'success',
  });

  // Modal: novo usuário
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal: redefinir senha
  const [pwUser, setPwUser] = useState<SystemUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const notify = (message: string, kind: ToastKind = 'success') =>
    setToast({ message, kind });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/users');
      setUsers(data.users || []);
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
    setEmail('');
    setPassword('');
    setRole('admin');
    setFormError('');
    setCreateOpen(true);
  };

  const createUser = async () => {
    setFormError('');
    if (!name.trim() || !email.trim()) {
      setFormError('Nome e email são obrigatórios');
      return;
    }
    if (password.length < 8) {
      setFormError('A senha deve ter no mínimo 8 caracteres');
      return;
    }
    setSaving(true);
    try {
      await authFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
        }),
      });
      setCreateOpen(false);
      notify('Usuário criado com sucesso');
      await load();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao criar usuário');
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async (user: SystemUser) => {
    const endpoint = user.blocked ? `/users/${user.id}/unblock` : `/users/${user.id}/block`;
    try {
      await apiFetch(endpoint, { method: 'PATCH' });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, blocked: !user.blocked } : u))
      );
      notify(user.blocked ? 'Usuário desbloqueado' : 'Usuário bloqueado');
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar usuário', 'error');
    }
  };

  const openPassword = (user: SystemUser) => {
    setPwUser(user);
    setNewPassword('');
    setPwError('');
  };

  const savePassword = async () => {
    if (!pwUser) return;
    if (newPassword.length < 8) {
      setPwError('A senha deve ter no mínimo 8 caracteres');
      return;
    }
    setPwSaving(true);
    setPwError('');
    try {
      await authFetch(`/users/${pwUser.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      setPwUser(null);
      notify('Senha atualizada com sucesso');
    } catch (err: any) {
      setPwError(err?.message || 'Erro ao atualizar senha');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
            <Users className="h-6 w-6 text-[#2563EB]" />
            Usuários do sistema
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Usuários com acesso ao painel administrativo.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Novo usuário
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-left text-sm text-[#64748B]">
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Perfil</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Criado em</th>
              <th className="p-4 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#94A3B8]">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#64748B]">
                  Nenhum usuário encontrado. Clique em <strong>Novo usuário</strong> para criar.
                </td>
              </tr>
            )}
            {!loading &&
              users.map((u) => (
                <tr key={u.id} className="border-b border-[#E2E8F0] text-sm last:border-b-0">
                  <td className="p-4 font-medium text-[#0F172A]">{u.name}</td>
                  <td className="p-4 text-[#64748B]">{u.email}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${
                        u.role === 'admin'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {u.blocked && (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">
                          Bloqueado
                        </span>
                      )}
                      {u.active === false && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          Inativo
                        </span>
                      )}
                      {u.active !== false && !u.blocked && (
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                          Ativo
                        </span>
                      )}
                      {!u.email_confirmed && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                          Não verificado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-[#64748B]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openPassword(u)}
                        title="Redefinir senha"
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC]"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Senha
                      </button>
                      <button
                        onClick={() => toggleBlock(u)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                          u.blocked
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {u.blocked ? (
                          <Shield className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldOff className="h-3.5 w-3.5" />
                        )}
                        {u.blocked ? 'Desbloquear' : 'Bloquear'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Novo usuário */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo usuário" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do usuário"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@email.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Perfil</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            >
              <option value="admin">Administrador</option>
              <option value="user">Usuário</option>
            </select>
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={createUser}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Redefinir senha */}
      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        title="Redefinir senha"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">
            Defina uma nova senha para <strong>{pwUser?.name}</strong> ({pwUser?.email}).
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>

          {pwError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {pwError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setPwUser(null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={savePassword}
              disabled={pwSaving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pwSaving ? 'Salvando...' : 'Salvar senha'}
            </button>
          </div>
        </div>
      </Modal>

      <Toast message={toast.message} kind={toast.kind} onClose={() => setToast({ ...toast, message: null })} />
    </div>
  );
}
