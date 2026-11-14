import nodemailer from 'nodemailer';
import { sql } from '../db/pool.js';

export interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
  encryption: string;
}

// Get panel-level email settings
export async function getPanelEmailSettings(): Promise<EmailSettings | null> {
  const [settings] = await sql`SELECT * FROM livre_auth.email_settings WHERE id = 1`;
  if (!settings) return null;
  if (!settings.smtp_host) return null;
  return settings as EmailSettings;
}

// Get per-project email settings
export async function getProjectEmailSettings(projectId: string): Promise<EmailSettings | null> {
  const [settings] = await sql`
    SELECT * FROM livre_auth.project_email_settings WHERE project_id = ${projectId}
  `;
  if (!settings) return null;
  if (!settings.smtp_host) return null;
  return settings as EmailSettings;
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

// Test email sending
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