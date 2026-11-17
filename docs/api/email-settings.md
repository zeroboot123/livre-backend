# API — Configurações de Email (SMTP)

Endpoints administrativos para configurar o servidor SMTP do painel e de cada
projeto. Todos exigem `Authorization: Bearer <token>` de administrador
(aplicado pelo `preHandler` global do `admin-api`); requisições sem token
recebem `401`.

## Contrato (a partir da versão com senha protegida)

### Mudança importante

A senha SMTP **nunca** é retornada pela API. Em vez disso, as respostas
trazem o booleano `smtp_password_configured`.

```diff
 {
   "settings": {
     "id": 1,
     "smtp_host": "smtp.exemplo.com",
     "smtp_port": 587,
     "smtp_username": "user@exemplo.com",
-    "smtp_password": "senha-em-texto-claro",
+    "smtp_password_configured": true,
     "from_name": "Meu App",
     "from_email": "noreply@exemplo.com",
     "encryption": "tls",
     "updated_at": "2026-11-15T05:59:51.301Z"
   }
 }
```

### Escrita (`PUT`)

- `smtp_password` **ausente**, `null`, vazio ou apenas máscara (`********`,
  `••••••••`) → a senha existente é **preservada**.
- `smtp_password` com valor novo → a credencial é substituída.
- Os demais campos continuam aceitando atualização parcial via `COALESCE`
  (enviar apenas `from_name` não afeta a senha).
- A senha é gravada cifrada com AES-256-GCM usando `EMAIL_ENCRYPTION_KEY`
  (ou `JWT_SECRET` como fallback). A chave fica em variável de ambiente,
  nunca no banco.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/api/email-settings` | Configuração do painel (sem senha) |
| `PUT` | `/admin/api/email-settings` | Atualiza configuração do painel |
| `POST` | `/admin/api/email-settings/test` | Envia email de teste (painel) |
| `GET` | `/admin/api/email-settings/project` | Configuração do projeto ativo (`X-Project-Id`) |
| `PUT` | `/admin/api/email-settings/project` | Atualiza configuração do projeto ativo |
| `POST` | `/admin/api/email-settings/project/test` | Envia email de teste (projeto) |

### Teste de envio

`POST /email-settings/test` aceita `to` + campos SMTP opcionais. Se
`smtp_password` vier vazio, o backend usa a credencial salva — assim é
possível testar sem redigitar a senha.

### Compatibilidade

Clientes antigos que liam `settings.smtp_password` deixarão de recebê-lo
(campo removido por segurança). Devem usar `smtp_password_configured`.
Clientes que enviavam `smtp_password: "********"` como máscara continuam
funcionando: esse valor é interpretado como "manter a senha atual".

## Logs

Nem o `admin-api` nem o `auth-service` registram a senha SMTP. O
`auth-service` loga apenas destinatário e `messageId` no envio de
recuperação de senha, e mensagem/código de erro em caso de falha.
