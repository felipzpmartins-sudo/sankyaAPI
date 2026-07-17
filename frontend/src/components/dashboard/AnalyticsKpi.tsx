import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  delta?: number | null;
  className?: string;
};

export function AnalyticsKpi({ label, value, delta, className }: Props) {
  const positive = (delta ?? 0) >= 0;
  const sign = positive ? "+" : "";
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 rounded-xl border border-border/40 bg-surface p-5",
        "transition-colors hover:bg-surface-elevated",
        className,
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight text-foreground lg:text-[32px]">
          {value}
        </span>
        {delta != null && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              positive
                ? "bg-success/15 text-success"
                : "bg-danger/15 text-danger",
            )}
          >
            {sign}
            {delta.toFixed(1).replace(".", ",")}%
          </span>
        )}
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
