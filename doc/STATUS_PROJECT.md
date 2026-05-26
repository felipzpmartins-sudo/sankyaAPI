# STATUS_PROJECT — Dashboard Sankhya · Grupo Maker

> **Documento principal de referência do desenvolvimento.** Atualizado a cada
> ciclo de trabalho. Os arquivos `PLAN_*.md` são documentos de design por
> escopo; este aqui é o resumo executável **do que está construído, do que
> está sendo construído e do que está planejado**. Em caso de conflito com
> qualquer `PLAN_*.md`, este documento ganha — se um plano foi superado pela
> realidade do código, anota aqui e atualiza o plano em seguida.

**Última atualização:** 2026-05-15
**Stack:** Node 22 + Express 5 (backend) · React 19 + TanStack Start + Vite (frontend) · SQLite snapshot · Sankhya Gateway OAuth 2.0
**Empresa-alvo:** Grupo Maker (Educação e Tecnologia) — 7 empresas mapeadas

---

## 1. Visão executiva

Dashboard web pra direção do Grupo Maker visualizar **Faturamento, Compras,
Recebimentos, Pagamentos, Comodato e DRE** em tempo quase-real, consumindo o
ERP Sankhya via **Sankhya Gateway (API REST oficial em nuvem)**. Backend Node
mantém um snapshot SQLite atualizado a cada 5 min, frontend React consome via
REST do backend (nunca direto da Sankhya).

**Por que não Sankhya direto no frontend:** CORS, credenciais sensíveis,
performance. **Por que SQLite:** resiliência — UI continua usável quando a
Sankhya cai (mostra dados com flag stale).

---

## 2. Mapa visual do estado atual

