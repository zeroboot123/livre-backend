'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Mail,
  Save,
  Send,
} from 'lucide-react';
import { DataShell } from '@/components/data/data-shell';
import {
  fetchProjectEmailSettings,
  updateProjectEmailSettings,
  testProjectEmailSettings,
  type EmailSettingsData,
} from '@/lib/data-api';

function EmailInner() {
  const [settings, setSettings] = useState<EmailSettingsData>({
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    from_name: '',
    from_email: '',
    encryption: 'tls',
  });
  // A senha é mantida fora do objeto de configurações: o backend nunca a devolve.
  const [password, setPassword] = useState('');
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Test email state
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjectEmailSettings();
      if (data.settings) {
        setSettings(data.settings);
        setPasswordConfigured(!!data.settings.smtp_password_configured);
      }
    } catch {
      // ignored
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (field: keyof EmailSettingsData, value: string | number) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      // Só envia a senha quando o usuário digitou uma nova.
      const payload: Partial<EmailSettingsData> = { ...settings };
      const newPassword = password.trim();
      if (newPassword) payload.smtp_password = newPassword;

      const result = await updateProjectEmailSettings(payload);
      if (result.settings) {
        setSettings(result.settings);
        setPasswordConfigured(!!result.settings.smtp_password_configured);
      }
      setPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testProjectEmailSettings(testTo.trim());
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'Falha ao enviar email de teste' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-bold text-slate-800">
        <Mail className="mr-2 inline-block h-5 w-5 text-blue-600" />
        Configurações de Email do Projeto
      </h1>

      <div className="space-y-8">
        {/* SMTP Configuration */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <Mail className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Servidor SMTP</h2>
          </div>

          <div className="space-y-5 p-6">
            <p className="text-sm text-slate-500">
              Configure o servidor SMTP para envio de emails transacionais deste projeto
              (notificações, recuperação de senha de usuários do app, etc.).
            </p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* SMTP Host */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Servidor SMTP <span className="text-red-500">*</span>
                </label>
                <input
                  value={settings.smtp_host}
                  onChange={(e) => handleChange('smtp_host', e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {/* Port */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Porta</label>
                <input
                  type="number"
                  value={settings.smtp_port}
                  onChange={(e) => handleChange('smtp_port', parseInt(e.target.value) || 587)}
                  placeholder="587"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {/* Username */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Usuário</label>
                <input
                  value={settings.smtp_username}
                  onChange={(e) => handleChange('smtp_username', e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {/* Password */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Senha</label>
                  {passwordConfigured && !password && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle className="h-3 w-3" />
                      Senha configurada
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setSaved(false);
                    setError('');
                  }}
                  placeholder={passwordConfigured ? '•••••••• (deixe em branco para manter)' : '••••••••'}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {passwordConfigured
                    ? 'Uma senha já está salva. Preencha apenas se quiser substituí-la.'
                    : 'A senha nunca é exibida após ser salva.'}
                </p>
              </div>

              {/* From Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome do Remetente
                </label>
                <input
                  value={settings.from_name}
                  onChange={(e) => handleChange('from_name', e.target.value)}
                  placeholder="Meu App"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {/* From Email */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email do Remetente
                </label>
                <input
                  value={settings.from_email}
                  onChange={(e) => handleChange('from_email', e.target.value)}
                  placeholder="noreply@meuapp.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {/* Encryption */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Criptografia</label>
                <select
                  value={settings.encryption}
                  onChange={(e) => handleChange('encryption', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                >
                  <option value="tls">TLS (STARTTLS)</option>
                  <option value="ssl">SSL</option>
                  <option value="none">Nenhuma</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>

              {saved && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Configurações salvas!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Test Email Section */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <Send className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Testar Envio</h2>
          </div>

          <div className="space-y-4 p-6">
            <p className="text-sm text-slate-500">
              Envie um email de teste para verificar se as configurações estão corretas.
            </p>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email de teste
                </label>
                <input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
              <button
                onClick={handleTest}
                disabled={testing || !testTo.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {testing ? 'Enviando...' : 'Testar'}
              </button>
            </div>

            {testResult && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                  testResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                {testResult.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmailPage() {
  return (
    <DataShell showSidebar={false}>
      <EmailInner />
    </DataShell>
  );
}