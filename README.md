# CIP - Central de Inteligência e Performance Grupo MKR

Dashboard executivo C-level com integração ao Sankhya (ERP).

## Estrutura do Projeto

```
sankyaAPI/
├── backend/              # Node.js + TypeScript + Express
│   ├── src/
│   │   ├── config.ts
│   │   ├── server.ts
│   │   ├── db/           # SQLite connection & schema
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── sync/         # Entity sync from Sankhya
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
├── frontend/             # Vite + React 19 + TypeScript
│   ├── src/
│   │   ├── routes/       # TanStack Router/Start
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks + API queries
│   │   ├── lib/          # Utilities & types
│   │   └── styles.css
│   ├── package.json
│   ├── vite.config.ts
│   └── wrangler.jsonc
├── doc/                  # Documentation
├── legacy-python/        # Old Python sync scripts
└── requirements.txt
```

## Desenvolvimento

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend roda em `http://localhost:3000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend roda em `http://localhost:8080` (Vite dev server) com backend em `http://localhost:3000`

## Variáveis de Ambiente

### Frontend `.env.local`

```
VITE_API_URL=http://localhost:3000
```

### Backend `.env`

Sankhya API credentials and database configuration.

## Build

```bash
# Frontend
cd frontend && npm run build

# Backend
cd backend && npm run build
```

## Features

- Dashboard de vendedores com ranking e performance 2026
- Lançamentos de hoje por vendedor
- Vendas por empresa
- Sincronização de dados do Sankhya ERP
- Sistema de filtros por empresa e vendedor
- Métricas em tempo real

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, SQLite, better-sqlite3, Zod
- **Frontend**: React 19, Vite, TanStack Query, TanStack Router/Start, Recharts, Radix UI
- **Database**: SQLite (local development)
- **Styling**: Tailwind CSS + Fraunces + Geist fonts
