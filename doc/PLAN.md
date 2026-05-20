# Dashboard Sankhya — Plano de Implementação

> Documento de planejamento para o projeto. Destinado a ser lido por outros
> agentes/devs antes da execução. Atualize conforme decisões mudarem.
>
> **📌 Para visão executiva do estado atual do projeto:** ver
> [`STATUS_PROJECT.md`](STATUS_PROJECT.md). Este `PLAN.md` é o **plano
> original** que orientou o início; muitos pontos descritos aqui já estão
> implementados (ver `STATUS_PROJECT.md §3`). Decisões posteriores que
> superam este documento são registradas no `STATUS_PROJECT.md`.
>
> **Revisão consolidada (2026-05-14, 2026-05-15):** os achados do
> `PLAN_REVIEW.md` original foram absorvidos (15 itens) — 10 aplicados no
> código, 5 viraram dívidas técnicas conhecidas em `STATUS_PROJECT.md §11`.
> O arquivo `PLAN_REVIEW.md` foi removido após consolidação.

## 1. Contexto

- **Empresa:** Grupo Maker (Maker Educação e Tecnologia LTDA)
- **Objetivo:** Dashboard web com KPIs de **Vendas, Compras, Contas a Receber e
  Contas a Pagar**, consumindo dados do ERP Sankhya.
- **Stack confirmada:** Node + TypeScript no backend, React + Vite + Tremor no
  frontend, monorepo.

## 2. Estado atual

### Concluído

- Investigação dos caminhos de integração com Sankhya (3 caminhos avaliados,
  escolha pelo Gateway oficial).
- Credenciais OAuth 2.0 obtidas (cliente `BI-MKR`, usuário `BIMKR`).
- Postman: collection `Sankya API` com login auto-renovado via script de
  test/Scripts (salva `access_token` no environment).
- Validação dos endpoints Sankhya principais.
- Backend Node + TS scaffolded em `backend/` com:
  - Cliente HTTP autenticado e auto-renovação de token em erro `GTW3403`.
  - Decoder universal `f0/f1/...` → objeto legível usando `metadata.fields`.
  - Wrapper `loadRecords` e `loadAllRecords` (paginação completa).
  - Serviço `financeiro` (títulos a receber/pagar) com tipagem.
  - Rotas `GET /api/receber` e `GET /api/pagar` validadas com Zod.
- Descoberta de **multi-empresa** via consulta exploratória: 7 empresas
  do Grupo Maker confirmadas (CODEMP 1, 2, 5, 6, 8, 11, 12). Detalhe em
  seção 9.
- Validados via Postman: filtros `this.CODEMP = N`, `this.CODEMP IN (...)`,
  e range de datas com `TO_DATE` para `DHBAIXA`.

### Pendente

- Endpoints de **Vendas** (`/v1/vendas/pedidos`) e **Compras**
  (gateway → `CabecalhoNota TIPMOV='C'`).
- Endpoints **agregados** para a dashboard (faturamento diário, aging,
  top clientes/fornecedores).
- **Cache em memória** (TTL configurável por rota).
- **SQLite snapshot** — guarda último estado conhecido para servir quando
  Sankhya estiver indisponível ou em horário de manutenção.
- **CORS** configurado para o frontend.
- **Frontend** (não começado).
- **Deploy** (decisão adiada).

## 3. Arquitetura geral

```
┌──────────────────┐     ┌────────────────────────┐     ┌─────────────────┐
│  Frontend Vite   │     │  Backend Node/Express  │     │   Sankhya OM    │
│  React + Tremor  │────▶│  - Auth gerenciada     │────▶│   Gateway       │
│  Dashboards      │     │  - Decoder f0/f1       │     │  api.sankhya.   │
│                  │◀────│  - Cache (5–30 min)    │◀────│  com.br         │
└──────────────────┘     │  - SQLite snapshot     │     └─────────────────┘
                         └────────────────────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │  snapshot.db  │
                            │   (SQLite)    │
                            └───────────────┘
```

**Princípios:**

1. Frontend **nunca** chama Sankhya diretamente (CORS, credenciais sensíveis,
   performance).
