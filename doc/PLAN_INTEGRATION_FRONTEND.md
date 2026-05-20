# Plano de integração Frontend ↔ Backend (Sankhya API)

Este documento descreve **como** integrar o painel React (`frontend/`) aos endpoints já existentes do backend Node (`backend/`). Foi pensado para ser executado por outro agente ou desenvolvedor com **detalhes de contrato, checklist e decisões já assumidas pelo time**.

> **Estado atual (implementação no repo — 2026-05-14):** **7a**, **7b** e **7c Financeiro**
> estão **implementadas** no `frontend/src/routes/index.tsx` e módulos
> associados. Seções Dashboard geral / Estoque / Compras etc. seguem mock
> (`DATA` em `index.tsx`). Ver §1.4 e §14–§15.

> **Revisão consolidada (2026-05-14, 2026-05-15):** decisões aplicadas após
> revisão externa do agente Cowork. **Os 9 itens do review foram absorvidos
> neste documento** e o arquivo `PLAN_INTEGRATION_FRONTEND_REVIEW.md` foi
> removido. Síntese das decisões:
>
> - **Sparkline na área Empresas** → postergado (exige endpoint de série
>   temporal — ver §7.4 e backlog 7c).
> - **Formato monetário k/M** → adotado nos cards de empresa (alinha com
>   `PLAN_DATA_BASE.md` §14.1; ver §7.5).
> - **SSR / Cloudflare Workers** → chamadas só no client; SSR prefetch
>   classificado como "fase futura" (§8).
> - **`getApiBaseUrl()` fallback explícito** → falha rápida em build de
>   produção sem `VITE_API_URL` definida.
> - **`retry` condicional** → não retentar 4xx; 1 retry para 5xx/network
>   (§6.3).
> - **UX `snapshot_at === null`** → mensagem "Aguardando primeira
>   sincronização" generalizada (§7.9).
> - **`ativa` vs `ordem < 99`** → frontend não filtra por `ativa`; backend
>   já filtra `ordem < 99` (§7.2).
> - **Query keys distintas** → `faturamentoConsolidado` separado de
>   `faturamentoPorEmpresa` (sem colisão em `invalidateQueries`).
> - **`npm run lint`** → adicionado nos critérios de aceite §14.

> **Etapa 7d — Dimensão Vendedor (backend pronto 2026-05-15):** novo endpoint
> `GET /api/vendedores` + parâmetro opcional `vendedor` em
> `/dashboard/empresa/faturamento` e `/dashboard/empresa/faturamento-por-empresa`.
> Permite responder a pergunta "qual o faturamento real do canal e-commerce?"
> (vendedores específicos como `ECOMMERCE ROBO`, `ECOMMERCE MAKER`) e "quanto
> a Camila vendeu em todas as empresas?" Backend implementado em
> `services/dashboard.ts` (`listarVendedores`, parâmetro `vendedor` em
> `faturamentoConsolidado` e `faturamentoPorEmpresa`) e `utils/vendedor.ts`.
> Frontend **ainda não integrado** — ver §2.6, §3.1 e §7.10.

**Decisões de produto já fechadas (não reinterpretar sem o usuário):**

1. **Escopo já integrado com API:** seção sidebar **Empresas** («Análise por Empresa») e **Financeiro** consomem os endpoints enumerados nos §§2–2.5. Demais itens da sidebar permanecem demonstração mock até nova fase.
2. **Badges de variação percentual** (Δ fake em KPIs executivos): **omitir** em **Empresas** e **Financeiro** até existir backend que compute período anterior; **não** inventar % no front.
3. **`keepPreviousData`** no `useFaturamentoConsolidado`: **descartado** na implementação (evitar mostrar KPIs da empresa anterior enquanto carrega troca de `CODEMP`); cache por query key já separa filtros.

**Stack do frontend:** TanStack Start (Vite), TanStack Router, TanStack Query (**em uso em `FinanceiroSection`**, `EmpresasDashboardSection` e hooks dedicados na rota `/`), React 19, Tailwind/shadcn, Recharts.

**Documentos de referência adicionais:** `PLAN_DATA_BASE.md` (seção «Análise por Empresa» / tela 14.1), `backend/src/services/dashboard.ts` (regra de «faturamento» e janelas temporais).

---

## 1. Objetivo da fase 7a + 7b

### 7a — Infraestrutura de API no cliente

- Cliente HTTP centralizado (URL base configurável por env).
- Tipos TypeScript alinhados às **respostas reais** do backend.
- Hooks TanStack Query com chaves estáveis (`queryKey`).
- Estados de loading/erro reutilizáveis na UI da seção Empresas.

### 7b — Substituir dados mockados da seção «Análise por Empresa»

- Lista de empresas vinda do snapshot (`/api/empresas`).
- KPIs dia / semana 7 dias / mês atual / ano atual via `/api/dashboard/empresa/faturamento`.
- Gráficos (barras + pizza/barras) via `/api/dashboard/empresa/faturamento-por-empresa` — **sempre todas as empresas**, sem filtro, conforme regra acordada.
- Selector de empresa: enviar **`CODEMP`** (ou conjunto ou `todas`) nas queries de KPI, **não** filtrar o endpoint de distribuição.

### 1.4 Fase 7c — Financeiro (implementada)

Implementação em **`FinanceiroSection`** (`routes/index.tsx`):

