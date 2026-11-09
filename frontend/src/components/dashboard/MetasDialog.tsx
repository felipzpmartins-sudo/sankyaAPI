import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiJson, apiSend } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MetasDoMes = {
  ano_mes: string;
  pode_editar: boolean;
  vendedores: Array<{
    CODVEND: number;
    vendedor: string;
    ativo: boolean;
    valor: number | null;
    alterado_por: string | null;
    alterado_em: string | null;
  }>;
};

export function buscarMetas(anoMes: string) {
  return apiJson<MetasDoMes>("/api/dashboard/vendedores/metas", { ano_mes: anoMes });
}

function mesAnterior(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  const d = new Date(ano, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nomeDoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  const texto = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function paraTexto(valor: number | null): string {
  return valor == null
    ? ""
    : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Lê o valor digitado no jeito brasileiro: "15.000", "15.000,50", "R$ 15000".
 * Vazio vira null (sem meta); texto que não é número vira NaN.
 */
function paraNumero(texto: string): number | null {
  let s = texto.replace(/R\$|\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

/**
 * Formulário de metas do mês: uma linha por vendedor ativo. Campo vazio é
 * "sem meta" — apagar o número e salvar remove a meta daquele vendedor.
 */
export function MetasDialog({
  open,
  onOpenChange,
  mesInicial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mesInicial: string;
}) {
  const queryClient = useQueryClient();
  const [anoMes, setAnoMes] = useState(mesInicial);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);

  useEffect(() => {
    if (open) {
      setAnoMes(mesInicial);
      setBusca("");
      setAviso(null);
    }
  }, [open, mesInicial]);

  const metas = useQuery({
    queryKey: ["comercial-metas", anoMes],
    queryFn: () => buscarMetas(anoMes),
    enabled: open && /^\d{4}-\d{2}$/.test(anoMes),
  });

  // O formulário recomeça do que está gravado sempre que o mês muda.
  useEffect(() => {
    if (!metas.data) return;
    setValores(
      Object.fromEntries(metas.data.vendedores.map((v) => [v.CODVEND, paraTexto(v.valor)])),
    );
  }, [metas.data]);

  const linhas = useMemo(() => metas.data?.vendedores ?? [], [metas.data]);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? linhas.filter((v) => v.vendedor.toLowerCase().includes(termo)) : linhas;
  }, [linhas, busca]);

  const numeros = linhas.map((v) => ({
    CODVEND: v.CODVEND,
    valor: paraNumero(valores[v.CODVEND] ?? ""),
  }));
  const invalidos = new Set(numeros.filter((n) => Number.isNaN(n.valor)).map((n) => n.CODVEND));
  const totalMeta = numeros.reduce(
    (s, n) => s + (n.valor && !Number.isNaN(n.valor) ? n.valor : 0),
    0,
  );
  const alterados = linhas.filter((v) => {
    const novo = paraNumero(valores[v.CODVEND] ?? "");
    return !Number.isNaN(novo) && (novo || null) !== (v.valor || null);
  }).length;

  const ultima = linhas
    .filter((v) => v.alterado_em)
    .sort((a, b) => (b.alterado_em ?? "").localeCompare(a.alterado_em ?? ""))[0];

  const salvar = useMutation({
    mutationFn: () =>
      apiSend<MetasDoMes>("PUT", "/api/dashboard/vendedores/metas", {
        ano_mes: anoMes,
        metas: numeros,
      }),
    onSuccess: (dados) => {
      queryClient.setQueryData(["comercial-metas", anoMes], dados);
      void queryClient.invalidateQueries({ queryKey: ["comercial-vendas-periodo"] });
      setAviso(`Metas de ${nomeDoMes(anoMes).toLowerCase()} salvas.`);
    },
  });

  async function copiarMesAnterior() {
    setCopiando(true);
    setAviso(null);
    try {
      const anterior = await buscarMetas(mesAnterior(anoMes));
      const comMeta = anterior.vendedores.filter((v) => v.valor != null);
      if (comMeta.length === 0) {
        setAviso(`${nomeDoMes(mesAnterior(anoMes))} não tem metas para copiar.`);
        return;
      }
      setValores((atual) => {
        const proximo = { ...atual };
        for (const v of comMeta) proximo[v.CODVEND] = paraTexto(v.valor);
        return proximo;
      });
      setAviso(
        `${comMeta.length} metas copiadas de ${nomeDoMes(mesAnterior(anoMes)).toLowerCase()}. Confira e salve.`,
      );
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Não foi possível copiar.");
    } finally {
      setCopiando(false);
    }
  }

  const podeEditar = metas.data?.pode_editar ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Metas por vendedor</DialogTitle>
          <DialogDescription>
            Meta de venda do mês, em valor de pedido. Deixe o campo vazio para o vendedor ficar sem
            meta.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={anoMes}
            onChange={(e) => {
              setAviso(null);
              if (e.target.value) setAnoMes(e.target.value);
            }}
            className="h-9 w-[170px]"
            aria-label="Mês da meta"
          />
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar vendedor..."
              className="h-9 pl-8"
            />
          </div>
          {podeEditar && (
            <Button variant="outline" size="sm" onClick={copiarMesAnterior} disabled={copiando}>
              {copiando ? <LoaderCircle className="animate-spin" /> : <Copy />}
              Copiar mês anterior
            </Button>
          )}
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md border border-border/60">
          {metas.isPending ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : metas.error ? (
            <div className="p-4 text-sm text-danger">Não foi possível carregar as metas.</div>
          ) : visiveis.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhum vendedor encontrado.</div>
          ) : (
            <ul className="divide-y divide-border/50">
              {visiveis.map((v) => (
                <li key={v.CODVEND} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{v.vendedor}</p>
                    {!v.ativo && (
                      <p className="text-xs text-muted-foreground">inativo no Sankhya</p>
                    )}
                  </div>
                  <div className="relative w-[160px]">
                    <span className="pointer-events-none absolute left-2.5 top-2 text-xs text-muted-foreground">
                      R$
                    </span>
                    <Input
                      inputMode="decimal"
                      value={valores[v.CODVEND] ?? ""}
                      disabled={!podeEditar}
                      placeholder="sem meta"
                      onChange={(e) => {
                        setAviso(null);
                        setValores((atual) => ({ ...atual, [v.CODVEND]: e.target.value }));
                      }}
                      className={cn(
                        "h-8 pl-8 text-right tabular-nums",
                        invalidos.has(v.CODVEND) && "border-danger focus-visible:ring-danger",
                      )}
                      aria-label={`Meta de ${v.vendedor}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Meta total de {nomeDoMes(anoMes).toLowerCase()}:{" "}
            <strong className="text-foreground">{formatCurrency(totalMeta)}</strong>
          </p>
          {ultima && (
            <p>
              Última alteração {ultima.alterado_por ? `por ${ultima.alterado_por} ` : ""}em{" "}
              {formatDateTime(ultima.alterado_em)}
            </p>
          )}
          {!podeEditar && metas.data && (
            <p className="text-warning">Esta conta só pode consultar as metas.</p>
          )}
          {invalidos.size > 0 && (
            <p className="text-danger">Corrija os valores marcados em vermelho.</p>
          )}
          {salvar.error && <p className="text-danger">{salvar.error.message}</p>}
          {aviso && <p className="text-success">{aviso}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {podeEditar && (
            <Button
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending || invalidos.size > 0 || alterados === 0}
            >
              {salvar.isPending && <LoaderCircle className="animate-spin" />}
              Salvar {alterados > 0 ? `(${alterados})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
