# Modelagem do Banco de Dados — Dashboard Sankhya

> Documento de referência para a criação e manutenção do banco SQLite que
> serve como **snapshot** dos dados do ERP Sankhya. Complementa `PLAN.md`
> seção "Fase 4 — SQLite snapshot" com o **como** (esquema, índices,
> estratégia de sync, concorrência, bootstrap).
>
> Atualize este documento quando: adicionar entidades novas, mudar índices,
> mudar a estratégia de sincronização, ou quando o consultor Sankhya
> responder sobre `DHCONCIL`/`DTCONTAB` (afeta `titulos`).

## 1. Objetivo do banco

O SQLite **não é a fonte da verdade** — o Sankhya é. O banco existe para
três coisas:

1. **Resiliência:** quando o Sankhya está fora (manutenção programada,
   falha de rede, expiração de credencial), a dashboard continua
   respondendo com `stale: true` em vez de quebrar.
2. **Performance:** agregações pesadas (`top-clientes`, `aging-receber`,
   `faturamento-diario`) rodam em SQL local com índices, em vez de iterar
   arrays JS em cima da resposta do Sankhya.
3. **Custo do gateway:** Sankhya tem rate limit. Sem cache local, cada
   refresh da dashboard (5 cards × N usuários) bate direto na API.

