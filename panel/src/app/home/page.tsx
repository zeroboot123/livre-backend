'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Heart,
  QrCode,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { fetchSiteSettings, type SiteSettingsData } from '@/lib/data-api';
import { APP_VERSION } from '@/lib/version';

export default function HomePage() {
  const [site, setSite] = useState<SiteSettingsData>({ pix_key: '', pix_qr_image: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSiteSettings()
      .then((data) => setSite(data.settings || { pix_key: '', pix_qr_image: '' }))
      .catch(() => {});
  }, []);

  const pixKey = site.pix_key?.trim() || '';
  const pixQr = site.pix_qr_image?.trim() || '';

  const copyPixKey = async () => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
    } catch {
      const el = document.createElement('textarea');
      el.value = pixKey;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] p-8 text-white sm:p-10">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Plataforma BaaS gratuita
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Livre Backend</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-50 sm:text-base">
            Uma plataforma Backend as a Service própria, modular e leve para criar APIs,
            autenticação e bancos de dados sem depender de soluções caras. Desenvolvida para
            oferecer uma alternativa acessível e gratuita a desenvolvedores e empresas.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#1D4ED8] transition-colors hover:bg-blue-50"
            >
              Ir para o Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            {pixKey && (
              <a
                href="#apoiar"
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <Heart className="h-4 w-4" />
                Apoiar o projeto
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Sobre */}
      <Card>
        <h2 className="text-base font-semibold text-[#0F172A]">Sobre o projeto</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
          O Livre Backend reúne banco de dados PostgreSQL com schemas por projeto, API REST,
          autenticação JWT, painel administrativo, gerenciamento de arquivos e construtor visual
          de banco de dados. O objetivo é simples: entregar uma solução de backend acessível,
          gratuita e que possa rodar na sua própria infraestrutura.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <Server className="h-5 w-5 text-[#2563EB]" />
            <p className="mt-2 text-sm font-medium text-[#0F172A]">Self-hosted</p>
            <p className="mt-1 text-xs text-[#64748B]">Rode na sua VPS, com seus dados e domínio.</p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <ShieldCheck className="h-5 w-5 text-[#2563EB]" />
            <p className="mt-2 text-sm font-medium text-[#0F172A]">Seguro por padrão</p>
            <p className="mt-1 text-xs text-[#64748B]">RLS, JWT, Argon2id e isolamento por schema.</p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <Users className="h-5 w-5 text-[#2563EB]" />
            <p className="mt-2 text-sm font-medium text-[#0F172A]">Sem custo</p>
            <p className="mt-1 text-xs text-[#64748B]">Gratuito para desenvolvedores e empresas.</p>
          </div>
        </div>
      </Card>

      {/* Autor / créditos */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-xl font-bold text-white">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">Autor</p>
            <p className="text-lg font-semibold text-[#0F172A]">Anderson</p>
            <a
              href="https://zeroboot.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm text-[#2563EB] hover:text-[#1E40AF]"
            >
              zeroboot.com.br
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="text-xs leading-relaxed text-[#64748B] sm:max-w-xs sm:text-right">
            © 2026 Anderson.
            <br />
            Todos os direitos reservados, respeitando as licenças de terceiros.
          </p>
        </div>
      </Card>

      {/* Doações */}
      <div id="apoiar" className="scroll-mt-20 rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white">
            <Heart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">
              Ajude a manter o Livre Backend gratuito!
            </h2>
            <p className="mt-1 text-sm text-[#475569]">
              Qualquer contribuição é bem-vinda — e totalmente voluntária.
            </p>
          </div>
        </div>

        <div className={`mt-5 grid grid-cols-1 gap-6 ${pixKey ? 'lg:grid-cols-2' : ''}`}>
          <div className="space-y-3 text-sm leading-relaxed text-[#475569]">
            <p>
              O Livre Backend é um projeto desenvolvido com o objetivo de oferecer uma solução
              acessível para desenvolvedores e empresas.
            </p>
            <p>
              Se este projeto é útil para você, considere fazer uma contribuição financeira. Sua
              ajuda permite manter a infraestrutura, continuar o desenvolvimento, implementar
              melhorias e disponibilizar novas funcionalidades.
            </p>
            <p className="font-medium text-[#0F172A]">
              Qualquer contribuição é bem-vinda. Obrigado por apoiar o projeto!
            </p>
          </div>

          {pixKey && (
            <div className="rounded-xl border border-[#BFDBFE] bg-white p-5">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[#2563EB]" />
                <h3 className="text-sm font-semibold text-[#0F172A]">Doar via PIX</h3>
              </div>

              <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                {pixQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pixQr}
                    alt="QR Code PIX para doação"
                    className="h-40 w-40 shrink-0 rounded-lg border border-[#E2E8F0] bg-white object-contain p-1"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#94A3B8]">Chave PIX</p>
                  <p className="mt-1 break-all rounded-lg bg-[#F8FAFC] px-3 py-2 font-mono text-sm text-[#0F172A]">
                    {pixKey}
                  </p>
                  <button
                    onClick={copyPixKey}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] sm:w-auto"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar chave PIX
                      </>
                    )}
                  </button>
                  <p className="mt-3 text-xs text-[#64748B]">
                    Qualquer valor é bem-vindo. A contribuição é voluntária e não dá acesso a
                    recursos extras.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé */}
      <p className="pb-2 text-center text-xs text-[#94A3B8]">
        Livre Backend v{APP_VERSION} · © 2026 Anderson ·{' '}
        <a
          href="https://zeroboot.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#64748B]"
        >
          zeroboot.com.br
        </a>
      </p>
    </div>
  );
}
