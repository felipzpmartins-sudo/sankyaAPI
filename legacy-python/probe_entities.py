import sys
from sankhya_client import SankhyaClient


CANDIDATE_ENTITIES = [
    "Empresa",
    "Usuario",
    "Parceiro",
    "Produto",
    "CabecalhoNota",
    "ItemNota",
    "Vendedor",
    "GrupoProduto",
    "TipoNegociacao",
    "CentroResultado",
    "Conta",
    "MovimentoBancario",
    "Estoque",
    "Projeto",
]


def probe(client, entity):
    body = {
        "dataSet": {
            "rootEntity": entity,
            "includePresentationFields": "N",
            "offsetPage": "0",
            "criteria": {"expression": {"$": "1=0"}},
            "entity": {"fieldset": {"list": "*"}},
        }
    }
    try:
        rb = client.call("CRUDServiceProvider.loadRecords", body, timeout=30)
        fields = rb.get("entities", {}).get("metadata", {}).get("fields", {}).get("field", [])
        if isinstance(fields, dict):
            fields = [fields]
        field_names = [f.get("name") for f in fields if isinstance(f, dict)]
        return True, len(field_names), field_names
    except Exception as e:
        return False, 0, str(e)


def main():
    client = SankhyaClient()
    client.login()
    print(f"Login OK.\n")
    print(f"{'ENTIDADE':<25} {'OK?':<6} {'#CAMPOS':<10} DETALHE")
    print("-" * 100)
    for ent in CANDIDATE_ENTITIES:
        ok, n, detail = probe(client, ent)
        if ok:
            preview = ", ".join(detail[:5]) + (" ..." if len(detail) > 5 else "")
            print(f"{ent:<25} {'OK':<6} {n:<10} {preview}")
        else:
            msg = str(detail)[:60]
            print(f"{ent:<25} {'FAIL':<6} {'-':<10} {msg}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Erro: {e}")
        sys.exit(1)
