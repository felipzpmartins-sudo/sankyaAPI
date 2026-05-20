# POSTMAN — Modelos de requisição para a API Sankhya

Guia rápido pra outro desenvolvedor (ou pra você mesmo dali a um mês)
conseguir bater na API Sankhya direto pelo Postman, sem subir o backend.
Foca em **três requests essenciais**:

1. **Autenticação** — obtém o `access_token` (Bearer JWT)
2. **Pedidos** — lista `CabecalhoNota` sem filtro
3. **Financeiro** — lista títulos sem filtro

> Credenciais reais (`client_id`, `client_secret`, `X-Token`) ficam em
> `backend/.env`. **Não commitar.** Para Postman, criar um **Environment**
> com elas (passo 0 abaixo) — segue local da sua máquina.

---

## Passo 0 — Criar o Environment "Sankhya"

No Postman, canto superior direito: **Environments** → **+ New**.

Nome: `Sankhya`. Adiciona estas 5 variáveis:

| Variable | Initial value | Current value |
|---|---|---|
| `base_url` | `https://api.sankhya.com.br` | (mesmo) |
| `client_id` | _seu client_id_ | _idem_ |
| `client_secret` | _seu client_secret_ | _idem_ |
| `x_token` | _seu X-Token_ | _idem_ |
| `access_token` | (vazio — vai ser preenchido pelo script) | (vazio) |

Marca o environment como **ativo** (canto superior direito do Postman).

---

## 1. Autenticação — obter o `access_token`

### Request

**Method:** `POST`
**URL:**
```
{{base_url}}/authenticate
```

### Headers

| Key | Value |
|---|---|
| `X-Token` | `{{x_token}}` |

### Body

Selecionar **`x-www-form-urlencoded`** (não JSON, não Text):

| Key | Value |
|---|---|
| `client_id` | `{{client_id}}` |
| `client_secret` | `{{client_secret}}` |
| `grant_type` | `client_credentials` |

### Script Post-response (aba "Scripts" → "Post-response")

Cola isto pra o Postman salvar o token automaticamente no environment
depois de cada login:

```javascript
const r = pm.response.json();
if (r.access_token) {
  pm.environment.set("access_token", r.access_token);
  console.log("✓ access_token atualizado");
}
```

### Resposta esperada (200 OK)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Como usar

Roda esse request **uma vez por hora** (token dura 3600s). O script
guarda o `access_token` no environment, então os requests seguintes
podem usar `{{access_token}}` sem você fazer nada manual.

> **Erro comum:** `400 invalid_request "Missing form parameter: grant_type"`
> — significa que o Body **não** está em `x-www-form-urlencoded`. Os 3
> campos têm que estar nessa aba específica, não em "raw" + JSON.

---

## 2. Pedidos — listar `CabecalhoNota` sem filtro

Lê notas (vendas, compras, devoluções etc.) direto da entidade
`CabecalhoNota` (TGFCAB).

### Request

**Method:** `POST`
**URL:**
```
{{base_url}}/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.loadRecords&outputType=json
```

> ⚠ **Mantém o `outputType=json`** no final da URL. Sem isso a Sankhya
> responde em XML e você cai num parser errado.