| UI | Backend | Observação |
|---|---|---|
| `EmpresaSelector` reutilizado | `empresa` em todas as queries financeiras | Estado local independente da seção Empresas. |
| Barra «Competência»: Mês atual / Ano atual | `GET .../financeiro/dre`, `GET .../distribuicao-despesas` com `periodo=mes\|ano` | DRE e distribuição usam competência (`DTNEG`). |
| KPIs ×4 | `dre` + `/financeiro/contas?tipo=receber&page=0&pageSize=1` | Sem Δ%. Card 3 usa **resultado operacional** + texto de **margem %** (não «lucro líquido» contábil). Card 4: `valor_total_aberto`. |
| Gráfico «DRE — resumo do período» | Mesmo objeto `dre` | Barras verticais: receita bruta · despesas totais · resultado operacional (**agregado** do período; não há série temporal no backend atual). Variant line/area é cosmético. |
| «Distribuição de despesas» | `/financeiro/distribuicao-despesas` | Categories = prefixos 2–5 (`dashboard-financeiro.ts`). Cores palette fixa ciclando por índice. |
| Barra «Fluxo — janela» | `/financeiro/fluxo-caixa?meses=3\|6\|12\|18` | **Mensal** por `DHBAIXA`; eixo usa `serie[].mes` + `formatMesAnoPt()` (`lib/format.ts`). Gráficos: saldo líquido; tooltip menciona entradas/saídas. |

- Removido o mock **`DATA.financeiro`** do bundle.
- Módulos reutilizáveis criados:**`lib/empresaSelecao.ts`** (`EmpresaSeleção`, `empresaKey`, `empresaQueryValue`), DTO financeiros em **`lib/api/types.dashboard.ts`**, hooks **`useFinanceiroDre`**, **`useDistribuicaoDespesas`**, **`useFluxoCaixa`**, **`useContasAbertasResumo`**.

**Backlog pós‑7c (não está no código):**

| Item | Esforço provável |
|---|---|
| Serie DRE **mês a mês** (substituir o gráfico de 3 barras por linha temporal) | Novo endpoint ou extensão de `dre` com agregações por `strftime('%Y-%m', ...)`. |
| Sparklines nos 4 KPIs da seção Empresas | Endpoint de série temporal de faturamento (ver §7.4). |
| Lista/tabular de `/financeiro/contas` com paginação na própria tela Financeiro | Reaproveitar DTO paginado; UI ainda pendente. |

---

## 2. Inventário das rotas já disponíveis (backend)

Todas as rotas são prefixadas por **`/api`** (montadas em `backend/src/server.ts` → `app.use("/api", router)`).

### 2.1. Health

| Método | Caminho | Uso típico no front |
|--------|---------|---------------------|
| `GET` | `/api/health` | Smoke test rápido; opcional antes de prefetch. |

### 2.2. Empresas (lista para o selector)

| Método | Caminho | Resposta JSON |
|--------|---------|---------------|
| `GET` | `/api/empresas` | `{ empresas: EmpresaDto[] }` |

**`EmpresaDto` (inferido do serviço `listarEmpresas`):**

```ts
type EmpresaDto = {
  CODEMP: number;
  NOMEFANTASIA: string;
  ordem: number;
  ativa: 0 | 1;
};
```

**Filtragem no backend:** apenas empresas com `ordem < 99` (seed visível na UI da tela 14.1; stubs não aparecem).

### 2.3. Faturamento consolidado (KPIs por filtro empresa)

| Método | Caminho | Query |
|--------|---------|--------|
| `GET` | `/api/dashboard/empresa/faturamento` | `empresa` (default Zod: `todas`; ver §3), `vendedor` (default Zod: `todos`; ver §3.1) |

**Resposta:**

```ts
type FaturamentoConsolidadoDto = {
  filtro: string;           // ex.: `"empresa=lista[6];vendedor=lista[7]"` ou `"empresa=todas;vendedor=todos"`
  dia: number;
  semana_7d: number;        // soma últimos 7 dias calendário (SQLite `date('now', '-6 days')` … inclui «hoje»)
  mes_atual: number;
  ano_atual: number;
  snapshot_at: string | null;  // último sync da entidade `pedidos`; pode ser UI «dados atualizados em»
};
```

> **Mudança de contrato (2026-05-15):** o campo `filtro` mudou de
> `"todas"`/`"lista[id]"` para `"empresa=...;vendedor=..."`. Frontend deve
> tratar como string opaca (só passar adiante em logs/debug) — não parsear.

### 2.4. Faturamento por empresa (gráficos)

| Método | Caminho | Query |
|--------|---------|-------|
| `GET` | `/api/dashboard/empresa/faturamento-por-empresa` | `vendedor` (default: `todos`) |

**Resposta:**

```ts
type FaturamentoPorEmpresaResponse = {
  periodo: string;    // exemplo: `ano:2026`
  total: number;
  snapshot_at: string | null;
  empresas: Array<{
    CODEMP: number;
    NOMEFANTASIA: string;
    faturamento: number;
    percentual: number;   // já 0–100 com 2 decimais; soma pode não dar exato 100% por arredondamento
  }>;
};
```

**Regra de negócio (backend):**
- Janela = **ano civil atual** (`ANO_EXIBICAO_FATURAMENTO = "2026"` hoje); participação `%` calculada sobre o `total`.
- `empresa` **não filtra aqui** (sempre retorna todas as empresas visíveis, mantendo a distribuição em pizza/barras coerente).
- `vendedor` **filtra**: com `vendedor=13`, o `total` e as `empresas[]` refletem só o que esse vendedor faturou em cada empresa. Útil para visualizar como uma vendedora distribui faturamento entre as filiais.

### 2.6. Vendedores (lista para o selector)

