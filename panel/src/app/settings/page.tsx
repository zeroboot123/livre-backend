'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Save, Send, CheckCircle, AlertCircle, Heart, QrCode, Upload, Trash2 } from 'lucide-react';
import {
  fetchEmailSettings,
  updateEmailSettings,
  testEmailSettings,
  fetchSiteSettings,
  updateSiteSettings,
  type EmailSettingsData,
} from '@/lib/data-api';

export default function SettingsPage() {
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

  // PIX / apoio ao projeto
  const [site, setSite] = useState<{ pix_key: string; pix_qr_image: string }>({
    pix_key: '',
    pix_qr_image: '',
  });
  const [pixSaving, setPixSaving] = useState(false);
  const [pixSaved, setPixSaved] = useState(false);
  const [pixError, setPixError] = useState('');

  useEffect(() => {
    fetchSiteSettings()
      .then((data) =>
        setSite({
          pix_key: data.settings?.pix_key || '',
          pix_qr_image: data.settings?.pix_qr_image || '',
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEmailSettings();
        if (data.settings) {
          setSettings(data.settings);
          setPasswordConfigured(!!data.settings.smtp_password_configured);
        }
      } catch {
        // ignored
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

      const result = await updateEmailSettings(payload);
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
      // Sem nova senha digitada, o backend usa a credencial já salva.
      const result = await testEmailSettings({
        ...settings,
        smtp_password: password.trim() || undefined,
        to: testTo.trim(),
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'Falha ao enviar email de teste' });
    } finally {
      setTesting(false);
    }
  };

  const handleQrFile = (file?: File) => {
    setPixError('');
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setPixError('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 1.4 * 1024 * 1024) {
      setPixError('Imagem muito grande (máximo 1,4 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setSite((prev) => ({ ...prev, pix_qr_image: String(reader.result || '') }));
    reader.onerror = () => setPixError('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  };

  const handlePixSave = async () => {
    setPixSaving(true);
    setPixSaved(false);
    setPixError('');
    try {
      const result = await updateSiteSettings({
        pix_key: site.pix_key.trim(),
        pix_qr_image: site.pix_qr_image.trim(),
      });
      setSite({
        pix_key: result.settings?.pix_key || '',
        pix_qr_image: result.settings?.pix_qr_image || '',
      });
      setPixSaved(true);
      setTimeout(() => setPixSaved(false), 3000);
    } catch (err: any) {
      setPixError(err?.message || 'Erro ao salvar a configuração PIX');
    } finally {
      setPixSaving(false);
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
    <div>
      <h1 className="mb-6 text-2xl font-bold">⚙️ Configurações</h1>

      <div className="space-y-8">
        {/* Email Settings Section */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <Mail className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Configurações de Email</h2>
          </div>

          <div className="space-y-5 p-6">
            <p className="text-sm text-slate-500">
              Configure o servidor SMTP para envio de emails do painel (recuperação de senha,
              notificações, etc.). Para emails dos projetos, acesse Database &gt; Email.
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
                  placeholder="Livre Backend"
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
                  placeholder="noreply@seudominio.com"
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

        {/* Apoio ao projeto (PIX) */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <Heart className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Apoio ao projeto (PIX)</h2>
          </div>

          <div className="space-y-5 p-6">
            <p className="text-sm text-slate-500">
              Configure a chave PIX exibida na página <strong>Início</strong>. É uma doação
              voluntária: não há gateway de pagamento nem cobrança automática. Deixe a chave
              vazia para ocultar a área PIX.
            </p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Chave PIX</label>
                <input
                  value={site.pix_key}
                  onChange={(e) => {
                    setSite((prev) => ({ ...prev, pix_key: e.target.value }));
                    setPixSaved(false);
                    setPixError('');
                  }}
                  placeholder="email, telefone, CPF/CNPJ ou chave aleatória"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                <p className="mt-1 text-xs text-slate-500">
                  A chave é exibida apenas para administradores e usuários autenticados no painel.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  QR Code (opcional)
                </label>
                <div className="flex items-center gap-3">
                  {site.pix_qr_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={site.pix_qr_image}
                      alt="Pré-visualização do QR Code PIX"
                      className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400">
                      <QrCode className="h-7 w-7" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label
                      htmlFor="pix-qr-upload"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="h-4 w-4" />
                      {site.pix_qr_image ? 'Trocar imagem' : 'Enviar imagem'}
                    </label>
                    <input
                      id="pix-qr-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        handleQrFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    {site.pix_qr_image && (
                      <button
                        type="button"
                        onClick={() => setSite((prev) => ({ ...prev, pix_qr_image: '' }))}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover QR Code
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">PNG, JPG ou WebP (até 1,4 MB).</p>
              </div>
            </div>

            {pixError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {pixError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handlePixSave}
                disabled={pixSaving}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pixSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {pixSaving ? 'Salvando...' : 'Salvar PIX'}
              </button>

              {pixSaved && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Configuração PIX salva!
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}