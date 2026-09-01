import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { GlobalFilters } from "./GlobalFilters";
import { useSnapshotAt } from "@/lib/snapshot-context";

export function AppShell({ children }: { children: ReactNode }) {
  const snapshotAt = useSnapshotAt();
  const snapshotLabel = snapshotAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshotAt))
    : "aguardando sincronizacao";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-transparent text-foreground">
        <AppSidebar />
        <SidebarInset className="flex min-h-screen flex-col bg-transparent">
          <AppHeader />
          <div className="overflow-x-auto border-b border-border/40 px-4 py-2 lg:px-6">
            <div className="min-w-max">
              <GlobalFilters />
            </div>
          </div>
          <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
          <footer className="border-t border-border/40 px-4 py-3 text-[11px] text-muted-foreground lg:px-6">
            {`Dados atualizados em: ${snapshotLabel} · Snapshot Sankhya`}
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
