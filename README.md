# CIP - Central de Inteligencia e Performance Grupo MKR

Dashboard executivo para o Grupo MKR, com backend Node.js integrado ao Sankhya ERP e frontend React/TanStack Start.

## Visao Geral

- `backend/`: API Express em TypeScript, snapshot SQLite e sincronizadores Sankhya.
- `frontend/`: dashboard React 19 com TanStack Start, TanStack Query, Recharts e componentes Radix/shadcn.
- `doc/`: documentacao de produto, rotas, planejamento e deployment.
- `legacy-python/`: scripts antigos de investigacao. Mantido apenas como arquivo historico.

## Estrutura

```text
sankyaAPI/
|-- backend/
|   |-- src/
|   |   |-- config.ts
|   |   |-- server.ts
|   |   |-- db/
|   |   |-- routes/
|   |   |-- sankhya/
|   |   |-- services/
|   |   |-- sync/
|   |   `-- utils/
|   |-- scripts/
|   |-- package.json
|   |-- railway.json
|   `-- tsconfig.json
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- hooks/
|   |   |-- lib/
|   |   |-- routes/
|   |   `-- styles.css
|   |-- package.json
|   |-- vercel.json
|   |-- vite.config.ts
|   `-- wrangler.jsonc
|-- doc/
|-- legacy-python/
|-- .env.example
|-- .gitignore
`-- README.md
```

## Requisitos

- Node.js `>=22.12.0`
- npm
- Credenciais Sankhya Gateway

## Configuracao Local

Crie os arquivos de ambiente a partir dos exemplos:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Preencha as credenciais Sankhya em `backend/.env` ou no `.env` da raiz, conforme o modo de execucao. Para desenvolvimento local, o frontend deve apontar para:

```env
VITE_API_URL=http://localhost:3000
```

## Desenvolvimento

Backend:

```bash
cd backend
npm install
npm run dev
```

API local: `http://localhost:3000`

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend local: `http://localhost:8080`

## Build

```bash
cd backend
npm run build
```

```bash
cd frontend
npm run build
```

## Rotas Principais

- `GET /api/health`
- `GET /api/empresas`
- `GET /api/vendedores`
- `GET /api/dashboard/empresa/faturamento`
- `GET /api/dashboard/empresa/faturamento-por-empresa`
- `GET /api/dashboard/empresa/comodato`
- `GET /api/dashboard/financeiro/dre`
- `GET /api/dashboard/financeiro/fluxo-caixa`
- `GET /api/dashboard/financeiro/distribuicao-despesas`
- `GET /api/dashboard/financeiro/contas`

Catalogo completo: [`doc/ROTAS.md`](doc/ROTAS.md).

## Deploy

- Backend: Railway, usando `backend/railway.json`.
- Frontend: Vercel, usando `frontend/vercel.json` com output `.vercel/output`.

Guia detalhado: [`doc/DEPLOYMENT.md`](doc/DEPLOYMENT.md).

## Documentacao

- [`doc/BACKEND_COMPLETO.md`](doc/BACKEND_COMPLETO.md): documentacao consolidada do backend atual.
- [`doc/STATUS_PROJECT.md`](doc/STATUS_PROJECT.md): estado atual, backlog e decisoes de negocio.
- [`doc/ROTAS.md`](doc/ROTAS.md): contrato das rotas REST.
- [`doc/PLAN_DATA_BASE.md`](doc/PLAN_DATA_BASE.md): schema e modelagem do snapshot.
- [`doc/PLAN_INTEGRATION_FRONTEND.md`](doc/PLAN_INTEGRATION_FRONTEND.md): plano de integracao do frontend.
- [`doc/POSTMAN.md`](doc/POSTMAN.md): apoio para validacao manual.

## Observacoes de Organizacao

- Arquivos `.env`, `.env.local`, logs, caches e bancos SQLite ficam fora do Git.
- Logs de dev ficam em `logs/` e sao ignorados pelo Git.
- Lockfiles relevantes ficam dentro de `backend/` e `frontend/`; nao deve existir `package-lock.json` na raiz sem um `package.json` correspondente.
