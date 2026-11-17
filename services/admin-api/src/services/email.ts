import nodemailer from 'nodemailer';
import { sql } from '../db/pool.js';
import { decryptSecret } from '../utils/secret-box.js';

/** Configuração SMTP como fica no banco (senha criptografada ou legado puro). */
export interface EmailSettingsRow {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
  encryption: string;
  [key: string]: any;
}

/** Configuração usada em memória para enviar email (senha já decifrada). */
export interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
  encryption: string;
}

/**
 * Configuração exposta pela API — NUNCA inclui a senha.
 * `smtp_password_configured` indica se há credencial salva.
 */
export type PublicEmailSettings = Omit<EmailSettingsRow, 'smtp_password'> & {
  smtp_password_configured: boolean;
};

/** Remove a senha do registro antes de devolvê-lo ao cliente. */
export function toPublicEmailSettings(
  row: EmailSettingsRow | null | undefined
): PublicEmailSettings | null {
  if (!row) return null;
  const { smtp_password, ...rest } = row;
  return { ...rest, smtp_password_configured: Boolean(smtp_password) };
}

/** Converte o registro do banco no objeto de envio, decifrando a senha. */
function toRuntimeSettings(row: EmailSettingsRow): EmailSettings {
  return {
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_username: row.smtp_username,
    smtp_password: decryptSecret(row.smtp_password || ''),
    from_name: row.from_name,
    from_email: row.from_email,
    encryption: row.encryption,
  };
}

/** Registro cru (senha ainda criptografada) das configurações do painel. */
export async function getPanelEmailSettingsRow(): Promise<EmailSettingsRow | null> {
  const [settings] = await sql`SELECT * FROM livre_auth.email_settings WHERE id = 1`;
  return (settings as EmailSettingsRow) || null;
}

/** Registro cru das configurações de um projeto. */
export async function getProjectEmailSettingsRow(
  projectId: string
): Promise<EmailSettingsRow | null> {
  const [settings] = await sql`
    SELECT * FROM livre_auth.project_email_settings WHERE project_id = ${projectId}
  `;
  return (settings as EmailSettingsRow) || null;
}

// Get panel-level email settings (com senha decifrada, para envio)
export async function getPanelEmailSettings(): Promise<EmailSettings | null> {
  const row = await getPanelEmailSettingsRow();
  if (!row || !row.smtp_host) return null;
  return toRuntimeSettings(row);
}

// Get per-project email settings (com senha decifrada, para envio)
export async function getProjectEmailSettings(
  projectId: string
): Promise<EmailSettings | null> {
  const row = await getProjectEmailSettingsRow(projectId);
  if (!row || !row.smtp_host) return null;
  return toRuntimeSettings(row);
}

// Create a nodemailer transporter from settings
function createTransporter(settings: EmailSettings) {
  const config: any = {
    host: settings.smtp_host,
    port: settings.smtp_port,
  };

  if (settings.encryption === 'ssl') {
    config.secure = true;
  } else if (settings.encryption === 'tls') {
    config.secure = false;
    config.tls = { rejectUnauthorized: false };
  } else {
    config.secure = false;
  }

  if (settings.smtp_username && settings.smtp_password) {
    config.auth = {
      user: settings.smtp_username,
      pass: settings.smtp_password,
    };
  }

  return nodemailer.createTransport(config);
}

// Send email using panel-level settings
export async function sendPanelEmail(to: string, subject: string, html: string): Promise<void> {
  const settings = await getPanelEmailSettings();
  if (!settings) throw new Error('Email do painel não configurado');

  const transporter = createTransporter(settings);
  await transporter.sendMail({
    from: `"${settings.from_name}" <${settings.from_email}>`,
    to,
    subject,
    html,
  });
}

// Send email using project-level settings
export async function sendProjectEmail(
  projectId: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const settings = await getProjectEmailSettings(projectId);
  if (!settings) throw new Error('Email do projeto não configurado');

  const transporter = createTransporter(settings);
  await transporter.sendMail({
    from: `"${settings.from_name}" <${settings.from_email}>`,
    to,
    subject,
    html,
  });
}

// Test email sending com um conjunto de configurações já resolvido (senha em claro).
export async function testEmailSettings(
  settings: EmailSettings,
  to: string
): Promise<void> {
  const transporter = createTransporter(settings);
  await transporter.sendMail({
    from: `"${settings.from_name}" <${settings.from_email}>`,
    to,
    subject: 'Teste de configuração de email',
    html: '<h2>Configuração de email OK!</h2><p>Seu servidor SMTP está configurado corretamente.</p>',
  });
}
