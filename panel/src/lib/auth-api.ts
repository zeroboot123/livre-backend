// Client de autenticação do painel (serviço de auth / JWT).
import { authFetch } from './api-client';

export interface SessionSettings {
  access_token_expiration: string;
  refresh_token_expiration: string;
}

export async function fetchSessionSettings(): Promise<SessionSettings> {
  const data = await authFetch('/admin/session-settings');
  const settings = (data as any)?.settings;
  return {
    access_token_expiration: settings?.access_token_expiration || '15m',
    refresh_token_expiration: settings?.refresh_token_expiration || '7d',
  };
}

export async function updateSessionSettings(values: SessionSettings): Promise<SessionSettings> {
  const data = await authFetch('/admin/session-settings', {
    method: 'PUT',
    body: JSON.stringify(values),
  });
  const settings = (data as any)?.settings;
  return {
    access_token_expiration: settings?.access_token_expiration || values.access_token_expiration,
    refresh_token_expiration: settings?.refresh_token_expiration || values.refresh_token_expiration,
  };
}