| Método | Caminho | Resposta JSON |
|--------|---------|---------------|
| `GET` | `/api/vendedores` | `{ vendedores: VendedorDto[] }` |

**`VendedorDto`:**

```ts
type VendedorDto = {
  CODVEND: number;     // 0 = "<SEM VENDEDOR>" (nota sem vendedor cadastrado)
  APELIDO: string;     // ex.: "ECOMMERCE ROBO", "CAMILA MAKER", "LAILA"
  ativo: 0 | 1;
};
```

**Ordenação backend:** `ORDER BY ativo DESC, APELIDO` — vendedores ativos primeiro, alfabético dentro de cada grupo.

**Observações da Maker (úteis pra UI):**

- Existe **um vendedor por canal × empresa**: `ECOMMERCE ROBO`, `ECOMMERCE MAKER`, `ECOMMERCE MYROB`, `ECOMMERCE SMART`. Considerar agrupar visualmente os "ECOMMERCE *" no selector se o usuário quiser ver "todos os canais online" juntos.
- Existem múltiplos vendedores humanos com mesmo primeiro nome (`CAMILA`, `CAMILA MAKER`, `CAMILA MY ROBOT`, `CAMILA ROBOSHOP`) — provavelmente uma pessoa atendendo em várias empresas mas com cadastros separados para apuração.
- **Importante:** um mesmo vendedor humano emite notas em **várias empresas** (qualquer vendedor pode tirar nota em qualquer CODEMP). Por isso `faturamentoPorEmpresa(?vendedor=X)` é a query certa pra ver "onde o vendedor X vendeu este ano".
- `<SEM VENDEDOR>` (CODVEND=0) aparece em algumas notas — costuma indicar lançamento sem atribuição (poucas, mas presentes).

### 2.5. Rotas financeiras (**7c ligado no front**, contrato igual ao backend)

TipoScript: ver `FinanceiroDreDto`, `FluxoCaixaDto`, `DistribuicaoDespesasDto`, `ContasFinanceirasDto` em `frontend/src/lib/api/types.dashboard.ts` (campos snake_case conforme Express).

| Caminho | Query típica | Ligado ao front em |
|---------|---------------|---------------------|
| `GET /api/dashboard/financeiro/dre` | `empresa`, `periodo=mes \| ano` | KPIs principais + gráfico resumo período (**agregado**; série mensal não disponível neste endpoint). Implementação backend: `services/dashboard-financeiro.ts`. |
| `GET /api/dashboard/financeiro/fluxo-caixa` | `empresa`, `meses` (1–36) | Janelas 3/6/12/18 preset na UI (`FluxoJanelaBar`). Série **`serie[]`**: `{ mes, entradas, saidas, saldo }`; `snapshot_at` de **`titulos`**. |
| `GET /api/dashboard/financeiro/distribuicao-despesas` | `empresa`, `periodo` | Donut/barras + legenda `%`. |
| `GET /api/dashboard/financeiro/contas` | `tipo`, `page`, `pageSize`, `empresa` | Apenas KPI: `valor_total_aberto` com `pageSize=1` (**useContasAbertasResumo**). Lista detalhada → backlog. |

---

#### 2.5.1. Query keys TanStack Query (financeiro)

Registrar prefixos antes de mais `invalidateQueries`:

```ts
['financeiroDre', { empresaKey, periodo }]
['distribuicaoDespesas', { empresaKey, periodo }]
['fluxoCaixa', { empresaKey, meses }]
['contasAbertasResumo', { empresaKey, tipo }]
```

Erro combinado na seção Financeiro invalida todas de uma vez (comportamento atual na UI).

#### 2.5.2. Query keys TanStack Query (empresas + vendedor — etapa 7d)

```ts
['empresas']
['vendedores']
['faturamento', { empresaKey, vendedorKey }]
['faturamentoPorEmpresa', { vendedorKey }]
```

**Determinismo das chaves:** sempre que `empresaKey` ou `vendedorKey` representar lista de IDs, ordenar antes de serializar (`[...ids].sort((a,b)=>a-b).join(',')`). Sem ordenação, mudanças triviais de ordem na UI quebram o cache.

`vendedorKey` deve ser:
- `"todos"` quando `modo: "todos"`,
- `String(id)` quando 1 id,
- `ids.sort().join(',')` quando lista.

---

## 3. Parâmetro `empresa` — semântica e exemplos de URL

Definido em `backend/src/utils/empresa.ts` e aplicado aos endpoints que usam `empresaParam`.

| Valor `empresa` (query string) | Significado |
|---------------------------------|-------------|
| omitido ou `todas` | Todas as empresas elegíveis. |
| inteiro positivo (`1`) | Uma empresa. |
| vários IDs (`1,2,5`) | Lista (OR no SQL); útil só se futuramente UI suportar multi-seleção. |

**Construção sugerida no front (para esta fase):**

- Estado interno recomendado: `modo: "todas"` **ou** `codempSelecionado: number`.
- Ao buscar KPIs:
  - se `todas`: omitir `empresa` **ou** `empresa=todas`.
  - se uma empresa: `empresa=<CODEMP>`.

**Encoding:** sempre `encodeURIComponent` ao montar query string dinamicamente.

**Erro 400:** se string inválida, backend retorna `ZodError` flattened — o cliente deve ler `details` opcionalmente e mostrar mensagem genérica («Parâmetro inválido»).

---

## 3.1. Parâmetro `vendedor` — semântica e exemplos de URL

Definido em `backend/src/utils/vendedor.ts` e aplicado nos endpoints listados na §2.3 e §2.4.