2. Backend mantém uma sessão Sankhya viva e cacheia.
3. Quando Sankhya falha, backend serve o último snapshot do SQLite com flag
   `stale: true` na resposta.
4. Atualização do snapshot é por job em background (a definir: cron, ou
   `setInterval` simples).

## 4. Stack escolhida

| Camada | Tecnologia | Versão | Justificativa |
|---|---|---|---|
| Server | Express | 5.x | Padrão de mercado, ampla documentação |
| HTTP cliente | `fetch` nativo (Node 20+) | — | Sem dependência externa |
| TypeScript | strict + ESM | 5.6 | Tipagem forte na contract da API |
| Validação | Zod | 3.x | Validação de env e query params |
| Logs | pino + pino-pretty | 9.x | Estruturado, performático |
| Cache | node-cache | (a instalar) | TTL por chave, in-memory |
| SQLite | better-sqlite3 | (a instalar) | Síncrono, file-based, performático |
| Dev | tsx --watch | 4.x | Hot reload sem build step |
| Frontend | Vite + React + TS | 18.x | Build rápido, ecossistema maduro |
| UI | Tremor + Tailwind | 3.x | Componentes prontos de dashboard |

## 5. Fontes de dados Sankhya

| Domínio | Caminho | Método | Auth | Validado |
|---|---|---|---|---|
| Autenticação | `/authenticate` | POST x-www-form-urlencoded | client_id + secret + X-Token | ✅ |
| Vendas (pedidos) | `/v1/vendas/pedidos` | GET | Bearer | ✅ |
| Compras (pedidos) | `/gateway/v1/mge/service.sbr` CRUD `CabecalhoNota` TIPMOV='C' | POST | Bearer | ⚠ não testado |
| Contas a Receber | `/gateway/v1/mge/service.sbr` CRUD `Financeiro` RECDESP>0 | POST | Bearer | ✅ |
| Contas a Pagar | idem com RECDESP<0 | POST | Bearer | ⚠ deduzido, falta confirmar |
| Parceiros | `/v1/parceiros` ou CRUD `Parceiro` | GET/POST | Bearer | ⚠ a confirmar caminho |
| Produtos | `/v1/produtos` | GET | Bearer | ⚠ a confirmar |
| Estoque | a confirmar | — | Bearer | ⚠ a confirmar |

### Notas operacionais

- **Token expira em 3600s.** Backend renova automaticamente em erro
  `GTW3403`.
- **Joined fields** (`Parceiro_NOMEPARC`, etc.) só vêm quando
  `includePresentationFields=S`. **Não podem ser listados explicitamente em
  `fieldset.list`** — quebra. Vêm "de brinde" no retorno.
- **Resposta CRUD vem ofuscada** com chaves `f0`, `f1`, ... A ordem é a do
  `metadata.fields[]` retornado na própria resposta. O decoder lê o metadata
  dinamicamente — não hardcode posições.
- **RECDESP é numérico:** `> 0` = receita, `< 0` = despesa. Não é `'R'`/`'D'`.
- **Status do título:** `DHBAIXA IS NULL` = em aberto. Não há campo `STATUS`
  legível na entidade `Financeiro`.
- **Critérios CRUD:** usar `this.CAMPO` (não só `CAMPO`) por segurança.
- **Módulos do gateway são exclusivos:** `CRUDServiceProvider` vai em
  `/gateway/v1/mge/`, não em `/mgecom/`. Serviços comerciais
  (ex.: `CACSP.IncluirNota`) vão em `/mgecom/`.
- **Entidade `Empresa` bloqueada:** o usuário `BIMKR` não tem permissão na
  entidade `Empresa`. Tentar consultá-la diretamente retorna XML estranho
  com erro "Content is not allowed in prolog." Workaround: extrair `CODEMP`
  e `Empresa_NOMEFANTASIA` dos próprios títulos do `Financeiro` (vêm como
  joined fields automaticamente).
