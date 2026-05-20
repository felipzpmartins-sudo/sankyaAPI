import os
import requests
from dotenv import load_dotenv

load_dotenv()


class SankhyaClient:
    def __init__(self, url=None, user=None, password=None):
        url = (url or os.getenv("SANKHYA_URL", "")).rstrip("/")
        if not url.endswith("/mge"):
            url = f"{url}/mge"
        self.base_url = url
        self.user = user or os.getenv("SANKHYA_USER", "")
        self.password = password or os.getenv("SANKHYA_PASSWORD", "")
        self.session = requests.Session()
        self.jsessionid = None

    def login(self):
        url = f"{self.base_url}/service.sbr"
        payload = {
            "serviceName": "MobileLoginSP.login",
            "requestBody": {
                "NOMUSU": {"$": self.user},
                "INTERNO": {"$": self.password},
                "KEEPCONNECTED": {"$": "S"},
            },
        }
        resp = self.session.post(
            url,
            params={"serviceName": "MobileLoginSP.login", "outputType": "json"},
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "1":
            msg = data.get("statusMessage") or data.get("errorMessage") or data
            raise RuntimeError(f"Falha no login: {msg}")
        self.jsessionid = data["responseBody"]["jsessionid"]["$"]
        return self.jsessionid

    def call(self, service_name, request_body, timeout=60):
        if not self.jsessionid:
            self.login()
        url = f"{self.base_url}/service.sbr"
        payload = {"serviceName": service_name, "requestBody": request_body}
        resp = self.session.post(
            url,
            params={"serviceName": service_name, "outputType": "json"},
            json=payload,
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "1":
            msg = data.get("statusMessage") or data.get("errorMessage") or data
            raise RuntimeError(f"Erro em {service_name}: {msg}")
        return data.get("responseBody", {})

    def execute_query(self, sql):
        body = {"sql": {"$": sql}}
        rb = self.call("DbExplorerSP.executeQuery", body)
        rows = rb.get("rows", [])
        field_names = [f.get("name") if isinstance(f, dict) else f
                       for f in rb.get("fieldsMetadata", [])]
        return field_names, rows
