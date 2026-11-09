// Utilitário para conversão de tempo (ex: "15m" -> 900)
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 900; // default 15 minutos

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 900;
  }
}

// Gera UUID v4
export function generateUUID(): string {
  return crypto.randomUUID();
}
