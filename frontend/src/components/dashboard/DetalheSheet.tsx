import { LoaderCircle, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Painel lateral que abre ao clicar num KpiCard e mostra a lista por trás do
 * número. A página entrega a tabela pronta; aqui ficam cabeçalho, busca,
 * rolagem e o rodapé com o resumo do que está filtrado.
 */
export function DetalheSheet({
  open,
  onOpenChange,
  titulo,
  descricao,
  busca,
  onBusca,
  placeholderBusca = "Buscar...",
  carregando = false,
  erro = null,
  rodape,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao?: string;
  busca: string;
  onBusca: (valor: string) => void;
  placeholderBusca?: string;
  carregando?: boolean;
  erro?: string | null;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-4xl">
        <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 pr-12">
          <SheetTitle>{titulo}</SheetTitle>
          {descricao && <SheetDescription>{descricao}</SheetDescription>}
          <div className="relative pt-3">
            <Search className="pointer-events-none absolute left-3 top-[calc(50%+6px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => onBusca(e.target.value)}
              placeholder={placeholderBusca}
              className="pl-9"
              autoFocus
            />
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          {carregando ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando lista...
            </div>
          ) : erro ? (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-danger">
              {erro}
            </div>
          ) : (
            children
          )}
        </div>

        {rodape && !carregando && !erro && (
          <div className="border-t border-border/60 px-6 py-3 text-sm text-muted-foreground">
            {rodape}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Normaliza para busca sem acento e sem caixa. */
export function normalizarBusca(valor: string | number | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function combinaBusca(
  termo: string,
  campos: Array<string | number | null | undefined>,
): boolean {
  const alvo = normalizarBusca(termo).trim();
  if (!alvo) return true;
  return campos.some((campo) => normalizarBusca(campo).includes(alvo));
}