O banco **não armazena histórico de mudanças** no MVP — só o último
estado conhecido. Histórico de KPIs (séries temporais para "vendas mês a
mês nos últimos 24 meses") vai entrar em tabela separada quando a dash
tiver essa necessidade explícita (ver seção 11).

## 2. Decisões técnicas (com motivo)

| Decisão | Escolha | Motivo |
|---|---|---|
| Engine | **SQLite** | Volume pequeno (Grupo Maker, 7 empresas), sem servidor de banco, file-based. Ver `PLAN.md` seção 8. |
| Lib | **`better-sqlite3`** (`^11.x`) | Síncrono → API simples no Node, sem callback hell. Tipagem forte. Maduro. `node:sqlite` (nativo Node 22.5+) ainda é experimental e tem API menos rica — **avaliar troca em 2027** quando estabilizar. |
| Modo | **WAL** (`PRAGMA journal_mode=WAL`) | Permite **leituras concorrentes** durante a escrita do job de snapshot. Sem isso, o servidor HTTP bloqueia toda vez que o job roda. |
| Sincronização | `PRAGMA synchronous=NORMAL` | Em WAL, `NORMAL` dá durabilidade suficiente para um snapshot (perda do último flush = re-sync). `FULL` é caro e desnecessário. |
| Foreign keys | **ON** (`PRAGMA foreign_keys=ON`) | SQLite vem com FK **off por padrão**. Sempre ligar no boot. |
| Criação do schema | `CREATE TABLE IF NOT EXISTS` no boot | Sem framework de migration por enquanto. Versão controlada em `metadata.schema_version`. Quando passar de 2-3 mudanças incompatíveis, considerar `drizzle-kit`. |
| Caminho do arquivo | `backend/data/snapshot.db`, configurável via env `DATABASE_PATH` | Pasta `data/` no `.gitignore`. Em produção, montar volume persistente. |
| Tipos numéricos | **REAL** para valores monetários | SQLite não tem `DECIMAL` nativo. Para até centavos em valores ≤ R$ 10M, `REAL` (double-precision) é exato. Acima disso, usar `INTEGER` em centavos. Estimativa do Grupo Maker está bem abaixo. |
| Datas | **TEXT em ISO-8601** (`YYYY-MM-DD` ou `YYYY-MM-DD HH:MM:SS`) | Padrão recomendado pelo SQLite. Comparação lexicográfica funciona. Conversão do `dd/MM/yyyy` do Sankhya feita no insert (helper `parseDateBR`). |
| Booleanos | **INTEGER** 0/1 | SQLite não tem `BOOLEAN`. |
| Timezone | Tudo gravado em **UTC** ou em **horário de Brasília**? | **DECIDIR:** o Sankhya retorna em horário de Brasília sem offset. Recomendo: gravar como veio (string `YYYY-MM-DD HH:MM:SS` sem zone) e **assumir `America/Sao_Paulo`** em todo o backend. Documentar isso em `utils/periodo.ts`. Reabrir quando a dashboard for usada fora do BR (não previsto). |
| Concorrência de escrita | **1 writer único** (o job de snapshot) | `better-sqlite3` é síncrono. Mesmo com WAL, múltiplos writers podem dar `SQLITE_BUSY`. O job de snapshot é o **único** processo que escreve. Endpoints só leem. |
| Bootstrap | Servidor sobe mesmo com banco vazio | Primeira request retorna `{ rows: [], stale: true, fetchedAt: null }`. Job em background popula. Não bloqueia o boot. |
| Re-sync por entidade | **Incremental quando possível**, full a cada N ciclos | `Financeiro` e `CabecalhoNota` via `modifiedSince` (depende de `LogAlteracoesTabelas` ativo — confirmar com admin Sankhya; ver `STATUS_PROJECT.md` §11 dívida 5). `Parceiro`/`Produto` em full a cada 30 min (mudam pouco). |
| Backup | Re-sync do Sankhya é aceitável | Se o arquivo corromper, deletar e deixar o job recriar. Sem rotação de backups no MVP. |
| Retenção | Última verdade conhecida (sem histórico) | Histórico vai pra tabela separada `kpi_snapshot` quando precisar (seção 11). |

## 3. Convenções de nomenclatura

- **Tabelas:** `snake_case` em inglês curto (`titulos`, `pedido_itens`).
- **Colunas:** preservar o nome Sankhya em **UPPERCASE** quando vem direto
  da API (`CODPARC`, `VLRDESDOB`). Colunas calculadas/derivadas em
  `snake_case` (`valor_aberto`, `is_em_aberto`).
- **PKs:** chave primária do Sankhya quando existir (`NUFIN`, `NUNOTA`,
  `CODPARC`, `CODPROD`, `CODEMP`). Composta quando precisar
  (`pedido_itens (NUNOTA, SEQUENCIA)`).
- **FKs:** sempre `ON DELETE RESTRICT` no MVP. Mudanças destrutivas vêm
  do sync, não de cascata.
- **Datas em colunas:** sufixo `_at` para timestamps locais
  (`synced_at`, `fetched_at`), nomes Sankhya quando vem direto
  (`DTNEG`, `DTVENC`, `DHBAIXA`).

## 4. Mapa Sankhya → SQLite

| Domínio | Entidade Sankhya | Tabela local | Endpoints que servem |
|---|---|---|---|
| Empresas | `Empresa` (TGFEMP) — bloqueada para `BIMKR` | `empresas` (seed estático) | `/api/empresas` |
| Parceiros | `Parceiro` (TGFPAR) | `parceiros` | `/api/parceiros`, joins de vendas/compras/financeiro |
| Produtos | `Produto` (TGFPRO) | `produtos` | `/api/produtos`, itens de pedidos |
| Vendedores | `Vendedor` (TGFVEN) | `vendedores` | `/api/vendedores`, pedidos |
| Tipo de Operação | `TipoOperacao` (TGFTOP) | `tipos_operacao` | filtragem de TIPMOV em vendas/compras — TIPMOV é chave pra TGFTOP, não literal `'V'`/`'C'` |
| Tipo de Título | `TipoTitulo` (TGFTPT) | `tipos_titulo` | join legível em `titulos` |
| Natureza | `Natureza` (TGFNAT) | `naturezas` | join legível em `titulos` |
| Financeiro | `Financeiro` (TGFFIN) | `titulos` | `/api/receber`, `/api/pagar`, `/api/recebidos`, `/api/dashboard/aging-receber`, `/api/dashboard/kpis` |
| Pedidos | `CabecalhoNota` (TGFCAB) | `pedidos` | `/api/vendas`, `/api/compras`, `/api/dashboard/faturamento-diario`, `/api/dashboard/top-clientes`, `/api/dashboard/top-fornecedores` |
| Itens de pedido | `ItemNota` (TGFITE) | `pedido_itens` | detalhe de pedidos, agregações por produto |

**Não modelado no MVP** (mas reservado nas decisões):

- Estoque (`Produto.ESTOQUE` ou `TGFEST`) — sem requisito explícito.
- Notas fiscais emitidas (distinto de pedidos) — depende de funcionalidade.
- Centros de resultado/custo — vem como joined field em pedidos quando
  precisar.

## 5. Schema completo (DDL)

> Este é o schema **versão 1**. Toda mudança incompatível incrementa
> `metadata.schema_version` e tem um bloco `-- v2`, `-- v3` etc. abaixo.

```sql
-- =====================================================================
-- PRAGMAs (rodar a cada conexão / no boot)
-- =====================================================================
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;

-- =====================================================================
-- metadata: controle interno (versão do schema, flags)
-- =====================================================================
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO metadata (key, value) VALUES
  ('schema_version', '2'),
  ('created_at',     CURRENT_TIMESTAMP);

-- =====================================================================
-- sync_state: rastreia última sincronização por entidade
--   habilita granularidade do `stale` por entidade no response
-- =====================================================================
CREATE TABLE IF NOT EXISTS sync_state (
  entity            TEXT PRIMARY KEY,    -- 'titulos', 'pedidos', 'parceiros', ...
  last_synced_at    TEXT,                -- ISO-8601 UTC
  last_full_sync_at TEXT,                -- última vez que foi full (não incremental)
  last_error        TEXT,                -- mensagem do último erro, se houver
  success_count     INTEGER NOT NULL DEFAULT 0,
  error_count       INTEGER NOT NULL DEFAULT 0,
  row_count         INTEGER NOT NULL DEFAULT 0
);

-- =====================================================================
-- empresas: seed estático (entidade Empresa bloqueada para BIMKR)
--   ver PLAN.md seção 9 (multi-empresa)
-- =====================================================================
CREATE TABLE IF NOT EXISTS empresas (
  CODEMP          INTEGER PRIMARY KEY,
  NOMEFANTASIA    TEXT NOT NULL,
  RAZAOSOCIAL     TEXT,
  CGC             TEXT,
  ativa           INTEGER NOT NULL DEFAULT 1,
  ordem           INTEGER NOT NULL DEFAULT 0,  -- para ordenar no seletor da UI
  synced_at       TEXT
);

-- =====================================================================
-- parceiros: clientes + fornecedores (a flag separa)
-- =====================================================================
CREATE TABLE IF NOT EXISTS parceiros (
  CODPARC         INTEGER PRIMARY KEY,
  NOMEPARC        TEXT NOT NULL,
  RAZAOSOCIAL     TEXT,
  CGC_CPF         TEXT,
  TIPPESSOA       TEXT,                  -- 'F' (física), 'J' (jurídica)
  CIDADE          TEXT,                  -- via joined field (Cidade_NOMECID)
  UF              TEXT,
  is_cliente      INTEGER NOT NULL DEFAULT 0,
  is_fornecedor   INTEGER NOT NULL DEFAULT 0,
  ativo           INTEGER NOT NULL DEFAULT 1,
  synced_at       TEXT NOT NULL
);

-- =====================================================================
-- produtos
-- =====================================================================
CREATE TABLE IF NOT EXISTS produtos (
  CODPROD         INTEGER PRIMARY KEY,
  DESCRPROD       TEXT NOT NULL,
  REFERENCIA      TEXT,
  CODGRUPOPROD    INTEGER,
  GRUPO_DESCR     TEXT,                  -- via joined field
  UNIDADE         TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  synced_at       TEXT NOT NULL
);

-- =====================================================================
-- vendedores
-- =====================================================================
CREATE TABLE IF NOT EXISTS vendedores (
  CODVEND         INTEGER PRIMARY KEY,
  APELIDO         TEXT NOT NULL,
  ativo           INTEGER NOT NULL DEFAULT 1,
  synced_at       TEXT NOT NULL
);

-- =====================================================================
-- tipos_operacao: TGFTOP. Define se um pedido é Venda (V) ou Compra (C)
--   TIPMOV é chave pra TGFTOP — não literal 'V'/'C'
-- =====================================================================
CREATE TABLE IF NOT EXISTS tipos_operacao (
  CODTIPOPER      INTEGER PRIMARY KEY,
  DESCROPER       TEXT NOT NULL,
  TIPMOV          TEXT NOT NULL,          -- 'V', 'C', 'D' (devolução), 'E' (entrada), ...
  ATIVO           INTEGER NOT NULL DEFAULT 1,
  synced_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tipos_operacao_tipmov ON tipos_operacao(TIPMOV);

-- =====================================================================
-- tipos_titulo + naturezas: dimensões pequenas para join legível
-- =====================================================================
CREATE TABLE IF NOT EXISTS tipos_titulo (
  CODTIPTIT       INTEGER PRIMARY KEY,
  DESCRTIPTIT     TEXT NOT NULL,
  synced_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS naturezas (
  CODNAT          INTEGER PRIMARY KEY,
  DESCRNAT        TEXT NOT NULL,
  synced_at       TEXT NOT NULL
);

-- =====================================================================
-- titulos: Financeiro (contas a receber + a pagar)
--   resolve bloco C da Atualização (DHBAIXA prevista vs DHCONCIL efetiva)
-- =====================================================================
CREATE TABLE IF NOT EXISTS titulos (
  NUFIN           INTEGER PRIMARY KEY,
  CODEMP          INTEGER NOT NULL,
  CODPARC         INTEGER NOT NULL,
  CODTIPTIT       INTEGER,
  CODNAT          INTEGER,
  RECDESP         INTEGER NOT NULL,        -- > 0 receita, < 0 despesa
  tipo            TEXT NOT NULL,            -- 'receita' | 'despesa' (derivado, indexável)
  DTNEG           TEXT,                     -- ISO yyyy-MM-dd
  DTVENC          TEXT,                     -- ISO yyyy-MM-dd
  DHBAIXA         TEXT,                     -- prevista — pode ser futura
  DHCONCIL        TEXT,                     -- efetiva (a confirmar com consultor)
  DTCONTAB        TEXT,                     -- contabilização
  VLRDESDOB       REAL NOT NULL DEFAULT 0,
  VLRBAIXA        REAL NOT NULL DEFAULT 0,
  valor_aberto    REAL NOT NULL DEFAULT 0,  -- VLRDESDOB - VLRBAIXA (denormalizado, indexável)
  is_em_aberto    INTEGER NOT NULL DEFAULT 1,  -- DHBAIXA IS NULL → 1
  synced_at       TEXT NOT NULL,
  FOREIGN KEY (CODEMP)    REFERENCES empresas(CODEMP),
  FOREIGN KEY (CODPARC)   REFERENCES parceiros(CODPARC),
  FOREIGN KEY (CODTIPTIT) REFERENCES tipos_titulo(CODTIPTIT),
  FOREIGN KEY (CODNAT)    REFERENCES naturezas(CODNAT)
);

-- =====================================================================
-- pedidos: CabecalhoNota (vendas + compras + devoluções)
--   tipo de movimento vem via tipos_operacao.TIPMOV
-- =====================================================================
CREATE TABLE IF NOT EXISTS pedidos (
  NUNOTA          INTEGER PRIMARY KEY,
  CODEMP          INTEGER NOT NULL,
  CODPARC         INTEGER NOT NULL,
  CODVEND         INTEGER,
  CODTIPOPER      INTEGER NOT NULL,
  TIPMOV          TEXT NOT NULL,            -- desnormalizado de tipos_operacao (indexável direto)
  NUMNOTA         INTEGER,                  -- número da nota (pode ser null em pedidos sem nota emitida)
  SERIENOTA       TEXT,
  DTNEG           TEXT NOT NULL,            -- ISO yyyy-MM-dd
  DTFATUR         TEXT,                     -- data de faturamento
  DTENTSAI        TEXT,                     -- entrada/saída
  STATUSNOTA      TEXT,                     -- 'L' liberada, 'P' pendente, etc.
  VLRNOTA         REAL NOT NULL DEFAULT 0,
  VLRDESC         REAL NOT NULL DEFAULT 0,
  VLRFRETE        REAL NOT NULL DEFAULT 0,
  AD_OBS          TEXT,                     -- observação (campo customizado comum)
  synced_at       TEXT NOT NULL,
  FOREIGN KEY (CODEMP)     REFERENCES empresas(CODEMP),
  FOREIGN KEY (CODPARC)    REFERENCES parceiros(CODPARC),
  FOREIGN KEY (CODVEND)    REFERENCES vendedores(CODVEND),
  FOREIGN KEY (CODTIPOPER) REFERENCES tipos_operacao(CODTIPOPER)
);

-- =====================================================================
-- pedido_itens: ItemNota
-- =====================================================================
CREATE TABLE IF NOT EXISTS pedido_itens (
  NUNOTA          INTEGER NOT NULL,
  SEQUENCIA       INTEGER NOT NULL,
  CODPROD         INTEGER NOT NULL,
  QTDNEG          REAL NOT NULL DEFAULT 0,
  VLRUNIT         REAL NOT NULL DEFAULT 0,
  VLRTOT          REAL NOT NULL DEFAULT 0,
  VLRDESC         REAL NOT NULL DEFAULT 0,
  CODLOCALORIG    INTEGER,                  -- local de estoque de origem
  synced_at       TEXT NOT NULL,
  PRIMARY KEY (NUNOTA, SEQUENCIA),
  FOREIGN KEY (NUNOTA)  REFERENCES pedidos(NUNOTA) ON DELETE CASCADE,
  FOREIGN KEY (CODPROD) REFERENCES produtos(CODPROD)
);

-- =====================================================================
-- v2 (2026-05-14): categorização de despesas para o donut da tela Financeira
--   ver seção 14.2. Naturezas Sankhya (~30) são agrupadas em 6 categorias
--   macro. A categoria 'OUTROS' funciona como fallback para naturezas
--   ainda não classificadas — nenhum gasto desaparece do total.
-- =====================================================================

CREATE TABLE IF NOT EXISTS categorias_despesa (
  codigo     TEXT PRIMARY KEY,              -- 'CMV', 'PESSOAL', 'LOGISTICA', 'ADMIN', 'MARKETING', 'OUTROS'
  descricao  TEXT NOT NULL,
  cor_hex    TEXT,                          -- '#FFD600' (amarelo Maker), etc.
  ordem      INTEGER NOT NULL DEFAULT 0     -- ordem de exibição no donut
);

-- Seed das 6 categorias fixas. Ordem reflete o donut da tela (maior fatia primeiro).
INSERT OR IGNORE INTO categorias_despesa (codigo, descricao, cor_hex, ordem) VALUES
  ('CMV',        'Custo da Mercadoria Vendida',  '#FFD600', 1),
  ('PESSOAL',    'Pessoal e Encargos',           '#3B82F6', 2),
  ('LOGISTICA',  'Logística e Transporte',       '#10B981', 3),
  ('ADMIN',      'Administrativo',               '#A855F7', 4),
  ('MARKETING',  'Marketing e Publicidade',      '#EF4444', 5),
  ('OUTROS',     'Outros',                       '#6B7280', 99);

-- Mapeamento natureza Sankhya → categoria macro. Populado por seed manual
-- após o primeiro sync de `naturezas` rodar. Qualquer natureza não listada
-- aqui cai automaticamente em 'OUTROS' via LEFT JOIN no service.
CREATE TABLE IF NOT EXISTS natureza_categoria (
  CODNAT     INTEGER PRIMARY KEY,
  categoria  TEXT NOT NULL,
  FOREIGN KEY (CODNAT)    REFERENCES naturezas(CODNAT),
  FOREIGN KEY (categoria) REFERENCES categorias_despesa(codigo)
);

UPDATE metadata SET value='2' WHERE key='schema_version';
```

## 6. Índices (justificados por endpoint)

Todo índice abaixo tem **uma query do PLAN.md seção 6** que ele acelera.
Sem o endpoint, sem o índice.

```sql
-- /api/receber, /api/pagar (filtragem por empresa + status + tipo)
CREATE INDEX IF NOT EXISTS idx_titulos_emp_aberto_tipo
  ON titulos(CODEMP, is_em_aberto, tipo);

-- /api/dashboard/aging-receber (faixas por DTVENC com tipo='receita')
CREATE INDEX IF NOT EXISTS idx_titulos_emp_tipo_venc
  ON titulos(CODEMP, tipo, DTVENC)
  WHERE is_em_aberto = 1;

-- /api/recebidos (range em DHCONCIL ou DHBAIXA por empresa)
--   índice criado nos dois campos, decisão de qual usar fica no service
CREATE INDEX IF NOT EXISTS idx_titulos_emp_concil ON titulos(CODEMP, DHCONCIL);
CREATE INDEX IF NOT EXISTS idx_titulos_emp_baixa  ON titulos(CODEMP, DHBAIXA);

-- /api/dashboard/kpis (somatórios por empresa + tipo)
--   já coberto por idx_titulos_emp_aberto_tipo

-- /api/vendas, /api/compras (range de DTNEG por empresa + tipo movimento)
CREATE INDEX IF NOT EXISTS idx_pedidos_emp_tipmov_dtneg
  ON pedidos(CODEMP, TIPMOV, DTNEG);

-- /api/dashboard/faturamento-diario (GROUP BY DTNEG com TIPMOV='V')
--   coberto pelo idx_pedidos_emp_tipmov_dtneg

-- /api/dashboard/top-clientes (GROUP BY CODPARC com filtro de período)
CREATE INDEX IF NOT EXISTS idx_pedidos_emp_tipmov_parc_dtneg
  ON pedidos(CODEMP, TIPMOV, CODPARC, DTNEG);
-- ^ pesado, mas top-clientes é o endpoint mais consultado.
-- Reavaliar se a dashboard não precisar dele.

-- Joins de itens
CREATE INDEX IF NOT EXISTS idx_pedido_itens_prod ON pedido_itens(CODPROD);

-- Busca por nome de parceiro (autocomplete em filtros)
CREATE INDEX IF NOT EXISTS idx_parceiros_nome ON parceiros(NOMEPARC);

-- Busca por descrição de produto
CREATE INDEX IF NOT EXISTS idx_produtos_descr ON produtos(DESCRPROD);

-- v2: tela Financeira (seção 14.2)
-- /api/dashboard/financeiro-kpis (SUM despesas por empresa + range de data)
-- /api/dashboard/dre-mensal (GROUP BY mês com tipo='despesa')
CREATE INDEX IF NOT EXISTS idx_titulos_emp_tipo_dtneg
  ON titulos(CODEMP, tipo, DTNEG);

-- /api/dashboard/distribuicao-custos (JOIN com natureza_categoria + GROUP BY categoria)
CREATE INDEX IF NOT EXISTS idx_titulos_emp_natureza_dtneg
  ON titulos(CODEMP, CODNAT, DTNEG)
  WHERE tipo = 'despesa';

CREATE INDEX IF NOT EXISTS idx_natcat_categoria
  ON natureza_categoria(categoria);

-- /api/dashboard/fluxo-caixa-previsto (range em DHBAIXA)
--   coberto por idx_titulos_emp_baixa já criado acima
```

**Não criar índices "por garantia"** — cada índice custa em insert do
job de snapshot. Adicionar só quando o `EXPLAIN QUERY PLAN` mostrar
scan completo numa query real.

## 7. Estratégia de sincronização

### 7.1. Frequência por entidade

| Entidade | Estratégia | Intervalo | Motivo |
|---|---|---|---|
| `empresas` | Seed estático | Manual | Lista hardcoded até `BIMKR` ter acesso à entidade `Empresa`. Ver `PLAN.md` seção 9. |
| `parceiros` | Full sync | 30 min | Mudam pouco. Volume médio. |
| `produtos` | Full sync | 30 min | Idem. |
| `vendedores` | Full sync | 1 h | Quase imutável. |
| `tipos_operacao`, `tipos_titulo`, `naturezas` | Full sync | 1 h | Imutável na prática. |
| `titulos` | **Incremental** via `modifiedSince`, full a cada 6 h | 5 min | Coração do dashboard. Mudanças frequentes. |
| `pedidos` + `pedido_itens` | **Incremental**, full a cada 6 h | 5 min | Idem. |

**Sobre `modifiedSince`:** depende de `LogAlteracoesTabelas` estar
ativo nas entidades Sankhya. Se não estiver (confirmar com admin), cair
em full sync a cada 5 min — vai funcionar, só consome mais quota da API.

### 7.2. Algoritmo de cada ciclo de sync (entidade `titulos`)

```ts
async function syncTitulos() {
  const state = await getSyncState('titulos');
  const since = state.last_synced_at;  // ISO UTC

  // 1. Buscar do Sankhya
  const rows = await sankhya.loadAllRecords({
    rootEntity: 'Financeiro',
    fields: [...],
    // se since existe → use modifiedSince; senão full sync
    modifiedSince: since,
    useFileBasedPagination: !since  // só no full inicial
  });

  // 2. Transação única para o batch inteiro
  db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO titulos (NUFIN, CODEMP, ..., synced_at)
      VALUES (@nufin, @codemp, ..., @syncedAt)
      ON CONFLICT(NUFIN) DO UPDATE SET
        CODEMP = excluded.CODEMP,
        DHBAIXA = excluded.DHBAIXA,
        DHCONCIL = excluded.DHCONCIL,
        VLRBAIXA = excluded.VLRBAIXA,
        valor_aberto = excluded.valor_aberto,
        is_em_aberto = excluded.is_em_aberto,
        synced_at = excluded.synced_at;
    `);
    for (const row of rows) stmt.run(row);

    updateSyncState('titulos', {
      last_synced_at: new Date().toISOString(),
      row_count: rows.length
    });
  })();
}
```

Pontos importantes:

- **`ON CONFLICT DO UPDATE`** (upsert) em vez de delete-and-insert.
  Preserva FK e é mais rápido.
- **Transação única por batch** — `better-sqlite3` faz ~50k inserts/s em
  transação, ~1k fora. Sempre embrulhar.
- **`synced_at` atualizado por linha**, não só no `sync_state`. Útil
  para debug ("essa linha veio quando?").
- **Não deletar registros que sumiram do Sankhya** automaticamente.
  Soft-delete via flag (a adicionar quando necessário) ou full sync
  periódico que rebuilda a tabela.

### 7.3. Job em background

- Implementado como `setInterval` simples no boot do servidor. Não usar
  cron lib até precisar de agenda real.
- **Mutex global por entidade:** se o ciclo anterior ainda está
  rodando, o próximo é skipado e loga warn (não enfileira).
- **Sem retry automático no erro** no MVP — o próximo ciclo já é o
  retry natural. `sync_state.last_error` guarda a última mensagem para
  observabilidade.
- Endpoint admin `/api/admin/refresh?entity=titulos` força sync
  manual. Útil em demo.

## 8. Bootstrap e primeiro boot

1. **Boot do servidor:**
   - Conecta no SQLite (cria o arquivo se não existir).
   - Roda `CREATE TABLE IF NOT EXISTS` para todas as tabelas.
   - Lê `metadata.schema_version`. Se diferente da versão do código →
     log fatal pedindo migration manual (a definir).
   - Faz seed estático de `empresas` (upsert das 7 do Grupo Maker).
   - Inicia o job de sync em background.
   - **Sobe o HTTP imediatamente** — não espera o primeiro sync.

2. **Primeira request da dashboard antes do primeiro sync terminar:**
   - Endpoints retornam `{ rows: [], total: 0, stale: true, fetchedAt: null }`.
   - Frontend mostra "Carregando dados pela primeira vez..." e faz
     polling a cada 30s no `/api/health` para saber quando popular.

3. **Health check estendido** (sugestão para `PLAN.md` seção 6):
   ```json
   GET /api/health
   → {
     "status": "ok",
     "time": "...",
     "sync": {
       "titulos":   { "last": "...", "rows": 1234, "stale_seconds": 87 },
       "pedidos":   { "last": "...", "rows": 5678, "stale_seconds": 87 },
       "parceiros": { "last": "...", "rows":  450, "stale_seconds": 1200 }
     }
   }
   ```
   Granularidade fina do `stale` por entidade — permite mostrar "pedidos
   atualizados há 3 min, parceiros há 20 min" no rodapé da dashboard.

## 9. Mapeamento detalhado: campos derivados

Algumas colunas são **calculadas no insert**, não vêm da API. Lista
explícita para evitar dúvida:

| Tabela | Coluna derivada | Cálculo |
|---|---|---|
| `titulos` | `tipo` | `'receita'` se `RECDESP > 0`, senão `'despesa'` |
| `titulos` | `is_em_aberto` | `1` se `DHBAIXA IS NULL`, senão `0` |
| `titulos` | `valor_aberto` | `VLRDESDOB - VLRBAIXA` |
| `pedidos` | `TIPMOV` | Lookup em `tipos_operacao` por `CODTIPOPER`. **Desnormalizado por performance** — query de Vendas/Compras filtra direto sem JOIN. |
| `parceiros` | `is_cliente` | `CLIENTE = 'S'` na API |
| `parceiros` | `is_fornecedor` | `FORNECEDOR = 'S'` na API |

Quando o snapshot rodar full sync e detectar que `RECDESP` mudou de uma
linha (raro mas acontece em correção), o upsert recalcula tudo.

## 10. Configuração via env

Adicionar em `backend/.env.example` e `backend/src/config.ts`:

```env
DATABASE_PATH=./data/snapshot.db
SYNC_INTERVAL_MS=300000          # 5 minutos (entidades quentes)
SYNC_INTERVAL_SLOW_MS=1800000    # 30 minutos (parceiros, produtos)
SYNC_ENABLED=true                # desligar no dev quando quiser bater direto no Sankhya
```

Schema Zod sugerido:

```ts
DATABASE_PATH: z.string().default('./data/snapshot.db'),
SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
SYNC_INTERVAL_SLOW_MS: z.coerce.number().int().positive().default(1_800_000),
SYNC_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
```

## 11. Funcionalidades futuras (reservadas, não no MVP)

Listadas aqui para não esquecer quando entrarem no escopo. **Não
implementar agora.**

- **Histórico de KPIs (séries temporais).** Tabela `kpi_snapshot
  (data, codemp, faturamento, recebido, pago, inadimplencia, taken_at)`
  alimentada por job diário fechando o dia anterior. Necessária para
  gráfico "mês a mês nos últimos 12/24 meses".
- **Inadimplência por idade.** Vista materializada (ou tabela cacheada)
  com aging snapshot diário.
- **Comissão de vendedor.** Tabela `comissoes` ligada a `pedidos` +
  `vendedores`. Depende de regra de negócio (Grupo Maker tem alíquota
  fixa ou por categoria de produto?).
- **Metas mensais.** Tabela `metas (CODVEND, ano, mes, valor_meta)` com
  insert manual por admin.
- **Audit log.** Quem chamou `/api/admin/refresh`, quando, com qual
  entidade. Tabela `admin_log`.
- **Múltiplos usuários.** Tabela `usuarios` com permissões por empresa
  (Maker tem 7 CODEMP, talvez nem todo usuário deve ver todas).

## 12. Plano de implementação (incremento por incremento)

> Cada item é independente e cabe num PR pequeno. Manter ordem.

### 12.1. Infraestrutura (antes da Fase 4 do PLAN.md)

- [ ] Instalar `better-sqlite3` e `@types/better-sqlite3`.
- [ ] Criar `backend/src/db/connection.ts` que abre o arquivo,
      configura PRAGMAs e exporta a instância singleton.
- [ ] Criar `backend/src/db/schema.sql` com o DDL da seção 5.
- [ ] Criar `backend/src/db/migrate.ts` que lê `schema.sql` e roda no
      boot (idempotente via `CREATE IF NOT EXISTS`).
- [ ] Adicionar `data/` no `.gitignore` do backend.
- [ ] Estender `config.ts` com as 4 envs da seção 10.

### 12.2. Sync de dimensões (entidades pequenas, baixo risco)

- [ ] `backend/src/sync/empresas.ts` — seed estático.
- [ ] `backend/src/sync/parceiros.ts`.
- [ ] `backend/src/sync/produtos.ts`.
- [ ] `backend/src/sync/vendedores.ts`.
- [ ] `backend/src/sync/tipos.ts` (tipos_operacao + tipos_titulo + naturezas).
- [ ] Orquestrador `backend/src/sync/scheduler.ts` com `setInterval` e
      mutex por entidade.
- [ ] **Após o primeiro sync de `naturezas` rodar:** exportar a lista
      via `SELECT CODNAT, DESCRNAT FROM naturezas ORDER BY DESCRNAT` e
      criar `backend/src/seeds/natureza_categoria.json` com o mapeamento
      manual de cada `CODNAT` em uma das 6 categorias de
      `categorias_despesa` (CMV, PESSOAL, LOGISTICA, ADMIN, MARKETING,
      OUTROS). Quem fizer o seed: alguém do financeiro do Maker (~1-2h).
- [ ] `backend/src/sync/natureza_categoria.ts` — lê o JSON do seed e
      faz upsert no `natureza_categoria`. Naturezas não listadas no
      JSON ficam **sem linha** na tabela; o service da seção 14.2
      trata isso via `LEFT JOIN ... COALESCE(categoria, 'OUTROS')`.

### 12.3. Sync de fatos (entidades grandes, com fallback)

- [ ] `backend/src/sync/titulos.ts` com `modifiedSince`. Detecta se
      `LogAlteracoesTabelas` retorna 401/404 e cai pra full.
- [ ] `backend/src/sync/pedidos.ts` (vendas + compras + itens).

### 12.4. Repository layer

- [ ] `backend/src/repo/titulos.ts` — `listarReceber`, `listarPagar`,
      `aging`, `recebidos`.
- [ ] `backend/src/repo/pedidos.ts` — `listarVendas`, `faturamentoDiario`,
      `topClientes`, `topFornecedores`.
- [ ] `backend/src/repo/kpis.ts` — agregação multi-tabela com `JOIN` e
      `UNION ALL`.

### 12.5. Integração com routes

- [ ] Refatorar `services/financeiro.ts` para ler do repo (SQLite) com
      fallback em Sankhya se `stale_seconds > 600`.
- [ ] Criar os endpoints novos do PLAN.md seção 6 contra o repo.
- [ ] Health check estendido (seção 8.3 deste documento).

### 12.6. Operação

- [ ] Endpoint admin `/api/admin/refresh?entity=...&full=true`.
- [ ] Métricas básicas: tempo de cada sync, contagem de linhas, taxa
      de erro. Loga via pino.

## 13. Riscos conhecidos

- **`modifiedSince` indisponível.** Mitigação: full sync a cada 5 min
  (mais quota de API, ainda viável para o volume do Maker).
- **`SQLITE_BUSY` em WAL.** Não deve acontecer com 1 writer, mas se
  acontecer, embrulhar leitura em retry com backoff (10ms, 50ms, 200ms).
- **Crash no meio do sync.** Transação é all-or-nothing — não fica
  estado intermediário no banco. `sync_state.last_error` pega o motivo.
- **Schema mudar sem migration.** `schema_version` em `metadata` permite
  detectar e falhar fast em vez de corromper silenciosamente. Migrações
  pesadas: deletar o `.db` e re-sync é aceitável no MVP.
- **Discrepância valor_aberto x soma real.** A coluna é denormalizada.
  Se o cálculo do upsert tiver bug, fica desincronizado. Mitigar com
  query de auditoria semanal: `SELECT NUFIN FROM titulos WHERE
  ABS(valor_aberto - (VLRDESDOB - VLRBAIXA)) > 0.01`.

## 14. Funcionalidades da dashboard a confirmar

> **Aguardando lista do usuário.** Esta seção será preenchida com as
> funcionalidades específicas da dashboard. Cada funcionalidade entra
> aqui com:
>
> - Nome / objetivo
> - Endpoint que ela vai consumir (existente ou novo)
> - Tabelas / colunas necessárias
> - Se requer schema novo, índice novo, ou já está coberto
>
> Quando essa lista chegar, revisar:
>
> 1. Schema da seção 5 (alguma tabela falta?).
> 2. Índices da seção 6 (alguma query nova precisa de índice?).
> 3. Mapeamento Sankhya da seção 4 (alguma entidade nova?).
> 4. Funcionalidades futuras da seção 11 (algo subir pro MVP?).

### 14.1. Análise por Empresa — Visão Diretoria (definida em 2026-05-14)

> **Revisão 2026-05-14 (segunda passagem):** sparkline por card e
> navegação por período (`?periodo=&data=`) foram **postergadas para a
> fase 7c**. A fase 7a/7b consome o endpoint
> `/api/dashboard/empresa/faturamento` já implementado, que retorna os
> 4 totais (`dia / semana_7d / mes_atual / ano_atual`) num único
> payload, sem série por bucket. Decisão registrada em
> `PLAN_INTEGRATION_FRONTEND.md` §7.4 (consolidada com o review original).
> Quando o backlog de série temporal entrar, reativar a sparkline e o
> seletor de período seguindo o desenho original abaixo.

**Componentes na tela:**

1. **Seletor de empresa** (tabs no topo): `TODAS AS EMPRESAS` (default, agrega as 7) + 7 empresas individuais. Label da tab "todas" foi ajustada de `EMPRESA` para `TODAS AS EMPRESAS` na iteração de design de 2026-05-14.
2. **4 cards de faturamento** lado a lado: `1 DIA`, `1 SEMANA`, `1 MÊS`, `ANUAL`. Cada card mostra:
   - Valor total faturado no período (R$ formatado com `k` / `M`).
   - ~~Mini-sparkline com série temporal do período (vem na mesma response, sem custo extra no Sankhya).~~ **[Postergado para 7c]**
   - **Sem variação percentual no MVP** (descartado pela diretoria — era valor mock no design).
3. **Gráfico de barras "Faturamento por Empresa" (Distribuição Anual):** 7 barras coloridas, **sempre exibe todas as 7 empresas** independentemente da tab selecionada (confirmado pelo usuário em 2026-05-14).
4. **Gráfico de pizza "Mix de Receita":** percentual de cada empresa no total. **Sempre exibe todas as 7 empresas** independentemente da tab selecionada (confirmado pelo usuário em 2026-05-14).

**Schema cobertura:**

| Componente | Cobertura | Tabelas / colunas |
|---|---|---|
| Cards de faturamento | ✅ Coberto | `pedidos` (`CODEMP`, `TIPMOV`, `DTNEG`, `VLRNOTA`, `VLRDESC`, `STATUSNOTA`, `DTFATUR`) |
| Sparkline | ✅ Coberto (`GROUP BY DTNEG`) | idem |
| Seletor de empresa | ✅ Coberto | `empresas` (seed estático) |
| Faturamento por empresa | ✅ Coberto | `pedidos` `GROUP BY CODEMP` |
| Mix de receita (%) | ✅ Coberto (deriva da mesma query) | idem |

**Sem schema novo. Sem índice novo.** Tudo coberto por `idx_pedidos_emp_tipmov_dtneg`.

**Decisões de negócio fechadas (confirmadas pelo usuário):**

- **"Faturamento" = nota emitida líquida.** Cláusula `WHERE` exige `STATUSNOTA = 'L' AND DTFATUR IS NOT NULL`; valor somado é `VLRNOTA - VLRDESC`. Pedidos não-faturados (rascunho, cancelado, em conferência) **ficam fora da tela principal** — vão para outra tela em fase futura.
- **Sem variação percentual.** Os `+8,2%`, `+6,1%` etc. da imagem eram mock do design e foram descartados.
- **Sparkline incluída** na resposta do `/api/dashboard/faturamento` (mesma query, custo zero adicional no Sankhya). Buckets:
  - Card 1 DIA: **sem sparkline** (exigiria granularidade horária em `DTNEG`).
  - Card 1 SEMANA: bucket por dia (7 pontos).
  - Card 1 MÊS: bucket por dia (28-31 pontos).
  - Card ANUAL: bucket por mês (12 pontos).
- **Tab de empresa afeta os 4 cards de cima:**
  - `EMPRESA` selecionado (= todas): cards somam todas as 7 empresas.
  - `MAKER MATRIZ` selecionado: cards mostram apenas `CODEMP=1`.
  - E assim por diante.
- **Gráfico de barras "Faturamento por Empresa" sempre mostra as 7 empresas** independente da tab (confirmado em 2026-05-14).
- **Gráfico de pizza "Mix de Receita" sempre mostra as 7 empresas** independente da tab (confirmado em 2026-05-14).

**Endpoints a criar:**

1. `GET /api/dashboard/faturamento?empresa=...&periodo=dia|semana|mes|ano&data=YYYY-MM-DD`
   Retorna: `total`, `serie[]`, `intervalo`, `stale`, `fetchedAt`.
2. `GET /api/dashboard/faturamento-por-empresa?periodo=dia|semana|mes|ano&data=YYYY-MM-DD`
   Retorna: `total`, `empresas[]` com `valor` e `percentual`, `intervalo`, `stale`, `fetchedAt`.

**Response shape — `/api/dashboard/faturamento`:**

```json
{
  "periodo": "mes",
  "intervalo": { "inicio": "2026-05-01", "fim": "2026-06-01" },
  "empresa": { "modo": "single", "ids": [1] },
  "total": 3812450.75,
  "serie": [
    { "bucket": "2026-05-01", "valor": 125400 },
    { "bucket": "2026-05-02", "valor":  98700 }
  ],
  "stale": false,
  "fetchedAt": "2026-05-14T13:00:00Z"
}
```

**Response shape — `/api/dashboard/faturamento-por-empresa`:**

```json
{
  "periodo": "ano",
  "intervalo": { "inicio": "2026-01-01", "fim": "2027-01-01" },
  "total": 42100000,
  "empresas": [
    { "codemp":  1, "nome": "MAKER MATRIZ",          "valor": 9262000, "percentual": 0.22 },
    { "codemp":  2, "nome": "MY ROBOT FRANQUEADORA", "valor": 3368000, "percentual": 0.08 }
  ],
  "stale": false,
  "fetchedAt": "2026-05-14T13:00:00Z"
}
```

**Query de referência (card 1 mês, empresa 1):**

```sql
SELECT
  SUM(VLRNOTA - VLRDESC) AS total
