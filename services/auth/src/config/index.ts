// Configurações centralizadas do Auth Service
export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiration: process.env.JWT_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  argon2: {
    timeCost: parseInt(process.env.ARGON2_TIME_COST || '2', 10),
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '19456', 10),
  },
  cors: {
    origins: process.env.CORS_ORIGINS || '*',
  },
} as const;
