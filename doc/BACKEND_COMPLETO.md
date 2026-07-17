# BACKEND_COMPLETO - Sankya API / CIP

Documento consolidado do backend criado ate agora.

Atualizado em: 2026-06-29
Fonte: codigo em `backend/src`, `backend/package.json`, `backend/railway.json` e `backend/src/db/schema.sql`.

## 1. Visao geral

O backend e uma API Node.js em TypeScript que atende o dashboard CIP do Grupo MKR. Ele integra com o Sankhya Gateway, sincroniza dados para um snapshot SQLite local e expoe rotas REST para o frontend.

Objetivo principal:

- Evitar que o frontend chame o Sankhya diretamente.
- Proteger credenciais do ERP.
- Melhorar performance do dashboard usando consultas locais no SQLite.
- Manter a interface utilizavel mesmo se o Sankhya estiver lento ou indisponivel, usando o ultimo snapshot sincronizado.

Stack atual:

- Node.js `>=22.12.0`
- TypeScript
- Express 5
- better-sqlite3
- Zod
- Pino
- Sankhya Gateway OAuth 2.0 / CRUDServiceProvider
- Autenticacao propria por TOTP + token de sessao HMAC

Diretorio principal:

```text
backend/
|-- package.json
|-- railway.json
|-- tsconfig.json
|-- scripts/
`-- src/
    |-- auth.ts
    |-- config.ts
    |-- server.ts
    |-- db/
    |-- routes/
    |-- sankhya/
    |-- services/
    |-- sync/
    `-- utils/
```

## 2. Como rodar

Instalar dependencias:

```bash
cd backend
npm install
```

Rodar em desenvolvimento:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Start em producao:

```bash
npm run start
```

Scripts do `package.json`:

| Script | Funcao |
|---|---|
| `npm run dev` | Roda `tsx watch src/server.ts` |
| `npm run build` | Compila TypeScript e copia `src/db/schema.sql` para `dist/db/schema.sql` |
| `npm run start` | Roda `node dist/server.js` |
| `npm run sync:estoque` | Executa sync manual de estoque via `scripts/sync-estoque.ts` |

## 3. Variaveis de ambiente

Carregamento:

- `backend/src/config.ts` procura primeiro `../.env` a partir do diretorio atual.
- Depois procura `.env` no diretorio atual.
- Variaveis sao validadas com Zod; se algo obrigatorio estiver invalido, o processo encerra.

Variaveis:

| Variavel | Obrigatoria | Default | Uso |
|---|---:|---|---|
| `SANKHYA_BASE_URL` | Sim | - | Base URL do Sankhya Gateway |
| `SANKHYA_CLIENT_ID` | Sim | - | OAuth client id |
| `SANKHYA_CLIENT_SECRET` | Sim | - | OAuth client secret |
| `SANKHYA_TOKEN` | Sim | - | Token gateway enviado no login Sankhya |
| `APP_TOTP_SECRET` | Sim | - | Segredo Base32 do autenticador |
| `APP_SESSION_SECRET` | Sim | - | Segredo para assinar token de sessao |
| `PORT` | Nao | `3000` | Porta HTTP |
| `LOG_LEVEL` | Nao | `info` | Nivel do Pino |
| `CORS_ORIGINS` | Nao | `http://localhost:8080,http://localhost:5173` | Origens permitidas |
| `DATABASE_PATH` | Nao | `./data/snapshot.db` | Caminho do SQLite |
| `VIACERTA_ACTIVE_USERS_URL` | Nao | URL fixa atual | Endpoint externo Via Certa |
| `SYNC_INTERVAL_MS` | Nao | `300000` | Intervalo hot de sync, em ms |
| `SYNC_INTERVAL_SLOW_MS` | Nao | `1800000` | Intervalo slow de sync, em ms |
| `SYNC_ENABLED` | Nao | `true` | Liga/desliga scheduler |

Observacao: `APP_TOTP_SECRET` precisa ter no minimo 16 caracteres e ser compativel com Base32.

## 4. Bootstrap da API

Arquivo principal: `backend/src/server.ts`.

Fluxo ao subir:

1. Carrega configuracao.
2. Cria logger Pino.
3. Executa `migrate()` para preparar o SQLite.
4. Inicia o scheduler de sincronizacao.
5. Cria app Express.
6. Configura CORS.
7. Configura JSON parser.
8. Aplica headers `no-cache` para rotas `/api`.
9. Registra logs de request.
10. Monta o router principal em `/api`, protegido por `requireApiToken`.
11. Registra middleware global de erro.
12. Inicia `listen(config.PORT)`.

