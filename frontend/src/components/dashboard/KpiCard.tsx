import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "danger" | "warning" | "primary" | "neutral";

const toneIconWrap: Record<Tone, string> = {
  default: "bg-primary/15 text-primary",
  primary: "bg-primary/15 text-primary",
  neutral: "bg-white/10 text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

const toneValue: Record<Tone, string> = {
  default: "text-[#3B82F6]",
  primary: "text-[#3B82F6]",
  neutral: "text-[#F1F5F9]",
  success: "text-[#10B981]",
  warning: "text-[#F59E0B]",
  danger: "text-[#EF4444]",
};

const toneGlow: Record<Tone, string> = {
  default: "",
  primary: "",
  neutral: "",
  success: "",
  warning: "shadow-[0_0_32px_-8px_rgba(245,158,11,0.35)]",
  danger: "shadow-[0_0_32px_-8px_rgba(239,68,68,0.4)]",
};

const toneValueShadow: Record<Tone, string> = {
  default: "0 0 3px rgba(59,130,246,0.25)",
  primary: "0 0 3px rgba(59,130,246,0.25)",
  neutral: "none",
  success: "0 0 3px rgba(16,185,129,0.25)",
  warning: "0 0 3px rgba(245,158,11,0.25)",
  danger: "0 0 3px rgba(239,68,68,0.25)",
};

export function KpiCard({
  label,
  value,
  hint,
  variation,
  tone = "default",
  icon: Icon,
  critical = false,
}: {
  label: string;
  value: string;
  hint?: string;
  variation?: number | null;
  tone?: Tone;
  icon?: LucideIcon;
  critical?: boolean;
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
        "relative overflow-hidden p-5 transition-all",
        critical && toneGlow[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", toneIconWrap[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={cn("text-3xl font-bold tracking-tight lg:text-[34px]", toneValue[tone])}
          style={{ textShadow: toneValueShadow[tone] }}
        >
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
