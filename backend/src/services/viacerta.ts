import { config } from "../config.js";

export type ViaCertaAlunoAtivo = {
  mes: string;
  matricula: number;
  aulas_assistidas: number;
};

export type ViaCertaAlunosAtivosResponse = {
  filtro: {
    month: string;
    year: string;
  };
  total_alunos: number;
  total_aulas_assistidas: number;
  alunos: ViaCertaAlunoAtivo[];
};

type ViaCertaRawRow = {
  Mes?: string;
  Matricula?: number | string;
  AulasAssistidas?: number | string;
};

type ViaCertaRawResponse = {
  status?: number;
  error?: unknown;
  response?: unknown;
};

function parseRows(response: unknown): ViaCertaRawRow[] {
  const body = typeof response === "string" ? JSON.parse(response) : response;
  const rows = Array.isArray(body) && Array.isArray(body[0]) ? body[0] : body;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is ViaCertaRawRow => typeof row === "object" && row !== null);
}

export async function alunosAtivosViaCerta(args: {
  month: string;
  year: string;
}): Promise<ViaCertaAlunosAtivosResponse> {
  const form = new URLSearchParams();
  form.set("month", args.month);
  form.set("year", args.year);

  const res = await fetch(config.VIACERTA_ACTIVE_USERS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = (await res.json()) as ViaCertaRawResponse;
  if (!res.ok || payload.error) {
    const message = typeof payload.error === "string" ? payload.error : `Via Certa HTTP ${res.status}`;
    throw new Error(message);
  }

  const alunos = parseRows(payload.response).map((row) => ({
    mes: String(row.Mes ?? `${args.year}-${args.month}`),
    matricula: Number(row.Matricula ?? 0),
    aulas_assistidas: Number(row.AulasAssistidas ?? 0),
  }));

  return {
    filtro: {
      month: args.month,
      year: args.year,
    },
    total_alunos: alunos.length,
    total_aulas_assistidas: alunos.reduce((acc, row) => acc + row.aulas_assistidas, 0),
    alunos,
  };
}
