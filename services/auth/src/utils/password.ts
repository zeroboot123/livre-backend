import argon2 from 'argon2';
import { config } from '../config/index.js';

// Hash de senha com Argon2id
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    timeCost: config.argon2.timeCost,
    memoryCost: config.argon2.memoryCost,
    parallelism: 1,
  });
}

// Verifica senha contra hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
