-- ============================================================================
-- Schema do snapshot SQLite — Dashboard Sankhya
--
-- Este arquivo é a fonte da verdade do DDL. Toda mudança incompatível bumpa
-- metadata.schema_version e adiciona um bloco "-- vN" abaixo do anterior.
--
-- Referência: PLAN_DATA_BASE.md seções 5 (schema), 6 (índices) e 14 (telas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- metadata: controle interno (versão do schema, flags)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO metadata (key, value) VALUES
  ('schema_version', '2'),
  ('created_at',     CURRENT_TIMESTAMP);

-- ----------------------------------------------------------------------------
-- sync_state: rastreia última sincronização por entidade
--   resolve item 11 do PLAN_REVIEW (granularidade do `stale`)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  entity            TEXT PRIMARY KEY,
  last_synced_at    TEXT,
  last_full_sync_at TEXT,
  last_error        TEXT,
  success_count     INTEGER NOT NULL DEFAULT 0,
  error_count       INTEGER NOT NULL DEFAULT 0,
  row_count         INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- empresas: seed estático (entidade Empresa bloqueada para BIMKR)
--   ver PLAN.md seção 9 (multi-empresa)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  CODEMP        INTEGER PRIMARY KEY,
  NOMEFANTASIA  TEXT NOT NULL,
  RAZAOSOCIAL   TEXT,
  CGC           TEXT,
  ativa         INTEGER NOT NULL DEFAULT 1,
  ordem         INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT
);