- **`DHBAIXA` pode ser data futura/programada:** observação importante —
  vários títulos retornam com `DHBAIXA` em datas à frente (ex.: `18/05/2026`,
  `16/06/2026`) mesmo já com `VLRBAIXA = VLRDESDOB`. Indica que esse campo
  carrega a **data prevista** de baixa, não necessariamente a data efetiva
  do recebimento. Para relatórios de "recebido de fato", investigar campos
  alternativos como `DHCONCIL` (conciliação bancária) ou `DTCONTAB`
  (contabilização). Confirmar com o consultor Sankhya antes de usar
  `DHBAIXA` como referência de "caixa realizado".

## 6. Contract da API do backend

Prefixo: `/api`

### Health
- `GET /api/health` → `{ status, time }`. Não chama Sankhya.

### Operacionais (listagens)
- `GET /api/vendas?empresa=1&inicio=YYYY-MM-DD&fim=YYYY-MM-DD&page=0`
- `GET /api/compras?empresa=1&inicio&fim&page`
- `GET /api/receber?empresa=1&emAberto=true&page=0` (títulos em aberto)
- `GET /api/pagar?empresa=1&emAberto=true&page=0`
- `GET /api/recebidos?empresa=1|todas|1,2,5&periodo=dia|semana|mes|ano&data=YYYY-MM-DD`

### Filtros de período (parâmetro `periodo`)

Todos os endpoints operacionais aceitam um `periodo` derivado, calculado
a partir do parâmetro `data` (default: hoje):

| `periodo` | Intervalo gerado | Exemplo (`data=2026-05-13`) |
|---|---|---|
| `dia` | `[data 00:00, data+1 00:00)` | 13/05 inteiro |
| `semana` | `[segunda da semana, segunda seguinte)` | 11/05 → 18/05 |
| `mes` | `[dia 1 do mês, dia 1 do próximo)` | 01/05 → 01/06 |
| `ano` | `[01/01 do ano, 01/01 do próximo)` | 01/01/2026 → 01/01/2027 |
| `custom` | `inicio` e `fim` em querystring | livre |

Implementação utilitária em `backend/src/utils/periodo.ts` retorna
`{ inicio: Date, fim: Date }` para uso na construção do `criteria.expression`.

### Multi-empresa nos endpoints

Parâmetro `empresa` aceita três formatos:
- `todas` (ou omitido) → sem filtro de CODEMP
- `1` → `this.CODEMP = 1`
- `1,2,5` → `this.CODEMP IN (1,2,5)`

**Response shape padrão:**
```json
{
  "rows": [ /* objetos tipados, nomes legíveis */ ],
  "total": 1234,
  "hasMore": false,
  "stale": false,
  "fetchedAt": "2026-05-13T18:00:00Z"
}
```

`stale: true` quando vier do SQLite snapshot (Sankhya indisponível).

### Agregados (para dashboard)
- `GET /api/dashboard/faturamento-diario?empresa=1&dias=30`
  → `[{ data, totalFaturado, qtdPedidos }, ...]`
- `GET /api/dashboard/aging-receber?empresa=1`
  → `{ "0-30": x, "31-60": y, "61-90": z, "90+": w, vencido: ..., aVencer: ... }`
- `GET /api/dashboard/top-clientes?empresa=1&periodo=mes&limite=10`
- `GET /api/dashboard/top-fornecedores?empresa=1&periodo=mes&limite=10`
- `GET /api/dashboard/kpis?empresa=1`
  → `{ faturamentoMes, recebidoMes, aReceber, aPagar, inadimplencia }`

### Cadastros (cache longo, ~30 min)
- `GET /api/parceiros`
- `GET /api/produtos`
- `GET /api/empresas`
- `GET /api/vendedores`

## 7. Plano em fases

### Fase 1 — Backend core ✅
- [x] Estrutura, config, client, decoder, CRUD wrapper
- [x] Rota `/api/receber`
- [x] Rota `/api/pagar`
- [x] Validação Zod nas queries
- [x] Logs estruturados
- [x] Tratamento global de erro

### Fase 2 — Endpoints restantes
- [ ] `/api/empresas` (hardcoded inicialmente, ver seção Multi-empresa)
- [ ] Utilitário `utils/periodo.ts` para calcular intervalos de
      `dia | semana | mes | ano | custom`