```
                      ╔══════════════════════════════════════════════╗
                      ║  STATUS: backend completo na fatia atual;     ║
                      ║  frontend ligado nas seções Empresas e        ║
                      ║  Financeiro com dados reais. Demais seções    ║
                      ║  da sidebar continuam mockadas.               ║
                      ╚══════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────────────┐
│ Sankhya Gateway (api.sankhya.com.br) — OAuth 2.0 Client Credentials    │
│   AppKey: BI-MKR · Usuário: BIMKR                                       │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │   (sync a cada 5–30 min)
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ backend/ (Node + Express 5 + TypeScript)                               │
│   port 3000                                                             │
│   ├─ sync/      ✅ 7 entidades sincronizando: empresas, vendedores,      │
│   │              tipos_operacao, tipos_titulo, naturezas, pedidos,      │
│   │              titulos. Scheduler ativo (hot 5min / slow 30min)       │
│   ├─ db/        ✅ SQLite schema v2 (14 tabelas, 13 índices)             │
│   ├─ sankhya/   ✅ Cliente OAuth + decoder f0/f1 + paginação automática  │
│   ├─ services/  ✅ dashboard.ts (faturamento + comodato) ·               │
│   │              dashboard-financeiro.ts (DRE + fluxo + distribuição)   │
│   ├─ utils/     ✅ EmpresaFiltro · VendedorFiltro · datas · números      │
│   └─ routes/    ✅ /api/health · /empresas · /vendedores ·               │
│                  /dashboard/empresa/* · /dashboard/financeiro/* ·       │
│                  /receber · /pagar                                      │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │   REST JSON (port 8080 CORS)
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ frontend/ (TanStack Start + React 19 + Tailwind + shadcn + Recharts)   │
│   port 8080                                                             │
│   ├─ lib/api/        ✅ client (fetch wrapper) · types.dashboard         │
│   ├─ lib/            ✅ empresaSelecao · vendedorSelecao · format        │
│   ├─ hooks/api/      ✅ useEmpresas · useVendedores ·                    │
│   │                   useFaturamentoConsolidado(empresa, vendedor) ·    │
│   │                   useFaturamentoPorEmpresa(vendedor) ·              │
│   │                   useFinanceiroDre · useDistribuicaoDespesas ·      │
│   │                   useFluxoCaixa · useContasAbertasResumo            │
│   └─ routes/index.tsx  ⚠ 1.843 linhas. EmpresasDashboardSection +        │
│                        FinanceiroSection com API real. Outras           │
│                        seções (Dashboard geral, Vendas, Compras,        │
│                        Estoque) ainda mockadas (`DATA` hardcoded).      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Status por área

### 3.1 Backend — Completo na fatia atual

| Módulo | Status | Observação |
|---|---|---|
| Autenticação Sankhya | ✅ | OAuth 2.0 com auto-renovação em `GTW3403`. Inflight promise pra evitar tempestade de logins concorrentes |
| Decodificador `f0/f1/...` | ✅ | Lê `metadata.fields[]` dinâmico. Nunca hardcode posições |
| Wrapper CRUD | ✅ | `loadRecords` + `loadAllRecords` (paginação completa, salvaguarda de 1000 páginas) |
| Sync de dimensões | ✅ | empresas, vendedores, tipos_operacao, tipos_titulo, naturezas |
| Sync de fatos | ✅ | pedidos (CabecalhoNota STATUSNOTA='L' desde 2025-01), titulos (Financeiro) |
| Scheduler | ✅ | Initial sync ao subir; hot 5min (pedidos/titulos); slow 30min (dimensões) |
| Snapshot SQLite | ✅ | better-sqlite3, file-based, schema v2 (14 tabelas, 13 índices) |
| Endpoints REST | ✅ | Listados na §5.4 |
| Tratamento de erro | ✅ | Middleware diferencia ZodError / SankhyaError / genérico. Logs estruturados (pino) |
| CORS | ✅ | Lista por env (`CORS_ORIGINS`). Hoje `localhost:8080` + `localhost:5173` |

### 3.2 Frontend — Parcial

| Seção | Status | Observação |
|---|---|---|
| Login | ✅ mock | `LoginGate.tsx` — gate local sem auth real. **Tópico futuro 7f** |
| TopBar / Sidebar / Layout | ✅ | Componentes em `index.tsx` (hardcoded) |
| Seção **Empresas** | ✅ ligada | KPIs · gráfico de barras · pizza/donut · filtros Empresa + Vendedor (etapa 7d concluída) |
| Seção **Financeiro** | ✅ ligada | DRE · Distribuição despesas · Fluxo caixa · KPI contas abertas (etapa 7c) |
| Seção Dashboard (geral) | ❌ mock | `DATA` hardcoded no `index.tsx` |
| Seção Vendas | ❌ mock | Idem |
| Seção Compras | ❌ mock | Idem |
| Seção Estoque | ❌ mock | Idem |
| Skeletons / erros UX | ✅ | Banner amarelo se snapshot > 30 min · skeleton enquanto pending · botão retry |

### 3.3 Dados Sankhya — Mapeados

| Entidade | Permissão BIMKR | Sync ativo |
|---|---|---|
| `CabecalhoNota` | ✅ | `pedidos` (filtro DTNEG ≥ 2025-01-01 AND STATUSNOTA='L') |
| `Financeiro` | ✅ | `titulos` |
| `Vendedor` | ✅ | `vendedores` |
| `Natureza` | ✅ | `naturezas` |
| `TipoOperacao` (TGFTOP) | ✅ | `tipos_operacao` |
| `TipoTitulo` | ✅ | `tipos_titulo` |
| `Empresa` | ❌ **bloqueada** | Workaround: extrair CODEMP via Financeiro/CabecalhoNota; 7 empresas no seed |
| `Parceiro` | ⚠ não testado | Pendente (necessário pra drill-down de clientes) |
| `Produto` | ⚠ não testado | Pendente |
| `ItemNota` | ⚠ não testado | Pendente (necessário pra análise por produto) |
| `Estoque` | ⚠ não testado | Pendente |

### 3.4 Infraestrutura

| Item | Status | Observação |
|---|---|---|
| Backend local | ✅ | `npm run dev` em `backend/` · port 3000 |
| Frontend local | ✅ | `npm run dev` em `frontend/` · port 8080 (Cloudflare Workers preset) |
| Gerenciador de pacotes | ✅ npm | Migrado de bun em 2026-05-14 (consistência com backend) |
| Deploy | ❌ | Não decidido. `wrangler.jsonc` aponta pra Cloudflare Workers (TanStack Start) |
| CI/CD | ❌ | Inexistente |
| Testes automatizados | ❌ | Inexistente. Validação ainda é via Postman + curl |

---

## 4. Estrutura do repositório

```
sankyaAPI/
├── backend/                          ← Node + Express + TS
│   ├── src/
│   │   ├── config.ts                 Validação Zod do .env
│   │   ├── server.ts                 Express bootstrap
│   │   ├── db/                       SQLite (schema, conexão, migração)
│   │   ├── sankhya/                  Cliente HTTP + decoder + CRUD
│   │   ├── sync/                     Sincronizadores + scheduler
│   │   ├── services/                 Lógica de negócio (queries SQL)
│   │   ├── routes/                   Roteadores Express
│   │   └── utils/                    Helpers (datas, números, filtros)
│   ├── data/snapshot.db              SQLite (gitignored)
│   ├── scripts/                      Scripts pontuais (ex.: check-vendedores)
│   └── .env                          Credenciais Sankhya (gitignored)
├── frontend/                         ← TanStack Start + React 19
│   ├── src/
│   │   ├── components/               LoginGate, AreaPanel, ui/* (shadcn)
│   │   ├── hooks/api/                Hooks TanStack Query (1 por endpoint)
│   │   ├── lib/                      api/ · empresaSelecao · vendedorSelecao · format
│   │   ├── routes/                   __root.tsx + index.tsx (Dashboard)
│   │   ├── router.tsx                QueryClient setup
│   │   └── server.ts                 SSR error wrapper
│   ├── .env.local                    VITE_API_URL (gitignored)
│   └── wrangler.jsonc                Deploy Cloudflare (não usado em dev)
├── doc/                              ← PLANs e este STATUS_PROJECT.md
│   ├── STATUS_PROJECT.md             ← VOCÊ ESTÁ AQUI
│   ├── PLAN.md                       Plano original do projeto
│   ├── PLAN_DATA_BASE.md             Schema SQLite + telas
│   ├── PLAN_INTEGRATION_FRONTEND.md  Plano de integração front (etapas 7*)
│   └── ROTAS.md                      Catálogo de rotas REST
├── legacy-python/                    Scripts antigos arquivados
└── __pycache__/                      (resíduo Python, pode apagar)
```

---

## 5. Inventário do backend

### 5.1 Sync (`backend/src/sync/`)

| Arquivo | Entidade Sankhya | Tabela SQLite | Refresh |
|---|---|---|---|
| `empresas.ts` | (seed estático — Empresa bloqueada) | `empresas` | inicial + slow 30 min |
| `vendedores.ts` | `Vendedor` | `vendedores` | inicial + slow 30 min |
| `tipos_operacao.ts` | `TipoOperacao` (TGFTOP) | `tipos_operacao` | inicial + slow 30 min |
| `tipos_titulo.ts` | `TipoTitulo` | `tipos_titulo` | inicial + slow 30 min |
| `naturezas.ts` | `Natureza` (TGFNAT) | `naturezas` | inicial + slow 30 min |
| `pedidos.ts` | `CabecalhoNota` (DTNEG ≥ 2025-01, STATUSNOTA='L') | `pedidos` | inicial + hot 5 min |
| `titulos.ts` | `Financeiro` | `titulos` | inicial + hot 5 min |
| `scheduler.ts` | (orquestrador) | — | — |
| `state.ts` | (helper de bookkeeping) | `sync_state` | — |

**Pendentes:** `parceiros`, `produtos`, `pedido_itens`, `estoque` (entidades correspondentes ainda não validadas com BIMKR).

### 5.2 Services (`backend/src/services/`)

| Arquivo | Responsabilidade |
|---|---|
| `dashboard.ts` | Faturamento (consolidado, por empresa) + Comodato + listagens (`listarEmpresas`, `listarVendedores`) |
| `dashboard-financeiro.ts` | DRE, fluxo de caixa, distribuição de despesas, contas abertas |
| `financeiro.ts` | Listagem de títulos direto da Sankhya (não usa snapshot — herança da Fase 1, pode aposentar) |
| `operacoes.ts` | Listas de CODTIPOPER por categoria: `FATURAMENTO_TOPS`, `COMODATO_SAIDA_TOPS`, `COMODATO_RETORNO_TOPS` |

### 5.3 Utils (`backend/src/utils/`)

| Arquivo | Conteúdo |
|---|---|
| `empresa.ts` | `EmpresaFiltro`, `empresaParam` (Zod), `empresaToSqlClause` |
| `vendedor.ts` | `VendedorFiltro`, `vendedorParam`, `vendedorToSqlClause`, `describeVendedorFiltro` |
| `dates.ts` | Conversão `dd/MM/yyyy` → ISO |
| `numbers.ts` | `parseDecimal`, `parseIntOrNull` |

### 5.4 Endpoints REST (`backend/src/routes/`)

**Health**
- `GET /api/health` — ping, não chama Sankhya

**Cadastros**
- `GET /api/empresas` — `{ empresas: EmpresaDto[] }`
- `GET /api/vendedores` — `{ vendedores: VendedorDto[] }`

**Dashboard — Empresas**
- `GET /api/dashboard/empresa/faturamento?empresa=&vendedor=`
- `GET /api/dashboard/empresa/faturamento-por-empresa?vendedor=`
- `GET /api/dashboard/empresa/comodato?empresa=&vendedor=` **(backend pronto, frontend pendente)**

**Dashboard — Financeiro**
- `GET /api/dashboard/financeiro/dre?empresa=&periodo=`
- `GET /api/dashboard/financeiro/fluxo-caixa?empresa=&meses=`
- `GET /api/dashboard/financeiro/distribuicao-despesas?empresa=&periodo=`
- `GET /api/dashboard/financeiro/contas?empresa=&tipo=&page=&pageSize=`

**Legados (compat — usam snapshot)**
- `GET /api/receber?empresa=&page=&pageSize=`
- `GET /api/pagar?empresa=&page=&pageSize=`

Parâmetros `empresa` e `vendedor`: aceitam `todas`/`todos`, um ID ou lista `1,2,5`. Ver §3 dos `PLAN_INTEGRATION_FRONTEND.md`.

---

## 6. Inventário do frontend

### 6.1 Hooks (`frontend/src/hooks/api/`)

| Hook | Endpoint | Cache | Query Key |
|---|---|---|---|
| `useEmpresas` | GET `/api/empresas` | 60 s | `['empresas']` |
| `useVendedores` | GET `/api/vendedores` | 60 s | `['vendedores']` |
| `useFaturamentoConsolidado(empresa, vendedor)` | GET `/api/dashboard/empresa/faturamento` | 30 s | `['faturamentoConsolidado', { empresaKey, vendedorKey }]` |
| `useFaturamentoPorEmpresa(vendedor)` | GET `/api/dashboard/empresa/faturamento-por-empresa` | 30 s | `['faturamentoPorEmpresa', { vendedorKey }]` |
| `useFinanceiroDre(empresa, periodo)` | GET `/api/dashboard/financeiro/dre` | 30 s | `['financeiroDre', { empresaKey, periodo }]` |
| `useDistribuicaoDespesas(empresa, periodo)` | GET `/api/dashboard/financeiro/distribuicao-despesas` | 30 s | `['distribuicaoDespesas', { empresaKey, periodo }]` |
| `useFluxoCaixa(empresa, meses)` | GET `/api/dashboard/financeiro/fluxo-caixa` | 30 s | `['fluxoCaixa', { empresaKey, meses }]` |
| `useContasAbertasResumo(empresa, tipo)` | GET `/api/dashboard/financeiro/contas?pageSize=1` | 30 s | `['contasAbertasResumo', { empresaKey, tipo }]` |

**Faltando** (backend pronto, hook não criado):
- `useComodato(empresa, vendedor)` → GET `/api/dashboard/empresa/comodato`

### 6.2 Lib (`frontend/src/lib/`)

- `api/client.ts` — wrapper `fetch` com `ApiError`
- `api/env.ts` — `getApiBaseUrl()` (lê `VITE_API_URL`)
- `api/types.dashboard.ts` — DTOs alinhados com backend
- `empresaSelecao.ts` — `EmpresaSeleção`, `empresaKey`, `empresaQueryValue`
- `vendedorSelecao.ts` — análogo pra vendedor
- `format.ts` — `formatBRL`, `formatBRLCompact` (compact com k/M), `formatMesAnoPt`

### 6.3 Componentes principais (dentro de `routes/index.tsx`)

⚠ **Tudo está em um arquivo só de 1.843 linhas** — refatorar é a etapa 7e do `PLAN_INTEGRATION_FRONTEND.md` §11.

| Componente | Responsabilidade |
|---|---|
| `Dashboard` | Roteamento entre seções via state |
| `TopBar` | Header com seletor de seção + indicador "Ao vivo" |
| `Sidebar` | Navegação lateral |
| `EmpresaSelector` | Chips (desktop) / Select (mobile) |
| `VendedorSelector` | Select (mobile + desktop, lista pode ter 40+) |
| `EmpresasDashboardSection` | KPIs + gráficos da seção Empresas |
| `FinanceiroSection` | KPIs + DRE + Distribuição + Fluxo |
| `KpiRow`, `KpiCard`, `Sparkline`, `ChartSwitcher`, `Card`, `SectionHead` | Primitivos reutilizáveis |

---

## 7. Regras de negócio decididas (referência crítica)

### 7.1 O que conta como "Faturamento Real"

Whitelist de **15 CODTIPOPER** em `backend/src/services/operacoes.ts`
(`FATURAMENTO_TOPS`). Decidido com financeiro em 2026-05-15.

```
1100 NFE VENDA
1107 FATURAMENTO CONSIGNAÇÃO - VENDA
1111 VENDA - ENTREGA FUTURA
1716 NFS-E EMISSÃO PREFEITURA C/RETENCAO
1733 NFE VENDA - SC
1763 NFE VENDA KIT
1776 NFE VENDA - ES
1795 NFE VENDA - GERENCIAL
1797 NFE VENDA - KIT LIVRO E APOSTILA
1801 NFE VENDA - KIT LIVRO E APOSTILA SC
1802 NFE VENDA - KIT LIVRO E APOSTILA ES
1705 VENDA NF-E EXPORT
1766 VENDA NF-E EXPORT CFOP 6502
1769 NF-E EXPORT
1770 VENDA NF-E EXTERIOR
```

Antes era `TIPMOV='V'` que inflava ~22% com remessas, bonificações, ajustes,
comodato. A regra completa é:
```sql
CODTIPOPER IN (FATURAMENTO_TOPS) AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL
```

### 7.2 Janela temporal canônica

```
ANO_EXIBICAO_FATURAMENTO = "2026"  (hardcoded em dashboard.ts)
```

Todos os KPIs e gráficos da seção Empresas usam o **ano civil 2026**. Quando
virar 2027, alterar essa constante (ou trocar pra dinâmico — backlog).

### 7.3 Multi-empresa

7 empresas seedadas em `empresas`:

| CODEMP | NOMEFANTASIA |
|---|---|
| 1 | MAKER MATRIZ |
| 2 | MY ROBOT FRANQUEADORA |
| 5 | MK CENTRO |
| 6 | MK E-COMMERCE |
| 8 | MAKER FILIAL |
| 11 | MAKER ATACADISTA |
| 12 | MAKER VAREJISTA |

A entidade `Empresa` na Sankhya está **bloqueada para o BIMKR**. Stubs
automáticos (ordem=99) são criados quando aparece um CODEMP novo em pedidos.

### 7.4 Vendedor × Empresa

Qualquer vendedor pode tirar nota em qualquer empresa. O filtro `vendedor`
funciona **transversalmente** — `?vendedor=13` retorna o que CAMILA MAKER
vendeu em todas as empresas. Vendedores notáveis:

- `ECOMMERCE ROBO/MAKER/MYROB/SMART` (CODVEND 7/9/8/10) — canais online
- `CAMILA / CAMILA MAKER / CAMILA MY ROBOT / CAMILA ROBOSHOP` (2/13/14/16) — vendedora humana por empresa
- `LICITAÇÃO` (15) — atendimento institucional
- `<SEM VENDEDOR>` (0) — notas sem atribuição

### 7.5 Comodato (kits em escolas)

3 TOPs:
- **Saída:** 1109 (NFE REMESSA EM COMODATO), 1772 (COMODATO EXTERIOR)
- **Retorno:** 1203 (NFE RETORNO COMODATO)

**Saldo ativo histórico:** R$ 13.095.056 — **mas há uma nota suspeita** de
R$ 11.191.755 (NUNOTA 104539, NUMNOTA 595/série 2, DTFATUR 09/10/2025,
MAKER MATRIZ). Sem ela, o saldo ativo cai pra R$ 1,9M (mais coerente com o
volume de contratos de grade curricular).

**Decisão pendente:** validar a nota 104539 no Sankhya. Hipóteses:
1. Erro de digitação (provável)
2. Lançamento agregado de contrato gigante
3. Estorno/regularização

### 7.6 Recebido vs Provisionado (cuidado com `DHBAIXA`)

`DHBAIXA` na Sankhya **não é necessariamente a data efetiva do recebimento**
— pode ser a data prevista (vencimento ajustado, programação de baixa).
Tem registros com `DHBAIXA` futuro (semanas/meses à frente) e `VLRBAIXA`
preenchido. Para "caixa realizado" verdadeiro, talvez precise usar
`DHCONCIL` (conciliação bancária) ou `DTCONTAB` (contabilização) — **a
confirmar com o consultor Sankhya**.

---

## 8. Armadilhas conhecidas (gotchas)

Lista de pontos que travaram o desenvolvimento e estão hoje contornados:

1. **API CRUDServiceProvider responde com chaves ofuscadas (`f0`, `f1`...)** — a ordem
   é a do `metadata.fields[]` retornado *na própria resposta*. O decoder lê
   esse metadata dinamicamente; nunca hardcode posições.

2. **`includePresentationFields="S"` é obrigatório pra ter joined fields** —
   ex.: `Parceiro_NOMEPARC` só aparece com essa flag. **Não dá pra listar
   joined fields em `fieldset.list`** — quebra com "Descritor de campo
   inválido". Eles vêm "de brinde".

3. **`RECDESP` é numérico** (`> 0` = receita, `< 0` = despesa). Não é
   `'R'`/`'D'` apesar do nome.

4. **Status de título** é inferido por `DHBAIXA IS NULL` (em aberto). Não
   existe campo `STATUS` legível na entidade Financeiro.

5. **TOPs de venda no Sankhya têm 51 variações** com `TIPMOV='V'`, mas só
   ~15 são receita real. O resto é remessa/bonificação/ajuste/etc.
   Solução: whitelist explícita (§7.1).

6. **Empresa bloqueada para BIMKR** — workaround é o seed + stubs auto-criados.

7. **`DHBAIXA` pode ser data futura/prevista** — não confiar pra "data de caixa".

8. **Cancelamentos pós-sync** — se uma nota é cancelada na Sankhya entre dois
   syncs, o snapshot ainda mostra como liberada até o próximo ciclo (5 min).

9. **Token Bearer expira em 1 hora** — auto-renovação ativa via inflight promise.

10. **Módulos do Gateway são exclusivos** — `CRUDServiceProvider` vai em
    `/gateway/v1/mge/`, **não** em `/mgecom/`. Trocou de módulo, quebra.

11. **`/v1/vendas/pedidos` é o único endpoint REST simplificado disponível
    pra vendas** — não existe `/v1/compras/pedidos`. Pra compras precisa
    usar gateway pass-through com `CRUDServiceProvider` em `CabecalhoNota`
    filtrando por `TIPMOV='C'`.

12. **`AD_OBS` no sync de pedidos foi propositalmente nulo** — gerava erro
    "Descritor de campo inválido" no sync inicial. Pode ser que o campo
    custom não exista nessa instalação ou tenha outro nome. **Reincluir
    em PR separado** após validar.

13. **`SERIENOTA = '1'` em todas as notas do e-commerce** — não dá pra
    separar canal por série. Identificação de canal vem pelo `CODVEND`
    (vendedores `ECOMMERCE *`).

14. **`date('now')` no SQLite é UTC** — pra "Faturamento 1 Dia" próximo
    da meia-noite Brasília, pode haver discrepância de fuso. Não corrigido
    ainda. Sugestão: usar `date('now', 'localtime')` ou normalizar no app.

---

## 9. Trabalho pendente (priorizado)

### 🥇 Curto prazo (decidir agora)

| # | Item | Esforço | Bloqueio? |
|---|---|---|---|
| P1 | Validar nota suspeita 104539 no Sankhya (R$ 11M comodato) | 5 min do usuário | bloqueia card de comodato |
| P2 | Refatorar `index.tsx` (1.843 linhas → features) — etapa 7e | 3-4h | quanto antes, melhor |
| P3 | Plug comodato no frontend (hook + card) | 1h | aguardando P1 + decisão UX de tela dedicada |
| P4 | Série temporal `/api/dashboard/empresa/faturamento-serie?meses=N` + sparklines | médio | habilita 7.4 do plano |

### 🥈 Médio prazo

| # | Item | Esforço |
|---|---|---|
| M1 | Drill-down: tabela paginada de notas (filtro empresa/vendedor/período) | médio |
| M2 | Sync de **Parceiros** (entidade Sankhya, valida permissão) | médio |
| M3 | Sync de **Produtos** + **ItemNota** (habilita análise por produto) | alto |
| M4 | Endpoint /api/dashboard/top-clientes e top-fornecedores | baixo (depende M2) |
| M5 | Confirmar com consultor: campo certo pra "caixa realizado" (DHBAIXA vs DHCONCIL vs DTCONTAB) | tem que perguntar |

### 🥉 Longo prazo

| # | Item |
|---|---|
| L1 | **Tela Grade Curricular** (planejamento próprio) — recebíveis recorrentes + saldo em comodato cruzados |
| L2 | Seções Dashboard geral / Vendas / Compras / Estoque com dados reais |
| L3 | Aging de recebíveis (0-30, 31-60, 61-90, >90) |
| L4 | Auth real SSO/JWT (substituir `LoginGate` mock) — etapa 7f |
| L5 | Deploy (Cloudflare Workers pronto via `wrangler.jsonc`; backend precisa definir host) |
| L6 | Re-tornar a sincronizar campo `AD_OBS` em pedidos (gotcha #12) |
| L7 | CI/CD + testes automatizados |

---

## 10. Trabalho diferido / parking lot

Itens explicitamente colocados em espera com motivo:

| Item | Motivo do adiamento | Quando retomar |
|---|---|---|
| **Tela dedicada de Grade Curricular** | Decisão do usuário 2026-05-15 — planejar tela específica em vez de só card | Após estabilizar dashboard atual |
| **Badges de variação Δ%** | Não inventar percentuais mock; depende de endpoint que calcule período anterior | Após série temporal estar pronta |
| **Outras seções mockadas** | Foco na fatia financeira/vendas primeiro | Após refatoração 7e |
| **Multi-seleção de vendedor na UI** | Backend já suporta `vendedor=7,8,9`; UI ainda single-select | Quando virar dor |
| **Combobox com busca de vendedor** | Hoje é Select dropdown simples (~40 itens) | Quando lista crescer mais |
| **Migrar `services/financeiro.ts` legado** | Ainda lê direto da Sankhya (não do snapshot) — herança da Fase 1 | Limpar quando for refatorar |

---

## 11. Riscos e dívidas técnicas

### Risco — Acoplamento ao Sankhya Gateway
A API que usamos é oficial mas relativamente nova. Se Sankhya mudar formato,
quebra. **Mitigação atual:** snapshot SQLite garante operação offline por
algumas horas. **Mitigação futura:** abstrair camada Sankhya num adaptador
intercambiável.

### Risco — Whitelist de TOPs envelhece
`FATURAMENTO_TOPS` em `operacoes.ts` é manual. Se a Maker criar um TOP novo
(ex.: 1809 NFE VENDA SUDESTE), ele **não entra automaticamente** no
faturamento. **Mitigação:** revisar a lista periodicamente; ou criar tabela
no SQLite tipo `tipos_operacao_faturamento(CODTIPOPER, is_receita)` que o
admin possa editar.

### Risco — Janela temporal fixa (`ANO_EXIBICAO_FATURAMENTO = "2026"`)
Hardcoded. Vira 2027 e a dashboard mostra zero. **Mitigação:** tornar
dinâmico em algum momento (ex.: ler ano atual via `new Date().getFullYear()`
no backend).

### Dívida — `index.tsx` de 1.843 linhas
Pendente etapa 7e. Cresce a cada feature, vai ficar mais doloroso quebrar
depois.

### Dívida — Falta de testes
Validação ainda manual. Toda mudança em `FATURAMENTO_TOPS` ou nas SQL queries
exige rodar curl + comparar com Sankhya. Subjetiva a erro humano.

### Dívida — Permissões Sankhya parciais
Entidade `Empresa` bloqueada; `Parceiro`/`Produto`/`ItemNota`/`Estoque` não
validadas. Limita o que dá pra mostrar na dashboard.

### Risco baixo — Timezone
`date('now')` no SQLite é UTC. Pode dar bug de "ontem fatura aparece como
hoje" perto da meia-noite Brasília. Ainda não corrigido.

### Risco baixo — Anomalia da nota 104539
R$ 11M de comodato numa única nota distorce gráficos. Bloqueia card de
comodato até validar.

### Dívidas técnicas sobreviventes do review original (2026-05-14)

Itens identificados pelo agente de revisão externa que **não foram aplicados**
e seguem como débito conhecido (em ordem de relevância):

1. **`expression` por template string em vez de `parameter[]` tipados** —
   `services/financeiro.ts` e outros constroem a `criteria.expression`
   concatenando valores. Hoje funciona porque só entram `number` validados
   pelo Zod. **Vai cobrar conta** quando entrar filtro por intervalo de datas
   (strings) ou busca textual. Refatorar `loadRecords` em `crud.ts` para
   aceitar `{ expression, params: Array<{value, type}> }`.

2. **Sem testes automatizados** — decoder `f0/f1` e queries SQL críticas
   (faturamento, DRE) não têm testes. Toda mudança em
   `FATURAMENTO_TOPS` ou em SQL exige rodar curl + comparar manualmente.
   Sugerido: `decoder.test.ts` com fixtures reais + `dashboard.test.ts`
   com mock de DB.

3. **`useFileBasedPagination` + guard `page > 1000`** — `loadAllRecords`
   tem `if (page > 1000) throw` defensivo. Quando Vendas/Compras com
   histórico anual passar de 1000 páginas (volume real, não loop),
   vai quebrar. Solução: adicionar flag `mode: "in-memory" | "file-based"`
   no `loadRecords` e usar `file-based` nos jobs de snapshot.

4. **`entity` como objeto em vez de array** — `crud.ts` envia
   `entity: { fieldset: {...} }` que funciona pra raiz mas dificulta
   joins explícitos no futuro. Doc oficial usa `entity: [{ path: "", fieldset: ... }]`.
   Refatorar antes do primeiro join customizado.

5. **`modifiedSince` para snapshot incremental** — sync atual é full sync
   (puxa tudo desde 2025-01 a cada ciclo). Quando o volume crescer,
   considerar usar o parâmetro `modifiedSince` da API para incremental.
   Requer `LogAlteracoesTabelas` ativo no Sankhya — confirmar com admin.

---

## 12. Observações do projeto (sugestões abertas)

1. **`scripts/` no backend** — criamos um script ad-hoc (`check-vendedores.ts`)
   pra debugar. Vale formalizar: padrão `scripts/<nome>.ts` que importa do
   `src/` e roda com `npx tsx`. Útil pra ETL ad-hoc, backfills e validações.

2. **Versionamento do schema SQLite** — hoje é uma constante no `schema.sql`
   (`schema_version = '2'`). Quando passarmos pra v3, vale formalizar um
   `migrations/` com arquivos numerados (`001_init.sql`, `002_categorias.sql`,
   `003_comodato.sql`...) em vez do schema.sql monolítico. Reduz risco em
   produção.

3. **`PLAN_INTEGRATION_FRONTEND.md` está ficando longo** (~500 linhas).
   Quando virar tela Grade Curricular, sugiro criar `PLAN_GRADE_CURRICULAR.md`
   próprio em vez de inflar o existente.

4. **`legacy-python/`** — pasta com scripts iniciais Python que ajudaram a
   investigar o Sankhya. Não é mais usada. Pode apagar ou jogar pra um branch
   `archive/` se quiser preservar histórico.

5. **`__pycache__/` na raiz** — resíduo do desenvolvimento Python inicial.
   Apagar e adicionar `__pycache__/` no `.gitignore` raiz.

6. **`PLAN.md` versus `STATUS_PROJECT.md`** — o `PLAN.md` original ainda fala
   em "Fase 1/2/3..." que estão obsoletos. Sugestão: trocar `PLAN.md` por
   um README mais curto de visão executiva e usar `STATUS_PROJECT.md` (este
   doc) como referência principal.

7. **Endpoint admin pra forçar sync** — quando você precisa de dado fresco
   imediato, hoje precisa esperar 5 min ou reiniciar o servidor. Vale
   `POST /api/admin/refresh?entity=pedidos` (protegido por header secreto)
   pra disparar sync sob demanda.

8. **Métricas de observabilidade** — backend loga `sync ok` e `sync falhou`,
   mas não temos visibilidade de "quantos pedidos foram sincronizados nesta
   rodada", "qual o lag médio entre data do pedido e momento do sync", etc.
   Métricas estruturadas (Prometheus / OpenTelemetry) seriam valiosas quando
   for pra produção.

---

## 13. Navegação da documentação

Onde olhar quando você precisar de:

| Pergunta | Documento |
|---|---|
| "Qual o estado atual do projeto?" | **`STATUS_PROJECT.md`** (este doc) |
| "Como funciona a integração com Sankhya?" | `PLAN.md` §3–§5, gotchas em `STATUS_PROJECT.md` §8 |
| "Estrutura do banco SQLite?" | `PLAN_DATA_BASE.md` (schema, índices, telas) |
| "Como ligar o frontend nos endpoints?" | `PLAN_INTEGRATION_FRONTEND.md` |
| "O que foi decidido e por quê?" | `STATUS_PROJECT.md` §7 (regras de negócio) e §11 (dívidas técnicas vindas dos reviews originais) |
| "Quais rotas REST estão disponíveis?" | `ROTAS.md` (catálogo completo com query params, response shapes e exemplos curl) |
| "Que decisões UI já foram tomadas?" | `PLAN_INTEGRATION_FRONTEND.md` §1 e §7.10 |

---

## 14. Como começar (onboarding de novo agente/dev)

```bash
# Backend
cd backend
npm install
cp .env.example .env       # popular SANKHYA_* (consultar gerente do projeto)
npm run dev                # http://localhost:3000

# Frontend (em outro terminal)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:3000" > .env.local
npm run dev                # http://localhost:8080
```

**Smoke tests:**
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/empresas
curl http://localhost:3000/api/vendedores
curl "http://localhost:3000/api/dashboard/empresa/faturamento?empresa=todas"
```

Se algo der errado: verificar `.env`, verificar se `CORS_ORIGINS` inclui a porta do front, verificar logs do backend (pino-pretty mostra colorido).

---

**Próxima decisão do usuário:** escolher entre P2 (refatorar `index.tsx`),
P4 (série temporal/sparklines), ou seguir outra direção. Ver §9.
