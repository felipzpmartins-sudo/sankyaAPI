import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "danger" | "warning" | "primary";

const toneRing: Record<Tone, string> = {
  default: "before:bg-primary/60",
  success: "before:bg-success",
  danger: "before:bg-danger",
  warning: "before:bg-warning",
  primary: "before:bg-primary",
};

const toneValue: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  primary: "text-primary",
};

export function KpiCard({
  label,
  value,
  hint,
  variation,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  variation?: number | null;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const varTone =
    variation == null
      ? "text-muted-foreground"
      : variation >= 0
        ? "text-success"
        : "text-danger";
  const VarIcon =
    variation == null ? null : variation >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-surface p-5 transition-colors hover:bg-surface-elevated",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
        toneRing[tone],
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn("text-3xl font-bold tracking-tight lg:text-[34px]", toneValue[tone])}>
          {value}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {VarIcon && variation != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              varTone,
            )}
          >
            <VarIcon className="h-3 w-3" />
            {Math.abs(variation).toFixed(1).replace(".", ",")}%
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}
