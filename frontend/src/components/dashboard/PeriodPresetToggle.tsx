import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Seletor de periodo compartilhado entre as telas.
 *
 * A logica de faixas vive aqui para nao ser reescrita a cada tela nova — hoje
 * `index.tsx` e `qualidade.tsx` ainda mantem copias proprias e devem migrar
 * para ca quando forem tocadas.
 *
 * O preset apenas escreve `dataInicio`/`dataFim` no filtro global. Nenhuma tela
 * precisa de tratamento especial no backend: `periodoRange` da prioridade ao
 * intervalo explicito sempre que ele chega preenchido.
 */
export type PeriodPreset = "hoje" | "semana" | "mes" | "ano" | "periodo";

const OPCOES: Array<[Exclude<PeriodPreset, "periodo">, string]> = [
  ["hoje", "Hoje"],
  ["semana", "Semanal"],
  ["mes", "Mensal"],
  ["ano", "Ano"],
];

function iso(date: Date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Faixa de datas de um preset, ancorada na data de referencia. */
export function presetRange(preset: PeriodPreset, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const fim = iso(now);

  if (preset === "hoje") return { dataInicio: fim, dataFim: fim };

  if (preset === "semana") {
    const inicio = new Date(now);
    inicio.setDate(inicio.getDate() - 6);
    return { dataInicio: iso(inicio), dataFim: fim };
  }

  if (preset === "ano") {
    return { dataInicio: iso(new Date(now.getFullYear(), 0, 1)), dataFim: fim };
  }

  return { dataInicio: iso(new Date(now.getFullYear(), now.getMonth(), 1)), dataFim: fim };
}

/**
 * Descobre qual preset corresponde a uma faixa. Devolve "periodo" quando as
 * datas foram escolhidas na mao, para nenhum botao aparecer marcado.
 */
export function selectedPreset(dataInicio: string, dataFim: string): PeriodPreset {
  const referencia = new Date(`${dataFim}T12:00:00`);
  for (const preset of ["hoje", "semana", "mes", "ano"] as const) {
    const faixa = presetRange(preset, referencia);
    if (faixa.dataInicio === dataInicio && faixa.dataFim === dataFim) return preset;
  }
  return "periodo";
}

export function PeriodPresetToggle({
  dataInicio,
  dataFim,
  onChange,
}: {
  dataInicio: string;
  dataFim: string;
  onChange: (faixa: { dataInicio: string; dataFim: string }) => void;
}) {
  const ativo = selectedPreset(dataInicio, dataFim);

  return (
    <ToggleGroup
      type="single"
      value={ativo}
      className="justify-start rounded-full border border-border/40 bg-surface p-1"
      onValueChange={(value) => {
        if (!value) return;
        // Ancorado em dataFim, nao em hoje: trocar de preset preserva o mes ou
        // ano que a pessoa estava olhando.
        onChange(presetRange(value as PeriodPreset, new Date(`${dataFim}T12:00:00`)));
      }}
    >
      {OPCOES.map(([value, label]) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="h-8 rounded-full px-3 text-xs text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