| Valor `vendedor` (query string) | Significado |
|---------------------------------|-------------|
| omitido ou `todos` | Sem filtro por vendedor (todos os vendedores agregados). |
| inteiro não-negativo (`7`) | Um vendedor (lembrar que `0` = `<SEM VENDEDOR>` é valor legítimo). |
| vários IDs (`7,8,9,10`) | Lista (OR no SQL). Útil para agrupar canais (ex.: todos os e-commerces). |

**Construção sugerida no front:**

- Espelhar o padrão de `empresaSelecao.ts` num novo `lib/vendedorSelecao.ts`: `VendedorSeleção`, `vendedorKey`, `vendedorQueryValue`.
- Estado: `{ modo: "todos" } | { modo: "lista"; ids: number[] }`.
- Ao buscar KPIs:
  - `todos` → omitir `vendedor` **ou** `vendedor=todos`.
  - `[7]` → `vendedor=7`.
  - `[7,8,9,10]` (todos os e-commerces) → `vendedor=7,8,9,10`.

**Ortogonalidade com `empresa`:** os dois filtros se combinam com `AND` no SQL.
- `?empresa=6&vendedor=7` → faturamento do `ECOMMERCE ROBO` **na** MK E-COMMERCE.
- `?empresa=todas&vendedor=13` → faturamento da `CAMILA MAKER` em **todas** as empresas (resposta retorna os agregados consolidados; para ver a distribuição **por empresa**, usar §2.4 com o mesmo `vendedor`).

**Erro 400:** mesma semântica de §3 — `ZodError` com mensagem do `parseVendedor`.

---

## 4. Contrato não-JSON (CORS)

- Backend já usa **`cors`** com `origin: config.CORS_ORIGINS`.
- Variável **`CORS_ORIGINS`** pode ser lista separada por vírgulas (trim em cada entrada).
- **Desenvolvimento local:** garantir `.env` do backend incluindo a origem exata onde o Vite sobe (`http://localhost:5173` por padrão). Se porta mudar (`5174`), atualizar `.env`.

**Credenciais:** `credentials: true` no servidor. No `fetch`, se usar cookies no futuro, precisará `credentials: 'include'`. Para esta API (somente JWT Sankhya no servidor, sem cookie de sessão no browser), **`credentials: 'omit'`** ou default costuma bastar — validar antes de ligar cookies.

---

## 5. Configuração de ambiente — frontend

### 5.1. Variável

| Nome sugerido | Exemplo |
|-----------------|---------|
| `VITE_API_URL` | `http://localhost:3000` |

**Implementação obrigatória:** leitura com fallback **explícito** —
nunca cair em string vazia silenciosamente (o `fetch` viraria mesma
origem e bateria no servidor do Vite com 404 HTML, produzindo
`SyntaxError: Unexpected token '<'` no `JSON.parse`).

```ts
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
  if (raw) return raw;
  if (import.meta.env.DEV) return 'http://localhost:3000';
  throw new Error(
    'VITE_API_URL não definido. Defina no .env.local antes do build.',
  );
}
```

**Em `apiJson`:** se `res.headers.get('content-type')` não começar com
`application/json`, lançar `ApiError('non_json_response')` com `bodyText`
truncado em `~200` chars — pega bug de URL errada antes do `JSON.parse`
e devolve mensagem útil em vez de stack trace genérica.

### 5.2. Arquivo ignorado pelo git

- Criar `frontend/.env.local` (normalmente já coberto pelo `.gitignore`; confirmar antes de commitar segredos).
- **Conteúdo exemplo:**

```env
VITE_API_URL=http://localhost:3000
```

Documentar num comentário no README do monorepo **ou** em uma linha no final deste plano quando o projeto tiver política única para env.

---

## 6. Implementação técnica proposta — arquivos novos / alterações

### 6.1. Árvore sugerida (após fase 7a; **extendida pela 7c**)

Manter camelCase/arquivos em **inglês**, conteúdo de UI já em PT-BR.

```txt
frontend/src/
  lib/
    api/
      env.ts                # helper getApiBaseUrl()
      client.ts             # ApiError + apiJson<T>(pathname, { query })
      types.dashboard.ts    # DTOs §2 + financeiro (§2.5)
    empresaSelecao.ts       # EmpresaSeleção, empresaKey, empresaQueryValue — compartilhado Empresa + Financeiro
    format.ts               # formatBRLCompact, formatBRL, formatMesAnoPt
  hooks/
    api/
      useEmpresas.ts
      useFaturamentoConsolidado.ts
      useFaturamentoPorEmpresa.ts
      useFinanceiroDre.ts
      useDistribuicaoDespesas.ts
      useFluxoCaixa.ts
      useContasAbertasResumo.ts
```

Extras de ambiente já no repo: **`frontend/.env.example`** (`VITE_API_URL`).

**Alternativa compacta:** um único `dashboard.ts` sob `hooks/api/` exportando os três hooks — aceitável se o agente preferir menos arquivos.

### 6.2. `client.ts` — requisitos

- Funções puras ou módulo sem estado global pesado (facilitar testes).
- Exemplo de assinatura:

```ts
export async function apiJson<T>(
  pathname: `/api/${string}`,  // texto livre também serve
  init?: RequestInit & { query?: Record<string, string | number | undefined | null> },
): Promise<T>;
```

Comportamentos:

