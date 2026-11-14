'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import logo from '@/../public/logo-mark.png';

const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL || 'https://livrebackend.gerbox.com.br/auth';

type SetupState = 'checking' | 'open' | 'closed';

export default function RegisterPage() {
  const { login } = useAuth();
  const [state, setState] = useState<SetupState>('checking');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${AUTH_URL}/setup/status`)
      .then((res) => res.json())
      .then((data) => setState(data?.needsSetup ? 'open' : 'closed'))
      .catch(() => setState('closed'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

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
      const res = await fetch(`${AUTH_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar administrador');

      setState('closed');
      setSuccess('Administrador criado com sucesso! Entrando...');
      try {
        await login(email, password);
        window.location.href = '/admin/dashboard';
      } catch {
        window.location.href = '/admin/login';
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src={logo} alt="Livre Backend" className="mx-auto mb-4 h-24 w-auto" />
          <h1 className="text-2xl font-bold text-[#0F172A]">Criar administrador</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Configure o primeiro acesso à plataforma
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 shadow-sm">
          {state === 'checking' && (
            <p className="text-center text-sm text-[#64748B]">Verificando instalação...</p>
          )}

          {state === 'closed' && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#64748B]">
                O cadastro público está desativado. Novos usuários são criados dentro do painel
                em <strong>Authentication</strong>.
              </p>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#2563EB] py-2.5 text-sm font-medium text-white hover:bg-[#1E40AF]"
              >
                Ir para o login
              </Link>
            </div>
          )}

          {state === 'open' && (
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
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  placeholder="Seu nome"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  placeholder="seu@email.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Confirmar senha
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  placeholder="Repita a senha"
                  required
                  minLength={8}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1E40AF] disabled:bg-[#93C5FD] text-white font-medium rounded-lg transition-colors"
              >
                {loading ? 'Criando administrador...' : 'Criar administrador'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[#94A3B8] mt-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-[#2563EB] hover:text-[#1E40AF] font-medium">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