-- ----------------------------------------------------------------------------
-- parceiros: clientes + fornecedores (a flag separa)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parceiros (
  CODPARC       INTEGER PRIMARY KEY,
  NOMEPARC      TEXT NOT NULL,
  RAZAOSOCIAL   TEXT,
  CGC_CPF       TEXT,
  TIPPESSOA     TEXT,
  EMAIL         TEXT,
  TELEFONE      TEXT,
  CELULAR       TEXT,
  DTCAD         TEXT,
  LIMCRED       REAL NOT NULL DEFAULT 0,
  CIDADE        TEXT,
  UF            TEXT,
  is_cliente    INTEGER NOT NULL DEFAULT 0,
  is_fornecedor INTEGER NOT NULL DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  synced_at     TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- produtos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produtos (
  CODPROD       INTEGER PRIMARY KEY,
  DESCRPROD     TEXT NOT NULL,
  REFERENCIA    TEXT,
  MARCA         TEXT,
  USOPROD       TEXT,
  CODVOL        TEXT,
  CODGRUPOPROD  INTEGER,
  GRUPO_DESCR   TEXT,
  UNIDADE       TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  synced_at     TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- estoque de produtos (inventário por produto e local)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produto_estoque (
  CODEMP        INTEGER NOT NULL DEFAULT 0,
  CODPROD       INTEGER NOT NULL,
  CODLOCALORIG  INTEGER NOT NULL DEFAULT 0,
  CONTROLE      TEXT NOT NULL DEFAULT '',
  CODPARC       INTEGER NOT NULL DEFAULT 0,
  TIPO          TEXT NOT NULL DEFAULT '',
  ESTOQUE       REAL NOT NULL DEFAULT 0,
  EST_MINIMO    REAL NOT NULL DEFAULT 0,
  EST_MAXIMO    REAL NOT NULL DEFAULT 0,
  UNIDADE       TEXT,
  LOCAL_DESCR   TEXT,
  EMPRESA_NOMEFANTASIA TEXT,
  PARCEIRO_NOMEPARC TEXT,
  synced_at     TEXT NOT NULL,
  PRIMARY KEY (CODEMP, CODPROD, CODLOCALORIG, CONTROLE, CODPARC, TIPO),
  FOREIGN KEY (CODPROD) REFERENCES produtos(CODPROD)
);

CREATE INDEX IF NOT EXISTS idx_produto_estoque_prod ON produto_estoque(CODPROD);
CREATE INDEX IF NOT EXISTS idx_produto_estoque_emp ON produto_estoque(CODEMP);

-- ----------------------------------------------------------------------------
-- vendedores
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendedores (
  CODVEND       INTEGER PRIMARY KEY,
  APELIDO       TEXT NOT NULL,
  ativo         INTEGER NOT NULL DEFAULT 1,
  synced_at     TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- tipos_operacao: TGFTOP. Define se um pedido é Venda (V) ou Compra (C)
--   resolve item 1 do PLAN_REVIEW (TIPMOV é chave pra TGFTOP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_operacao (
  CODTIPOPER  INTEGER PRIMARY KEY,
  DESCROPER   TEXT NOT NULL,
  TIPMOV      TEXT NOT NULL,
  ATIVO       INTEGER NOT NULL DEFAULT 1,
  synced_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tipos_operacao_tipmov ON tipos_operacao(TIPMOV);

-- ----------------------------------------------------------------------------
-- tipos_titulo + naturezas: dimensões pequenas para join legível
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_titulo (
  CODTIPTIT   INTEGER PRIMARY KEY,
  DESCRTIPTIT TEXT NOT NULL,
  synced_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS naturezas (
  CODNAT      INTEGER PRIMARY KEY,
  DESCRNAT    TEXT NOT NULL,
  synced_at   TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- titulos: Financeiro (contas a receber + a pagar)
--
-- Campos derivados (preenchidos pelo sync, NÃO vêm do Sankhya):
--   tipo          'receber' (RECDESP=1) | 'pagar' (RECDESP=-1)
--   valor_aberto  VLRDESDOB - VLRBAIXA quando DHBAIXA IS NULL, senão 0
--   is_em_aberto  1 quando DHBAIXA IS NULL, senão 0
--
-- NOTA: FKs de CODPARC/CODTIPTIT/CODNAT removidas no MVP (mesma decisão de
-- `pedidos` — parceiros ainda não tem sync, e títulos podem referenciar
-- CODTIPTIT/CODNAT pontuais que não passariam no enforcement). Reativar via
-- migration quando todos os syncs estiverem maduros. FK em CODEMP mantida;
-- o sync auto-cria stubs de empresas desconhecidas (mesmo padrão de pedidos).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS titulos (
  NUFIN         INTEGER PRIMARY KEY,
  CODEMP        INTEGER NOT NULL,
  CODPARC       INTEGER NOT NULL,
  CODTIPTIT     INTEGER,
  CODNAT        INTEGER,
  RECDESP       INTEGER NOT NULL,
  PROVISAO      TEXT,
  tipo          TEXT NOT NULL,
  DTNEG         TEXT,
  DTVENC        TEXT,
  DHBAIXA       TEXT,
  DHCONCIL      TEXT,
  DTCONTAB      TEXT,
  VLRDESDOB     REAL NOT NULL DEFAULT 0,
  VLRBAIXA      REAL NOT NULL DEFAULT 0,
  valor_aberto  REAL NOT NULL DEFAULT 0,
  is_em_aberto  INTEGER NOT NULL DEFAULT 1,
  synced_at     TEXT NOT NULL,
  FOREIGN KEY (CODEMP) REFERENCES empresas(CODEMP)
);

-- ----------------------------------------------------------------------------
-- pedidos: CabecalhoNota (vendas + compras + devoluções)
--
-- NOTA: FKs removidas no MVP porque as tabelas-pai (parceiros, vendedores)
-- ainda não são sincronizadas; e o seed de `empresas` cobre 7 CODEMPs
-- conhecidos, mas o Sankhya pode retornar pedidos de CODEMPs 3/4/7/9/10
-- (alertado em PLAN.md seção 9). O service `syncPedidos` insere uma
-- empresa stub automaticamente quando encontra CODEMP desconhecido.
-- As FKs voltam via migration quando todos os syncs estiverem rodando.
-- Ver PLAN_DATA_BASE.md seção 13 (riscos).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  NUNOTA      INTEGER PRIMARY KEY,
  CODEMP      INTEGER NOT NULL,
  CODPARC     INTEGER NOT NULL,
  CODVEND     INTEGER,
  CODTIPOPER  INTEGER NOT NULL,
  TIPMOV      TEXT NOT NULL,
  NUMNOTA     INTEGER,
  SERIENOTA   TEXT,
  DTNEG       TEXT NOT NULL,
  DTFATUR     TEXT,
  DTENTSAI    TEXT,
  CODPARCTRANSP INTEGER,
  TRANSPORTADORA_NOME TEXT,
  CIF_FOB     TEXT,
  QTDVOL      REAL NOT NULL DEFAULT 0,
  STATUSNOTA  TEXT,
  VLRNOTA     REAL NOT NULL DEFAULT 0,
  VLRDESC     REAL NOT NULL DEFAULT 0,
  VLRFRETE    REAL NOT NULL DEFAULT 0,
  AD_OBS      TEXT,
  synced_at   TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- pedido_itens: ItemNota
--   FKs removidas no MVP pelo mesmo motivo de `pedidos` acima.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_itens (
  NUNOTA       INTEGER NOT NULL,
  SEQUENCIA    INTEGER NOT NULL,
  CODPROD      INTEGER NOT NULL,
  QTDNEG       REAL NOT NULL DEFAULT 0,
  VLRUNIT      REAL NOT NULL DEFAULT 0,
  VLRTOT       REAL NOT NULL DEFAULT 0,
  VLRDESC      REAL NOT NULL DEFAULT 0,
  CODLOCALORIG INTEGER,
  synced_at    TEXT NOT NULL,
  PRIMARY KEY (NUNOTA, SEQUENCIA)
);

-- ============================================================================
-- v2 (2026-05-14): categorização de despesas para o donut da tela Financeira
--   ver PLAN_DATA_BASE.md seção 14.2.
--   Naturezas Sankhya (~30) são agrupadas em 6 categorias macro.
--   'OUTROS' funciona como fallback — nenhum gasto desaparece do total.
-- ============================================================================

CREATE TABLE IF NOT EXISTS categorias_despesa (
  codigo     TEXT PRIMARY KEY,
  descricao  TEXT NOT NULL,
  cor_hex    TEXT,
  ordem      INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO categorias_despesa (codigo, descricao, cor_hex, ordem) VALUES
  ('CMV',        'Custo da Mercadoria Vendida',  '#FFD600', 1),
  ('PESSOAL',    'Pessoal e Encargos',           '#3B82F6', 2),
  ('LOGISTICA',  'Logística e Transporte',       '#10B981', 3),
  ('ADMIN',      'Administrativo',               '#A855F7', 4),
  ('MARKETING',  'Marketing e Publicidade',      '#EF4444', 5),
  ('OUTROS',     'Outros',                       '#6B7280', 99);

CREATE TABLE IF NOT EXISTS natureza_categoria (
  CODNAT    INTEGER PRIMARY KEY,
  categoria TEXT NOT NULL,
  FOREIGN KEY (CODNAT)    REFERENCES naturezas(CODNAT),
  FOREIGN KEY (categoria) REFERENCES categorias_despesa(codigo)
);

-- ============================================================================
-- Índices (justificados por endpoint — ver PLAN_DATA_BASE.md seção 6)
-- ============================================================================

-- /api/receber, /api/pagar
CREATE INDEX IF NOT EXISTS idx_titulos_emp_aberto_tipo
  ON titulos(CODEMP, is_em_aberto, tipo);

-- /api/dashboard/aging-receber
CREATE INDEX IF NOT EXISTS idx_titulos_emp_tipo_venc
  ON titulos(CODEMP, tipo, DTVENC)
  WHERE is_em_aberto = 1;

-- /api/recebidos (range em DHCONCIL ou DHBAIXA)
CREATE INDEX IF NOT EXISTS idx_titulos_emp_concil ON titulos(CODEMP, DHCONCIL);
CREATE INDEX IF NOT EXISTS idx_titulos_emp_baixa  ON titulos(CODEMP, DHBAIXA);

-- /api/vendas, /api/compras, /api/dashboard/faturamento*
CREATE INDEX IF NOT EXISTS idx_pedidos_emp_tipmov_dtneg
  ON pedidos(CODEMP, TIPMOV, DTNEG);

-- /api/dashboard/empresa/* e /api/dashboard/vendedores/*
-- As telas usam faturamento por DTFATUR/CODTIPOPER, não DTNEG/TIPMOV.
CREATE INDEX IF NOT EXISTS idx_pedidos_faturamento_status_dt_top_emp
  ON pedidos(STATUSNOTA, DTFATUR, CODTIPOPER, CODEMP);

CREATE INDEX IF NOT EXISTS idx_pedidos_faturamento_vend_status_dt_top
  ON pedidos(CODVEND, STATUSNOTA, DTFATUR, CODTIPOPER);

-- /api/dashboard/top-clientes (pesado, reavaliar)
CREATE INDEX IF NOT EXISTS idx_pedidos_emp_tipmov_parc_dtneg
  ON pedidos(CODEMP, TIPMOV, CODPARC, DTNEG);

-- Joins
CREATE INDEX IF NOT EXISTS idx_pedido_itens_prod ON pedido_itens(CODPROD);

-- Autocomplete
CREATE INDEX IF NOT EXISTS idx_parceiros_nome ON parceiros(NOMEPARC);
CREATE INDEX IF NOT EXISTS idx_produtos_descr ON produtos(DESCRPROD);

-- v2: tela Financeira (14.2)
CREATE INDEX IF NOT EXISTS idx_titulos_emp_tipo_dtneg
  ON titulos(CODEMP, tipo, DTNEG);

CREATE INDEX IF NOT EXISTS idx_titulos_emp_natureza_dtneg
  ON titulos(CODEMP, CODNAT, DTNEG)
  WHERE tipo = 'despesa';

CREATE INDEX IF NOT EXISTS idx_titulos_rec_prov_dtneg
  ON titulos(RECDESP, PROVISAO, DTNEG);

CREATE INDEX IF NOT EXISTS idx_titulos_aberto_rec_prov
  ON titulos(is_em_aberto, RECDESP, PROVISAO);

CREATE INDEX IF NOT EXISTS idx_titulos_dhbaixa
  ON titulos(DHBAIXA);

CREATE INDEX IF NOT EXISTS idx_natcat_categoria
  ON natureza_categoria(categoria);