1. Concatenar `baseUrl + pathname + '?' + URLSearchParams` descartando chaves `undefined`/`null`.
2. **`Accept: application/json`**.
3. Se `!res.ok`: lançar `ApiError` com `status`, `bodyText` opcionalmente parseado.
4. Não usar `axios` — manter apenas `fetch` (zero deps novos).

### 6.3. TanStack Query — configurações recomendadas

- **`QueryClient`:** instanciado em `frontend/src/router.tsx` com **`ApiError`**-aware **`retry`** (não repetir em 4xx) e **`refetchOnWindowFocus: false`**.
- Props mínimas:
  - `defaultOptions.queries`:
    - `staleTime`: `30_000` (30 s) até alinhar política ao sync do backend (~5 min); pode subir para `60_000` após UX review.
    - `retry`: **condicional por status** — não retentar 4xx (não vai
      melhorar), retentar uma vez para 5xx/erro de rede:
      ```ts
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      }
      ```
    - `refetchOnWindowFocus`: configurado **`false`** no projeto atual para dashboard menos ruidoso.
    - ~~`placeholderData: keepPreviousData` no `useFaturamentoConsolidado`~~ — **removido** por decisão UX (evitar exibir KPIs da empresa anterior ao mudar seleção até o fetch da nova empresa retornar).

**Query keys obrigatórias (lista):** prefixos distintos pra
`invalidateQueries` nunca pegar ambos por engano.

```ts
['empresas']
['faturamentoConsolidado', { empresaKey: string }]  // empresaKey = 'todas' | String(codemp)
['faturamentoPorEmpresa']                            // sempre UMA entrada de cache, independente da UI
```

**Invalidação em retry/refresh manual:**

```ts
// erro no card consolidado (depende da empresa selecionada):
queryClient.invalidateQueries({ queryKey: ['faturamentoConsolidado'] });

// erro no gráfico de pizza/barras (sem dependência de empresa):
queryClient.invalidateQueries({ queryKey: ['faturamentoPorEmpresa'], exact: true });
```

---

## 7. Mudanças na UI — `EmpresasDashboardSection` (~linhas 843–961 de `routes/index.tsx`; antes de `FinanceiroSection`)

### 7.1. Estado e selector

**Remover (ou abandonar uso em runtime)**:

- Arrays hardcoded `EMPRESAS`, `EMPRESA_DATA`, `EMPRESA_MIX` como fonte única da verdade.
- Opcionalmente manter apenas como tipo de exemplo comentado **não** importado na build.

**Novo fluxo:**

1. `useEmpresas()` → popular opções dinamicamente usando `NOMEFANTASIA` + valor interno `CODEMP`.
2. Estado `todas | number` onde `number` é `CODEMP` real retornado pela API (**nunca** hardcode `'MAKER MATRIZ'` como chave mágica de negócio).
3. Rótulos da UI continuam usando `NOMEFANTASIA` do servidor; breadcrumb textual pode ser derivado de `NOMEFANTASIA` ou mapa opcional apenas para casing amigável (não bloqueante).

### 7.2. Mobile `Select`

- Items: uma entrada **«Todas as Empresas»** (`value="todas"`) mais uma linha por `empresaDto`.
- **Não filtrar por `ativa` no front.** O backend já filtra por `ordem < 99`
  no `listarEmpresas` (stubs auto-criados pelo sync ficam invisíveis).
  O campo `ativa` continua no payload como metadado para uso futuro
  (relatórios de inativas, por exemplo). Renderizar tudo que vier do
  endpoint, sem condicional extra.

### 7.3. Desktop chips

Mesma lista; `key` deve ser `'todas'` ou `String(CODEMP)`.

### 7.4. KPI cards (`KpiRow`)

1. Substituir `value` pela formatação de moeda brasileira a partir dos **números** vindos da API (**não** strings como `"R$ 548k"`).
2. **`delta`/`up`/`Trending*`:** remover da renderização OU passar dados sem esses campos quando `showDelta === false`.

**Implementação recomendável:** novo componente curto `FaturamentoKpiRow({ data })` específico desta seção **ou** estender `KpiCard` com prop `delta?: ReactNode` onde `undefined` omita ícone e `%`.

**Sparklines — postergadas (ainda backlog; não fazem parte do 7c Financeiro já entregue).**

Decisão de 2026-05-14 (segunda passagem da revisão): o backend hoje
expõe apenas o agregado (`dia/semana_7d/mes_atual/ano_atual`), sem
série por bucket. O `PLAN_DATA_BASE.md` §14.1 prometia sparkline
inicialmente; permanece backlog — exige novo endpoint
`/api/dashboard/empresa/faturamento-serie?periodo=...` ou extensão do
existente).

**Nesta fase (7a/7b):**

- Tipo `Kpi` deve tornar `spark?: number[]` (opcional).
- Renderizar `<Sparkline />` apenas se `spark` vier definido.
- Para os 4 cards de faturamento real, **não passar `spark`** — UI fica
  só com valor + label, sem mini-gráfico.
- Demais seções da página (Vendas, Compras, etc., ainda mockadas) que
  passam `spark` hardcoded continuam funcionando — o componente lida
  com ambos os casos.

A navegação por período extra no endpoint empresarial (`?periodo=&data=`) também fica
em backlog até a API suportar. Por enquanto os cards mostram os 4 períodos fixos vindos do
mesmo payload de `/api/dashboard/empresa/faturamento`.

### 7.5. Formatador monetário

**Decisão (confirmada com stakeholder em 2026-05-14):** usar formato
**compacto k/M** nos cards de faturamento, alinhando com
`PLAN_DATA_BASE.md` §14.1.

