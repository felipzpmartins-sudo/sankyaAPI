import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, GraduationCap, LineChart, Search, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/components/LoginGate";

type NavItem = {
  title: string;
  icon: LucideIcon;
  url?: string;
  disabled?: boolean;
};

const dashboards: NavItem[] = [
  { title: "Resumo executivo", icon: BarChart3, url: "/" },
  { title: "DRE por Projeto", icon: LineChart, url: "/dre" },
  { title: "Rateio por projeto", icon: ShieldAlert, url: "/qualidade" },
];

function NavList({ items, currentPath }: { items: NavItem[]; currentPath: string }) {
  const isActive = (url?: string) =>
    !!url && (url === "/" ? currentPath === "/" : currentPath.startsWith(url));

  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isActive(item.url);
        const content = (
          <>
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate text-[13px] group-data-[collapsible=icon]:hidden">
              {item.title}
            </span>
          </>
        );
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild={!item.disabled && !!item.url}
              isActive={active}
              tooltip={item.title}
              className="h-8 rounded-md px-2 text-muted-foreground/90 hover:bg-white/[0.04] hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-sm"
              disabled={item.disabled}
            >
              {!item.disabled && item.url ? (
                <Link to={item.url} className="flex items-center gap-2.5">
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 opacity-60"
                  disabled
                >
                  {content}
                </button>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const user = useAuthUser();
  const visibleDashboards: NavItem[] = user?.role === "viacerta"
    ? [{ title: "Alunos Via Certa", icon: GraduationCap, url: "/via-certa" }]
    : dashboards;

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/40 [&>[data-sidebar=sidebar]]:bg-sidebar"
    >
      <SidebarHeader className="gap-3 border-b border-border/30 px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-md shadow-primary/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              Sankhya <span className="text-primary">3.0</span>
            </span>
          </div>
        </div>

        <div className="relative group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar painéis..."
            className="h-8 border-border/40 bg-white/[0.03] pl-8 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/60"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2 py-2">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Dashboards
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavList items={visibleDashboards} currentPath={currentPath} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
