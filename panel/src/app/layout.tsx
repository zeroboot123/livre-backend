// Livre Backend — © 2026 Anderson · https://zeroboot.com.br
//
// Layout no SERVIDOR: injeta a configuração pública em runtime (EasyPanel)
// antes da hidratação. O shell interativo fica em AppShell (client).
import '../styles/globals.css';
import { AppShell } from '@/components/layout/app-shell';

// Garante leitura de process.env em runtime (não "assar" no build).
export const dynamic = 'force-dynamic';

function runtimeEnvScript(): string {
  const env = {
    API_URL: process.env.NEXT_PUBLIC_API_URL || '',
    AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL || '',
    VISUAL_DB_URL: process.env.NEXT_PUBLIC_VISUAL_DB_URL || '',
  };
  // Escapa "<" para não permitir fechamento prematuro da tag <script>.
  return `window.__LIVRE_ENV__=${JSON.stringify(env).replace(/</g, '\\u003c')};`;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: runtimeEnvScript() }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