- [ ] `/api/recebidos` com filtros multi-empresa + período
- [ ] `/api/vendas` usando `/v1/vendas/pedidos`
- [ ] `/api/compras` via CRUD `CabecalhoNota` (TIPMOV='C')
- [ ] `/api/parceiros` (cache 30 min)
- [ ] `/api/produtos` (cache 30 min)

### Fase 3 — Agregados e cache
- [ ] Camada de cache (node-cache, TTL por rota)
- [ ] `/api/dashboard/faturamento-diario`
- [ ] `/api/dashboard/aging-receber`
- [ ] `/api/dashboard/kpis`
- [ ] `/api/dashboard/top-clientes` e `top-fornecedores`

### Fase 4 — SQLite snapshot
- [ ] Schema das tabelas snapshot (`titulos`, `pedidos`, `parceiros`, ...)
- [ ] Job em background atualizando o snapshot (a cada 5–10 min)
- [ ] Fallback no error handler: se Sankhya falha, lê do SQLite e marca
      `stale: true` na resposta
- [ ] Endpoint admin `/api/admin/refresh` pra forçar sync

### Fase 5 — Frontend
- [ ] Scaffold `frontend/` com Vite + React + TS + Tailwind + Tremor
- [ ] Cliente HTTP (axios ou fetch) apontando pro backend
- [ ] Layout base com sidebar
- [ ] Página de Visão Geral (KPIs do `/api/dashboard/kpis`)
- [ ] Página Vendas (gráfico de faturamento diário + tabela paginada)
- [ ] Página Compras
- [ ] Página Financeiro (a receber + a pagar + aging)
- [ ] Filtros: empresa, período

### Fase 6 — Polish e deploy
- [ ] Tratamento de loading/erro/empty no front
- [ ] Tema escuro
- [ ] Deploy (decisão pendente)

## 8. Decisões já tomadas (com motivo)

| Decisão | Motivo |
|---|---|
| Sankhya Gateway (cloud) e não API local (`service.sbr`) | API oficial, documentada, versionada, com `BIMKR` que tem permissão ampla |
| OAuth 2.0 e não login legado | Legado foi descontinuado em 30/04/2026 |
| Backend Node mediando o Frontend | Esconde credenciais, evita CORS, permite cache |
| TypeScript strict | Pega erros de contract em compile-time, melhora DX |
| ESM (`type: module`) | Padrão moderno do Node, alinhado com Vite no front |
| Express 5 (não Fastify) | Mais fácil de manter, comunidade maior |
| Tremor (não Recharts puro) | Componentes prontos de dashboard reduzem código UI |
| SQLite (não Postgres/Mongo) | Volume pequeno, sem necessidade de servidor de banco |
| Cache + Snapshot em vez de só cache | Resiliência: dashboard continua usável se Sankhya cai |

## 9. Riscos e pendências

### Permissões da Sankhya
- O usuário `BIMKR` foi confirmado para `Financeiro`. **Falta confirmar
  permissão pra `CabecalhoNota`** (Vendas/Compras como CRUD) e demais entidades.
  Validar antes de avançar na Fase 2.

### Volume de dados
- A primeira chamada de `/api/vendas` puxando o ano inteiro pode ser lenta
  (várias páginas). Mitigação:
  - Paginação real no frontend (não carregar tudo de uma vez).
  - Snapshot pré-carregado.
  - Filtro de data obrigatório nos endpoints operacionais.

### Datas e timezones
- API retorna datas em `dd/MM/yyyy` (BR). Backend normaliza para ISO
  (`yyyy-MM-dd`). Atenção para campos `DHBAIXA` que vêm como
  `dd/MM/yyyy HH:mm:ss`.

### Decodificação dinâmica
- O mapa `fN → nome` muda conforme o `fieldset.list` enviado. **Sempre** ler
  o `metadata.fields[]` da própria resposta para decodificar — não hardcode
  índices.

