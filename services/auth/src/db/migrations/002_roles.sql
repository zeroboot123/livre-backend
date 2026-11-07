-- Migração: Adicionar campo role e confirmação de email
ALTER TABLE livre_auth.users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Atualizar admin existente
UPDATE livre_auth.users SET role = 'admin' WHERE email = 'admin@livrebackend.com';

-- Trigger para auditoria
CREATE OR REPLACE FUNCTION livre_auth.audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO livre_auth.audit_log (user_id, action, resource, details)
  VALUES (
    current_setting('app.current_user_id', TRUE)::UUID,
    TG_OP,
    TG_TABLE_NAME,
    jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;