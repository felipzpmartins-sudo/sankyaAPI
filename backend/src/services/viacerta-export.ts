import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

import type { ViaCertaAlunosAtivosResponse } from "./viacerta.js";

const COR_CABECALHO = "#17365D";

function cabecalho(value: string): Cell {
  return {
    value,
    fontWeight: "bold",
    textColor: "#FFFFFF",
    backgroundColor: COR_CABECALHO,
    align: "center",
  };
}

export async function gerarViaCertaXlsx(
  relatorio: ViaCertaAlunosAtivosResponse,
): Promise<Buffer> {
  const resumo: SheetData = [
    [cabecalho("Indicador"), cabecalho("Valor")],
    ["Período", `${relatorio.filtro.month}/${relatorio.filtro.year}`],
    ["Alunos ativos", relatorio.total_alunos],
    ["Aulas assistidas", relatorio.total_aulas_assistidas],
    ["Gerado em", { value: new Date(), type: Date, format: "dd/mm/yyyy hh:mm" }],
  ];
  const alunos: SheetData = [
    [cabecalho("Matrícula"), cabecalho("Mês"), cabecalho("Aulas assistidas")],
    ...relatorio.alunos.map((aluno) => [aluno.matricula, aluno.mes, aluno.aulas_assistidas]),
  ];

  return writeXlsxFile([
    {
      data: resumo,
      sheet: "Resumo",
      columns: [{ width: 26 }, { width: 24 }],
      stickyRowsCount: 1,
    },
    {
      data: alunos,
      sheet: "Alunos ativos",
      columns: [{ width: 18 }, { width: 16 }, { width: 22 }],
      stickyRowsCount: 1,
    },
  ]).toBuffer();
}