```ts
// frontend/src/lib/format.ts
const compact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

export function formatBRLCompact(n: number): string {
  return compact.format(n); // ex.: "R$ 3,8 mi", "R$ 548 mil"
}
```

Para listas tabulares (onde o valor inteiro deve ser legível sem abreviar),
usar o formato completo:

```ts
const full = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

export function formatBRL(n: number): string {
  return full.format(n);
}
```

Centralizar em `lib/format.ts` para evitar drift. Tooltip do Recharts
nos gráficos (§7.6) também usa `formatBRL` no completo (mais legível
no hover do que k/M).

### 7.6. Barras (`BarChart`)

- `data`: mapeia `resp.empresas` para `{ name: NOMEFANTASIA truncada se necessário, value: percentual OU faturamento }`.
  - Tooltip pode mostrar `faturamento` formatado mesmo se barras estiverem dimensionadas pelo **valor absoluto** (Recharts permite `tooltip` formatter).
  - **Alinhamento texto/plano:** subtítulo atual diz «DISTRIBUIÇÃO ANUAL» — já bate com `periodo` do backend; atualizar apenas se texto fixo ficar inconsistente quando virar novo ano ou mostrar também `snapshot_at`.

### 7.7. Pizza / donut

- Mantém mesmo array.
- Centro do donut: substituir `100%` estático pela soma textual significativa (**exibir `total`** formatado em BRL usando `Intl`) — encaixa com realidade («participações somam até o total anual atual»).

### 7.8. Lista lateral de percentuais

- Labels e cores: usar `CODEMP` como `key`, cor derivada por hash estável OU paleta ciclica — evitar usar **índices** porque ordem já vem `ORDER BY faturamento DESC` e pode causar corrida React se keys instáveis.
- Preferência: preservar objeto `EMPRESA_COLORS` só se mapeável por CODEMP estável definido pelo negócio; senão remover mapa fixo enorme ou substituí-lo por gerador deterministico `(codemp:number) => string`.

### 7.9. Indicator «Ao vivo» + UX para snapshot vazio/desatualizado

- Badge «Ao vivo» no `TopBar` é cosmetológico até haver SSE/WebSockets.

**Regra geral para qualquer card/gráfico da seção Empresas** (vale
para cards de faturamento e para os gráficos de pizza/barras):

| Condição | Comportamento UI |
|---|---|
| `snapshot_at === null` E todos os valores 0 | Substituir números por mensagem **«Aguardando primeira sincronização»** (skeleton ou texto). Não mostrar `R$ 0,00` zerado — usuário acha que é bug. |
| `snapshot_at !== null` E idade ≤ 30 min | Render normal. Opcionalmente exibir `snapshot_at` em texto pequeno («atualizado às 14:32»). |
| `snapshot_at !== null` E idade > 30 min | Banner amarelo discreto no topo da seção: «Dados podem estar desatualizados — última sincronização: <relativa>». Não bloqueia a visualização. |

Formatador para `snapshot_at`:
```ts
new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot_at))
```

Para "idade relativa", usar `date-fns/formatDistanceToNow` com
`addSuffix: true` (já está no `package.json`).

### 7.10. Filtro de Vendedor (etapa 7d — backend pronto, frontend pendente)

**Onde:** na mesma seção «Análise por Empresa», abaixo (ou ao lado) do `EmpresaSelector` atual.

**Estado interno proposto** (espelha `EmpresaSeleção`):

```ts
// frontend/src/lib/vendedorSelecao.ts
export type VendedorSeleção =
  | { modo: "todos" }
  | { modo: "lista"; ids: number[] };

export const vendedorKey = (s: VendedorSeleção): string =>
  s.modo === "todos" ? "todos" : [...s.ids].sort((a, b) => a - b).join(",");

export const vendedorQueryValue = (s: VendedorSeleção): string | undefined =>
  s.modo === "todos" ? undefined : [...s.ids].sort((a, b) => a - b).join(",");
```

**Hooks novos:**

```ts
hooks/api/useVendedores.ts            // GET /api/vendedores  (cache longo)
// faturamentoConsolidado e faturamentoPorEmpresa passam a aceitar vendedor:
useFaturamentoConsolidado({ empresa, vendedor })
useFaturamentoPorEmpresa({ vendedor })
```

**Atualização nas query keys:** `['faturamento', { empresaKey, vendedorKey }]` e `['faturamentoPorEmpresa', { vendedorKey }]` (ver §2.5.2).

**Componente `VendedorSelector`:**

- **Mobile:** `Select` (shadcn) com **«Todos os vendedores»** + uma linha por `VendedorDto` (apelido).
- **Desktop:** combobox (`cmdk`) com busca por texto (lista pode chegar a ~40 vendedores). Não usar chips horizontais como o `EmpresaSelector` desktop — fica longo demais.
- Mostrar **apenas vendedores ativos** por default (`ativo === 1`). Toggle «mostrar inativos» se necessário (UX backlog).
- Agrupar visualmente por prefixo de apelido pode ajudar (`ECOMMERCE *`, `CAMILA *`) — mas é decoração, não bloqueante.

**UX da combinação Empresa + Vendedor:**

- Os dois selects são **independentes**. O usuário pode escolher qualquer combinação.
- KPIs (`useFaturamentoConsolidado`) recebem `empresa` **e** `vendedor`.
- Gráfico de pizza/barras (`useFaturamentoPorEmpresa`) recebe **só** `vendedor` (empresa não filtra aqui — ver §2.4).
- Breadcrumb deve refletir os dois: `Maker > MK > E-commerce · Vendedor: ECOMMERCE ROBO`.

