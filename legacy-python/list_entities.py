import sys
from sankhya_client import SankhyaClient


SQL = """
SELECT NOMEINST, DESCRINST, NOMETAB
FROM TDDINS
ORDER BY NOMEINST
"""


def main():
    client = SankhyaClient()
    client.login()
    print(f"Login OK. JSESSIONID: {client.jsessionid}\n")

    fields, rows = client.execute_query(SQL)
    print(f"Entidades encontradas: {len(rows)}\n")
    print(f"{'NOMEINST':<30} {'NOMETAB':<25} DESCRINST")
    print("-" * 100)
    for r in rows:
        nome = (r[0] or "")[:29]
        tab = (r[2] or "")[:24]
        desc = (r[1] or "")[:50]
        print(f"{nome:<30} {tab:<25} {desc}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Erro: {e}")
        sys.exit(1)
