import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL || '';

export const sql = postgres(databaseUrl, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
});
