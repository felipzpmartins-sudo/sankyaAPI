import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

SANKHYA_URL = os.getenv("SANKHYA_URL", "").rstrip("/")
SANKHYA_USER = os.getenv("SANKHYA_USER", "")
SANKHYA_PASSWORD = os.getenv("SANKHYA_PASSWORD", "")

if not (SANKHYA_URL and SANKHYA_USER and SANKHYA_PASSWORD):
    print("Configure SANKHYA_URL, SANKHYA_USER e SANKHYA_PASSWORD no arquivo .env")
    sys.exit(1)


def login():
    base = SANKHYA_URL if SANKHYA_URL.rstrip("/").endswith("/mge") else f"{SANKHYA_URL}/mge"
    url = f"{base.rstrip('/')}/service.sbr"
    params = {"serviceName": "MobileLoginSP.login", "outputType": "json"}
    payload = {
        "serviceName": "MobileLoginSP.login",
        "requestBody": {
            "NOMUSU": {"$": SANKHYA_USER},
            "INTERNO": {"$": SANKHYA_PASSWORD},
            "KEEPCONNECTED": {"$": "S"},
        },
    }

    resp = requests.post(url, params=params, json=payload, timeout=30)
    print(f"Status HTTP: {resp.status_code}")
    print(f"Resposta:\n{resp.text}\n")

    resp.raise_for_status()
    data = resp.json()

    status = data.get("status")
    if status != "1":
        msg = data.get("statusMessage") or data.get("errorMessage") or data
        raise RuntimeError(f"Falha no login: {msg}")

    jsession = data.get("responseBody", {}).get("jsessionid", {}).get("$")
    if not jsession:
        for c in resp.cookies:
            if c.name.upper() == "JSESSIONID":
                jsession = c.value
                break

    print(f"Login OK. JSESSIONID: {jsession}")
    return jsession


if __name__ == "__main__":
    try:
        login()
    except Exception as e:
        print(f"Erro: {e}")
        sys.exit(1)