FROM pedidos
WHERE CODEMP = 1
  AND TIPMOV = 'V'
  AND STATUSNOTA = 'L'
  AND DTFATUR IS NOT NULL
  AND DTNEG >= '2026-05-01' AND DTNEG < '2026-06-01';
```

**Query de referência (sparkline mensal, mesmo card):**

```sql
SELECT
  DTNEG AS bucket,
  SUM(VLRNOTA - VLRDESC) AS valor
FROM pedidos
WHERE CODEMP = 1
  AND TIPMOV = 'V'
  AND STATUSNOTA = 'L'
  AND DTFATUR IS NOT NULL
  AND DTNEG >= '2026-05-01' AND DTNEG < '2026-06-01'
GROUP BY DTNEG
ORDER BY DTNEG;
```

**Query de referência (card "todas as empresas", 1 mês):**

```sql
SELECT
  SUM(VLRNOTA - VLRDESC) AS total
FROM pedidos
WHERE TIPMOV = 'V'
  AND STATUSNOTA = 'L'
  AND DTFATUR IS NOT NULL
  AND DTNEG >= '2026-05-01' AND DTNEG < '2026-06-01';
-- sem filtro CODEMP quando empresa=todas
```

**Query de referência (mix por empresa, ano):**

```sql
WITH faturamento_por_emp AS (
  SELECT
    p.CODEMP,
    e.NOMEFANTASIA AS nome,
    SUM(p.VLRNOTA - p.VLRDESC) AS valor
  FROM pedidos p
  JOIN empresas e ON e.CODEMP = p.CODEMP
  WHERE p.TIPMOV = 'V'
    AND p.STATUSNOTA = 'L'
    AND p.DTFATUR IS NOT NULL
    AND p.DTNEG >= '2026-01-01' AND p.DTNEG < '2027-01-01'
  GROUP BY p.CODEMP, e.NOMEFANTASIA
),
totais AS (
  SELECT SUM(valor) AS total FROM faturamento_por_emp
)
SELECT
  f.CODEMP,
  f.nome,
  f.valor,
  f.valor / t.total AS percentual