### Headers

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{access_token}}` |
| `Content-Type` | `application/json` |

### Body — raw + **JSON**

```json
{
  "serviceName": "CRUDServiceProvider.loadRecords",
  "requestBody": {
    "dataSet": {
      "rootEntity": "CabecalhoNota",
      "includePresentationFields": "S",
      "offsetPage": "0",
      "criteria": { "expression": { "$": "1=1" } },
      "entity": {
        "fieldset": {
          "list": "NUNOTA,NUMNOTA,SERIENOTA,DTNEG,DTFATUR,CODEMP,CODPARC,CODVEND,CODTIPOPER,STATUSNOTA,VLRNOTA"
        }
      }
    }
  }
}
```

### Resposta esperada (200 OK)

A resposta vem com **chaves ofuscadas** (`f0`, `f1`, `f2`...) e um
`metadata.fields[]` que mapeia cada `fN` ao nome do campo:

```json
{
  "serviceName": "CRUDServiceProvider.loadRecords",
  "status": "1",
  "pendingPrinting": "false",
  "transactionId": "ABC123...",
  "responseBody": {
    "entities": {
      "total": "50",
      "hasMoreResult": "true",
      "offsetPage": "0",
      "metadata": {
        "fields": {
          "field": [
            { "name": "NUNOTA" },
            { "name": "NUMNOTA" },
            { "name": "SERIENOTA" },
            { "name": "DTNEG" },
            { "name": "DTFATUR" },
            { "name": "CODEMP" },
            { "name": "CODPARC" },
            { "name": "CODVEND" },
            { "name": "CODTIPOPER" },
            { "name": "STATUSNOTA" },
            { "name": "VLRNOTA" },
            { "name": "Empresa_NOMEFANTASIA" },
            { "name": "Parceiro_NOMEPARC" }
          ]
        }
      },
      "entity": [
        {
          "f0":  { "$": "115388" },
          "f1":  { "$": "1545" },
          "f3":  { "$": "25/02/2026" },
          "f10": { "$": "40324.52" },
          "f11": { "$": "MK E-COMMERCE" },
          "f12": { "$": "FORNECEDOR XYZ LTDA" }
        }
      ]
    }
  }
}
```

**Como decifrar:** a ordem do `metadata.fields[]` corresponde aos índices
`f0`, `f1`, `f2`... então `f0` = `NUNOTA`, `f3` = `DTNEG`, etc.

### Variações úteis (trocar só o `criteria.expression`)

| Filtro | Expression |
|---|---|
| Sem filtro (qualquer nota) | `"1=1"` |
| Só vendas faturadas em 2026 | `"this.TIPMOV='V' AND this.STATUSNOTA='L' AND strftime('%Y', this.DTFATUR) = '2026'"` ⚠ (TIPMOV depende do TOP — ver §7.1 do STATUS_PROJECT) |
| Uma empresa | `"this.CODEMP = 1"` |
| Várias empresas | `"this.CODEMP IN (1, 2, 5)"` |
| Range de data | `"this.DTNEG >= TO_DATE('01/01/2026','DD/MM/YYYY')"` |
| Combinado | `"this.CODEMP = 1 AND this.STATUSNOTA = 'L' AND this.DTNEG >= TO_DATE('01/05/2026','DD/MM/YYYY')"` |

### Paginação

A resposta vem em **páginas de ~50 registros**. Pra buscar a próxima
página, incrementa `offsetPage`:

```json
"offsetPage": "1"   // segunda página
"offsetPage": "2"   // terceira página
```

Continue até `"hasMoreResult": "false"`.

---

## 3. Financeiro — listar títulos sem filtro

Lê contas a pagar/receber direto da entidade `Financeiro` (TGFFIN).

### Request

**Method:** `POST`
**URL:** mesma URL do request anterior (Pedidos):
```
{{base_url}}/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.loadRecords&outputType=json
```

### Headers

Idênticos ao request de Pedidos:

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{access_token}}` |
| `Content-Type` | `application/json` |

### Body — raw + **JSON**

```json
{
  "serviceName": "CRUDServiceProvider.loadRecords",
  "requestBody": {
    "dataSet": {
      "rootEntity": "Financeiro",
      "includePresentationFields": "S",
      "offsetPage": "0",
      "criteria": { "expression": { "$": "1=1" } },
      "entity": {
        "fieldset": {
          "list": "NUFIN,CODEMP,CODPARC,RECDESP,DTNEG,DTVENC,DHBAIXA,VLRDESDOB,VLRBAIXA,CODTIPTIT,CODNAT"
        }
      }
    }
  }
}
```

### Resposta esperada

Mesmo formato dos Pedidos (`f0`, `f1`, ... + `metadata.fields[]`).
Campos típicos que vêm preenchidos:

