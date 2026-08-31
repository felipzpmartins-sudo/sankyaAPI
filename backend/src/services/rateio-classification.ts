import { getDb } from "../db/connection.js";

/**
 * Faixa do grupo economico 04. E exatamente o criterio que o filtro do
 * frontend usa para montar a lista de projetos (lib/filters-context.tsx),
 * entao os dois lados passam a concordar por construcao.
 */
export const FAIXA_EMPRESA_DESTINO = { min: 40_100_000, max: 40_999_999 } as const;

/**
 * Usado apenas enquanto a tabela `projetos` nao tiver sido sincronizada.
 * Era a lista fixa anterior: ficou defasada em relacao ao Sankhya, e todo
 * rateio destinado a um projeto ausente dela (PARAGUAI, MK E-COMMERCE...)
 * era contado como percentual "fora dos projetos permitidos" e jogava o
 * titulo em "Distribuicao incompleta" mesmo estando correto no ERP.
 */
const FALLBACK_EMPRESA_DESTINO = [
  40_100_000,
  40_200_000,
  40_300_000,
  40_400_000,
  40_500_000,
  40_600_000,
  40_700_000,
] as const;

const CACHE_MS = 60_000;
let cache: { codigos: number[]; conjunto: Set<number>; expiraEm: number } | null = null;

function resolver(): { codigos: number[]; conjunto: Set<number> } {
  if (cache && Date.now() < cache.expiraEm) return cache;

  let codigos: number[] = [];
  try {
    codigos = (
      getDb()
        .prepare("SELECT CODPROJ FROM projetos WHERE CODPROJ BETWEEN ? AND ? ORDER BY CODPROJ")
        .all(FAIXA_EMPRESA_DESTINO.min, FAIXA_EMPRESA_DESTINO.max) as { CODPROJ: number }[]
    ).map((linha) => linha.CODPROJ);
  } catch {
    codigos = [];
  }

  if (codigos.length === 0) codigos = [...FALLBACK_EMPRESA_DESTINO];

  cache = { codigos, conjunto: new Set(codigos), expiraEm: Date.now() + CACHE_MS };
  return cache;
}

/** Projetos que representam empresa de destino, lidos do snapshot do Sankhya. */
export function projetosEmpresaDestino(): number[] {
  return resolver().codigos;
}

export type RateioCategoria =
  | "COM_RATEIO"
  | "NAO_RATEIO"
  | "SEM_RATEIO"
  | "RATEIO_INCOMPLETO";

export type RateioLinhaClassificacao = {
  codproj: number | null;
  percentual: number;
};

export type RateioClassificacao = {
  status: RateioCategoria;
  totalPerc: number;
  percentualValido: number;
  percentualSemDestino: number;
  projetosValidos: number[];
  somaInvalida: boolean;
  destinoInvalido: boolean;
};

const TOLERANCIA_PERCENTUAL = 0.01;

export function isProjetoEmpresaDestino(codproj: number | null | undefined): boolean {
  return Number.isInteger(codproj) && resolver().conjunto.has(Number(codproj));
}

function numeroSeguro(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Classifica o rateio pela empresa de destino representada pelo projeto.
 *
 * - Sem linhas: SEM_RATEIO.
 * - Linhas cuja soma total ou cuja soma em destinos validos nao fecha 100%:
 *   RATEIO_INCOMPLETO.
 * - 100% em destinos validos: COM_RATEIO, seja um projeto ou varios. Basta
 *   um projeto de destino fechando 100% para a despesa estar rateada.
 *
 * NAO_RATEIO nao e mais produzido. O membro segue no tipo porque o contrato
 * da API ainda expoe as listas e contagens dessa categoria, agora sempre
 * vazias, para nao quebrar consumidores existentes.
 */
export function classificarRateio(linhas: readonly RateioLinhaClassificacao[]): RateioClassificacao {
  if (linhas.length === 0) {
    return {
      status: "SEM_RATEIO",
      totalPerc: 0,
      percentualValido: 0,
      percentualSemDestino: 0,
      projetosValidos: [],
      somaInvalida: false,
      destinoInvalido: false,
    };
  }

  let totalPerc = 0;
  let percentualValido = 0;
  let percentualSemDestino = 0;
  let possuiPercentualNegativo = false;
  const projetosValidos = new Set<number>();

  for (const linha of linhas) {
    const percentual = numeroSeguro(Number(linha.percentual));
    totalPerc += percentual;
    if (percentual < -TOLERANCIA_PERCENTUAL) possuiPercentualNegativo = true;

    if (isProjetoEmpresaDestino(linha.codproj) && percentual > 0) {
      percentualValido += percentual;
      projetosValidos.add(Number(linha.codproj));
    } else if (percentual > 0) {
      percentualSemDestino += percentual;
    }
  }

  const somaInvalida = Math.abs(totalPerc - 100) > TOLERANCIA_PERCENTUAL;
  const destinoInvalido =
    Math.abs(percentualValido - 100) > TOLERANCIA_PERCENTUAL ||
    percentualSemDestino > TOLERANCIA_PERCENTUAL ||
    possuiPercentualNegativo;
  const projetos = [...projetosValidos].sort((a, b) => a - b);

  const status: RateioCategoria =
    somaInvalida || destinoInvalido || projetos.length === 0
      ? "RATEIO_INCOMPLETO"
      : "COM_RATEIO";

  return {
    status,
    totalPerc,
    percentualValido,
    percentualSemDestino,
    projetosValidos: projetos,
    somaInvalida,
    destinoInvalido,
  };
}
