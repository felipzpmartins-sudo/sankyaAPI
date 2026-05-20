# ROTAS — Backend Dashboard Sankhya

Catálogo completo das rotas REST expostas pelo backend Node em
`backend/src/routes/`. Documento gerado a partir do código atual
(2026-05-15) — fonte de verdade: arquivos `routes/index.ts` e
`routes/dashboard.ts`.

> Todas as rotas estão sob o prefixo **`/api`** (registrado em
> `backend/src/server.ts`). Não há rotas sem prefixo.

## Sumário

| Categoria | Rotas |
|---|---|
| [Health](#1-health) | `GET /api/health` |
| [Cadastros](#2-cadastros) | `GET /api/empresas` · `GET /api/vendedores` |
| [Dashboard — Empresas](#3-dashboard--empresas) | `GET /api/dashboard/empresa/faturamento` · `…/faturamento-por-empresa` · `…/comodato` |
| [Dashboard — Financeiro](#4-dashboard--financeiro) | `GET /api/dashboard/financeiro/dre` · `…/fluxo-caixa` · `…/distribuicao-despesas` · `…/contas` |
| [Legados (compat)](#5-legados-compat) | `GET /api/receber` · `GET /api/pagar` |

**Total:** 11 rotas (todas GET, lê do snapshot SQLite — sem efeito colateral).

---

## Convenções gerais

### Autenticação

O frontend chama o backend sem token (CORS por origem). O backend autentica
**ele mesmo** na Sankhya via OAuth 2.0 Client Credentials (renovação automática).
Nenhuma rota desta API exige `Authorization: Bearer ...` do cliente — ainda.

> Auth real do dashboard → backlog (`PLAN_INTEGRATION_FRONTEND.md` etapa 7f).

### Parâmetro `empresa`

Aceito em quase todos os endpoints. Definido em
`backend/src/utils/empresa.ts`.

| Valor da query | Significado |
|---|---|
| omitido ou `todas` | Todas as empresas elegíveis (sem filtro) |
| inteiro positivo (`1`) | Uma empresa só |
| lista com vírgula (`1,2,5`) | `CODEMP IN (...)` no SQL |

### Parâmetro `vendedor`

Aplicado nos endpoints da seção Empresas (§3). Definido em
`backend/src/utils/vendedor.ts`.

| Valor da query | Significado |
|---|---|
| omitido ou `todos` | Sem filtro por vendedor |
| inteiro não-negativo (`7`) | Um vendedor (lembrar: `0` = `<SEM VENDEDOR>`) |
| lista com vírgula (`7,8,9,10`) | `CODVEND IN (...)` |

### Formato de resposta

- `Content-Type: application/json; charset=utf-8`
- Valores monetários em **`number`** (float JS, 2 casas decimais arredondadas).
- Datas em **ISO `YYYY-MM-DD`** quando isoladas; `snapshot_at` é ISO completo (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- Campo `filtro` é descritivo (não é pra parse), usado pra debug.

### Status codes

| Status | Significado |
|---|---|
| `200` | OK — sempre que retorna JSON de domínio |
| `400` | Query params inválidos (ZodError) — body: `{ error: "validation_error", details }` |
| `500` | Erro interno (snapshot corrompido, etc.) — body: `{ error: "internal_error", message }` |
| `502` | Erro da Sankhya (raramente — só nos legados §5 que ainda leem direto) — body: `{ error: "sankhya_error", message }` |

### Frescor dos dados (`snapshot_at`)

Quase todas as respostas trazem `snapshot_at: string | null`, indicando o
último sync da entidade-fonte (`pedidos` ou `titulos`). Use isso pra mostrar
ao usuário "dados atualizados em ..." e/ou banner de "dados desatualizados"
quando passar de 30 min.

---

## 1. Health

### `GET /api/health`

Smoke test rápido. Não toca em banco nem em Sankhya.

**Query params:** nenhum.

**Response 200:**
```json
{
  "status": "ok",
  "time": "2026-05-15T18:33:12.899Z"
}
```

**Definido em:** `backend/src/routes/index.ts:9`

---

## 2. Cadastros

### `GET /api/empresas`

Lista as empresas visíveis (seed estático + stubs com `ordem < 99`).

**Query params:** nenhum.

**Response 200:**
```json
{
  "empresas": [
    { "CODEMP": 1,  "NOMEFANTASIA": "MAKER MATRIZ",            "ordem": 1, "ativa": 1 },
    { "CODEMP": 2,  "NOMEFANTASIA": "MY ROBOT FRANQUEADORA",   "ordem": 2, "ativa": 1 },
    { "CODEMP": 5,  "NOMEFANTASIA": "MK CENTRO",               "ordem": 3, "ativa": 1 },
    { "CODEMP": 6,  "NOMEFANTASIA": "MK E-COMMERCE",           "ordem": 4, "ativa": 1 },
    { "CODEMP": 8,  "NOMEFANTASIA": "MAKER FILIAL",            "ordem": 5, "ativa": 1 },
    { "CODEMP": 11, "NOMEFANTASIA": "MAKER ATACADISTA",        "ordem": 6, "ativa": 1 },
    { "CODEMP": 12, "NOMEFANTASIA": "MAKER VAREJISTA",         "ordem": 7, "ativa": 1 }
  ]
}
```

**Observações:**
- Filtra `WHERE ordem < 99` (stubs auto-criados pelo sync de pedidos têm `ordem=99` e ficam invisíveis).
- Ordenação `ORDER BY ordem, CODEMP`.

**Definido em:** `backend/src/routes/dashboard.ts:117` (`empresasRouter`)
**Service:** `services/dashboard.ts` → `listarEmpresas()`

---

### `GET /api/vendedores`

Lista os vendedores do snapshot.

**Query params:** nenhum.

**Response 200:**
```json
{
  "vendedores": [
    { "CODVEND": 0,  "APELIDO": "<SEM VENDEDOR>",  "ativo": 1 },
    { "CODVEND": 2,  "APELIDO": "CAMILA",           "ativo": 1 },
    { "CODVEND": 13, "APELIDO": "CAMILA MAKER",     "ativo": 1 },
    { "CODVEND": 7,  "APELIDO": "ECOMMERCE ROBO",   "ativo": 1 },
    { "CODVEND": 31, "APELIDO": "LAILA",            "ativo": 1 }
  ]
}
```

**Observações:**
- `CODVEND=0` (`<SEM VENDEDOR>`) é vendedor "fictício" para notas sem atribuição — valor legítimo, não null.
- Ordenação backend: `ORDER BY ativo DESC, APELIDO` (ativos primeiro, alfabético).
- Existem vendedores **por canal × empresa**: `ECOMMERCE ROBO`, `ECOMMERCE MAKER`, `ECOMMERCE MYROB`, `ECOMMERCE SMART`. Idem `CAMILA *`.

**Definido em:** `backend/src/routes/dashboard.ts:127` (`vendedoresRouter`)
**Service:** `services/dashboard.ts` → `listarVendedores()`

---

## 3. Dashboard — Empresas

Endpoints da seção "Análise por Empresa" e correlatos.

**Critério canônico de "faturamento real"** (vale para os 3 endpoints abaixo):

```
CODTIPOPER IN (FATURAMENTO_TOPS) AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL
```

Whitelist de 15 TOPs em `backend/src/services/operacoes.ts`. **Não é `TIPMOV='V'`**
(isso inflava 22% com remessas, bonificações, ajustes, comodato).

**Janela temporal:** ano civil em `ANO_EXIBICAO_FATURAMENTO = "2026"`
(hardcoded). Não mudar sem alinhar com produto.

---

### `GET /api/dashboard/empresa/faturamento`

KPIs consolidados (1 dia / 7 dias / mês atual / ano) com filtro empresa+vendedor.

**Query params:**

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `empresa` | `empresaParam` | `todas` | Ver §convenções |
| `vendedor` | `vendedorParam` | `todos` | Ver §convenções |

**Response 200:**
```json
{
  "filtro": "empresa=lista[6];vendedor=lista[7]",
  "dia": 0,
  "semana_7d": 18186.04,
  "mes_atual": 28593.34,
  "ano_atual": 228923.88,
  "snapshot_at": "2026-05-15T18:33:12.899Z"
}
```

**Semântica dos campos numéricos** (todos pré-filtrados pelo critério de faturamento real):

| Campo | Janela SQL |
|---|---|
| `dia` | `DTFATUR = date('now')` |
| `semana_7d` | `DTFATUR >= date('now', '-6 days')` (inclui hoje) |
| `mes_atual` | `strftime('%Y-%m', DTFATUR) = strftime('%Y-%m', 'now')` |
| `ano_atual` | `strftime('%Y', DTFATUR) = '2026'` |

**Exemplos:**

```bash
# Faturamento geral (todas empresas, todos vendedores)
curl "http://localhost:3000/api/dashboard/empresa/faturamento"

# Empresa específica
curl "http://localhost:3000/api/dashboard/empresa/faturamento?empresa=6"

# Vendedor específico em todas as empresas
curl "http://localhost:3000/api/dashboard/empresa/faturamento?vendedor=13"

# E-commerce real (MK E-COMMERCE só do vendedor ECOMMERCE ROBO)
curl "http://localhost:3000/api/dashboard/empresa/faturamento?empresa=6&vendedor=7"

# Combinar canais e-commerce em todas empresas
curl "http://localhost:3000/api/dashboard/empresa/faturamento?vendedor=7,8,9,10"
```

**Definido em:** `backend/src/routes/dashboard.ts:30`
**Service:** `services/dashboard.ts` → `faturamentoConsolidado()`

---

### `GET /api/dashboard/empresa/faturamento-por-empresa`

Distribuição do faturamento entre todas as empresas (gráficos de pizza/barras).

**Query params:**

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `vendedor` | `vendedorParam` | `todos` | Filtra por vendedor (útil pra "onde o vendedor X vendeu este ano") |

⚠ **`empresa` NÃO É aceito** — propositalmente. Decisão de UX: o gráfico
mostra sempre **todas** as empresas, independente da seleção dos cards.

**Response 200:**
```json
{
  "periodo": "ano:2026",
  "total": 6341655.37,
  "snapshot_at": "2026-05-15T18:33:12.899Z",
  "empresas": [
    { "CODEMP": 1,  "NOMEFANTASIA": "MAKER MATRIZ",          "faturamento": 2036641.67, "percentual": 32.12 },
    { "CODEMP": 12, "NOMEFANTASIA": "MAKER VAREJISTA",       "faturamento": 1709295.52, "percentual": 26.95 },
    { "CODEMP": 2,  "NOMEFANTASIA": "MY ROBOT FRANQUEADORA", "faturamento": 1056334.89, "percentual": 16.66 },
    { "CODEMP": 6,  "NOMEFANTASIA": "MK E-COMMERCE",         "faturamento":  514006.43, "percentual":  8.11 },
    { "CODEMP": 8,  "NOMEFANTASIA": "MAKER FILIAL",          "faturamento":  493380.63, "percentual":  7.78 },
    { "CODEMP": 5,  "NOMEFANTASIA": "MK CENTRO",             "faturamento":  390919.00, "percentual":  6.16 },
    { "CODEMP": 11, "NOMEFANTASIA": "MAKER ATACADISTA",      "faturamento":  140077.23, "percentual":  2.21 }
  ]
}
```

**Observações:**
- Ordenação: `ORDER BY faturamento DESC`.
- Empresas com `faturamento = 0` aparecem no array (LEFT JOIN). Frontend filtra se quiser esconder.
- `percentual` já vem 0–100 com 2 casas decimais. Soma pode dar 99,99 ou 100,01 por arredondamento.

**Exemplos:**

```bash
# Distribuição global
curl "http://localhost:3000/api/dashboard/empresa/faturamento-por-empresa"

# Distribuição apenas do que a CAMILA MAKER (CODVEND=13) vendeu
curl "http://localhost:3000/api/dashboard/empresa/faturamento-por-empresa?vendedor=13"
```

**Definido em:** `backend/src/routes/dashboard.ts:39`
**Service:** `services/dashboard.ts` → `faturamentoPorEmpresa()`

---

### `GET /api/dashboard/empresa/comodato`

Saídas e retornos de kits em comodato (contratos de grade curricular).

**Query params:**

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `empresa` | `empresaParam` | `todas` | Filtra por empresa |
| `vendedor` | `vendedorParam` | `todos` | Aceito pela mesma `faturamentoQuery`, mas hoje **não é aplicado dentro do service** (limitação atual — backlog) |

**TOPs envolvidos** (em `services/operacoes.ts`):
- Saída: `1109` (NFE REMESSA EM COMODATO), `1772` (COMODATO EXTERIOR)
- Retorno: `1203` (NFE RETORNO COMODATO)

**Response 200:**
```json
{
  "filtro": "todas",
  "enviado": {
    "dia": 0,
    "semana_7d": 0,
    "mes_atual": 0,
    "ano_atual": 1057003.75,
    "historico_total": 13384757.39
  },
  "retornado": {
    "dia": 0,
    "semana_7d": 0,
    "mes_atual": 0,
    "ano_atual": 81295.50,
    "historico_total": 289701.50
  },
  "saldo_ativo": 13095055.89,
  "snapshot_at": "2026-05-15T18:33:12.899Z"
}
```

**Semântica:**

| Campo | Significado |
|---|---|
| `enviado.dia/semana_7d/mes_atual/ano_atual` | Volume saído no período (kits cedidos) |
| `enviado.historico_total` | Soma de TODO o histórico do snapshot (desde 2025-01) |
| `retornado.*` | Idem, mas pra notas de retorno de comodato |
| `saldo_ativo` | `enviado.historico_total - retornado.historico_total` — estimativa de valor "no campo" (kits que saíram e ainda não voltaram) |

⚠ **Alerta de dado anômalo:** o `saldo_ativo` atual (R$ 13M) está inflado por
uma única nota suspeita (NUNOTA 104539, R$ 11.191.755,40, DTFATUR 2025-10-09).
Validar com financeiro antes de exibir ao usuário. Ver §7.5 do `STATUS_PROJECT.md`.

**Exemplos:**

```bash
# Comodato global
curl "http://localhost:3000/api/dashboard/empresa/comodato"

# Comodato só da MAKER MATRIZ (CODEMP=1, que concentra ~100% dos contratos)
curl "http://localhost:3000/api/dashboard/empresa/comodato?empresa=1"
```

**Definido em:** `backend/src/routes/dashboard.ts:48`
**Service:** `services/dashboard.ts` → `comodatoConsolidado()`

---

## 4. Dashboard — Financeiro

Endpoints baseados na entidade `Financeiro` (TGFFIN) do Sankhya, sincronizada
em `titulos`. **Regime de competência** (DTNEG) em DRE e distribuição;
**regime de caixa** (DHBAIXA) em fluxo de caixa.

---

### `GET /api/dashboard/financeiro/dre`

DRE simplificado por categoria do plano de contas (prefixo do CODNAT).

**Query params:**

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `empresa` | `empresaParam` | `todas` | — |
| `periodo` | `"mes"` \| `"ano"` | `"ano"` | `mes` = mês atual; `ano` = ano atual |

**Response 200:**
```json
{
  "filtro": "todas",
  "periodo": "ano_atual:2026",
  "receita_bruta": 8500000.00,
  "custos": 2100000.00,
  "despesas_admin": 1200000.00,
  "despesas_comerciais": 800000.00,
  "impostos": 950000.00,
  "despesas_total": 5050000.00,
  "resultado_operacional": 3450000.00,
  "margem_pct": 40.59,
  "snapshot_at": "2026-05-15T18:33:12.899Z"
}
```

**Regras:**
- Receitas: `RECDESP = 1 AND CODNAT LIKE '1%'`
- Custos: `RECDESP = -1 AND CODNAT LIKE '2%'`
- Despesas admin / comerciais / impostos: prefixos `3` / `4` / `5`
- Sempre `PROVISAO = 'N'` (exclui provisões)
- `resultado_operacional = receita_bruta - despesas_total` (EBIT simplificado, antes de investimentos e dividendos)
- `margem_pct = (resultado_operacional / receita_bruta) * 100`

**Categorias de natureza:**

| Prefixo | Categoria |
|---|---|
| `1` | Receitas |
| `2` | Custos / Estoques |
| `3` | Despesas Administrativas |
| `4` | Despesas Comerciais |
| `5` | Impostos / Tributos |
| `6` | Investimentos (CAPEX) — **não entra** no despesas_total |
| `7` | Dividendos — **não entra** |
| `8` | Serviços — **não entra** |

**Exemplos:**

```bash
# DRE do ano atual, todas as empresas
curl "http://localhost:3000/api/dashboard/financeiro/dre"

# DRE do mês atual, MAKER MATRIZ
curl "http://localhost:3000/api/dashboard/financeiro/dre?empresa=1&periodo=mes"
```

**Definido em:** `backend/src/routes/dashboard.ts:62`
**Service:** `services/dashboard-financeiro.ts` → `dre()`

---

### `GET /api/dashboard/financeiro/fluxo-caixa`

Série mensal de entradas, saídas e saldo de caixa (regime de caixa via `DHBAIXA`).

**Query params:**

| Nome | Tipo | Default | Faixa | Descrição |
|---|---|---|---|---|
| `empresa` | `empresaParam` | `todas` | — | — |
| `meses` | `number` | `12` | 1 a 36 | Janela retroativa (inclui mês atual) |

**Response 200:**
```json
{
  "filtro": "todas",
  "meses": 6,
  "snapshot_at": "2026-05-15T18:33:12.899Z",
  "serie": [
    { "mes": "2025-12", "entradas": 1200000.00, "saidas":  900000.00, "saldo":  300000.00 },
    { "mes": "2026-01", "entradas": 1350000.00, "saidas":  920000.00, "saldo":  430000.00 },
    { "mes": "2026-02", "entradas": 1100000.00, "saidas":  870000.00, "saldo":  230000.00 },
    { "mes": "2026-03", "entradas":  980000.00, "saidas":  950000.00, "saldo":   30000.00 },
    { "mes": "2026-04", "entradas": 1420000.00, "saidas":  890000.00, "saldo":  530000.00 },
    { "mes": "2026-05", "entradas":  600000.00, "saidas":  400000.00, "saldo":  200000.00 }
  ]
}
```

**Observações:**
- Buckets mensais por `strftime('%Y-%m', DHBAIXA)`.
- `entradas`: soma de `VLRBAIXA` quando `RECDESP = 1`.
- `saidas`: soma de `VLRBAIXA` quando `RECDESP = -1`.
- `saldo = entradas - saidas` (líquido do mês, não cumulativo).
- ⚠ `DHBAIXA` pode ser data **prevista** de baixa (não efetiva). Pra "caixa realizado" 100% confiável, talvez seja melhor `DHCONCIL`. Tópico em aberto (§7.6 do `STATUS_PROJECT.md`).

**Exemplos:**

```bash
# Últimos 12 meses, todas empresas
curl "http://localhost:3000/api/dashboard/financeiro/fluxo-caixa"

# Últimos 6 meses, MAKER MATRIZ
curl "http://localhost:3000/api/dashboard/financeiro/fluxo-caixa?empresa=1&meses=6"
```

**Definido em:** `backend/src/routes/dashboard.ts:76`
**Service:** `services/dashboard-financeiro.ts` → `fluxoCaixa()`

---

### `GET /api/dashboard/financeiro/distribuicao-despesas`

Quebra das despesas operacionais por categoria (prefixos 2-5 do CODNAT).

**Query params:**

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `empresa` | `empresaParam` | `todas` | — |
| `periodo` | `"mes"` \| `"ano"` | `"ano"` | — |

**Response 200:**
```json
{
  "filtro": "todas",
  "periodo": "ano_atual:2026",
  "total": 5050000.00,
  "snapshot_at": "2026-05-15T18:33:12.899Z",
  "categorias": [
    { "categoria": "Custos / Estoques",          "valor": 2100000.00, "percentual": 41.58 },
    { "categoria": "Despesas Administrativas",   "valor": 1200000.00, "percentual": 23.76 },
    { "categoria": "Impostos / Tributos",        "valor":  950000.00, "percentual": 18.81 },
    { "categoria": "Despesas Comerciais",        "valor":  800000.00, "percentual": 15.84 }
  ]
}
```

**Observações:**
- Filtros: `RECDESP = -1 AND PROVISAO = 'N' AND prefixo CODNAT IN ('2','3','4','5')`.
- Ordenação: `ORDER BY valor DESC`.
- `percentual` somando 100 (sujeito a 0.01 de drift por arredondamento).

**Exemplos:**

```bash
# Distribuição ano atual, global
curl "http://localhost:3000/api/dashboard/financeiro/distribuicao-despesas"

# Distribuição mês atual, MAKER FILIAL
curl "http://localhost:3000/api/dashboard/financeiro/distribuicao-despesas?empresa=8&periodo=mes"
```

**Definido em:** `backend/src/routes/dashboard.ts:85`
**Service:** `services/dashboard-financeiro.ts` → `distribuicaoDespesas()`

---

### `GET /api/dashboard/financeiro/contas`

Listagem paginada de contas em aberto (a receber ou a pagar). Suporta KPI
de "valor total em aberto" via `pageSize=1`.

**Query params:**

| Nome | Tipo | Default | Faixa | Descrição |
|---|---|---|---|---|
| `empresa` | `empresaParam` | `todas` | — | — |
| `tipo` | `"receber"` \| `"pagar"` | — | obrigatório | — |
| `page` | `number` | `0` | ≥ 0 | Página (zero-indexed) |
| `pageSize` | `number` | `50` | 1 a 200 | Limite de registros |

**Response 200:**
```json
{
  "filtro": "todas",
  "tipo": "receber",
  "page": 0,
  "pageSize": 50,
  "total": 489,
  "valor_total_aberto": 4175929.12,
  "snapshot_at": "2026-05-15T18:33:12.899Z",
  "titulos": [
    {
      "NUFIN": 111432,
      "CODEMP": 1,
      "CODPARC": 4882,
      "NOMEPARC": "CURSO E COLÉGIO LEFFLER",
      "CODTIPTIT": 4,
      "DESCRTIPTIT": "BOLETO",
      "CODNAT": 1011600,
      "DESCRNAT": "GRADE CURRICULAR",
      "DTNEG": "2025-02-05",
      "DTVENC": "2026-02-09",
      "VLRDESDOB": 1990.00,
      "VLRBAIXA": 0.00,
      "valor_aberto": 1990.00
    }
  ]
}
```

**Semântica:**

| Campo | Significado |
|---|---|
| `total` | Quantidade total de títulos em aberto que casam o filtro |
| `valor_total_aberto` | Soma de `valor_aberto` de TODOS os títulos (não só os da página) |
| `titulos[]` | Apenas os registros da página atual |

**Filtros aplicados internamente:**
- `is_em_aberto = 1` (DHBAIXA NULL)
- `tipo = ?` (receber → `RECDESP = 1` no sync; pagar → `RECDESP = -1`)

**Exemplos:**

```bash
# Primeira página de contas a receber, todas empresas
curl "http://localhost:3000/api/dashboard/financeiro/contas?tipo=receber"

# KPI: total a receber em aberto (não retorna lista, só o agregado)
curl "http://localhost:3000/api/dashboard/financeiro/contas?tipo=receber&pageSize=1"

# Contas a pagar da MAKER MATRIZ, página 2
curl "http://localhost:3000/api/dashboard/financeiro/contas?tipo=pagar&empresa=1&page=2&pageSize=20"
```

**Definido em:** `backend/src/routes/dashboard.ts:101`
**Service:** `services/dashboard-financeiro.ts` → `listarContasAbertas()`

---

## 5. Legados (compat)

Endpoints anteriores à fase de snapshot. Hoje **leem do SQLite** (foram
migrados), mas mantêm a forma de URL antiga pra compatibilidade.

**Recomendado:** novos usos devem ir pra `/api/dashboard/financeiro/contas`
(§4), que é mais flexível.

---

### `GET /api/receber`

Atalho de `/api/dashboard/financeiro/contas?tipo=receber`.

**Query params:**

| Nome | Tipo | Default |
|---|---|---|
| `empresa` | `empresaParam` | `todas` |
| `page` | `number` | `0` |
| `pageSize` | `number` (1–200) | `50` |

**Response 200:** mesmo shape de §4 → `/financeiro/contas` (com `tipo: "receber"`).

**Definido em:** `backend/src/routes/index.ts:28`
**Service:** `services/dashboard-financeiro.ts` → `listarContasAbertas({ tipo: "receber" })`

---

### `GET /api/pagar`

Atalho de `/api/dashboard/financeiro/contas?tipo=pagar`.

**Query params:** idênticos ao `/api/receber`.

**Response 200:** mesmo shape de §4 → `/financeiro/contas` (com `tipo: "pagar"`).

**Definido em:** `backend/src/routes/index.ts:44`
**Service:** `services/dashboard-financeiro.ts` → `listarContasAbertas({ tipo: "pagar" })`

---

## Erros — formato padrão

### 400 — Validação Zod

```json
{
  "error": "validation_error",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "vendedor": ["vendedor: use 'todos', um inteiro (ex.: 7) ou lista separada por vírgula (ex.: 7,13)"]
    }
  }
}
```

### 500 — Erro interno

```json
{
  "error": "internal_error",
  "message": "Sintaxe inválida no SQL ..."
}
```

### 502 — Erro repassado da Sankhya (raro hoje)

```json
{
  "error": "sankhya_error",
  "message": "Sankhya 401: ..."
}
```

Middleware global em `backend/src/server.ts:40-63`.

---

## Endpoints planejados (ainda não existem)

Lista do que está nos planos mas **não tem rota implementada hoje**:

| Endpoint provável | Para que | Origem |
|---|---|---|
| `GET /api/dashboard/empresa/faturamento-serie?meses=N` | Sparklines + DRE série temporal | `PLAN_INTEGRATION_FRONTEND.md` §7.4 backlog |
| `GET /api/dashboard/pedidos?empresa&vendedor&page` | Drill-down de notas | `STATUS_PROJECT.md` §9 M1 |
| `GET /api/dashboard/top-clientes?empresa&periodo&limite` | Top compradores | `PLAN.md` §6 + depende de sync de Parceiros |
| `GET /api/dashboard/top-fornecedores?…` | Idem do lado de compras | — |
| `GET /api/dashboard/aging-receber?empresa` | Buckets 0-30, 31-60, 61-90, >90 | `PLAN.md` §6 |
| `POST /api/admin/refresh?entity=pedidos` | Forçar sync sob demanda | `STATUS_PROJECT.md` §12 observação 7 |
| `GET /api/parceiros` / `GET /api/produtos` | Pré-requisito de top-clientes e produtos | `STATUS_PROJECT.md` §5.1 pendentes |
| `GET /api/vendas` / `GET /api/compras` (alto nível) | Seções da sidebar ainda mockadas | `PLAN.md` §7 Fase 2 |

---

## Como manter este documento

- Toda nova rota adicionada em `backend/src/routes/*.ts` **deve aparecer aqui** antes do PR ser mergeado.
- Mudou query param ou shape de resposta → atualizar a seção correspondente.
- Em caso de divergência entre código e doc, **o código ganha** (e este doc deve ser corrigido).
- Mudanças com impacto cross-cutting (auth, paginação, formato de erro) → também atualizar `STATUS_PROJECT.md` §5.4.