FROM faturamento_por_emp f, totais t
ORDER BY f.valor DESC;
```

**Dependências de sync antes desse endpoint funcionar:**

1. `empresas` populada (já é seed estático).
2. `tipos_operacao` populada — para validar que `TIPMOV='V'` está correto **antes** da query rodar (pode ser que a instalação do Sankhya use outro literal). TIPMOV é chave pra TGFTOP, não literal — sempre conferir o mapa real.
3. `pedidos` populada — sync incremental rodando, com pelo menos um full sync inicial de **12 meses de DTNEG** completos (para o card anual funcionar).

**Frequência de atualização da dashboard (decisão do usuário "consultar API o mínimo possível"):**

- O job de sync do Sankhya roda a cada `SYNC_INTERVAL_MS` (default 5 min, configurável via env).
- O frontend bate no backend (= SQLite local) — pode recarregar quantas vezes quiser sem aumentar carga no Sankhya.
- Para diretoria, **polling de 60s no front é suficiente** (não há motivo pra recarregar mais rápido que o sync interno).
- Se quiser zero polling, websocket/SSE notifica o front quando o snapshot atualiza — fica para iteração futura, não MVP.

**Riscos específicos dessa funcionalidade:**

- **Card 1 DIA sem dados:** se a query rodar antes do faturamento do dia ser lançado no Sankhya, mostra zero. UX precisa diferenciar "zero real" de "ainda não sincronizado" usando `stale_seconds` do health.
- **Performance do card anual:** `SUM` sobre 12 meses de pedidos com índice `(CODEMP, TIPMOV, DTNEG)` deve ser rápido (< 50ms em volumes típicos do Maker). Validar com `EXPLAIN QUERY PLAN` quando o snapshot estiver populado.
- **Definição de `TIPMOV='V'`:** se a instalação do Sankhya do Maker usar outro literal (ex.: empresas com vendas e devoluções no mesmo TOP), o filtro precisa virar `CODTIPOPER IN (lista)` lendo de `tipos_operacao`. Decisão fica adiada até o primeiro sync de `tipos_operacao` rodar e a tabela ser inspecionada.

### 14.2. Financeiro — DRE, Fluxo e Contas a Receber (definida em 2026-05-14)

**Componentes na tela:**

1. **Seletor de período** (canto superior direito): `1 DIA`, `1 SEMANA`, `1 MÊS`, `TUDO` (default).
2. **4 cards de KPI** lado a lado, seguem o seletor de empresa global:
   - `RECEITA BRUTA` — `SUM(VLRNOTA)` de pedidos faturados no período.
   - `RESULTADO OPERACIONAL` — `Receita − Despesas`. Subtítulo "Margem 30,3%" calculada em tempo real.
   - `CONTAS A RECEBER` — `SUM(valor_aberto)` de títulos com `tipo='receita' AND is_em_aberto=1`.
   - `DESPESAS TOTAIS` — `SUM(VLRDESDOB)` de títulos com `tipo='despesa'` lançadas no período (regime de competência).
3. **Gráfico de barras "DRE — Últimos 6 meses"** com 3 séries (receita amarela, despesa vermelha, lucro verde). Ignora o seletor de período da tela (sempre 6 meses corridos).
4. **Gráfico de pizza "Distribuição de Custos"** — despesas do mês corrente agrupadas em 6 categorias macro (CMV, Pessoal, Logística, Admin, Marketing, Outros).
5. **Gráfico de linha "Posição de Caixa Prevista"** (renomeado de "Fluxo de Caixa Diário") — saldo diário projetado para o mês corrente, baseado em `DHBAIXA` (data prevista de baixa). Disclaimer visível na UI: *"Baseado em datas de baixa programadas no Sankhya. Caixa efetivamente realizado será atualizado quando a integração com conciliação bancária for liberada."*

**Decisões de negócio fechadas (confirmadas pelo usuário em 2026-05-14):**

- **Lucro = Receita − Despesas** (sem CEO passar margem fixa). Renomeado de "Lucro Líquido" para **"Resultado Operacional"** para refletir honestamente que não inclui CMV detalhado, impostos diretos sobre venda nem resultado financeiro.
- **Margem operacional** calculada em tempo real: `(Receita − Despesas) / Receita`. Tratamento de edge cases: `receita = 0` → `margem = null`. Resultado negativo → margem negativa (pintar de vermelho no front).
- **Despesas Totais = lançadas no período** (`SUM(VLRDESDOB)` com `DTNEG` no range, regime de competência). Garante que `Receita − Despesas = Resultado` bate matematicamente nos 3 cards visualmente.
- **Sem variação percentual** nos cards (consistente com a tela 14.1).
- **Distribuição de Custos:** 6 categorias fixas com `OUTROS` como fallback. Naturezas não classificadas no seed caem em `OUTROS` automaticamente — nenhum gasto desaparece do total.
- **Posição de Caixa Prevista:** usar `DHBAIXA` enquanto o consultor não responder sobre `DHCONCIL`/`DTCONTAB`. Schema já guarda as 3 colunas separadas — troca futura é só na query (ver `STATUS_PROJECT.md` §7.6 e §8 gotcha 7).

**Schema cobertura:**

| Componente | Cobertura | Tabelas / colunas |
|---|---|---|
| Card Receita Bruta | ✅ | `pedidos` (`VLRNOTA`, `TIPMOV`, `STATUSNOTA`, `DTFATUR`, `DTNEG`) |
| Card Resultado Operacional + Margem | ✅ | `pedidos` + `titulos` (cálculo derivado) |
| Card Contas a Receber | ✅ | `titulos` (`valor_aberto`, `tipo`, `is_em_aberto`) |
| Card Despesas Totais | ✅ | `titulos` (`VLRDESDOB`, `tipo`, `DTNEG`) |
| DRE 6 meses | ✅ | `pedidos` + `titulos` agrupados por mês |
| Distribuição de Custos (donut) | ✅ **v2** | `titulos` + `natureza_categoria` + `categorias_despesa` |
| Posição de Caixa Prevista (linha) | ✅ | `titulos` (`VLRDESDOB`, `VLRBAIXA`, `DHBAIXA`, `tipo`) |

**Schema novo introduzido (v2):**

- `categorias_despesa` (6 categorias fixas seedadas no schema).
- `natureza_categoria` (mapeamento CODNAT → categoria, populado por seed manual).

**Índices novos (v2):**

- `idx_titulos_emp_tipo_dtneg` — KPIs e DRE.
- `idx_titulos_emp_natureza_dtneg` — donut de distribuição.
- `idx_natcat_categoria` — JOIN do donut.

**Endpoints a criar:**

1. `GET /api/dashboard/financeiro-kpis?empresa=...&periodo=dia|semana|mes|tudo&data=YYYY-MM-DD`
   Popula os 4 cards de cima em uma única request.
2. `GET /api/dashboard/dre-mensal?empresa=...&meses=6`
   Popula o gráfico de barras DRE.
3. `GET /api/dashboard/distribuicao-custos?empresa=...&periodo=mes&data=YYYY-MM-DD`
   Popula o donut.
4. `GET /api/dashboard/posicao-caixa-prevista?empresa=...&mes=YYYY-MM`
   Popula o gráfico de linha.

**Response shape — `/api/dashboard/financeiro-kpis`:**

```json
{
  "periodo": "mes",
  "intervalo": { "inicio": "2026-05-01", "fim": "2026-06-01" },
  "empresa": { "modo": "single", "ids": [1] },
  "receita":   2840000,
  "despesas":  1980000,
  "resultado":  860000,
  "margem":      0.303,
  "contasReceber": 1120000,
  "stale": false,
  "fetchedAt": "2026-05-14T13:00:00Z"
}
```

**Response shape — `/api/dashboard/dre-mensal`:**

```json
{
  "empresa": { "modo": "single", "ids": [1] },
  "meses": [
    { "mes": "2025-12", "label": "Dez", "receita": 2100000, "despesa": 1700000, "lucro":  400000 },
    { "mes": "2026-01", "label": "Jan", "receita": 2200000, "despesa": 1750000, "lucro":  450000 },
    { "mes": "2026-02", "label": "Fev", "receita": 2300000, "despesa": 1800000, "lucro":  500000 },
    { "mes": "2026-03", "label": "Mar", "receita": 2700000, "despesa": 1900000, "lucro":  800000 },
    { "mes": "2026-04", "label": "Abr", "receita": 2850000, "despesa": 2000000, "lucro":  850000 },
    { "mes": "2026-05", "label": "Mai", "receita": 2840000, "despesa": 1980000, "lucro":  860000 }
  ],
  "stale": false,
  "fetchedAt": "2026-05-14T13:00:00Z"
}
```

**Response shape — `/api/dashboard/distribuicao-custos`:**

```json
{
  "periodo": "mes",
  "intervalo": { "inicio": "2026-05-01", "fim": "2026-06-01" },
  "empresa": { "modo": "todas" },
  "total": 1980000,
  "categorias": [
    { "codigo": "CMV",       "descricao": "Custo da Mercadoria Vendida", "cor": "#FFD600", "valor":  831_600, "percentual": 0.42 },
    { "codigo": "PESSOAL",   "descricao": "Pessoal e Encargos",          "cor": "#3B82F6", "valor":  435_600, "percentual": 0.22 },
    { "codigo": "LOGISTICA", "descricao": "Logística e Transporte",      "cor": "#10B981", "valor":  277_200, "percentual": 0.14 },
    { "codigo": "ADMIN",     "descricao": "Administrativo",              "cor": "#A855F7", "valor":  237_600, "percentual": 0.12 },
    { "codigo": "MARKETING", "descricao": "Marketing e Publicidade",     "cor": "#EF4444", "valor":  198_000, "percentual": 0.10 },
    { "codigo": "OUTROS",    "descricao": "Outros",                      "cor": "#6B7280", "valor":        0, "percentual": 0.00 }
  ],
  "stale": false,
  "fetchedAt": "2026-05-14T13:00:00Z"
}
```

**Response shape — `/api/dashboard/posicao-caixa-prevista`:**

```json
{
  "mes": "2026-05",
  "empresa": { "modo": "todas" },
  "dias": [
    { "data": "2026-05-01", "entradas": 95_000, "saidas":  82_000, "saldo": 13_000, "saldoAcumulado":  13_000 },
    { "data": "2026-05-02", "entradas": 88_000, "saidas":  75_000, "saldo": 13_000, "saldoAcumulado":  26_000 }
  ],
  "fonte": "DHBAIXA",
  "aviso": "Baseado em datas de baixa programadas. Não reflete caixa efetivamente realizado.",
  "stale": false,
  "fetchedAt": "2026-05-14T13:00:00Z"
}
```

**Query de referência — KPIs (empresa=1, mês corrente):**

```sql
WITH receita AS (
  SELECT COALESCE(SUM(VLRNOTA), 0) AS total
  FROM pedidos
  WHERE CODEMP = 1 AND TIPMOV = 'V'
    AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL
    AND DTNEG >= '2026-05-01' AND DTNEG < '2026-06-01'
),
despesas AS (
  SELECT COALESCE(SUM(VLRDESDOB), 0) AS total
  FROM titulos
  WHERE CODEMP = 1 AND tipo = 'despesa'
    AND DTNEG >= '2026-05-01' AND DTNEG < '2026-06-01'
),
receber AS (
  SELECT COALESCE(SUM(valor_aberto), 0) AS total
  FROM titulos
  WHERE CODEMP = 1 AND tipo = 'receita' AND is_em_aberto = 1
)
SELECT
  receita.total                                    AS receita,
  despesas.total                                   AS despesas,
  receita.total - despesas.total                   AS resultado,
  CASE WHEN receita.total = 0 THEN NULL
       ELSE (receita.total - despesas.total) / receita.total
  END                                              AS margem,
  receber.total                                    AS contas_receber