Tratamento de erro:

- `ZodError`: HTTP 400 com `{ error: "validation_error", details }`.
- Erro do Sankhya no formato `Sankhya NNN:`: status correspondente quando aplicavel, ou 502.
- Outros erros: HTTP 500 com `{ error: "internal_error", message }`.

## 5. Autenticacao do dashboard

Arquivo: `backend/src/auth.ts`.

Rotas publicas:

- `GET /api/health`
- `GET /api/auth/setup`
- `POST /api/auth/validate`

Todas as demais rotas em `/api` exigem:

```http
Authorization: Bearer <accessToken>
```

### 5.1 Setup TOTP

`GET /api/auth/setup`

Retorna dados para configurar autenticador:

- `account`
- `issuer`
- `manualKey`
- `otpauthUrl`
- `qrCodeUrl`

O QR code e gerado via `quickchart.io`.

### 5.2 Validacao TOTP

`POST /api/auth/validate`

Body:

```json
{
  "code": "123456"
}
```

Se o codigo TOTP for valido, retorna:

```json
{
  "ok": true,
  "accessToken": "...",
  "expiresAt": "2026-06-29T18:00:00.000Z"
}
```

Detalhes:

- TOTP usa SHA1, 6 digitos e janela de 30 segundos.
- O backend aceita uma janela de tolerancia de `-4` a `+4` steps.
- Token de sessao expira em 8 horas.
- Token e assinado com HMAC-SHA256 usando `APP_SESSION_SECRET`.

### 5.3 Sessao

`GET /api/auth/session`

Rota protegida. Se o token for valido, retorna:

```json
{ "ok": true }
```

## 6. Banco de dados SQLite

Arquivos:

- `backend/src/db/connection.ts`
- `backend/src/db/migrate.ts`
- `backend/src/db/schema.sql`

O banco e criado no caminho `DATABASE_PATH`. A conexao usa:

- `journal_mode = WAL`
- `synchronous = NORMAL`
- `foreign_keys = ON`
- `temp_store = MEMORY`
- `busy_timeout = 5000`
- `cache_size = -20000`

Versao esperada do schema: `2`.

Se o valor em `metadata.schema_version` divergir de `2`, o backend sobe erro e exige migracao manual.

### 6.1 Tabelas principais

| Tabela | Conteudo |
|---|---|
| `metadata` | Versao do schema e metadados internos |
| `sync_state` | Estado de cada sincronizacao |
| `empresas` | Empresas seedadas e stubs automaticos |
| `parceiros` | Clientes e fornecedores |
| `produtos` | Cadastro de produtos |
| `produto_estoque` | Snapshot de estoque por empresa, produto, local, controle, parceiro e tipo |
| `vendedores` | Vendedores Sankhya |
| `tipos_operacao` | TGFTOP / tipos de operacao |
| `tipos_titulo` | Tipos de titulo financeiro |
| `naturezas` | Plano de contas / naturezas financeiras |
| `titulos` | Financeiro Sankhya, contas a receber e pagar |
| `pedidos` | CabecalhoNota, vendas/compras/devolucoes conforme TOP |
| `pedido_itens` | Itens de nota; tabela existe, mas nao ha sync ativo no codigo atual |
| `categorias_despesa` | Categorias macro para despesas |
| `natureza_categoria` | Mapeamento manual natureza -> categoria |

### 6.2 Campos derivados importantes

Em `titulos`:

- `tipo`: `receber` quando `RECDESP > 0`; `pagar` quando `RECDESP < 0`.
- `valor_aberto`: `VLRDESDOB - VLRBAIXA` quando `DHBAIXA` e nulo; caso contrario `0`.
- `is_em_aberto`: `1` quando `DHBAIXA` e nulo; caso contrario `0`.

Em `pedidos`:

- `TIPMOV` e preenchido a partir de `tipos_operacao`, pois vem do relacionamento com TGFTOP.
- Empresas desconhecidas sao criadas como stubs com `ordem = 99`.

### 6.3 Indices relevantes

O schema cria indices para:

