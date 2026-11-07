# Integração JavaScript

## Instalação

```bash
npm install @livre/client
```

## Uso Básico

```javascript
import { LivreClient } from '@livre/client';

const client = new LivreClient({
  apiUrl: 'https://api.livrebackend.com.br',
});

// Registrar usuário
const { user } = await client.auth.register({
  email: 'usuario@email.com',
  password: 'senha123',
  name: 'Nome do Usuário',
});

// Login
const { access_token, refresh_token } = await client.auth.login({
  email: 'usuario@email.com',
  password: 'senha123',
});

// Usar token para requisições autenticadas
client.setToken(access_token);

// Consultar dados via PostgREST
const dados = await client.from('tabela').select('*');
const filtrados = await client.from('tabela').select('*').eq('campo', 'valor');

// Criar registro
const novo = await client.from('tabela').insert({
  nome: 'João',
  email: 'joao@email.com',
});

// Atualizar registro
await client.from('tabela').update({ nome: 'João Atualizado' }).eq('id', 'uuid');

// Excluir registro
await client.from('tabela').delete().eq('id', 'uuid');

// Refresh token automático
client.onTokenExpired(async () => {
  const { access_token } = await client.auth.refresh(refresh_token);
  client.setToken(access_token);
});
```

## Exemplo com fetch nativo

```javascript
// Login
const login = async (email, password) => {
  const res = await fetch('https://api.livrebackend.com.br/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
};

// Consulta autenticada
const consultar = async (token) => {
  const res = await fetch('https://api.livrebackend.com.br/api/rest/tabela', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};
```
