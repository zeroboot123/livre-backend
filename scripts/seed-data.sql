-- ==============================================================
-- LIVRE BACKEND - Dados Iniciais (Seed)
-- ==============================================================
-- Execute após a primeira inicialização para criar dados de exemplo

-- Projeto inicial
INSERT INTO livre_auth.projects (name, slug, description)
VALUES ('Projeto Padrão', 'projeto-padrao', 'Projeto inicial da plataforma')
ON CONFLICT (slug) DO NOTHING;

-- Usuário admin (senha: admin123)
-- ATENÇÃO: Troque a senha após o primeiro login!
INSERT INTO livre_auth.users (email, password_hash, name, email_confirmed)
VALUES (
    'admin@livrebackend.com',
    '$argon2id$v=19$m=19456,t=2,p=1$SU5JVBZNT0RFCkxZVNQ$VGVtcG9yYXJ5UGFzc3dvcmQ',
    'Administrador',
    TRUE
)
ON CONFLICT (email) DO NOTHING;