- Contas abertas por empresa/tipo/status.
- Titulos por vencimento, conciliacao e baixa.
- Pedidos por empresa, movimento e datas.
- Faturamento por `STATUSNOTA`, `DTFATUR`, `CODTIPOPER`, `CODEMP`.
- Faturamento por vendedor.
- Joins de itens/produtos.
- Autocomplete de parceiros/produtos.
- Distribuicao financeira por natureza.

## 7. Integracao com Sankhya

Arquivos:

- `backend/src/sankhya/client.ts`
- `backend/src/sankhya/crud.ts`
- `backend/src/sankhya/decoder.ts`
- `backend/src/sankhya/types.ts`

### 7.1 Autenticacao Sankhya

O backend usa OAuth client credentials:

- POST em `${SANKHYA_BASE_URL}/authenticate`
- Header `X-Token: SANKHYA_TOKEN`
- Body `client_id`, `client_secret`, `grant_type=client_credentials`

O access token fica em cache ate 60 segundos antes de expirar.

Protecoes implementadas:

- `inflight` promise para evitar varios logins simultaneos.
- Renovacao automatica quando o payload indica token expirado `GTW3403`.

### 7.2 CRUDServiceProvider

Funcao principal:

```ts
loadAllRecords({
  rootEntity,
  fields,
  expression
})
```

Ela chama:

- Path: `/gateway/v1/mge/service.sbr`
- Query: `serviceName=CRUDServiceProvider.loadRecords`
- `outputType=json`
- `includePresentationFields=S`
- Paginacao por `offsetPage`

O decoder le `metadata.fields.field` e converte entidades `f0`, `f1`, etc. para objetos com nomes de campo reais.

Retry:

- Ate 4 tentativas.
- Retry para `fetch failed`, HTTP 429, HTTP 5xx e causas transientes como timeout/ECONNRESET/EAI_AGAIN.

Limite defensivo:

- `loadAllRecords` interrompe se passar de 1000 paginas.

## 8. Sincronizacao

Arquivos:

- `backend/src/sync/scheduler.ts`
- `backend/src/sync/state.ts`
- `backend/src/sync/*.ts`

O scheduler inicia automaticamente junto com o servidor quando `SYNC_ENABLED=true`.

### 8.1 Estado de sync

Tabela: `sync_state`.

Campos:

- `entity`
- `last_synced_at`
- `last_full_sync_at`
- `last_error`
- `success_count`
- `error_count`
- `row_count`

Sucesso e erro sao registrados por `recordSyncSuccess()` e `recordSyncError()`.

### 8.2 Fluxo inicial

Ao subir:

1. Sempre roda `syncEmpresas`.
2. Em paralelo, roda se estiver faltando snapshot:
   - `tipos_operacao`
   - `naturezas`
   - `tipos_titulo`
   - `parceiros`
   - `vendedores`
   - `produtos`
3. Em paralelo, roda se estiver faltando snapshot:
   - `pedidos`
   - `titulos`
   - `estoque`

`runIfMissing` pula entidades que ja possuem `last_synced_at` e `row_count > 0`.

### 8.3 Fluxo periodico

Intervalo slow (`SYNC_INTERVAL_SLOW_MS`, default 30 min):

- `tipos_operacao`
- `naturezas`
- `tipos_titulo`
- `parceiros`
- `vendedores`

Intervalo hot (`SYNC_INTERVAL_MS`, default 5 min):

- `pedidos`
- `titulos`

Observacao importante:

- `produtos` e `estoque` so entram no fluxo inicial quando o snapshot esta ausente.
- Para atualizar estoque manualmente existe o script `npm run sync:estoque`.

### 8.4 Entidades sincronizadas

| Sync | Origem Sankhya | Destino SQLite | Observacoes |
|---|---|---|---|
| `syncEmpresas` | Seed local | `empresas` | Empresa Sankhya esta bloqueada; usa 7 empresas conhecidas |
| `syncTiposOperacao` | `TipoOperacao` | `tipos_operacao` | Filtra `this.ATIVO = 'S'` |
| `syncNaturezas` | `Natureza` | `naturezas` | Puxa tudo |
| `syncTiposTitulo` | `TipoTitulo` | `tipos_titulo` | Filtra `this.ATIVO = 'S'` |
| `syncParceiros` | `Parceiro` | `parceiros` | Filtra ativos; tenta fieldsets alternativos |
| `syncVendedores` | `Vendedor` | `vendedores` | Mapeia `ATIVO = 'S'` |
| `syncProdutos` | `Produto` | `produtos` | Cadastro base de produtos |
| `syncPedidos` | `CabecalhoNota` | `pedidos` | `DTNEG >= 01/01/2025` e `STATUSNOTA = 'L'` |
| `syncTitulos` | `Financeiro` | `titulos` | `DTNEG >= 01/01/2026` |
| `syncEstoque` | `Estoque` | `produto_estoque` | Apaga e recarrega todo estoque |

