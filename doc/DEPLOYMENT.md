# Deployment: Railway + Vercel

Este guia descreve o caminho recomendado hoje:

- Backend Express em `backend/`, publicado no Railway.
- Frontend TanStack Start em `frontend/`, publicado na Vercel.
- Banco SQLite como snapshot local do backend.

## Pre-requisitos

- Repositorio GitHub atualizado.
- Conta Railway.
- Conta Vercel.
- Node.js `>=22.12.0`.
- Variaveis Sankhya Gateway.
- Dominio proprio, se for usar DNS customizado.

## 1. Backend no Railway

### Criar o projeto

1. Acesse `https://railway.app`.
2. Crie um projeto com `Deploy from GitHub`.
3. Selecione este repositorio.
4. Configure o servico para usar o diretorio `backend`.

O arquivo [`backend/railway.json`](../backend/railway.json) ja define:

```json
{
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health"
  }
}
```

### Variaveis de ambiente

Configure no Railway:

```env
SANKHYA_BASE_URL=https://api.sankhya.com.br
SANKHYA_CLIENT_ID=<client-id>
SANKHYA_CLIENT_SECRET=<client-secret>
SANKHYA_TOKEN=<gateway-token>

PORT=3000
NODE_ENV=production
LOG_LEVEL=info

CORS_ORIGINS=https://seu-dominio.com.br,https://www.seu-dominio.com.br

DATABASE_PATH=./data/snapshot.db
SYNC_ENABLED=true
SYNC_INTERVAL_MS=300000
SYNC_INTERVAL_SLOW_MS=1800000
```

### Ponto de atencao: SQLite em producao

O backend usa SQLite como snapshot. Antes de usar em producao de forma definitiva, confirme no Railway se o caminho `DATABASE_PATH` sera persistente entre deploys/restarts. Se nao houver volume persistente, o snapshot sera recriado a cada subida.

Opcoes:

- Manter SQLite com volume persistente no Railway.
- Migrar snapshot para Postgres depois que o dashboard estabilizar.
- Rodar sync inicial a cada deploy sabendo que o primeiro carregamento pode demorar.

### Smoke test

Depois do deploy, teste:

```bash
curl https://sua-api.up.railway.app/api/health
curl https://sua-api.up.railway.app/api/empresas
```

Guarde a URL final do backend. Ela sera usada como `VITE_API_URL` no frontend.

## 2. Frontend na Vercel

### Importar projeto

1. Acesse `https://vercel.com`.
2. Importe o repositorio.
3. Configure:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: .vercel/output
```

O arquivo [`frontend/vercel.json`](../frontend/vercel.json) ja aponta para o preset TanStack Start:

```json
{
  "framework": "tanstack-start",
  "buildCommand": "npm run build",
  "outputDirectory": ".vercel/output"
}
```

### Variaveis de ambiente

Configure na Vercel:

```env
VITE_API_URL=https://sua-api.up.railway.app
```

Nao use barra final.

### Validacao

Depois do deploy:

1. Abra o dominio da Vercel.
2. Confirme se os paineis Empresas e Financeiro carregam dados.
3. Verifique o console do navegador para erros de CORS ou `VITE_API_URL`.
4. Se houver erro de CORS, adicione o dominio final da Vercel em `CORS_ORIGINS` no Railway.

## 3. Dominio customizado

### Na Vercel

1. Va em `Settings > Domains`.
2. Adicione `seu-dominio.com.br` e, se necessario, `www.seu-dominio.com.br`.
3. Copie os registros DNS sugeridos.

### No Registro.br

1. Acesse o painel do dominio.
2. Configure os registros indicados pela Vercel.
3. Aguarde a propagacao.

Exemplo comum:

```text
Tipo: CNAME
Nome: www
Alvo: cname.vercel-dns.com
```

Siga sempre os valores mostrados pela Vercel, porque eles podem variar.

## 4. Checklist antes de publicar

- Backend builda com `npm run build`.
- Frontend builda com `npm run build`.
- `CORS_ORIGINS` inclui os dominios finais do frontend.
- `VITE_API_URL` aponta para o backend Railway.
- Credenciais Sankhya estao somente no Railway, nunca no Git.
- `.env` e `.env.local` nao aparecem em `git status`.
- Snapshot SQLite tem estrategia de persistencia definida.
- `/api/health` responde publicamente.

## 5. Troubleshooting

### Frontend nao acessa backend

- Confira `VITE_API_URL` na Vercel.
- Confira `CORS_ORIGINS` no Railway.
- Teste a URL do backend diretamente no navegador.

### Backend nao sobe

- Verifique logs do Railway.
- Confirme se todas as variaveis `SANKHYA_*` existem.
- Rode localmente:

```bash
cd backend
npm run build
npm run start
```

### Dados aparecem vazios

- Confira se `SYNC_ENABLED=true`.
- Verifique logs de sync no backend.
- Confirme se o snapshot SQLite foi criado no caminho de `DATABASE_PATH`.
- Teste `/api/empresas` e `/api/vendedores`.

### Dominio nao resolve

- Aguarde a propagacao DNS.
- Confira os registros no Registro.br.
- Teste:

```bash
nslookup seu-dominio.com.br
```

## 6. Notas

- `frontend/wrangler.jsonc` ficou como referencia para Cloudflare Workers, mas o deploy documentado aqui usa Vercel.
- Se a decisao mudar para Cloudflare, atualize este documento e remova a ambiguidade entre Vercel e Wrangler.