- `NUFIN`: número único do título
- `RECDESP`: **`1` = Receita (a receber)**, **`-1` = Despesa (a pagar)** — ⚠ é numérico, não `'R'`/`'D'`
- `DTNEG`: data da negociação
- `DTVENC`: data de vencimento
- `DHBAIXA`: data/hora da baixa (`null` se em aberto; pode ser data **prevista**, não efetiva)
- `VLRDESDOB`: valor original
- `VLRBAIXA`: valor já recebido/pago

E os joined fields automáticos (vêm porque `includePresentationFields=S`):
- `Empresa_NOMEFANTASIA`
- `Parceiro_NOMEPARC`
- `TipoTitulo_DESCRTIPTIT`
- `Natureza_DESCRNAT`

### Variações úteis

| Filtro | Expression |
|---|---|
| Só contas **a receber** em aberto | `"this.RECDESP > 0 AND this.DHBAIXA IS NULL"` |
| Só contas **a pagar** em aberto | `"this.RECDESP < 0 AND this.DHBAIXA IS NULL"` |
| Recebidos no mês atual | `"this.RECDESP > 0 AND this.DHBAIXA >= TO_DATE('01/05/2026','DD/MM/YYYY') AND this.DHBAIXA < TO_DATE('01/06/2026','DD/MM/YYYY')"` |
| Vencendo nos próximos 30 dias | `"this.RECDESP > 0 AND this.DHBAIXA IS NULL AND this.DTVENC <= date('now', '+30 days')"` |

---

## Dicas gerais

### O token expirou? (`GTW3403`)

Quando ver:
```json
{
  "error": {
    "codigo": "GTW3403",
    "descricao": "Bearer Token inválido ou Expirado."
  }
}
```
→ volta no request **#1 (Authenticate)** e clica **Send**. O script
salva o novo token, e os requests seguintes voltam a funcionar.

### Resposta veio em XML em vez de JSON?

3 causas possíveis (na ordem mais comum):

1. Faltou `&outputType=json` na URL.
2. `Content-Type` não está `application/json` (Body marcado como Text
   em vez de JSON).
3. Body está vazio ou malformado.

### `Descritor do campo 'XYZ' inválido`?

O nome do campo está errado **ou** ele não existe nessa entidade.
Truque: troca a `list` por `"*"` (todos os campos) — a resposta vem com
o `metadata.fields[]` completo, daí você vê os nomes reais e ajusta.

```json
"fieldset": { "list": "*" }
```

### `ORA-01722: número inválido`?

Você comparou um campo numérico com string ou vice-versa. Casos
clássicos:

- `RECDESP = 'R'` — errado, ele é numérico. Use `RECDESP > 0` ou `RECDESP < 0`.
- `CODEMP = 'todas'` — não funciona, é número.

### Joined fields (`Parceiro_NOMEPARC`, etc.)

Não tente listar explicitamente em `fieldset.list` — quebra. Eles vêm
**automaticamente** quando `includePresentationFields = "S"`. A
underscore é proposital (`Parceiro_NOMEPARC`, não `Parceiro.NOMEPARC`).

### Organização sugerida da Collection

```
Sankhya API
├── 🔑 Auth
│   └── POST Authenticate
├── 📦 Pedidos
│   └── POST Listar (CabecalhoNota)
└── 💰 Financeiro
    └── POST Listar (Financeiro)
```

E na collection (raiz) → aba **Authorization** → Type **Bearer Token**
→ Token: `{{access_token}}`. Cada request herda esse Bearer
automaticamente — exceto o `Authenticate`, onde você seta Type **No
Auth**.

---

## Documentos relacionados

- [`STATUS_PROJECT.md`](STATUS_PROJECT.md) §7 — regras de negócio (whitelist de TOPs, RECDESP, DHBAIXA prevista)
- [`STATUS_PROJECT.md`](STATUS_PROJECT.md) §8 — armadilhas (14 gotchas que travaram o desenvolvimento)
- [`ROTAS.md`](ROTAS.md) — endpoints do **backend** local (alternativa ao Postman quando o backend está rodando)
- [`PLAN_DATA_BASE.md`](PLAN_DATA_BASE.md) — schema completo do snapshot SQLite