### Joined fields
- A lista de joined fields disponíveis varia por entidade e versão.
  `Parceiro_NOMEPARC` foi confirmado pra `Financeiro`. Outros joins (ex.:
  `Vendedor_APELIDO`, `CentroResultado_DESCRCENCUS`) podem vir, mas não
  podemos solicitá-los explicitamente — vêm automaticamente com
  `includePresentationFields=S`.

### Multi-empresa

O Grupo Maker tem **pelo menos 7 empresas** ativas, descobertas extraindo os
`CODEMP` distintos dos próprios títulos do Financeiro (a entidade `Empresa`
direta está bloqueada para o usuário `BIMKR`):

| CODEMP | NOMEFANTASIA |
|---|---|
| 1 | MAKER MATRIZ |
| 2 | MY ROBOT FRANQUEADORA |
| 5 | MK CENTRO |
| 6 | MK E-COMMERCE |
| 8 | MAKER FILIAL |
| 11 | MAKER ATACADISTA |
| 12 | MAKER VAREJISTA |

> Códigos 3, 4, 7, 9, 10 não apareceram nas amostras de maio/2026 — podem
> existir mas sem movimento no período. Confirmar paginando a consulta de
> Financeiro com filtro de data mais amplo.

**Decisão de UX:** seletor com opção "Todas as empresas" + cada empresa
individual + seleção múltipla (`?empresa=1,2,5`). Os endpoints aceitam:

- `?empresa=todas` → sem filtro de CODEMP
- `?empresa=1` → `this.CODEMP = 1`
- `?empresa=1,2,5` → `this.CODEMP IN (1,2,5)`

**Implementação de `/api/empresas`:** já que a entidade `Empresa` não é
consultável diretamente, a lista das 7 empresas fica **hardcoded** no
backend (`backend/src/services/empresas.ts`) por enquanto. Quando/se as
permissões da entidade `Empresa` forem liberadas, troca por consulta
dinâmica.

### CORS
- Quando o frontend rodar em `localhost:5173` e backend em `localhost:3000`,
  habilitar `cors` no Express com `origin: ['http://localhost:5173']`.

### Segredos
- `.env` no `.gitignore`. Em produção, mover para variáveis de ambiente do
  provedor (Render/Railway/etc.) ou um cofre.

## 10. Convenções de código

- **Imports relativos com `.js`** (TS ESM exige a extensão final).
- **Nada de comentários óbvios.** Comentar só "porquê" não óbvio.
- **Validação Zod** em toda entrada do request.
- **Sem `any`.** Usar tipos em `sankhya/types.ts`.
- **Erros sobem.** O middleware global de erro formata a resposta.
- **Naming:** TypeScript em inglês para tipos/funções, JSON da API REST em
  português pra mapear ao domínio (Vendas, Compras, etc.).

## 11. Como rodar (estado atual)

```bash
cd backend
npm install
cp .env.example .env   # se ainda não tiver; popular com credenciais
npm run dev            # sobe em http://localhost:3000
```

**Testar:**

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/receber?empresa=1&page=0"
curl "http://localhost:3000/api/pagar?empresa=1&page=0"
```

## 12. Próxima ação concreta

1. Criar `backend/src/services/empresas.ts` com a lista hardcoded das 7
   empresas conhecidas.
2. Criar `backend/src/utils/periodo.ts` para calcular intervalos
   `dia | semana | mes | ano | custom` a partir de uma data de referência.
3. Criar `backend/src/services/recebidos.ts` consultando `Financeiro`
   com filtros de período + multi-empresa.
4. Adicionar rotas `GET /api/empresas` e
   `GET /api/recebidos?empresa=...&periodo=...&data=...` em
   `routes/index.ts`.
5. Validar end-to-end com `curl` / Postman, especialmente:
   - `?empresa=1&periodo=dia&data=2026-05-04` (caso conhecido: 5 títulos)
   - `?empresa=todas&periodo=mes`
   - `?empresa=1,2,5&periodo=semana&data=2026-05-13`
6. Antes da Fase 3, confirmar com o consultor Sankhya qual campo usar
   para "data de recebimento efetivo" (ver nota sobre `DHBAIXA` na seção 5).