FROM receita, despesas, receber;
```

**Query de referência — DRE 6 meses (empresa=1):**

```sql
WITH meses AS (
  SELECT strftime('%Y-%m', date('now', 'start of month', '-' || n || ' months')) AS mes
  FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5)
),
receita AS (
  SELECT strftime('%Y-%m', DTNEG) AS mes, COALESCE(SUM(VLRNOTA), 0) AS valor
  FROM pedidos
  WHERE CODEMP = 1 AND TIPMOV = 'V'
    AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL
    AND DTNEG >= date('now', 'start of month', '-5 months')
  GROUP BY strftime('%Y-%m', DTNEG)
),
despesa AS (
  SELECT strftime('%Y-%m', DTNEG) AS mes, COALESCE(SUM(VLRDESDOB), 0) AS valor
  FROM titulos
  WHERE CODEMP = 1 AND tipo = 'despesa'
    AND DTNEG >= date('now', 'start of month', '-5 months')
  GROUP BY strftime('%Y-%m', DTNEG)
)
SELECT
  m.mes,
  COALESCE(r.valor, 0)                   AS receita,
  COALESCE(d.valor, 0)                   AS despesa,
  COALESCE(r.valor, 0) - COALESCE(d.valor, 0) AS lucro
FROM meses m
LEFT JOIN receita  r ON r.mes = m.mes
LEFT JOIN despesa  d ON d.mes = m.mes
ORDER BY m.mes;
```

**Query de referência — Distribuição de Custos (todas empresas, mês corrente):**

```sql
WITH despesas_por_natureza AS (
  SELECT
    t.CODNAT,
    SUM(t.VLRDESDOB) AS valor
  FROM titulos t
  WHERE t.tipo = 'despesa'
    AND t.DTNEG >= '2026-05-01' AND t.DTNEG < '2026-06-01'
  GROUP BY t.CODNAT
),
despesas_por_categoria AS (
  SELECT
    COALESCE(nc.categoria, 'OUTROS') AS codigo,
    SUM(dpn.valor)                   AS valor
  FROM despesas_por_natureza dpn
  LEFT JOIN natureza_categoria nc ON nc.CODNAT = dpn.CODNAT
  GROUP BY COALESCE(nc.categoria, 'OUTROS')
),
totais AS (
  SELECT SUM(valor) AS total FROM despesas_por_categoria
)
SELECT
  cd.codigo,
  cd.descricao,
  cd.cor_hex AS cor,
  COALESCE(dpc.valor, 0)                                       AS valor,
  CASE WHEN t.total = 0 THEN 0 ELSE COALESCE(dpc.valor, 0) / t.total END AS percentual