**Casos de uso comuns na UI:**

| Cenário | empresa | vendedor | Resposta esperada |
|---|---|---|---|
| Visão geral | `todas` | `todos` | Faturamento global da Maker |
| Uma filial | `6` | `todos` | Tudo que MK E-COMMERCE faturou (qualquer vendedor) |
| Canal e-commerce real | `todas` | `7,8,9,10` | Soma dos ECOMMERCE * em todas as empresas |
| Vendedora específica | `todas` | `13` | Faturamento de CAMILA MAKER em todas as empresas |
| Vendedora numa filial | `6` | `13` | CAMILA MAKER vendeu quanto na MK E-COMMERCE |

**Critério de aceite extra (somar à §14):**

- [ ] Selector de vendedor presente e funcional.
- [ ] Trocar vendedor invalida só queries dependentes (`faturamentoConsolidado`, `faturamentoPorEmpresa`); cadastros (empresas/vendedores) ficam no cache.
- [ ] Lista de vendedores ordenada pelo backend (não reordenar no front).
- [ ] Estado «todos» não emite o parâmetro `vendedor` na URL (consistente com como `empresa=todas` é tratado).

---

## 8. SSR / TanStack Start e `fetch` — regras desta fase

O frontend roda no Cloudflare Workers (preset `@lovable.dev/vite-tanstack-config`
+ `wrangler.jsonc` + `src/server.ts` com assinatura
`fetch(request, env, ctx)`). Workers **não conseguem** acessar
`localhost:3000` em dev, e em prod chamariam o backend via host
externo — comportamento diferente do client.

**Regra obrigatória nesta fase (7a–7c):**

1. **Todos** os hooks de API (`useEmpresas`, `useFaturamentoConsolidado`,
   `useFaturamentoPorEmpresa`, `useFinanceiroDre`, `useDistribuicaoDespesas`,
   `useFluxoCaixa`, `useContasAbertasResumo` e outros em `hooks/api/`)
   rodam **apenas no client**.
2. **Não usar** `loader` nem `beforeLoad` nas rotas TanStack Router
   para essas consultas. Render inicial mostra skeleton/estado de
   loading; dados chegam após hidratação no client.
3. Se a rota raiz tiver SSR habilitado, deixar — só não chamar API
   dentro do ciclo SSR.

**Fase futura — SSR prefetch (não confundir com 7c Financeiro já feito):**

- Introduzir env separada `VITE_API_URL_INTERNAL` que aponta para o
  host interno do backend (acessível pelo Worker, ex.: via Cloudflare
  Tunnel).
- Usar `createServerFn` ou loader com `QueryClient.prefetchQuery`
  selecionando a env conforme `import.meta.env.SSR`.
- Manter o fallback client-only caso a env interna não esteja definida.

---

## 9. Tratamento de erros UX

 Estados mínimos:

| Estado | Comportamento |
|--------|----------------|
| Loading | Skeleton / placeholders nas seções **Empresas** e **Financeiro** (mantém sidebar). |
| Erro rede / 500 | Faixa vermelha + «Tentar novamente»; **Financeiro** invalida todas as query keys dessa área (§2.5.1); **Empresas** granular. |
| 400 validation | Logs em dev (`console.warn` com corpo truncado); mensagem usuário neutra «Requisição inválida». |
| Lista vazia de empresas | Alerta configuracional «Nenhuma empresa carregada; verifique sincronização do backend». |

**Nunca** falhar silentamente deixando layout com zeros sem explicar se foi erro ou dado zerado sem sync.

---

## 10. Ordem executável para o segundo agente (checklist numerada)

### Fase pré-código / ambiente

> **Gerenciador de pacotes:** o monorepo padronizou em **npm** (em ambos
> `backend/` e `frontend/`). Não usar Bun, pnpm ou yarn — `package-lock.json`
> é a única fonte de verdade. Se aparecer `bun.lock` ou `pnpm-lock.yaml` no
> diretório, apagar antes de rodar `npm install`.

1. Backend rodando (`cd backend && npm install && npm run dev`) na porta esperada (**default 3000**).
2. Frontend com dependências instaladas (`cd frontend && npm install`).
3. Garantir `CORS_ORIGINS` inclua `http://localhost:5173` (ou porta real do Vite).
4. Smoke: `curl http://localhost:3000/api/health` deve retornar JSON `status: ok`.
5. Smoke: `curl http://localhost:3000/api/empresas` deve retornar `{ empresas: [...] }` com ≥1 item após migrações e seed/sync.

### Código infra (7a)

6. Adicionar `VITE_API_URL` em `.env.local` do frontend **não** commitado por engano se contiver infra interna futura — hoje apenas localhost ok.
7. Implementar `getApiBaseUrl()` + `apiJson()` em `frontend/src/lib/api/`.
8. Copiar/definir DTO TS em `types.dashboard.ts` espelhando §2 deste doc.
9. Criar `useEmpresas`, `useFaturamentoConsolidado`, `useFaturamentoPorEmpresa`.
10. (Opcional) Ajustar `QueryClient` default options em `router.tsx` onde instanciado atualmente OU extrair singleton.

### Código UI (7b)

11. Refatorar `EmpresasDashboardSection` para consumir os hooks ao invés de `EMPRESA_*` estáticos.
12. Omitir deltas/spark quando não há dado compatível conforme decisão de produto.
13. Harmonizar donut central com total real (`total` campo API).
14. Atualizar chaves/colors dos gráficos para não depender apenas de strings fixas pré-definidas.
15. Lint: `npm run lint` dentro de `frontend/`.
16. Typecheck já coberto pela build do Vite; opcional rodar compiler isolado conforme projeto.

