# Guia de Deployment: Vercel + Railway

## Pré-requisitos

- Conta no Vercel (você já tem)
- Conta no Railway (railway.app)
- Repositório GitHub com o código
- Domínio custom registrado (registro.br)

---

## 1️⃣ Setup Railway (Backend)

### Criar projeto no Railway

1. Acesse [railway.app](https://railway.app)
2. Clique em "New Project"
3. Selecione "Deploy from GitHub"
4. Autorize e selecione seu repositório
5. Railway vai detectar automaticamente o Node.js

### Variáveis de Ambiente no Railway

No painel do Railway, configure:

```
# Sankhya API Credentials
SANKHYA_BASE_URL=<sua-url-base-do-sankhya>
SANKHYA_CLIENT_ID=<seu-client-id>
SANKHYA_CLIENT_SECRET=<seu-client-secret>
SANKHYA_TOKEN=<seu-token>

# Database
DATABASE_PATH=./data/snapshot.db
NODE_ENV=production

# CORS
CORS_ORIGINS=https://seu-dominio.com.br,https://www.seu-dominio.com.br

# Runtime
LOG_LEVEL=info
SYNC_ENABLED=true
SYNC_INTERVAL_MS=300000
SYNC_INTERVAL_SLOW_MS=1800000
```

### Deploy

1. Railway vai fazer deploy automático ao detectar `package.json` no `/backend`
2. Copie a URL da aplicação (ex: `cip-backend-prod.railway.app`)
3. Essa será sua `VITE_API_URL` no frontend

---

## 2️⃣ Setup Vercel (Frontend)

### Importar projeto

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "Add New..." → "Project"
3. Selecione seu repositório GitHub
4. Na configuração do projeto:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/client`

### Variáveis de Ambiente

Na seção "Environment Variables", configure:

```
VITE_API_URL=https://sua-url-do-backend.up.railway.app
```

(Substitua pela URL real do seu backend no Railway)

### Deploy

Vercel faz deploy automático ao fazer push para `main`. Você pode acompanhar em https://vercel.com/deployments

---

## 3️⃣ Conectar Domínio Custom

### No Vercel

1. Vá em "Settings" → "Domains"
2. Clique em "Add Domain"
3. Digite seu domínio: `seu-dominio.com.br`
4. Vercel vai mostrar registros DNS

### No Registro.br

1. Acesse seu painel no registro.br
2. Vá em "Meus Domínios"
3. Edite os registros DNS
4. Adicione os registros que Vercel mostrou (CNAME ou A)

Exemplo:
```
Nome: seu-dominio.com.br
Tipo: CNAME
Alvo: cname.vercel-dns.com
```

---

## 4️⃣ Estrutura do Repositório

Para funcionar com ambos, mantenha assim:

```
sankyaAPI/
├── backend/
│   ├── src/
│   ├── package.json
│   ├── railway.json
│   └── .railwayignore
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vercel.json
├── .gitignore
└── README.md
```

---

## 5️⃣ Scripts de Deploy Locais

### Testar build do frontend

```bash
cd frontend
npm run build
# Verifica se `dist/client` foi criado
```

### Testar build do backend

```bash
cd backend
npm run build
npm run start  # Testa se roda
```

---

## 6️⃣ Variáveis Sensíveis

### ⚠️ NUNCA commitar

- `.env` com credenciais reais
- Senhas ou tokens

### Usar

- Railway: painel web para configurar variáveis
- Vercel: painel web para configurar variáveis

---

## 7️⃣ Troubleshooting

### Frontend não consegue acessar backend

- Verificar `VITE_API_URL` no Vercel
- Verificar CORS no backend (`CORS_ORIGINS`)
- Testar URL diretamente no navegador

### Backend não inicia no Railway

- Verificar logs no painel Railway
- Confirmar se `npm start` está funcionando
- Verificar variáveis de ambiente

### Domínio não resolve

- Aguardar 24-48h para DNS se propagar
- Verificar registros DNS no registro.br
- Usar `nslookup seu-dominio.com.br` para testar

---

## 8️⃣ Próximos Passos

1. Criar conta no Railway
2. Conectar GitHub ao Railway
3. Configurar variáveis de ambiente
4. Fazer push para GitHub (ambos farão deploy automático)
5. Apontar domínio para Vercel
6. Testar acesso via seu-dominio.com.br

---

**Dúvidas?** Avise quando começar o setup que te ajudo com os passos específicos.
