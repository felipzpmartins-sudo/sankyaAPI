import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Bell, ChevronRight, Plus } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const TITLES: Record<string, { section: string; page: string }> = {
  "/": { section: "Dashboard", page: "Central CEO" },
  "/dre": { section: "Dashboard", page: "DRE por Projeto" },
  "/qualidade": { section: "Dashboard", page: "Qualidade do Dado" },
  "/estoque": { section: "Dashboard", page: "Estoque" },
};

export function AppHeader() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const meta = TITLES[pathname] ?? TITLES["/"];
  const queryClient = useQueryClient();
  const refreshing = useIsFetching() > 0;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/40 bg-background/80 px-4 backdrop-blur-xl lg:px-6">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{meta.section}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">{meta.page}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          className="h-9 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
          onClick={() => void queryClient.invalidateQueries()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {refreshing ? "Atualizando" : "Criar relatório"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full border-border/40 bg-surface hover:bg-surface-elevated"
        >
          <Bell className="h-4 w-4" />
        </Button>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/70 to-primary/30 text-[11px] font-bold text-primary-foreground">
          RF
        </div>
      </div>
    </header>
  );
}
