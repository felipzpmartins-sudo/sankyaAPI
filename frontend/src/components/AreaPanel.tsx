import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#475569",
];

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Props = {
  title: string;
  subtitle: string;
  total: number;
  pie: Array<{ name: string; value: number }>;
  table: Array<Record<string, string | number>>;
  error: string | null;
  isLoading: boolean;
};

export function AreaPanel({ title, subtitle, total, pie, table, error, isLoading }: Props) {
  const columns = table[0] ? Object.keys(table[0]) : [];
  const isMoneyCol = (c: string) => /valor|total/i.test(c);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="text-xl font-semibold tabular-nums text-foreground">{fmtBRL(total)}</div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Falha ao consultar Maker.OS: {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : pie.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sem dados.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pie}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {pie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {columns.map((c) => {
                      const v = row[c];
                      const isNum = typeof v === "number";
                      return (
                        <td
                          key={c}
                          className={`px-3 py-2 ${isNum ? "text-right tabular-nums" : ""}`}
                        >
                          {isNum ? (isMoneyCol(c) ? fmtBRL(v) : v.toLocaleString("pt-BR")) : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
