# Deploy — VPS (produção)

## Visão geral

O deploy da aplicação na VPS (`adminvps@62.171.185.9`) é feito via SSH,
utilizando o script `scripts/deploy.sh` (build + recriação com override +
healthcheck + verificação HTTP).

## Configuração atual (deploy automático via SSH)

- **VPS:** `adminvps@62.171.185.9`
- **Caminho do script:** `/home/adminvps/livre-backend/scripts/deploy.sh`
  (com **hífen**: `livre-backend`)
- **Usuário:** `adminvps` (autenticação via chave SSH: `livre_backend_key`)

### Regra sudoers (NOPASSWD restrito ao script)

A configuração que permite o deploy **automático, sem intervenção manual**,
via OpenCode (execução remota via SSH):

```sudoers
adminvps ALL=(root) NOPASSWD: /home/adminvps/livre-backend/scripts/deploy.sh
```

- **Arquivo:** `/etc/sudoers.d/livre_backend_deploy`
- **Permissões:** `root:root` — modo `0440`

Com essa regra, o comando abaixo executa **sem solicitação de senha**:

```bash
sudo /home/adminvps/livre-backend/scripts/deploy.sh admin-api
```

## Procedimento de recuperação (se o deploy voltar a falhar)

1. **Verificar conectividade SSH:**

   ```bash
   ssh -i "C:\Users\Anderson\.ssh\livre_backend_key" \
     -o StrictHostKeyChecking=no \
     -o UserKnownHostsFile=/dev/null \
     adminvps@62.171.185.9 "echo SSH_OK"
   ```

2. **Verificar status do deploy:**

   ```bash
   sudo /home/adminvps/livre-backend/scripts/deploy.sh --status
   ```

3. **Se o sudo falhar** (`a terminal is required` / `no password was provided`):
   - Confirmar que a regra NOPASSWD acima existe em `/etc/sudoers.d/`.
   - Executar o sudo em **sessão interativa** (TTY), caso contrário o sudo não
     consegue ler a senha/NOPASSWD.

4. **Se o deploy falhar** (build, healthcheck ou verificação HTTP):
   - Verificar logs do container:

     ```bash
     docker logs --tail 20 livre-backend_livre-backend-admin-api-1
     ```

5. **Reexecutar o deploy:**

   ```bash
   sudo /home/adminvps/livre-backend/scripts/deploy.sh admin-api
   ```

## Observações

- O deploy aplica o `docker-compose.override.yml` (preservando aliases de rede).
- Requer chave SSH configurada (sem senha) e usuário `adminvps` com sudo.
