'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_AUTH_URL || 'https://livrebackend.gerbox.com.br/auth'}/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
      setSuccess('Conta criada com sucesso! Verifique seu email.');
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">🚀 Criar Conta</h1>
          <p className="text-gray-400 mt-2">Cadastre-se na plataforma</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">{error}</div>}
          {success && <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">{success}</div>}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
              placeholder="Seu nome" required />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
              placeholder="seu@email.com" required />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
              placeholder="Mínimo 8 caracteres" required minLength={8} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg font-medium transition-colors">
            {loading ? 'Cadastrando...' : 'Criar Conta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">Faça login</Link>
        </p>
      </div>
    </div>
  );
}