FROM categorias_despesa cd
CROSS JOIN totais t
LEFT JOIN despesas_por_categoria dpc ON dpc.codigo = cd.codigo
ORDER BY cd.ordem;
```

**Query de referência — Posição de Caixa Prevista (mês corrente, todas empresas):**

```sql
WITH dias_do_mes AS (
  SELECT date('2026-05-01', '+' || n || ' days') AS data
  FROM (
    WITH RECURSIVE r(n) AS (
      SELECT 0 UNION ALL SELECT n + 1 FROM r WHERE n < 30
    )
    SELECT n FROM r
  )
  WHERE date('2026-05-01', '+' || n || ' days') < '2026-06-01'
),
entradas AS (
  SELECT date(DHBAIXA) AS data, SUM(VLRDESDOB) AS valor
  FROM titulos
  WHERE tipo = 'receita'
    AND DHBAIXA >= '2026-05-01' AND DHBAIXA < '2026-06-01'
  GROUP BY date(DHBAIXA)
),
saidas AS (
  SELECT date(DHBAIXA) AS data, SUM(VLRDESDOB) AS valor
  FROM titulos
  WHERE tipo = 'despesa'
    AND DHBAIXA >= '2026-05-01' AND DHBAIXA < '2026-06-01'
  GROUP BY date(DHBAIXA)
)
SELECT
  d.data,
  COALESCE(e.valor, 0)                          AS entradas,
  COALESCE(s.valor, 0)                          AS saidas,
  COALESCE(e.valor, 0) - COALESCE(s.valor, 0)   AS saldo,
  SUM(COALESCE(e.valor, 0) - COALESCE(s.valor, 0)) OVER (ORDER BY d.data) AS saldo_acumulado
