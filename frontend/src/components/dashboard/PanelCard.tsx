import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PanelCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("border-border/60 bg-surface", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </Card>
  );
}