### 8.5 Empresas seedadas

| CODEMP | Nome |
|---:|---|
| 1 | MAKER MATRIZ |
| 2 | MY ROBOT FRANQUEADORA |
| 5 | MK CENTRO |
| 6 | MK E-COMMERCE |
| 8 | MAKER FILIAL |
| 11 | MAKER ATACADISTA |
| 12 | MAKER VAREJISTA |

Quando `pedidos` ou `titulos` encontram CODEMP desconhecido, o backend cria stub:

- `NOMEFANTASIA = EMPRESA <CODEMP>`
- `ordem = 99`

Stubs nao aparecem em `listarEmpresas`, pois a API filtra empresas visiveis com `ordem < 99`.

## 9. Regras de negocio implementadas

### 9.1 Faturamento real

O backend nao usa apenas `TIPMOV = 'V'`.

Regra canonica:

```sql
CODTIPOPER IN (FATURAMENTO_TOPS)
AND STATUSNOTA = 'L'
AND DTFATUR IS NOT NULL
```

Lista em `backend/src/services/operacoes.ts`:

```text
1100, 1107, 1111, 1716, 1733, 1763, 1776, 1795, 1797,
1801, 1802, 1705, 1766, 1769, 1770
```

### 9.2 Comodato

TOPs de saida:

```text
1109, 1772
```

TOPs de retorno:

```text
1203
```

Saldo ativo:

```text
historico_saida - historico_retorno
```

### 9.3 DRE

Arquivo: `backend/src/services/dashboard-financeiro.ts`.

Receita bruta da DRE vem de `pedidos`, usando `FATURAMENTO_TOPS`, `STATUSNOTA='L'` e `DTFATUR`.

Despesas/custos/impostos vem de `titulos`, usando:

- `DTNEG` no periodo.
- `PROVISAO = 'N'`.
- `RECDESP = -1`.
- Prefixo de `CODNAT`.

Categorias por prefixo:

| Prefixo | Categoria |
|---|---|
| `1` | Receitas |
| `2` | Custos / Estoques |
| `3` | Despesas Administrativas |
| `4` | Despesas Comerciais |
| `5` | Impostos / Tributos |
| `6` | Investimentos / CAPEX |
| `7` | Dividendos / Distribuicao |
| `8` | Servicos |

`despesas_total` soma apenas prefixos 2, 3, 4 e 5.

### 9.4 Fluxo de caixa

Usa `DHBAIXA` como data de caixa.

Entradas:

```sql
RECDESP = 1
```

Saidas:

```sql
RECDESP = -1
```

Observacao: ha uma duvida de negocio conhecida sobre `DHBAIXA`, que pode representar data prevista em alguns cenarios. Pode ser necessario validar `DHCONCIL` ou `DTCONTAB` para caixa realizado real.

### 9.5 Filtros padrao

`empresa`:

- Omitido, vazio ou `todas`: sem filtro.
- Numero: uma empresa.
- Lista `1,2,5`: SQL `CODEMP IN (...)`.

`vendedor`:

- Omitido, vazio ou `todos`: sem filtro.
- Numero: um vendedor.
- Lista `7,8,9`: SQL `CODVEND IN (...)`.
- Aceita `0` para vendedor sem atribuicao.

## 10. Services

### 10.1 `services/dashboard.ts`

Responsabilidades:

- Listar empresas visiveis.
- Listar vendedores.
- Listar produtos com saldo agregado.
- Calcular faturamento consolidado.
- Calcular faturamento por empresa.
- Montar resumo da tela de empresas.
- Calcular ranking de vendedores.
- Listar lancamentos do dia.
- Calcular comodato.

Funcoes exportadas principais:

- `listarEmpresas()`
- `listarVendedores()`
- `listarProdutos()`
- `faturamentoConsolidado(empresa, vendedor, data)`
- `faturamentoPorEmpresa(vendedor, data, periodo)`
- `empresasResumo(empresa, vendedor, data, periodo)`
- `vendedoresRanking(data, periodo)`
- `lancamentosHoje(vendedor, data)`
- `comodatoConsolidado(empresa)`