### Validação manual

17. Fluxo usuário típico: abrir página → entrar pela `LoginGate` existente (`LoginGate.tsx` não mexe neste plano, exceto se exigência de segurança evoluir separadamente) → navegar sidebar «Empresas».
18. Trocar empresa consecutivamente; observar apenas KPIs mudando; distribuições estáticas.
19. Backend desligado: UI deve erro graciosa.
20. Zerar dados (DB vazio sintético) — números 0 aceitável com texto de staleness/sync.

### Financeiro — validação extra (nova)

21. Sidebar **Financeiro**: alternar `Mês atual`/`Ano atual` observando mudanças em KPIs e distribuição.
22. Trocar janela fluxo (**3 … 18 meses**); ver série alinhada a `DHBAIXA`.
23. Trocar empresa: todos os widgets financeiros devem refletir o filtro (`empresa` na query).

---

## 11. Backlog após integração inicial

| ID | Escopo tentativo | Dependências / notas |
|----|-------------------|-----------------------|
| ~~7c Financeiro~~ | ~~Ligar KPIs/gráficos reais ao cluster `/api/dashboard/financeiro/*`~~ | Feito conforme §1.4. Pendências: série DRE mensal opcional (`/financeiro/dre série` novo), lista paginada de contas na UI. |
| 7d | Migrar deltas reais ou omitir também em outras seções | Contrato período anterior. |
| 7e | Dividir arquivo gigante `index.tsx` por rota/feature | Cleanup arquitetural. |
| 7f | Auth real SSO / JWT público ao front | Substituir `LoginGate`. |

---

## 12. Riscos para o revisor destacar conscientemente

1. **`index.tsx` gigante (>1500 linhas):** aumenta chance de conflitos de merge; refactor incremental apenas após primeira integração verde.

2. **Duplicação naming `Empresa`** em TS já pode existir; renomeie import local para `EmpresaDashboardDto`, etc., para não colidir com tipos Router.

3. **Datas locais SQLite `date('now')` vs TZ do servidor Node:** servidor Windows pode estar em UTC local misto — pequenas diferenças de «dia» próximo à meia-noite; problema baixo MVP.

4. **Percentuais com arredondamento:** donut legendas devem usar valor server `percentual` sem recalcular no front quando possível (evitar drift).

---

## 13. Sugestões de commits atômicos (para reviewer de git friendly)

Recomenda-se granularidade:

1. `feat(frontend/api): client + dashboard DTO/types`
2. `feat(frontend/hooks): react-query empresa faturamento`
3. `feat(frontend/ui): integrate Empresa section`
4. `feat(frontend/ui): integrate Financeiro (7c)`
5. `refactor(frontend/lib): empresaSelecao + formatMesAnoPt`

Se agente automatizado não usar git granular, garantir pelo menos bullets na descrição de PR mencionando arquivos chave tocados.

---

## 14. Critérios de aceite — fase **7a+7b** (Empresa)

Marcar quando validado em ambiente local / CI:

- [x] Nenhuma string KPI de valor monetário fictício permanece na seção Empresas em runtime (exceto mocks de **outras** seções na mesma página).
- [x] Parâmetro `empresa` respeita `todas`/CODEMP.
- [x] Gráficos sempre consomem `faturamento-por-empresa` íntegra.
- [x] Sem badges Δ percentual visíveis nessa seção.
- [x] Sem sparkline na seção Empresas (still backlog — §7.4 vs endpoint de série).
- [x] Valores monetários no formato compacto k/M nos KPIs empresa (§7.5); tooltips gráficos com `formatBRL`.
- [x] Estado «Aguardando sync» quando `snapshot_at === null` e agregados zero (aprox §7.9 para **pedidos**).
- [x] Erro tratado quando API indisponível (faixas + retry).
- [x] Build `npm run build` do frontend passando (**validado uma vez durante implementação**).
- [ ] `npm run lint` em **todo** o `frontend/` — o repo ainda emite warnings de `react-refresh/only-export-components` em alguns artefactos **shadcn**; comando focado nos ficheiros de integração passa (`exit 0` com `--max-warnings 0` em paths cirúrgicos). Remediar projeto-inteiro fica backlog.
- [ ] `.env.local` mencionando `VITE_API_URL` no **README** do monorepo (opcional até disciplina única definida); existe **`frontend/.env.example`**.

---

## 15. Critérios de aceite — fase **7c** (Financeiro)

- [x] Mock `DATA.financeiro` removido (`index.tsx`).
- [x] Quatro KPIs ligados (receita, despesas, resultado + margem, contas em aberto) sem Δ falsos.
- [x] DRE/gráficos respeitam `periodo=mes|ano`; fluxo mensal usa `fluxo-caixa`; distribuição de despesas do endpoint próprio.
- [x] Filtro `empresa` em todas as rotas §2.5 utilizadas.
- [x] Snapshots **`titulos`** refletidos em UI (banner se >30 min onde aplicável — implementação paralela ao padrão pedidos onde possível).
- [ ] Série temporal DRE («últimos N meses» estilo UX antigo) — **bloqueado** até backend novo.
- [ ] Tabela UX de lista de `/financeiro/contas` paginável — backlog.

---

**Fim do plano (atualizado 2026-05-14).**

Alterações estruturais a este arquivo devem ser discutidas com o stakeholder porque impactam paralelização de outros agentes.
