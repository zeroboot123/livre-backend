'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import logo from '@/../public/logo-mark.png';
import { publicEnv } from '@/lib/public-env';

const AUTH_URL = publicEnv('AUTH_URL');

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Link de recuperação inválido ou expirado.');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${AUTH_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Erro ao redefinir a senha');

      setSuccess('Senha redefinida com sucesso! Redirecionando para o login...');
      setPassword('');
      setConfirm('');
      setTimeout(() => {
        window.location.href = '/admin/login';
      }, 2500);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <Image src={logo} alt="Livre Backend" className="mx-auto mb-4 h-24 w-auto" />
          <h1 className="text-2xl font-bold text-[#0F172A]">Redefinir senha</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Escolha uma nova senha para sua conta
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 shadow-sm">
          {!token ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] px-4 py-3 rounded-lg text-sm">
                Link de recuperação inválido ou expirado.
              </div>
              <Link
                href="/forgot-password"
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#2563EB] py-2.5 text-sm font-medium text-white hover:bg-[#1E40AF]"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2.5 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] px-4 py-3 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Nova senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  disabled={!!success}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  placeholder="Repita a nova senha"
                  required
                  minLength={8}
                  disabled={!!success}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !!success}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1E40AF] disabled:bg-[#93C5FD] text-white font-medium rounded-lg transition-colors"
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[#94A3B8] mt-6">
          <Link href="/login" className="text-[#2563EB] hover:text-[#1E40AF] font-medium">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <Image src={logo} alt="Livre Backend" className="mx-auto mb-4 h-24 w-auto" />
              <p className="text-sm text-[#64748B]">Validando link...</p>
            </div>
          </div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