Periodos de vendas:

- `dia`
- `mes`
- `ano`

### 10.2 `services/dashboard-financeiro.ts`

Responsabilidades:

- DRE.
- Resumo financeiro consolidado.
- Fluxo de caixa.
- Distribuicao de despesas.
- Contas abertas.

Funcoes principais:

- `dre(filtro, periodo, intervalo)`
- `financeiroResumo(filtro, periodo, intervalo, fluxoMeses)`
- `fluxoCaixa(filtro, meses)`
- `distribuicaoDespesas(filtro, periodo, intervalo)`
- `listarContasAbertas({ filtro, tipo, page, pageSize })`
- `resumoContasAbertas(filtro, tipo)`

Suporta intervalo customizado:

- `dataInicio`
- `dataFim`
- `codTipOper`

### 10.3 `services/dashboard-estoque.ts`

Responsabilidade:

- Montar visao geral de estoque por empresa.

Retorna:

- KPIs de quantidade em estoque, abaixo do minimo, saldos negativos e cobertura media.
- Niveis por categoria/grupo.
- Alertas de estoque abaixo do minimo.
- Estoque por local.
- Linhas com saldo negativo.

Funcao:

- `estoqueVisaoGeral(empresa)`

### 10.4 `services/dashboard-clientes-rh.ts`

Responsabilidades:

- BI de clientes.
- BI de RH/vendedores.

Clientes:

- Total de clientes.
- Clientes ativos.
- Compradores do ano.
- Receita do ano.
- Ticket medio.
- Receber aberto.
- Receber vencido.
- Fluxo mensal de novos/recorrentes.
- Segmentos pessoa fisica/juridica/nao informado.
- Top clientes.

RH:

- Total de vendedores.
- Vendedores ativos.
- Vendedores com venda.
- Faturamento anual.
- Ticket medio.
- Media por vendedor ativo.
- Faturamento por empresa.
- Ranking.
- Serie mensal.

Funcoes:

- `clientesBI()`
- `rhBI()`

### 10.5 `services/dashboard-entregas.ts`

Responsabilidade:

- BI de entregas/logistica usando dados de `pedidos`.

Regra:

- SLA fixo de 3 dias.
- Base logistica usa `FATURAMENTO_TOPS` e `STATUSNOTA='L'`.

Retorna:

- Total de notas.
- Entregas no prazo.
- Atrasadas.
- Em transito.
- Percentual on-time.
- Prazo medio.
- Frete total.
- Volumes.
- Historico mensal.
- Ranking de transportadoras.
- Entregas recentes.

Funcao:

- `entregasBI()`

### 10.6 `services/viacerta.ts`

Responsabilidade:

- Integrar com endpoint externo da Via Certa para relatorio de alunos ativos.

Metodo:

- POST `application/x-www-form-urlencoded`
- Campos `month` e `year`

Funcao:

- `alunosAtivosViaCerta({ month, year })`

### 10.7 `services/operacoes.ts`

Contem listas de TOPs de negocio:

- `FATURAMENTO_TOPS`
- `COMODATO_SAIDA_TOPS`
- `COMODATO_RETORNO_TOPS`

Tambem expoe:

- `inListClause(coluna, ids)`

## 11. Rotas HTTP

Todas as rotas estao sob `/api`.

### 11.1 Publicas

| Metodo | Rota | Funcao |
|---|---|---|
| GET | `/api/health` | Status, caminho do banco, sync state e contagens |
| GET | `/api/auth/setup` | Dados para cadastrar TOTP |
| POST | `/api/auth/validate` | Valida TOTP e gera token |

### 11.2 Autenticacao

| Metodo | Rota | Funcao |
|---|---|---|
| GET | `/api/auth/session` | Valida sessao atual |

### 11.3 Cadastros

| Metodo | Rota | Funcao |
|---|---|---|
| GET | `/api/empresas` | Lista empresas visiveis |
| GET | `/api/vendedores` | Lista vendedores |

### 11.4 Dashboard - Empresas e vendas