FROM dias_do_mes d
LEFT JOIN entradas e ON e.data = d.data
LEFT JOIN saidas   s ON s.data = d.data
ORDER BY d.data;
```

**Dependências de sync antes desses endpoints funcionarem:**

1. `empresas` populada (seed estático).
2. `tipos_operacao` populada — para confirmar `TIPMOV='V'` (ver tela 14.1).
3. `pedidos` populada — full sync inicial de pelo menos 6 meses (para DRE).
4. `titulos` populada — full sync inicial de pelo menos 6 meses (para DRE).
5. `naturezas` populada — para que o seed `natureza_categoria` possa ser gerado.
6. `natureza_categoria` seedado manualmente — antes do donut funcionar. **Sem o seed, o donut mostra 100% em "OUTROS"**, o que não é bug mas é UX ruim.

**Riscos específicos desta funcionalidade:**

- **"Despesas Totais" cresce com o tempo:** títulos de despesa lançados em janeiro continuam contando se o usuário selecionar "TUDO" no seletor. Definir se "TUDO" tem um teto (ex.: últimos 12 meses) ou se é literalmente desde o início dos dados. Recomendo limitar a **ano corrente** ou últimos 12 meses para não distorcer a margem.
- **DRE com mês corrente incompleto:** o mês atual aparece com receita e despesa **parciais** (até hoje). Frontend deve marcar visualmente o mês corrente (ex.: tracejado ou opacidade) para diretoria não comparar com mês fechado.
- **Donut com `OUTROS` dominante:** se o seed manual de `natureza_categoria` ficar incompleto, `OUTROS` pode acabar sendo a maior fatia, escondendo a informação útil. Adicionar warning no log de boot quando `OUTROS > 30%` do total.
- **Posição de Caixa com `DHBAIXA`:** dados podem mostrar caixa muito otimista (todo título "previsto" entra como se fosse acontecer). Mitigar com o disclaimer na UI até o `DHCONCIL` ser validado.
- **Tela "AO VIVO":** indicador da imagem implica polling agressivo no front. Manter polling de 60s (sync interno do snapshot é de 5 min — polling mais rápido que isso não traz dado novo).

### 14.3. (a preencher)

---

## 15. Cobertura Sankhya e estratégia de filtragem

> **Premissa de trabalho (definida em 2026-05-14):** assumimos que `BIMKR`
> tem ou terá permissão em todas as entidades listadas abaixo. Quando uma
> request falhar com `401`/`403`, abre-se um chamado interno para liberação
> em paralelo — **não bloqueia o desenvolvimento**. A entidade `Empresa`
> é a única exceção confirmada (workaround: seed estático na tabela
> `empresas`, ver seção 4).

### 15.1. Premissas de cobertura por entidade

| Tabela SQLite | Entidade Sankhya | Premissa |
|---|---|---|
| `empresas` | `Empresa` (TGFEMP) | 🔒 Sem permissão (confirmado). Seed estático até liberação. |
| `parceiros` | `Parceiro` (TGFPAR) | Assumida concedida. |
| `produtos` | `Produto` (TGFPRO) | Assumida concedida. |
| `vendedores` | `Vendedor` (TGFVEN) | Assumida concedida. |
| `tipos_operacao` | `TipoOperacao` (TGFTOP) | Assumida concedida. **Crítica para 14.1** (definir `TIPMOV`). |
| `tipos_titulo` | `TipoTitulo` (TGFTPT) | Assumida concedida. |
| `naturezas` | `Natureza` (TGFNAT) | Assumida concedida. **Necessária** para gerar seed de `natureza_categoria` (14.2). |
| `titulos` | `Financeiro` (TGFFIN) | ✅ **Validada** — funcionando hoje em `/api/receber` e `/api/pagar`. |
| `pedidos` | `CabecalhoNota` (TGFCAB) | Assumida concedida. **Crítica para 14.1 e 14.2**. |
| `pedido_itens` | `ItemNota` (TGFITE) | Assumida concedida. |

### 15.2. Estratégia de filtragem em 3 níveis

**Nível 1 — Filtro no Sankhya** (via `criteria.expression` no `loadRecords`):

| Tabela | Filtro de sync inicial (full) | Filtro incremental |
|---|---|---|
| `parceiros` | `this.ATIVO = 'S'` | `modifiedSince` ou full a cada 30 min |
| `produtos` | `this.ATIVO = 'S'` | idem |
| `vendedores` | `this.ATIVO = 'S'` | idem |
| `tipos_operacao` | `this.ATIVO = 'S'` | full 1 h |
| `tipos_titulo`, `naturezas` | sem filtro | full 1 h |
| `titulos` | `this.DTNEG >= TO_DATE('01/01/2025','DD/MM/YYYY')` | `modifiedSince` ou DTNEG >= `last_synced_at` |
| `pedidos` | `this.DTNEG >= TO_DATE('01/01/2025','DD/MM/YYYY') AND this.STATUSNOTA = 'L'` | `modifiedSince` ou DTNEG >= `last_synced_at` |
| `pedido_itens` | `this.NUNOTA IN (lote sincronizado nessa rodada)` | acompanha o sync de `pedidos` |

12-18 meses de retroatividade no full inicial cobrem DRE 6 meses + tela "anual" com folga.

**Nível 2 — Transformação no backend antes do INSERT**:

Já listada na seção 9 do documento (campos derivados). Adicionalmente:

- Converter `dd/MM/yyyy` → `YYYY-MM-DD` em todas as colunas de data.
- Converter `dd/MM/yyyy HH:mm:ss` → `YYYY-MM-DD HH:MM:SS` nas colunas `DH*`.
- Aplicar `parseDecimalBR` em todos os valores monetários (confirmar formato `1234.56` vs `1.234,56` em retornos da Sankhya antes de codar).
- Quando o filtro tiver string (datas, nomes), usar `parameter[]` tipados em vez de template string — ver `STATUS_PROJECT.md` §11 dívida 1.

**Nível 3 — Filtro no SQL ao atender o endpoint**:

Filtros que variam por request (empresa, período, status). Coberto nas queries das seções 14.1 e 14.2.

### 15.3. Validação Postman (checklist — fazer antes do sync de cada entidade)

Cada teste responde uma pergunta concreta sobre a API. Marcar conforme valida:

- [ ] **`TipoOperacao`:** `loadRecords` com `fieldset.list="CODTIPOPER,DESCROPER,TIPMOV,ATIVO"` e `expression="this.ATIVO='S'"`. **Espera:** confirma qual literal de `TIPMOV` corresponde a venda. Salvar a lista — vira referência do filtro de `pedidos`.
- [ ] **`CabecalhoNota`:** `loadRecords` em um `NUNOTA` conhecido. **Espera:** retorno OK ou 403. Se 403, abrir chamado e seguir com mock até a liberação.
- [ ] **`Parceiro`:** `loadRecords` com `fieldset.list="CODPARC,NOMEPARC,CGC_CPF,TIPPESSOA,CLIENTE,FORNECEDOR,ATIVO"`. **Espera:** confirmar se `CLIENTE` e `FORNECEDOR` voltam como `'S'/'N'`.
- [ ] **`Natureza`:** `loadRecords` sem filtro. **Espera:** lista das ~30 naturezas — input do seed `natureza_categoria.json` (14.2).
- [ ] **`Financeiro` com `DHCONCIL`/`DTCONTAB`:** `loadRecords` com esses campos em `fieldset.list` em títulos já baixados. **Espera:** confirma se vêm preenchidos. Resposta destrava 14.2 e a tela `/api/recebidos`.
- [ ] **`modifiedSince`:** `loadRecords` em `Financeiro` com query string `modifiedSince=2026-05-13T00:00:00`. **Espera:** lista filtrada ou erro indicando `LogAlteracoesTabelas` inativo. Se inativo, cair em full sync de 5 min — funciona, só consome mais quota.

### 15.4. Como tratar permissões negadas no código

- Sync de cada entidade tem `try/catch`. Erro `401`/`403` é **capturado, logado, e o ciclo da entidade marca `sync_state.last_error`**, mas o orquestrador **continua sincronizando as outras entidades**.
- Endpoints que dependem de entidade sem permissão retornam `{ rows: [], stale: true, fetchedAt: null, reason: "permission_denied" }` em vez de quebrar.
- Health check estendido (seção 8.3) lista qual entidade está com erro — frontend pode mostrar banner "MK CENTRO sem dados — verificando permissão".

---

## Referências cruzadas

- `STATUS_PROJECT.md` — visão executiva atualizada do projeto (referência principal).
- `PLAN.md` seções 4 (stack), 6 (contract), 8 (decisões), Fase 4 (snapshot).
- `STATUS_PROJECT.md` §11 (Dívidas técnicas) — `parameter[]` tipados,
  `useFileBasedPagination`, testes mínimos, e demais débitos vindos da
  revisão original (PLAN_REVIEW.md foi consolidado e removido em 2026-05-15).
- `STATUS_PROJECT.md` §7 (Regras de negócio) — multi-empresa,
  `DHBAIXA` vs `DHCONCIL`, faturamento real.
- `ROTAS.md` — catálogo de rotas REST do backend.
