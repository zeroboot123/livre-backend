'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL || 'https://livrebackend.gerbox.com.br/auth';

export default function Home() {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch(`${AUTH_URL}/setup/status`)
      .then((res) => res.json())
      .then((data) => setNeedsSetup(!!data?.needsSetup))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold mb-4">🚀 Livre Backend</h1>
        <p className="text-gray-400 mb-8">Plataforma de Backend as a Service</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Entrar
          </Link>
          {needsSetup && (
            <Link
              href="/register"
              className="px-6 py-3 border border-gray-700 rounded-lg hover:bg-gray-800 transition"
            >
              Criar administrador
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