| Metodo | Rota | Query params | Funcao |
|---|---|---|---|
| GET | `/api/dashboard/empresa/faturamento` | `empresa`, `vendedor`, `data` | KPIs dia, 7 dias, mes, ano |
| GET | `/api/dashboard/empresa/faturamento-por-empresa` | `vendedor`, `data`, `periodo` | Distribuicao por empresa |
| GET | `/api/dashboard/empresa/resumo` | `empresa`, `vendedor`, `data`, `periodo` | Empresas, vendedores, faturamento e DRE |
| GET | `/api/dashboard/empresa/comodato` | `empresa` | Saidas, retornos e saldo de comodato |
| GET | `/api/dashboard/vendedores/ranking` | `data`, `periodo` | Ranking de vendedores |
| GET | `/api/dashboard/vendedores/hoje` | `vendedor`, `data` | Ultimos lancamentos do dia |
| GET | `/api/dashboard/produtos` | - | Lista produtos ativos com estoque agregado |

Valores de `periodo` para vendas:

- `dia`
- `mes`
- `ano`

Formato de `data`:

```text
YYYY-MM-DD
```

### 11.5 Dashboard - Financeiro

| Metodo | Rota | Query params | Funcao |
|---|---|---|---|
| GET | `/api/dashboard/financeiro/dre` | `empresa`, `periodo`, `dataInicio`, `dataFim`, `codTipOper` | DRE |
| GET | `/api/dashboard/financeiro/resumo` | `empresa`, `periodo`, `dataInicio`, `dataFim`, `codTipOper`, `fluxoMeses` | DRE + despesas + fluxo + contas |
| GET | `/api/dashboard/financeiro/fluxo-caixa` | `empresa`, `meses` | Serie mensal de caixa |
| GET | `/api/dashboard/financeiro/distribuicao-despesas` | `empresa`, `periodo`, `dataInicio`, `dataFim` | Despesas por categoria |
| GET | `/api/dashboard/financeiro/contas` | `empresa`, `tipo`, `page`, `pageSize` | Contas abertas |

Valores:

- `periodo`: `mes` ou `ano`.
- `tipo`: `receber` ou `pagar`.
- `meses`: 1 a 36.
- `fluxoMeses`: 1 a 36.
- `page`: zero-indexed.
- `pageSize`: 1 a 200.
- `codTipOper`: lista numerica separada por virgula, exemplo `1100,1763`.

Regra de datas:

- `dataInicio` e `dataFim` devem ser informadas juntas.
- `dataInicio <= dataFim`.
- Formato `YYYY-MM-DD`.

### 11.6 Dashboard - Estoque, clientes, RH e entregas

| Metodo | Rota | Query params | Funcao |
|---|---|---|---|
| GET | `/api/dashboard/estoque` | `empresa` | Visao geral de estoque |
| GET | `/api/dashboard/clientes` | - | BI de clientes |
| GET | `/api/dashboard/rh` | - | BI de RH/vendedores |
| GET | `/api/dashboard/entregas` | - | BI de entregas |

### 11.7 Via Certa

| Metodo | Rota | Query params | Funcao |
|---|---|---|---|
| GET | `/api/viacerta/alunos-ativos` | `month`, `year` | Consulta alunos ativos Via Certa |

Validacao:

- `month`: `01` a `12`.
- `year`: 4 digitos.

### 11.8 Compatibilidade legada

| Metodo | Rota | Query params | Funcao |
|---|---|---|---|
| GET | `/api/receber` | `empresa`, `page`, `pageSize` | Atalho para contas a receber abertas |
| GET | `/api/pagar` | `empresa`, `page`, `pageSize` | Atalho para contas a pagar abertas |

Essas rotas hoje leem do SQLite, nao diretamente do Sankhya.

## 12. Health check

`GET /api/health`

Retorna:

- `status`
- `time`
- `database_path`
- `sync.pedidos`
- `sync.titulos`
- `sync.estoque`
- contagens de linhas:
  - `pedidos`
  - `titulos`
  - `produto_estoque`

Exemplo de uso:

```bash
curl http://localhost:3000/api/health
```

## 13. Scripts auxiliares

Diretorio: `backend/scripts`.

Arquivos atuais:

| Script | Uso esperado |
|---|---|
| `check-vendedores.ts` | Validacao/exploracao de vendedores |
| `explore-sankhya.ts` | Exploracao geral de entidades Sankhya |
| `inspect-dimensoes.ts` | Inspecao de dimensoes sincronizadas |
| `inspect-snapshot.ts` | Inspecao do SQLite snapshot |
| `inspect-titulos.ts` | Inspecao de titulos financeiros |
| `probe-sankhya-fields.ts` | Teste de campos disponiveis em entidades Sankhya |
| `sync-estoque.ts` | Sincronizacao manual de estoque |

