import { CalendarRange, Building2, Layers, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useFilters } from "@/lib/filters-context";

function MultiSelect({
  label,
  icon,
  options,
  selected,
  onChange,
  emptyLabel = "Todos",
}: {
  label: string;
  icon: React.ReactNode;
  options: { value: number; label: string }[];
  selected: number[];
  onChange: (next: number[]) => void;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length === options.length
        ? "Todos"
        : `${selected.length} selecionados`;

  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? options.filter((o) => o.label.toLowerCase().includes(termo))
    : options;

  const toggle = (val: number) =>
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 justify-between gap-2 border-border/70 bg-surface hover:bg-surface-elevated"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            {icon}
            <span className="text-foreground">{label}:</span>
          </span>
          <span className="max-w-[140px] truncate text-xs font-medium text-foreground">
            {summary}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
            <span className="ml-1.5 font-normal normal-case tracking-normal">
              {selected.length} de {options.length}
            </span>
          </span>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() =>
              onChange(selected.length === options.length ? [] : options.map((o) => o.value))
            }
          >
            {selected.length === options.length ? "Limpar" : "Todos"}
          </button>
        </div>
        <Separator />
        {options.length > 8 && (
          <div className="px-2 pb-2 pt-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}...`}
              className="h-8 text-xs"
            />
          </div>
        )}
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {visiveis.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhum resultado para “{busca}”.
              </p>
            )}
            {visiveis.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-elevated"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(opt.value)}
                  />
                  <span className="text-foreground">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/** Telas em que o recorte por vendedor faz sentido. */
const ROTAS_COM_VENDEDOR = new Set(["/", "/dre"]);

export function GlobalFilters() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { filters, empresas, projetos, vendedores, setFilters, resetFilters } = useFilters();

  const chips: { label: string; onRemove: () => void }[] = [];
  if (filters.empresas.length > 0 && filters.empresas.length < empresas.length) {
    filters.empresas.forEach((codemp) => {
      const emp = empresas.find((e) => e.codemp === codemp);
      if (emp)
        chips.push({
          label: emp.nome,
          onRemove: () =>
            setFilters({ empresas: filters.empresas.filter((c) => c !== codemp) }),
        });
    });
  }
  if (filters.projetos.length > 0 && filters.projetos.length < projetos.length) {
    if (filters.projetos.length <= 3) {
      filters.projetos.forEach((codproj) => {
        const proj = projetos.find((p) => p.codproj === codproj);
        if (proj)
          chips.push({
            label: proj.nome,
            onRemove: () =>
              setFilters({ projetos: filters.projetos.filter((c) => c !== codproj) }),
          });
      });
    } else {
      chips.push({
        label: `${filters.projetos.length} projetos`,
        onRemove: () => setFilters({ projetos: [] }),
      });
    }
  }
  if (ROTAS_COM_VENDEDOR.has(pathname) && filters.vendedores.length > 0 && filters.vendedores.length < vendedores.length) {
    const nomes = filters.vendedores
      .map((codvend) => vendedores.find((vendedor) => vendedor.codvend === codvend)?.nome)
      .filter(Boolean);
    chips.push({
      label: nomes.length <= 2 ? nomes.join(", ") : `${nomes.length} vendedores`,
      onRemove: () => setFilters({ vendedores: [] }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect
        label="Empresa"
        icon={<Building2 className="h-3.5 w-3.5" />}
        options={empresas.map((e) => ({ value: e.codemp, label: e.nome }))}
        selected={filters.empresas}
        onChange={(empresas) => setFilters({ empresas })}
      />
      <MultiSelect
        label="Projeto"
        icon={<Layers className="h-3.5 w-3.5" />}
        options={projetos.map((p) => ({ value: p.codproj, label: p.nome }))}
        selected={filters.projetos}
        onChange={(projetos) => setFilters({ projetos })}
      />
      {ROTAS_COM_VENDEDOR.has(pathname) && (
        <MultiSelect
          label="Vendedor"
          icon={<UserRound className="h-3.5 w-3.5" />}
          options={vendedores.map((vendedor) => ({ value: vendedor.codvend, label: vendedor.nome }))}
          selected={filters.vendedores}
          onChange={(vendedores) => setFilters({ vendedores })}
        />
      )}

      <div className="flex h-9 items-center gap-2 rounded-md border border-border/70 bg-surface px-3 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5" />
        <span className="text-foreground">Período:</span>
        <Input
          type="date"
          value={filters.dataInicio}
          onChange={(e) => setFilters({ dataInicio: e.target.value })}
          className="h-7 w-[130px] border-0 bg-transparent p-0 text-xs text-foreground"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          type="date"
          value={filters.dataFim}
          onChange={(e) => setFilters({ dataFim: e.target.value })}
          className="h-7 w-[130px] border-0 bg-transparent p-0 text-xs text-foreground"
        />
      </div>

      {chips.length > 0 && (
        <>
          <div className="mx-1 h-6 w-px bg-border/60" />
          {chips.map((chip, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="h-7 gap-1 bg-primary/15 pl-2 pr-1 text-primary hover:bg-primary/20"
            >
              {chip.label}
              <button
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/25"
                onClick={chip.onRemove}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={resetFilters}
          >
            Redefinir
          </button>
        </>
      )}
    </div>
  );
}
