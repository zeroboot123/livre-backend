import { sql } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/crypto.js';
import { parseDuration } from '../utils/helpers.js';
import { config } from '../config/index.js';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

interface LoginInput {
  email: string;
  password: string;
}

// Status de instalação: true enquanto não existir nenhum usuário.
export async function getSetupStatus() {
  const [row] = await sql`SELECT COUNT(*)::int AS count FROM livre_auth.users`;
  return { needsSetup: row.count === 0 };
}

// Registro do primeiro administrador (somente na primeira instalação).
export async function register(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);

  const result = await sql.begin(async (tx) => {
    // Serializa tentativas concorrentes de setup.
    await tx`SELECT pg_advisory_xact_lock(741852963)`;

    const [row] = await tx`SELECT COUNT(*)::int AS count FROM livre_auth.users`;
    if (row.count > 0) return { blocked: true as const };

    const [user] = await tx`
      INSERT INTO livre_auth.users (email, password_hash, name, role)
      VALUES (${input.email}, ${passwordHash}, ${input.name}, 'admin')
      RETURNING id, email, name, role, created_at
    `;
    return { user };
  });

  if ('blocked' in result) {
    const err: any = new Error(
      'Cadastro público desativado. Crie novos usuários pelo painel.'
    );
    err.statusCode = 403;
    throw err;
  }

  return {
    user: result.user,
    message: 'Administrador criado com sucesso.',
  };
}

// Criação de usuários do sistema pelo painel (após o setup inicial).
export async function createUser(input: RegisterInput & { role?: string }) {
  const passwordHash = await hashPassword(input.password);
  const role = input.role === 'admin' ? 'admin' : 'user';

  const [user] = await sql`
    INSERT INTO livre_auth.users (email, password_hash, name, role)
    VALUES (${input.email}, ${passwordHash}, ${input.name}, ${role})
    RETURNING id, email, name, role, created_at
  `;

  return { user, message: 'Usuário criado com sucesso.' };
}

// Alteração da própria senha (exige a senha atual).
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const [user] = await sql`
    SELECT id, password_hash FROM livre_auth.users WHERE id = ${userId}
  `;
  if (!user) {
    const err: any = new Error('Usuário não encontrado');
    err.statusCode = 404;
    throw err;
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    const err: any = new Error('Senha atual incorreta');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await hashPassword(newPassword);
  await sql.begin(async (tx) => {
    await tx`
      UPDATE livre_auth.users
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${userId}
    `;
    // Revoga sessões existentes por segurança.
    await tx`
      UPDATE livre_auth.sessions SET revoked = TRUE WHERE user_id = ${userId}
    `;
  });

  return { message: 'Senha alterada com sucesso.' };
}

// Redefinição de senha de outro usuário pelo painel.
export async function setUserPassword(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);

  const [user] = await sql`
    UPDATE livre_auth.users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, email, name
  `;
  if (!user) {
    const err: any = new Error('Usuário não encontrado');
    err.statusCode = 404;
    throw err;
  }

  await sql`
    UPDATE livre_auth.sessions SET revoked = TRUE WHERE user_id = ${userId}
  `;

  return { user, message: 'Senha atualizada com sucesso.' };
}

// Login
export async function login(input: LoginInput) {
  const [user] = await sql`
    SELECT id, email, password_hash, name, active, blocked, role
    FROM livre_auth.users
    WHERE email = ${input.email}
  `;

  if (!user) {
    throw new Error('Credenciais inválidas');
  }

  if (!user.active) {
    throw new Error('Usuário desativado');
  }

  if (user.blocked) {
    throw new Error('Usuário bloqueado');
  }

  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) {
    throw new Error('Credenciais inválidas');
  }

  // Gerar tokens
  const accessToken = await generateAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role || 'user',
  });

  const refreshToken = await generateRefreshToken();
  const refreshTokenHash = await hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpiration) * 1000);

  await sql`
    INSERT INTO livre_auth.sessions (user_id, refresh_token_hash, expires_at)
    VALUES (${user.id}, ${refreshTokenHash}, ${expiresAt})
  `;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: parseDuration(config.jwt.expiration),
    token_type: 'Bearer',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    },
  };
}

// Refresh token
export async function refresh(refreshToken: string) {
  const tokenHash = await hashToken(refreshToken);

  const [session] = await sql`
    SELECT s.id, s.user_id, s.revoked, s.expires_at, u.email, u.active, u.blocked
    FROM livre_auth.sessions s
    JOIN livre_auth.users u ON u.id = s.user_id
    WHERE s.refresh_token_hash = ${tokenHash}
  `;

  if (!session || session.revoked || session.expires_at < new Date()) {
    throw new Error('Refresh token inválido ou expirado');
  }

  if (!session.active || session.blocked) {
    // Revogar sessão se usuário estiver bloqueado
    await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE id = ${session.id}`;
    throw new Error('Usuário bloqueado ou desativado');
  }

  // Revogar token antigo (rotação)
  await sql`UPDATE livre_auth.sessions SET revoked = TRUE WHERE id = ${session.id}`;

  // Gerar novos tokens
  const newAccessToken = await generateAccessToken({
    sub: session.user_id,
    email: session.email,
    role: 'user',
  });

  const newRefreshToken = await generateRefreshToken();
  const newRefreshTokenHash = await hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpiration) * 1000);

  await sql`
    INSERT INTO livre_auth.sessions (user_id, refresh_token_hash, expires_at)
    VALUES (${session.user_id}, ${newRefreshTokenHash}, ${expiresAt})
  `;

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_in: parseDuration(config.jwt.expiration),
    token_type: 'Bearer',
  };
}

// Logout (revogar refresh token)
export async function logout(refreshToken: string) {
  const tokenHash = await hashToken(refreshToken);

  await sql`
    UPDATE livre_auth.sessions
    SET revoked = TRUE
    WHERE refresh_token_hash = ${tokenHash}
  `;
}

// Forgot password
export async function forgotPassword(email: string) {
  const [user] = await sql`
    SELECT id FROM livre_auth.users WHERE email = ${email}
  `;

  if (!user) return; // Não revelar se email existe

  const resetToken = await generateRefreshToken();
  const expiresAt = new Date(Date.now() + 3600000); // 1 hora

  await sql`
    INSERT INTO livre_auth.password_resets (user_id, token, expires_at)
    VALUES (${user.id}, ${resetToken}, ${expiresAt})
  `;

  // TODO: Enviar email com link de recuperação
  console.log(`🔗 Link de recuperação para ${email}: /reset-password?token=${resetToken}`);
}

// Reset password
export async function resetPassword(token: string, newPassword: string) {
  const [reset] = await sql`
    SELECT pr.id, pr.user_id, pr.used, pr.expires_at
    FROM livre_auth.password_resets pr
    WHERE pr.token = ${token}
  `;

  if (!reset || reset.used || reset.expires_at < new Date()) {
    throw new Error('Token de recuperação inválido ou expirado');
  }

  const passwordHash = await hashPassword(newPassword);

  await sql.begin(async (tx) => {
    await tx`
      UPDATE livre_auth.users
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${reset.user_id}
    `;

    await tx`
      UPDATE livre_auth.password_resets
      SET used = TRUE
      WHERE id = ${reset.id}
    `;

    // Revogar todas as sessões do usuário
    await tx`
      UPDATE livre_auth.sessions
      SET revoked = TRUE
      WHERE user_id = ${reset.user_id}
    `;
  });
}