## 14. Deploy

Arquivo: `backend/railway.json`.

Railway:

```json
{
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

Pontos de atencao:

- `DATABASE_PATH` deve apontar para armazenamento persistente se o snapshot nao puder ser recriado a cada deploy.
- Credenciais Sankhya e segredos da aplicacao devem ficar so nas variaveis do provedor.
- `CORS_ORIGINS` precisa incluir o dominio final do frontend.
- `/api/health` precisa responder publicamente para healthcheck.

## 15. Limitacoes e pendencias conhecidas

1. `pedido_itens` existe no schema, mas nao ha sincronizador ativo de itens no codigo atual.
2. `produtos` e `estoque` nao estao no ciclo periodico; apenas no sync inicial quando faltam dados e no script manual de estoque.
3. A entidade `Empresa` esta bloqueada no Sankhya para o usuario atual; o backend usa seed local e stubs.
4. Whitelist `FATURAMENTO_TOPS` e manual; se a empresa criar TOP novo de receita, precisa atualizar `operacoes.ts`.
5. `DHBAIXA` pode nao representar caixa efetivamente realizado em todos os casos.
6. `loadAllRecords` tem limite defensivo de 1000 paginas.
7. O snapshot de `titulos` comeca em `01/01/2026`; analises historicas anteriores dependem de ampliar essa janela.
8. `syncPedidos` comeca em `01/01/2025`.
9. Nao ha testes automatizados no backend neste momento.
10. Nao existe rota administrativa para forcar sync sob demanda.
11. A rota `/api/dashboard/empresa/comodato` valida `vendedor` na query por reaproveitar schema, mas o service aplica apenas filtro de empresa.

## 16. Checklist rapido para manutencao

Ao adicionar uma nova rota:

- Criar ou atualizar service em `backend/src/services`.
- Validar query params com Zod em `backend/src/routes`.
- Garantir que a rota esteja atras de auth se nao for publica.
- Atualizar este documento.
- Atualizar docs de frontend se houver consumo novo.

Ao adicionar nova entidade Sankhya:

- Testar campos com script de probe.
- Criar tabela ou migration.
- Criar sync com `recordSyncSuccess` e `recordSyncError`.
- Definir se entra no sync inicial, slow ou hot.
- Conferir indices para as queries que vao usar a entidade.

Ao alterar regra financeira:

- Revisar `services/operacoes.ts`.
- Revisar queries em `dashboard.ts` e `dashboard-financeiro.ts`.
- Comparar resultados com Sankhya/Postman antes de publicar.

## 17. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `src/server.ts` | Bootstrap Express |
| `src/config.ts` | Ambiente e validacao |
| `src/auth.ts` | TOTP, sessao e middleware Bearer |
| `src/routes/index.ts` | Router raiz, health, auth, Via Certa, legados |
| `src/routes/dashboard.ts` | Rotas de dashboard, empresas e vendedores |
| `src/db/connection.ts` | Conexao SQLite |
| `src/db/migrate.ts` | Execucao de schema e ajustes incrementais |
| `src/db/schema.sql` | Fonte do DDL |
| `src/sankhya/client.ts` | HTTP/OAuth Sankhya |
| `src/sankhya/crud.ts` | CRUDServiceProvider e paginacao |
| `src/sankhya/decoder.ts` | Decoder `f0/f1` |
| `src/sync/scheduler.ts` | Orquestracao de sync |
| `src/sync/state.ts` | Estado de sincronizacao |
| `src/services/dashboard.ts` | Empresas, vendas, vendedores, comodato, produtos |
| `src/services/dashboard-financeiro.ts` | DRE, caixa, despesas e contas |
| `src/services/dashboard-estoque.ts` | Estoque |
| `src/services/dashboard-clientes-rh.ts` | Clientes e RH |
| `src/services/dashboard-entregas.ts` | Entregas/logistica |
| `src/services/viacerta.ts` | Integracao Via Certa |
| `src/services/operacoes.ts` | TOPs de negocio |
| `src/utils/empresa.ts` | Filtro de empresa |
| `src/utils/vendedor.ts` | Filtro de vendedor |
| `src/utils/dates.ts` | Parse de datas Sankhya |
| `src/utils/numbers.ts` | Parse de numeros Sankhya |
