'use client';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">🔑 Recuperar Senha</h1>
          <p className="text-gray-400 mt-2">Receba um link de recuperação</p>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const email = (e.target as any).email.value;
          await fetch(`${process.env.NEXT_PUBLIC_AUTH_URL || 'https://livrebackend.gerbox.com.br/auth'}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          alert('Se o email existir, você receberá um link de recuperação.');
        }} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" name="email" required
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
              placeholder="seu@email.com" />
          </div>
          <button type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors">
            Enviar Link
          </button>
        </form>
      </div>
    </div>
  );
}