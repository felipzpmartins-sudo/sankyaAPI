import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Wallet,
  Package,
  ShoppingCart,
  Boxes,
  Truck,
  Users,
  UserCog,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart2,
  LineChart as LineIcon,
  AreaChart as AreaIcon,
  AlignLeft,
  PieChart as PieIcon,
  Layers,
  LogOut,
  Menu,
  X,
  Building2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EmpresaDashboardDto, VendedorDto } from "@/lib/api/types.dashboard";
import { ApiError } from "@/lib/api/client";
import { formatBRL, formatBRLCompact, formatMesAnoPt } from "@/lib/format";
import { useEmpresas } from "@/hooks/api/useEmpresas";
import { useVendedores } from "@/hooks/api/useVendedores";
import { useVendedoresRanking, type VendedoresPeriodo } from "@/hooks/api/useVendedoresRanking";
import { useVendedoresLancamentosHoje } from "@/hooks/api/useVendedoresLancamentosHoje";
import { useFaturamentoConsolidado } from "@/hooks/api/useFaturamentoConsolidado";
import { useFaturamentoPorEmpresa } from "@/hooks/api/useFaturamentoPorEmpresa";
import type { FinanceiroDrePeriodo } from "@/lib/api/types.dashboard";
import type { EmpresaSeleção } from "@/lib/empresaSelecao";
import type { VendedorSeleção } from "@/lib/vendedorSelecao";
import { useFinanceiroDre } from "@/hooks/api/useFinanceiroDre";
import { useDistribuicaoDespesas } from "@/hooks/api/useDistribuicaoDespesas";
import { useFluxoCaixa } from "@/hooks/api/useFluxoCaixa";
import { useContasAbertasResumo } from "@/hooks/api/useContasAbertasResumo";
import { useEstoque } from "@/hooks/api/useEstoque";
import { useProdutos } from "@/hooks/api/useProdutos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CIP - Central de Inteligência e Performance Grupo MKR" },
      {
        name: "description",
        content: "Painel executivo C-level com dados do CIP - Central de Inteligência e Performance Grupo MKR.",
      },
    ],
  }),
  component: Dashboard,
});

/* ============================================================
 *  PALETTE & TOKENS  — single source of truth
 * ============================================================ */
const C = {
  bg: "#000000",
  surface: "#0A0A0A",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  gold: "#F5D547",
  goldSoft: "rgba(245,213,71,0.12)",
  green: "#2EBD8F",
  red: "#E05555",
  amber: "#F5D547",
  blue: "#4DA3FF",
  text: "#E8E6E0",
  muted: "#6B6F78",
  mutedStrong: "#9AA0AB",
};

/* ============================================================
 *  HARDCODED DATA — swap for API later
 * ============================================================ */
const DATA = {
  dashboard: {
    kpis: [
      {
        label: "Receita Total",
        value: "R$ 2,4M",
        delta: "+12,4%",
        up: true,
        color: C.gold,
        spark: [12, 15, 14, 18, 16, 21, 19, 24, 22, 26, 28, 31],
      },
      {
        label: "Pedidos Ativos",
        value: "1.847",
        delta: "+8,1%",
        up: true,
        color: C.green,
        spark: [40, 42, 38, 45, 50, 48, 52, 55, 53, 58, 60, 62],
      },
      {
        label: "Ticket Médio",
        value: "R$ 1.298",
        delta: "-2,3%",
        up: false,
        color: C.blue,
        spark: [30, 28, 32, 31, 29, 27, 28, 26, 27, 25, 26, 24],
      },
      {
        label: "Inadimplência",
        value: "3,2%",
        delta: "+0,8pp",
        up: false,
        color: C.red,
        alert: true,
        spark: [10, 12, 11, 13, 15, 14, 18, 17, 20, 22, 24, 26],
      },
    ],
    receitaMeta: [
      { m: "Jun", real: 1.6, meta: 1.5 },
      { m: "Jul", real: 1.7, meta: 1.6 },
      { m: "Ago", real: 1.8, meta: 1.7 },
      { m: "Set", real: 1.95, meta: 1.8 },
      { m: "Out", real: 2.1, meta: 1.9 },
      { m: "Nov", real: 2.0, meta: 2.0 },
      { m: "Dez", real: 2.3, meta: 2.1 },
      { m: "Jan", real: 2.15, meta: 2.2 },
      { m: "Fev", real: 2.25, meta: 2.25 },
      { m: "Mar", real: 2.35, meta: 2.3 },
      { m: "Abr", real: 2.4, meta: 2.35 },
      { m: "Mai", real: 2.45, meta: 2.4 },
    ],
    mix: [
      { name: "Indústria", value: 48, color: C.gold },
      { name: "Atacado", value: 32, color: C.blue },
      { name: "Varejo", value: 20, color: C.green },
    ],
    topProdutos: [
      {
        sku: "MK-1042",
        nome: "Chapa Aço Carbono 4mm",
        receita: "R$ 384.200",
        pct: "+18%",
        up: true,
      },
      { sku: "MK-2089", nome: "Tubo Galvanizado 2”", receita: "R$ 296.500", pct: "+12%", up: true },
      { sku: "MK-3310", nome: "Perfil U Reforçado", receita: "R$ 241.800", pct: "+9%", up: true },
      { sku: "MK-4501", nome: "Tela Soldada 50x100", receita: "R$ 198.300", pct: "-3%", up: false },
      {
        sku: "MK-5022",
        nome: "Fio Máquina Trefilado",
        receita: "R$ 174.900",
        pct: "+6%",
        up: true,
      },
    ],
    status: [
      { label: "Estoque", pct: 87, tone: "green" },
      { label: "Entregas", pct: 94, tone: "green" },
      { label: "Satisfação", pct: 78, tone: "amber" },
      { label: "Compras", pct: 61, tone: "red" },
    ],
    alertas: [
      {
        level: "Crítico",
        tone: "red",
        text: "3 SKUs abaixo do estoque mínimo na filial Curitiba.",
      },
      {
        level: "Atenção",
        tone: "amber",
        text: "Margem da linha Construção caiu 2,1pp na última semana.",
      },
      {
        level: "Positivo",
        tone: "green",
        text: "Cliente Polimax renovou contrato anual de R$ 1,8M.",
      },
    ],
  },
  estoque: {
    kpis: [
      { label: "Valor em Estoque", value: "R$ 4,28M", delta: "+2,1%", up: true, color: C.gold },
      {
        label: "Abaixo do Mínimo",
        value: "3",
        delta: "Crítico",
        up: false,
        color: C.red,
        alert: true,
      },
      { label: "Giro de Estoque", value: "5,8x", delta: "+0,4", up: true, color: C.green },
      { label: "Cobertura Média", value: "62 dias", delta: "-3 dias", up: true, color: C.blue },
    ],
    niveis: [
      { cat: "Aço", atual: 820, min: 600 },
      { cat: "Tubos", atual: 540, min: 400 },
      { cat: "Perfis", atual: 380, min: 450 },
      { cat: "Telas", atual: 290, min: 200 },
      { cat: "Fios", atual: 180, min: 250 },
      { cat: "Acessórios", atual: 720, min: 500 },
    ],
    alertas: [
      { item: "Perfil U 100x40", atual: 38, min: 80, status: "red" },
      { item: "Fio Trefilado 2,4mm", atual: 92, min: 120, status: "amber" },
      { item: "Tela Sold. 15x15", atual: 145, min: 100, status: "green" },
      { item: "Tubo Galv. 1.1/2”", atual: 64, min: 90, status: "amber" },
      { item: "Chapa 6mm", atual: 22, min: 60, status: "red" },
    ],
  },
  entregas: {
    kpis: [
      { label: "No Prazo", value: "94,2%", delta: "+1,3pp", up: true, color: C.green },
      { label: "Em Trânsito", value: "187", delta: "+12", up: true, color: C.blue },
      { label: "Tempo Médio", value: "2,4 dias", delta: "-0,3", up: true, color: C.gold },
      { label: "Devoluções", value: "1,8%", delta: "-0,2pp", up: true, color: C.amber },
    ],
    historico: Array.from({ length: 12 }, (_, i) => {
      const meses = [
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
      ];
      return {
        m: meses[i],
        prazo: 80 + i,
        atrasado: 10 - Math.floor(i / 3),
        transito: 12 - Math.floor(i / 4),
      };
    }),
    transp: [
      { nome: "TransLog Sul", pct: 96, tone: "green" },
      { nome: "Rodoexpress", pct: 92, tone: "green" },
      { nome: "Cargas Brasil", pct: 81, tone: "amber" },
      { nome: "ViaRápida", pct: 68, tone: "red" },
    ],
  },
  clientes: {
    kpis: [
      { label: "Clientes Ativos", value: "3.482", delta: "+124", up: true, color: C.gold },
      { label: "NPS", value: "72", delta: "Excelente", up: true, color: C.green },
      { label: "LTV Médio", value: "R$ 48K", delta: "+8,2%", up: true, color: C.blue },
      { label: "Churn Rate", value: "4,1%", delta: "+0,6pp", up: false, color: C.red, alert: true },
    ],
    flow: [
      { m: "Dez", novos: 142, churn: -38 },
      { m: "Jan", novos: 128, churn: -42 },
      { m: "Fev", novos: 156, churn: -35 },
      { m: "Mar", novos: 178, churn: -48 },
      { m: "Abr", novos: 164, churn: -52 },
      { m: "Mai", novos: 192, churn: -61 },
    ],
    seg: [
      { name: "Premium", value: 18, color: C.gold },
      { name: "Recorrente", value: 42, color: C.blue },
      { name: "Ocasional", value: 28, color: C.green },
      { name: "Inativo", value: 12, color: C.muted },
    ],
  },
  produtos: {
    kpis: [
      { label: "SKUs Ativos", value: "1.284", delta: "+18", up: true, color: C.gold },
      { label: "Mais Vendido", value: "MK-1042", delta: "Aço Carbono", up: true, color: C.green },
      { label: "Margem Média", value: "28,4%", delta: "+1,1pp", up: true, color: C.blue },
      { label: "Baixo Giro", value: "47", delta: "SKUs", up: false, color: C.red, alert: true },
    ],
    cats: Array.from({ length: 12 }, (_, i) => {
      const meses = [
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
      ];
      return {
        m: meses[i],
        Aço: 80 + i * 4,
        Tubos: 60 + i * 2,
        Perfis: 50 + i * 3,
        Telas: 40 + i,
      };
    }),
    margem: [
      { cat: "Aço Premium", v: 38 },
      { cat: "Perfis", v: 32 },
      { cat: "Telas", v: 28 },
      { cat: "Tubos", v: 24 },
      { cat: "Fios", v: 18 },
      { cat: "Acessórios", v: 14 },
    ],
  },
  compras: {
    kpis: [
      { label: "Volume", value: "R$ 1,68M", delta: "+9,4%", up: true, color: C.gold },
      { label: "Fornecedores Ativos", value: "84", delta: "+3", up: true, color: C.green },
      { label: "Economia Negociada", value: "R$ 142K", delta: "+22%", up: true, color: C.blue },
      { label: "Pedidos Pendentes", value: "27", delta: "-4", up: true, color: C.amber },
    ],
    top: [
      { nome: "Gerdau", v: 420, color: C.gold },
      { nome: "ArcelorMittal", v: 360, color: C.blue },
      { nome: "Usiminas", v: 280, color: C.green },
      { nome: "CSN", v: 210, color: "#8E6FB5" },
      { nome: "Aperam", v: 160, color: C.amber },
    ],
    rating: [
      { nome: "Gerdau", score: 4.8, tone: "green" },
      { nome: "ArcelorMittal", score: 4.5, tone: "green" },
      { nome: "Usiminas", score: 3.9, tone: "amber" },
      { nome: "CSN", score: 3.1, tone: "red" },
    ],
  },
  rh: {
    kpis: [
      { label: "Colaboradores", value: "428", delta: "+12", up: true, color: C.gold },
      { label: "Satisfação", value: "82%", delta: "+3pp", up: true, color: C.green },
      { label: "Produtividade", value: "94 idx", delta: "+1,8", up: true, color: C.blue },
      { label: "Turnover", value: "8,4%", delta: "+1,2pp", up: false, color: C.amber, alert: true },
    ],
    headcount: [
      { dep: "Operações", v: 142 },
      { dep: "Comercial", v: 88 },
      { dep: "Logística", v: 64 },
      { dep: "Administrativo", v: 52 },
      { dep: "TI", v: 38 },
      { dep: "RH", v: 24 },
    ],
    abs: Array.from({ length: 12 }, (_, i) => {
      const meses = [
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
      ];
      return { m: meses[i], v: 3 + Math.sin(i / 2) * 1.2 + (i % 4) * 0.3 };
    }),
  },
};

/* ============================================================
 *  PRIMITIVES
 * ============================================================ */
function Card({
  children,
  topAccent,
  className = "",
}: {
  children: React.ReactNode;
  topAccent?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[2px] ${className}`}
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        padding: 24,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {topAccent && (
        <div className="absolute left-0 right-0 top-0 h-px" style={{ background: topAccent }} />
      )}
      {children}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 88;
  const h = 28;
  const bw = w / data.length - 1;
  return (
    <svg width={w} height={h}>
      {data.map((v, i) => {
        const bh = ((v - min) / (max - min || 1)) * h * 0.9 + h * 0.1;
        return (
          <rect
            key={i}
            x={i * (bw + 1)}
            y={h - bh}
            width={bw}
            height={bh}
            fill={color}
            opacity={0.55 + (i / data.length) * 0.45}
          />
        );
      })}
    </svg>
  );
}

type Kpi = {
  label: string;
  value: string;
  color: string;
  alert?: boolean;
  spark?: number[];
  delta?: string;
  up?: boolean;
};

function KpiCard({ k }: { k: Kpi }) {
  const accent = k.alert ? C.red : k.color;
  const footer = k.delta !== undefined || k.spark;
  return (
    <Card topAccent={accent}>
      <div className="flex flex-col gap-4">
        <div
          className="font-geist text-[10px] uppercase tracking-[0.18em]"
          style={{ color: C.muted }}
        >
          {k.label}
        </div>
        <div
          className="font-fraunces font-light leading-none"
          style={{ color: C.text, fontSize: 38, letterSpacing: "-0.03em" }}
        >
          {k.value}
        </div>
        {footer ? (
          <div className="flex items-end justify-between">
            {k.delta !== undefined ? (
              <div
                className="font-geist flex items-center gap-1 text-[11px]"
                style={{ color: k.up !== undefined ? (k.up ? C.green : C.red) : C.mutedStrong }}
              >
                {k.up !== undefined ? (
                  k.up ? (
                    <TrendingUp size={12} />
                  ) : (
                    <TrendingDown size={12} />
                  )
                ) : null}
                {k.delta}
              </div>
            ) : (
              <span />
            )}
            {k.spark && <Sparkline data={k.spark} color={k.color} />}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function SectionHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div
          className="font-geist text-[10px] uppercase tracking-[0.22em]"
          style={{ color: C.muted }}
        >
          {sub}
        </div>
        <h3
          className="font-fraunces font-light"
          style={{ color: C.text, fontSize: 18, letterSpacing: "-0.02em", marginTop: 4 }}
        >
          {title}
        </h3>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

type ChartTypeKey = "bar" | "line" | "area" | "hbar" | "donut" | "sbar";

import type { LucideIcon } from "lucide-react";
const CHART_ICONS: Record<ChartTypeKey, LucideIcon> = {
  bar: BarChart2,
  line: LineIcon,
  area: AreaIcon,
  hbar: AlignLeft,
  donut: PieIcon,
  sbar: Layers,
};

function ChartSwitcher<T extends ChartTypeKey>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: T[];
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => {
        const Icon = CHART_ICONS[opt as ChartTypeKey] as LucideIcon;
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-label={opt}
            className="flex h-7 w-7 items-center justify-center transition-colors"
            style={{
              borderRadius: 6,
              background: active ? "rgba(245,213,71,0.15)" : "transparent",
              border: `1px solid ${active ? "rgba(245,213,71,0.35)" : "transparent"}`,
              color: active ? C.gold : "rgba(255,255,255,0.28)",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "#0F1218",
    border: `1px solid ${C.borderStrong}`,
    borderRadius: 2,
    fontSize: 11,
    fontFamily: "Geist, sans-serif",
    color: C.text,
  },
  labelStyle: { color: C.mutedStrong, fontSize: 10, textTransform: "uppercase" as const },
  itemStyle: { color: C.text },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

const axisStyle = { fill: C.muted, fontSize: 10, fontFamily: "Geist, sans-serif" };

/* ============================================================
 *  KPI ROW
 * ============================================================ */
function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((k) => (
        <KpiCard key={k.label} k={k} />
      ))}
    </div>
  );
}

function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <div className="flex animate-pulse flex-col gap-4">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="h-10 w-40 max-w-full rounded bg-white/10" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ============================================================
 *  SECTIONS
 * ============================================================ */
type RangeKey = "1d" | "1w" | "1m" | "all";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "1d", label: "1 Dia" },
  { key: "1w", label: "1 Semana" },
  { key: "1m", label: "1 Mês" },
  { key: "all", label: "Tudo" },
];

const SLICE_COUNT: Record<RangeKey, number> = { "1d": 1, "1w": 3, "1m": 6, all: 12 };

function sliceByRange<T>(arr: T[], range: RangeKey): T[] {
  const n = SLICE_COUNT[range];
  return arr.slice(-Math.min(n, arr.length));
}

function RangeFilterBar({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        Período
      </div>
      <RangeFilter value={value} onChange={onChange} />
    </div>
  );
}

function RangeFilter({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1"
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="px-2 py-1.5 font-geist text-[10px] uppercase tracking-[0.1em] transition-colors sm:px-3 sm:text-[11px] sm:tracking-[0.12em]"
            style={{
              borderRadius: 6,
              background: active ? C.goldSoft : "transparent",
              color: active ? C.gold : C.mutedStrong,
              border: active ? `1px solid ${C.gold}40` : "1px solid transparent",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DashboardSection() {
  const d = DATA.dashboard;
  const [t1, setT1] = useState<"line" | "bar" | "area">("line");
  const [t2, setT2] = useState<"donut" | "bar">("donut");
  const [range, setRange] = useState<RangeKey>("all");
  const filteredReceita = sliceByRange(d.receitaMeta, range);

  return (
    <div className="flex flex-col gap-4">
      <RangeFilterBar value={range} onChange={setRange} />

      <KpiRow items={d.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionHead
            title="Receita vs Meta"
            sub="ÚLTIMOS 12 MESES"
            actions={
              <ChartSwitcher value={t1} onChange={setT1} options={["bar", "line", "area"]} />
            }
          />
          <div className="mb-3 flex gap-5 font-geist text-[11px]" style={{ color: C.mutedStrong }}>
            <span className="flex items-center gap-2">
              <span className="inline-block h-[2px] w-4" style={{ background: C.gold }} /> Realizado
            </span>
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-[2px] w-4"
                style={{ borderTop: `2px dashed ${C.blue}` }}
              />{" "}
              Meta
            </span>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer key={t1}>
              {t1 === "line" ? (
                <LineChart
                  data={filteredReceita}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="real"
                    stroke={C.gold}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="meta"
                    stroke={C.blue}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              ) : t1 === "area" ? (
                <AreaChart
                  data={filteredReceita}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="real"
                    stroke={C.gold}
                    strokeWidth={2}
                    fill={C.gold}
                    fillOpacity={0.12}
                  />
                  <Area
                    type="monotone"
                    dataKey="meta"
                    stroke={C.blue}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill={C.blue}
                    fillOpacity={0.06}
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={filteredReceita}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="real" fill={C.gold} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="meta" fill={C.blue} radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionHead
            title="Mix de Receita"
            sub="DISTRIBUIÇÃO"
            actions={<ChartSwitcher value={t2} onChange={setT2} options={["donut", "bar"]} />}
          />
          <div className="relative" style={{ height: 240 }}>
            <ResponsiveContainer key={t2}>
              {t2 === "donut" ? (
                <PieChart>
                  <Pie
                    data={d.mix}
                    dataKey="value"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {d.mix.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              ) : (
                <BarChart data={d.mix} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {d.mix.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
            {t2 === "donut" && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="font-geist text-[9px] uppercase tracking-[0.2em]"
                  style={{ color: C.muted }}
                >
                  Total
                </div>
                <div
                  className="font-fraunces font-light"
                  style={{ color: C.text, fontSize: 24, letterSpacing: "-0.03em" }}
                >
                  R$ 2,4M
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-1.5 font-geist text-[11px]">
            {d.mix.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between"
                style={{ color: C.mutedStrong }}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span style={{ color: C.text }}>{s.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <SectionHead title="Top Produtos" sub="RECEITA NO MÊS" />
          <table className="w-full font-geist text-[12px]">
            <tbody>
              {d.topProdutos.map((p) => (
                <tr key={p.sku} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="py-2.5 pr-2" style={{ color: C.muted, fontSize: 10 }}>
                    {p.sku}
                  </td>
                  <td className="py-2.5 pr-2" style={{ color: C.text }}>
                    {p.nome}
                  </td>
                  <td
                    className="py-2.5 pr-2 text-right tabular-nums"
                    style={{ color: C.mutedStrong }}
                  >
                    {p.receita}
                  </td>
                  <td
                    className="py-2.5 text-right tabular-nums"
                    style={{ color: p.up ? C.green : C.red }}
                  >
                    {p.pct}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <SectionHead title="Status Operacional" sub="INDICADORES" />
          <div className="flex flex-col gap-4">
            {d.status.map((s) => {
              const tone = s.tone === "green" ? C.green : s.tone === "amber" ? C.amber : C.red;
              return (
                <div key={s.label}>
                  <div className="mb-1.5 flex justify-between font-geist text-[11px]">
                    <span style={{ color: C.mutedStrong }}>{s.label}</span>
                    <span className="tabular-nums" style={{ color: C.text }}>
                      {s.pct}%
                    </span>
                  </div>
                  <div className="h-1" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full" style={{ width: `${s.pct}%`, background: tone }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHead title="Alertas do Dia" sub="ATIVIDADE" />
          <div className="flex flex-col gap-3">
            {d.alertas.map((a, i) => {
              const tone = a.tone === "red" ? C.red : a.tone === "amber" ? C.amber : C.green;
              return (
                <div
                  key={i}
                  className="p-3"
                  style={{
                    background: `${tone}10`,
                    border: `1px solid ${tone}33`,
                    borderLeftWidth: 2,
                  }}
                >
                  <div
                    className="font-geist text-[9px] uppercase tracking-[0.2em]"
                    style={{ color: tone }}
                  >
                    {a.level}
                  </div>
                  <div
                    className="mt-1 font-geist text-[12px] leading-snug"
                    style={{ color: C.text }}
                  >
                    {a.text}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
 *  EMPRESAS / UNIDADES — API backend (SQLite snapshot pedidos)
 * ============================================================ */
type EmpresaChartRow = {
  CODEMP: number;
  name: string;
  value: number;
  faturamento: number;
  color: string;
};

const EMPRESA_CHART_COLORS = [
  "#F5D547",
  "#4DA3FF",
  "#B57EDC",
  "#2EBD8F",
  "#F39C7A",
  "#E05555",
  "#7ED4E0",
] as const;

function shortEmpresaLabel(nome: string, maxLen = 18): string {
  const trimmed = nome.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function EmpresaSelector({
  lista,
  value,
  onChange,
  disabled,
}: {
  lista: EmpresaDashboardDto[];
  value: EmpresaSeleção;
  onChange: (v: EmpresaSeleção) => void;
  disabled?: boolean;
}) {
  const isMobile = useIsMobile();

  const label = (cod: EmpresaSeleção) =>
    cod === "todas"
      ? "Todas as Empresas"
      : (lista.find((e) => e.CODEMP === cod)?.NOMEFANTASIA ?? "—");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        Empresa
      </div>

      {isMobile ? (
        <Select
          value={value === "todas" ? "todas" : String(value)}
          onValueChange={(v) => onChange(v === "todas" ? "todas" : Number(v))}
          disabled={disabled}
        >
          <SelectTrigger
            className="h-9 w-full min-w-[200px] font-geist text-[11px] uppercase tracking-[0.1em]"
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
              color: C.gold,
            }}
          >
            <SelectValue>{label(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas" className="font-geist text-[11px] uppercase tracking-[0.1em]">
              Todas as Empresas
            </SelectItem>
            {lista.map((e) => (
              <SelectItem
                key={e.CODEMP}
                value={String(e.CODEMP)}
                className="font-geist text-[11px] uppercase tracking-[0.1em]"
              >
                {e.NOMEFANTASIA}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div
          className="flex flex-wrap items-center gap-1 p-1"
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("todas")}
            className="px-2 py-1.5 font-geist text-[10px] uppercase tracking-[0.1em] transition-colors sm:px-3 sm:text-[11px]"
            style={{
              borderRadius: 6,
              background: value === "todas" ? C.goldSoft : "transparent",
              color: value === "todas" ? C.gold : C.mutedStrong,
              border: value === "todas" ? `1px solid ${C.gold}40` : "1px solid transparent",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            Todas as Empresas
          </button>
          {lista.map((e) => {
            const active = value === e.CODEMP;
            return (
              <button
                key={e.CODEMP}
                type="button"
                disabled={disabled}
                onClick={() => onChange(e.CODEMP)}
                className="px-2 py-1.5 font-geist text-[10px] uppercase tracking-[0.1em] transition-colors sm:px-3 sm:text-[11px]"
                style={{
                  borderRadius: 6,
                  background: active ? C.goldSoft : "transparent",
                  color: active ? C.gold : C.mutedStrong,
                  border: active ? `1px solid ${C.gold}40` : "1px solid transparent",
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {e.NOMEFANTASIA}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VendedorSelector({
  lista,
  value,
  onChange,
  disabled,
}: {
  lista: VendedorDto[];
  value: VendedorSeleção;
  onChange: (v: VendedorSeleção) => void;
  disabled?: boolean;
}) {
  const label =
    value === "todos"
      ? "Todos os Vendedores"
      : (lista.find((v) => v.CODVEND === value)?.APELIDO ?? "—");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        Vendedor
      </div>

      <Select
        value={value === "todos" ? "todos" : String(value)}
        onValueChange={(v) => onChange(v === "todos" ? "todos" : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger
          className="h-9 w-full min-w-[220px] font-geist text-[11px] uppercase tracking-[0.1em] sm:w-auto"
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            color: C.gold,
          }}
        >
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value="todos" className="font-geist text-[11px] uppercase tracking-[0.1em]">
            Todos os Vendedores
          </SelectItem>
          {lista.map((v) => (
            <SelectItem
              key={v.CODVEND}
              value={String(v.CODVEND)}
              className="font-geist text-[11px] uppercase tracking-[0.1em]"
            >
              {v.APELIDO}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center font-geist text-[12px]"
      style={{ height: 240, color: C.mutedStrong }}
    >
      {message}
    </div>
  );
}

function localDateInputValue(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDatePt(date: string): string {
  const [yyyy, mm, dd] = date.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function EmpresasDashboardSection() {
  const queryClient = useQueryClient();
  const [empresa, setEmpresa] = useState<EmpresaSeleção>("todas");
  const [vendedor, setVendedor] = useState<VendedorSeleção>("todos");
  const [t2, setT2] = useState<"donut" | "bar">("donut");

  const qEmp = useEmpresas();
  const qVend = useVendedores();
  const qFat = useFaturamentoConsolidado(empresa, vendedor);
  const qMix = useFaturamentoPorEmpresa(vendedor);

  const listaEmpresas = useMemo(() => {
    const raw = qEmp.data?.empresas ?? [];
    return [...raw].sort((a, b) => a.ordem - b.ordem || a.CODEMP - b.CODEMP);
  }, [qEmp.data?.empresas]);

  const listaVendedores = useMemo(() => {
    return qVend.data?.vendedores ?? [];
  }, [qVend.data?.vendedores]);

  const vendedoresDisabled = qVend.isPending || !!qVend.error || listaVendedores.length === 0;

  const mixRows: EmpresaChartRow[] = useMemo(() => {
    if (!qMix.data?.empresas.length) return [];
    return qMix.data.empresas.map((row, i) => ({
      CODEMP: row.CODEMP,
      name: shortEmpresaLabel(row.NOMEFANTASIA),
      value: row.percentual,
      faturamento: row.faturamento,
      color: EMPRESA_CHART_COLORS[i % EMPRESA_CHART_COLORS.length]!,
    }));
  }, [qMix.data]);

  const empresaLabel =
    empresa === "todas"
      ? "Todas as Empresas"
      : (listaEmpresas.find((e) => e.CODEMP === empresa)?.NOMEFANTASIA ?? "…");

  const vendedorLabel =
    vendedor === "todos"
      ? null
      : (listaVendedores.find((v) => v.CODVEND === vendedor)?.APELIDO ?? "…");

  const path = vendedorLabel
    ? `Maker > ${empresaLabel} · Vendedor: ${vendedorLabel}`
    : `Maker > ${empresaLabel}`;

  const snapshotAt = qFat.data?.snapshot_at ?? qMix.data?.snapshot_at ?? null;

  const aguardandoSync =
    qFat.isSuccess &&
    qFat.data.snapshot_at === null &&
    qFat.data.dia === 0 &&
    qFat.data.semana_7d === 0 &&
    qFat.data.mes_atual === 0 &&
    qFat.data.ano_atual === 0;

  const syncAntigo =
    qFat.isSuccess &&
    !!qFat.data.snapshot_at &&
    Date.now() - new Date(qFat.data.snapshot_at).getTime() > 30 * 60 * 1000;

  const showFatSkeleton = !qFat.data && qFat.isPending;

  const fatKpis: Kpi[] =
    !qFat.data || aguardandoSync
      ? aguardandoSync && qFat.data
        ? [
            { label: "Faturamento 1 Dia", value: "Aguardando sync", color: C.gold },
            { label: "Faturamento 1 Semana", value: "Aguardando sync", color: C.green },
            { label: "Faturamento 1 Mês", value: "Aguardando sync", color: C.blue },
            { label: "Total 2026", value: "Aguardando sync", color: C.amber },
          ]
        : []
      : [
          { label: "Faturamento Dia", value: formatBRLCompact(qFat.data.dia), color: C.gold },
          {
            label: "Faturamento 1 Semana",
            value: formatBRLCompact(qFat.data.semana_7d),
            color: C.green,
          },
          {
            label: "Faturamento 1 Mês",
            value: formatBRLCompact(qFat.data.mes_atual),
            color: C.blue,
          },
          {
            label: "Total 2026",
            value: formatBRLCompact(qFat.data.ano_atual),
            color: C.amber,
          },
        ];

  const mixTooltipFormatter = (item: { payload?: unknown }) => {
    const row = item.payload as EmpresaChartRow | undefined;
    if (!row) return ["", ""];
    return [`${formatBRL(row.faturamento)} (${row.value.toFixed(1)}%)`, row.name];
  };

  const empresasDisabled = qEmp.isPending || !!qEmp.error || listaEmpresas.length === 0;

  return (
    <div className="mt-10 flex flex-col gap-4 border-t pt-8" style={{ borderColor: C.border }}>
      {qEmp.error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qEmp.error instanceof ApiError
              ? qEmp.error.message
              : "Não foi possível carregar empresas."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 font-geist uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["empresas"] })}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {syncAntigo && qFat.data?.snapshot_at && (
        <div
          className="px-3 py-2 font-geist text-[11px]"
          style={{
            border: `1px solid rgba(245,213,71,0.35)`,
            background: "rgba(245,213,71,0.08)",
            color: C.amber,
          }}
        >
          Dados podem estar desatualizados — última sincronização dos pedidos:{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(qFat.data.snapshot_at))}{" "}
          (
          {formatDistanceToNow(new Date(qFat.data.snapshot_at), {
            locale: ptBR,
            addSuffix: true,
          })}
          )
        </div>
      )}

      {snapshotAt !== null && qFat.isSuccess && !syncAntigo && !aguardandoSync && (
        <div
          className="font-geist text-[10px] uppercase tracking-[0.14em]"
          style={{ color: C.muted }}
        >
          Pedidos atualizados em{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(snapshotAt))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <h2
            className="font-fraunces font-light"
            style={{ color: C.text, fontSize: "clamp(18px, 4vw, 22px)", letterSpacing: "-0.02em" }}
          >
            Análise por Empresa
          </h2>
          <span
            className="font-geist text-[10px] uppercase tracking-[0.2em]"
            style={{ color: C.muted }}
          >
            Sankhya · Unidades
          </span>
        </div>
        <div className="font-geist text-[12px]" style={{ color: C.mutedStrong }}>
          {path}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <EmpresaSelector
          lista={listaEmpresas}
          value={empresa}
          onChange={setEmpresa}
          disabled={empresasDisabled}
        />
        <VendedorSelector
          lista={listaVendedores}
          value={vendedor}
          onChange={setVendedor}
          disabled={vendedoresDisabled}
        />
      </div>

      {qFat.error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qFat.error instanceof ApiError
              ? qFat.error.message
              : "Não foi possível carregar faturamento."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["faturamentoConsolidado"] })
            }
          >
            Tentar novamente
          </button>
        </div>
      )}

      {showFatSkeleton ? (
        <KpiRowSkeleton />
      ) : fatKpis.length > 0 ? (
        <KpiRow items={fatKpis} />
      ) : null}

      {qMix.error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qMix.error instanceof ApiError
              ? qMix.error.message
              : "Não foi possível carregar distribuição."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: ["faturamentoPorEmpresa"],
                exact: true,
              })
            }
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionHead title="Faturamento por Empresa" sub="DISTRIBUIÇÃO 2026" />
          {!qMix.data && qMix.isPending ? (
            <ChartPlaceholder message="Carregando gráfico…" />
          ) : mixRows.length === 0 ? (
            <ChartPlaceholder message="Sem dados para 2026 ou aguardando sincronização." />
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={mixRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ ...axisStyle, fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(_value, _name, item) => mixTooltipFormatter(item)}
                  />
                  <Bar dataKey="faturamento" radius={[3, 3, 0, 0]}>
                    {mixRows.map((row) => (
                      <Cell key={row.CODEMP} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <SectionHead
            title="Mix de Receita"
            sub="POR EMPRESA"
            actions={<ChartSwitcher value={t2} onChange={setT2} options={["donut", "bar"]} />}
          />
          {!qMix.data && qMix.isPending ? (
            <ChartPlaceholder message="Carregando gráfico…" />
          ) : mixRows.length === 0 ? (
            <ChartPlaceholder message="Sem dados para 2026 ou aguardando sincronização." />
          ) : (
            <>
              <div className="relative" style={{ height: 240 }}>
                <ResponsiveContainer key={t2}>
                  {t2 === "donut" ? (
                    <PieChart>
                      <Pie
                        data={mixRows}
                        dataKey="value"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {mixRows.map((row) => (
                          <Cell key={row.CODEMP} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(_value, _name, item) => mixTooltipFormatter(item)}
                      />
                    </PieChart>
                  ) : (
                    <BarChart data={mixRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ ...axisStyle, fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(_value, _name, item) => mixTooltipFormatter(item)}
                      />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {mixRows.map((row) => (
                          <Cell key={row.CODEMP} fill={row.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
                {t2 === "donut" && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div
                      className="font-geist text-[9px] uppercase tracking-[0.2em]"
                      style={{ color: C.muted }}
                    >
                      Total (ano)
                    </div>
                    <div
                      className="font-fraunces font-light"
                      style={{
                        color: C.text,
                        fontSize: 22,
                        letterSpacing: "-0.03em",
                        textAlign: "center",
                        paddingInline: 8,
                      }}
                    >
                      {qMix.data && qMix.data.total > 0
                        ? formatBRLCompact(qMix.data.total)
                        : formatBRLCompact(0)}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-1.5 font-geist text-[11px]">
                {mixRows.map((row) => (
                  <div
                    key={row.CODEMP}
                    className="flex items-center justify-between"
                    style={{ color: C.mutedStrong }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0" style={{ background: row.color }} />
                      {shortEmpresaLabel(
                        listaEmpresas.find((e) => e.CODEMP === row.CODEMP)?.NOMEFANTASIA ??
                          row.name,
                        28,
                      )}
                    </span>
                    <span className="tabular-nums" style={{ color: C.text }}>
                      {row.value.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

const FIN_DIST_COLORS = ["#F5D547", "#4DA3FF", "#B57EDC", "#2EBD8F", "#E05555"] as const;

const FLUXO_JANELAS = [
  { meses: 3, label: "3 meses" },
  { meses: 6, label: "6 meses" },
  { meses: 12, label: "12 meses" },
  { meses: 18, label: "18 meses" },
] as const;

function CompetenciaFinanceiraBar({
  value,
  onChange,
}: {
  value: FinanceiroDrePeriodo;
  onChange: (p: FinanceiroDrePeriodo) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        Competência — DRE e despesas
      </div>
      <div
        className="inline-flex flex-wrap items-center gap-1 p-1"
        style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}
      >
        {(["mes", "ano"] as const).map((p) => {
          const active = value === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className="px-2 py-1.5 font-geist text-[10px] uppercase tracking-[0.1em] transition-colors sm:px-3 sm:text-[11px]"
              style={{
                borderRadius: 6,
                background: active ? C.goldSoft : "transparent",
                color: active ? C.gold : C.mutedStrong,
                border: active ? `1px solid ${C.gold}40` : "1px solid transparent",
              }}
            >
              {p === "mes" ? "Mês atual" : "Ano atual"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FluxoJanelaBar({
  meses,
  onChange,
}: {
  meses: number;
  onChange: (m: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        Fluxo de caixa — janela
      </div>
      <div
        className="inline-flex flex-wrap items-center gap-1 p-1"
        style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}
      >
        {FLUXO_JANELAS.map((opt) => {
          const active = meses === opt.meses;
          return (
            <button
              key={opt.meses}
              type="button"
              onClick={() => onChange(opt.meses)}
              className="px-2 py-1.5 font-geist text-[10px] uppercase tracking-[0.1em] transition-colors sm:px-3 sm:text-[11px]"
              style={{
                borderRadius: 6,
                background: active ? C.goldSoft : "transparent",
                color: active ? C.gold : C.mutedStrong,
                border: active ? `1px solid ${C.gold}40` : "1px solid transparent",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FinanceiroSection() {
  const queryClient = useQueryClient();
  const [empresa, setEmpresa] = useState<EmpresaSeleção>("todas");
  const [periodoComp, setPeriodoComp] = useState<FinanceiroDrePeriodo>("ano");
  const [fluxoMeses, setFluxoMeses] = useState<number>(12);
  const [t1, setT1] = useState<"bar" | "line" | "area">("bar");
  const [t2, setT2] = useState<"donut" | "bar">("donut");
  const [t3, setT3] = useState<"area" | "line" | "bar">("area");

  const qEmp = useEmpresas();
  const listaEmpresas = useMemo(() => {
    const raw = qEmp.data?.empresas ?? [];
    return [...raw].sort((a, b) => a.ordem - b.ordem || a.CODEMP - b.CODEMP);
  }, [qEmp.data?.empresas]);

  const qDre = useFinanceiroDre(empresa, periodoComp);
  const qDist = useDistribuicaoDespesas(empresa, periodoComp);
  const qFlux = useFluxoCaixa(empresa, fluxoMeses);
  const qContas = useContasAbertasResumo(empresa, "receber");

  const snapshotAt =
    qDre.data?.snapshot_at ?? qFlux.data?.snapshot_at ?? qDist.data?.snapshot_at ?? null;

  const syncAntigo =
    qDre.isSuccess &&
    !!qDre.data.snapshot_at &&
    Date.now() - new Date(qDre.data.snapshot_at).getTime() > 30 * 60 * 1000;

  const semTitulosSync =
    qDre.isSuccess &&
    qDre.data.snapshot_at === null &&
    qDre.data.receita_bruta === 0 &&
    qDre.data.despesas_total === 0;

  const empresaDisabled = qEmp.isPending || !!qEmp.error || listaEmpresas.length === 0;

  const distribRows = useMemo(() => {
    const cats = qDist.data?.categorias ?? [];
    return cats.map((c, i) => ({
      name: c.categoria,
      value: c.percentual,
      valorAbs: c.valor,
      color: FIN_DIST_COLORS[i % FIN_DIST_COLORS.length]!,
    }));
  }, [qDist.data]);

  const dreResumo = useMemo(() => {
    const d = qDre.data;
    if (!d) return [];
    const resCor = d.resultado_operacional >= 0 ? C.green : C.red;
    return [
      { nome: "Receita bruta", valor: d.receita_bruta, cor: C.gold },
      { nome: "Despesas totais", valor: d.despesas_total, cor: C.red },
      { nome: "Resultado operac.", valor: d.resultado_operacional, cor: resCor },
    ];
  }, [qDre.data]);

  const fluxoChartData = useMemo(
    () =>
      (qFlux.data?.serie ?? []).map((s) => ({
        ...s,
        labelMes: formatMesAnoPt(s.mes),
      })),
    [qFlux.data?.serie],
  );

  const showKpiSkeleton = !qDre.data && qDre.isPending;

  const kpisFinance: Kpi[] =
    semTitulosSync && qDre.data
      ? [
          { label: "Receita bruta", value: "Aguardando sync", color: C.gold },
          { label: "Despesas totais", value: "Aguardando sync", color: C.red },
          { label: "Resultado operac.", value: "Aguardando sync", color: C.green },
          {
            label: "Contas a receber (aberto)",
            value: "Aguardando sync",
            color: C.blue,
          },
        ]
      : qDre.data
        ? [
            {
              label: "Receita bruta",
              value: formatBRLCompact(qDre.data.receita_bruta),
              color: C.gold,
            },
            {
              label: "Despesas totais",
              value: formatBRLCompact(qDre.data.despesas_total),
              color: C.red,
            },
            {
              label: "Resultado operac.",
              value: `${formatBRLCompact(qDre.data.resultado_operacional)} · ${qDre.data.margem_pct.toFixed(1)}%`,
              color: qDre.data.resultado_operacional >= 0 ? C.green : C.red,
            },
            {
              label: "Contas a receber (aberto)",
              value:
                qContas.data !== undefined
                  ? formatBRLCompact(qContas.data.valor_total_aberto)
                  : "…",
              color: C.blue,
            },
          ]
        : [];

  const periodoSub =
    periodoComp === "mes"
      ? "Competência mês civil atual (títulos realizados)"
      : "Competência ano civil atual (títulos realizados)";

  return (
    <div className="flex flex-col gap-4">
      {qEmp.error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qEmp.error instanceof ApiError ? qEmp.error.message : "Erro ao carregar empresas."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["empresas"] })}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {syncAntigo && qDre.data?.snapshot_at && (
        <div
          className="px-3 py-2 font-geist text-[11px]"
          style={{
            border: `1px solid rgba(245,213,71,0.35)`,
            background: "rgba(245,213,71,0.08)",
            color: C.amber,
          }}
        >
          Títulos podem estar desatualizados — última sync:{" "}
          {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
            new Date(qDre.data.snapshot_at),
          )}{" "}
          (
          {formatDistanceToNow(new Date(qDre.data.snapshot_at), {
            locale: ptBR,
            addSuffix: true,
          })}
          )
        </div>
      )}

      {snapshotAt !== null && qDre.isSuccess && !syncAntigo && !semTitulosSync && (
        <div className="font-geist text-[10px] uppercase tracking-[0.14em]" style={{ color: C.muted }}>
          Títulos atualizados em{" "}
          {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
            new Date(snapshotAt),
          )}
        </div>
      )}

      <EmpresaSelector
        lista={listaEmpresas}
        value={empresa}
        onChange={setEmpresa}
        disabled={empresaDisabled}
      />

      <CompetenciaFinanceiraBar value={periodoComp} onChange={setPeriodoComp} />
      <FluxoJanelaBar meses={fluxoMeses} onChange={setFluxoMeses} />

      {(qDre.error || qDist.error || qFlux.error || qContas.error) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qDre.error instanceof ApiError
              ? qDre.error.message
              : qDist.error instanceof ApiError
                ? qDist.error.message
                : qFlux.error instanceof ApiError
                  ? qFlux.error.message
                  : qContas.error instanceof ApiError
                    ? qContas.error.message
                    : "Erro ao carregar dados financeiros."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["financeiroDre"] });
              void queryClient.invalidateQueries({ queryKey: ["distribuicaoDespesas"] });
              void queryClient.invalidateQueries({ queryKey: ["fluxoCaixa"] });
              void queryClient.invalidateQueries({ queryKey: ["contasAbertasResumo"] });
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {showKpiSkeleton ? <KpiRowSkeleton /> : kpisFinance.length > 0 ? <KpiRow items={kpisFinance} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionHead
            title="DRE — resumo do período"
            sub={periodoSub}
            actions={
              <ChartSwitcher value={t1} onChange={setT1} options={["bar", "line", "area"]} />
            }
          />
          <div className="mb-1 font-geist text-[10px]" style={{ color: C.mutedStrong }}>
            {qDre.data?.periodo ?? "—"} · Valores em R$ (competência, sem provisão)
          </div>
          {!qDre.data && qDre.isPending ? (
            <ChartPlaceholder message="Carregando DRE…" />
          ) : dreResumo.length === 0 ? (
            <ChartPlaceholder message="Sem dados para o período." />
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer key={t1}>
                {t1 === "bar" ? (
                  <BarChart
                    layout="vertical"
                    data={dreResumo}
                    margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={axisStyle}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatBRLCompact(Number(v))}
                    />
                    <YAxis
                      dataKey="nome"
                      type="category"
                      width={118}
                      tick={axisStyle}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => formatBRL(v)}
                      labelFormatter={(_, p) => {
                        const row = p?.[0]?.payload as (typeof dreResumo)[0] | undefined;
                        return row?.nome ?? "";
                      }}
                    />
                    <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
                      {dreResumo.map((row) => (
                        <Cell key={row.nome} fill={row.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : t1 === "line" ? (
                  <LineChart data={dreResumo} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="nome" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke={C.gold}
                      strokeWidth={2}
                      dot={{ r: 4, stroke: C.gold, strokeWidth: 1, fill: C.bg }}
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={dreResumo} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="nome" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke={C.gold}
                      strokeWidth={2}
                      fill={C.gold}
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <SectionHead
            title="Distribuição de despesas"
            sub={periodoComp === "mes" ? "Mês atual" : "Ano atual"}
            actions={<ChartSwitcher value={t2} onChange={setT2} options={["donut", "bar"]} />}
          />
          {!qDist.data && qDist.isPending ? (
            <ChartPlaceholder message="Carregando…" />
          ) : distribRows.length === 0 ? (
            <ChartPlaceholder message="Sem despesas categorizadas no período." />
          ) : (
            <>
              <div style={{ height: 220 }}>
                <ResponsiveContainer key={t2}>
                  {t2 === "donut" ? (
                    <PieChart>
                      <Pie
                        data={distribRows}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {distribRows.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(v: number, _n, item) => {
                          const payload = item?.payload as (typeof distribRows)[0];
                          const abs = payload?.valorAbs ?? 0;
                          return [`${typeof v === "number" ? v.toFixed(1) : v}% (${formatBRL(abs)})`, payload?.name ?? ""];
                        }}
                      />
                    </PieChart>
                  ) : (
                    <BarChart data={distribRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {distribRows.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 font-geist text-[11px] sm:grid-cols-2">
                {distribRows.map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-2"
                    style={{ color: C.mutedStrong }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums" style={{ color: C.text }}>
                      {row.value.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
      <Card>
        <SectionHead
          title="Fluxo de caixa mensal"
          sub="Saldo líquido (entradas − saídas) por mês baixado"
          actions={<ChartSwitcher value={t3} onChange={setT3} options={["area", "line", "bar"]} />}
        />
        {!qFlux.data && qFlux.isPending ? (
          <ChartPlaceholder message="Carregando fluxo…" />
        ) : fluxoChartData.length === 0 ? (
          <ChartPlaceholder message="Sem movimentações com DHBAIXA na janela." />
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer key={t3}>
              {t3 === "area" ? (
                <AreaChart data={fluxoChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="goldFillFin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.gold} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="labelMes" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => formatBRL(v)}
                    labelFormatter={(l, p) => {
                      const row = p?.[0]?.payload as (typeof fluxoChartData)[0] | undefined;
                      return row
                        ? `${l} · entradas ${formatBRL(row.entradas)} · saídas ${formatBRL(row.saidas)}`
                        : String(l);
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    stroke={C.gold}
                    strokeWidth={2}
                    fill="url(#goldFillFin)"
                  />
                </AreaChart>
              ) : t3 === "line" ? (
                <LineChart data={fluxoChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="labelMes" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => formatBRL(v)}
                    labelFormatter={(l, p) => {
                      const row = p?.[0]?.payload as (typeof fluxoChartData)[0] | undefined;
                      return row
                        ? `${l} · entradas ${formatBRL(row.entradas)} · saídas ${formatBRL(row.saidas)}`
                        : String(l);
                    }}
                  />
                  <Line type="monotone" dataKey="saldo" stroke={C.gold} strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={fluxoChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="labelMes" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => formatBRL(v)}
                    labelFormatter={(l, p) => {
                      const row = p?.[0]?.payload as (typeof fluxoChartData)[0] | undefined;
                      return row
                        ? `${l} · entradas ${formatBRL(row.entradas)} · saídas ${formatBRL(row.saidas)}`
                        : String(l);
                    }}
                  />
                  <Bar dataKey="saldo" fill={C.gold} radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

function EstoqueSection() {
  const [empresa, setEmpresa] = useState<EmpresaSeleção>("todas");
  const qEmp = useEmpresas();
  const qEstoque = useEstoque(empresa);
  const [t1, setT1] = useState<"bar" | "line" | "area">("bar");
  const [range, setRange] = useState<RangeKey>("all");
  const d = qEstoque.data ?? DATA.estoque;
  const niveisData = sliceByRange(d.niveis, range);
  const locais = "locais" in d ? d.locais : [];
  const negativos = "negativos" in d ? d.negativos : [];
  const listaEmpresas = useMemo(() => {
    const raw = qEmp.data?.empresas ?? [];
    return [...raw].sort((a, b) => a.ordem - b.ordem || a.CODEMP - b.CODEMP);
  }, [qEmp.data?.empresas]);
  const empresaDisabled = qEmp.isPending || !!qEmp.error || listaEmpresas.length === 0;
  const formatQty = (value: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

  return (
    <div className="flex flex-col gap-4">
      {qEstoque.error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qEstoque.error instanceof ApiError
              ? qEstoque.error.message
              : "Erro ao carregar dados de estoque."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() => void qEstoque.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <EmpresaSelector
        lista={listaEmpresas}
        value={empresa}
        onChange={setEmpresa}
        disabled={empresaDisabled}
      />
      <RangeFilterBar value={range} onChange={setRange} />
      <KpiRow items={d.kpis} />
      <Card>
        <SectionHead
          title="Níveis de Estoque por Categoria"
          sub="ATUAL VS MÍNIMO"
          actions={<ChartSwitcher value={t1} onChange={setT1} options={["bar", "line", "area"]} />}
        />
        <div style={{ height: 280 }}>
          <ResponsiveContainer key={t1}>
            <ComposedChart data={niveisData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="cat" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              {t1 === "bar" && <Bar dataKey="atual" fill={C.gold} radius={[3, 3, 0, 0]} />}
              {t1 === "line" && (
                <Line type="monotone" dataKey="atual" stroke={C.gold} strokeWidth={2} dot={false} />
              )}
              {t1 === "area" && (
                <Area
                  type="monotone"
                  dataKey="atual"
                  stroke={C.gold}
                  strokeWidth={2}
                  fill={C.gold}
                  fillOpacity={0.12}
                />
              )}
              <Line
                type="stepAfter"
                dataKey="min"
                stroke={C.red}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionHead title="Estoque por Local" sub="EMPRESA · LOCAL · SALDO" />
          <div className="overflow-x-auto">
            <table className="w-full font-geist text-[12px]">
              <thead>
                <tr style={{ color: C.muted, fontSize: 10 }}>
                  <th className="py-2 text-left font-normal uppercase tracking-wider">Empresa</th>
                  <th className="py-2 text-left font-normal uppercase tracking-wider">Local</th>
                  <th className="py-2 text-right font-normal uppercase tracking-wider">Itens</th>
                  <th className="py-2 text-right font-normal uppercase tracking-wider">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {locais.map((row) => (
                  <tr key={`${row.empresa}-${row.local}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2.5" style={{ color: C.text }}>{row.empresa}</td>
                    <td className="py-2.5" style={{ color: C.mutedStrong }}>{row.local}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: C.muted }}>{row.linhas}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: row.estoque < 0 ? C.red : C.gold }}>
                      {formatQty(row.estoque)}
                    </td>
                  </tr>
                ))}
                {locais.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center" style={{ color: C.muted }}>
                      Sem dados de local para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHead title="Saldos Negativos" sub="CONFERÊNCIA DE INVENTÁRIO" />
          <div className="overflow-x-auto">
            <table className="w-full font-geist text-[12px]">
              <thead>
                <tr style={{ color: C.muted, fontSize: 10 }}>
                  <th className="py-2 text-left font-normal uppercase tracking-wider">Item</th>
                  <th className="py-2 text-left font-normal uppercase tracking-wider">Origem</th>
                  <th className="py-2 text-right font-normal uppercase tracking-wider">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {negativos.map((row) => (
                  <tr key={`${row.empresa}-${row.local}-${row.item}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="max-w-[320px] py-2.5" style={{ color: C.text }}>
                      <div className="truncate">{row.item}</div>
                    </td>
                    <td className="py-2.5" style={{ color: C.mutedStrong }}>
                      <div>{row.empresa}</div>
                      <div className="mt-1 text-[10px]" style={{ color: C.muted }}>
                        {row.local} · {row.parceiro}
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: C.red }}>
                      {formatQty(row.estoque)}
                    </td>
                  </tr>
                ))}
                {negativos.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center" style={{ color: C.muted }}>
                      Nenhum saldo negativo encontrado para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card>
        <SectionHead title="Alertas de Estoque" sub="ITENS CRÍTICOS" />
        <table className="w-full font-geist text-[12px]">
          <thead>
            <tr style={{ color: C.muted, fontSize: 10 }}>
              <th className="py-2 text-left font-normal uppercase tracking-wider">Item</th>
              <th className="py-2 text-right font-normal uppercase tracking-wider">Atual</th>
              <th className="py-2 text-right font-normal uppercase tracking-wider">Mínimo</th>
              <th className="py-2 text-right font-normal uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {d.alertas.map((a) => {
              const tone = a.status === "green" ? C.green : a.status === "amber" ? C.amber : C.red;
              return (
                <tr key={a.item} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="py-2.5" style={{ color: C.text }}>
                    <div>{a.item}</div>
                    {(a.empresa || a.local || a.parceiro) && (
                      <div className="mt-1 text-[10px]" style={{ color: C.muted }}>
                        {[a.empresa, a.local, a.parceiro].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums" style={{ color: C.mutedStrong }}>
                    {a.atual}
                  </td>
                  <td className="py-2.5 text-right tabular-nums" style={{ color: C.muted }}>
                    {a.min}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex items-center gap-2" style={{ color: tone }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                      {a.status === "red" ? "Crítico" : a.status === "amber" ? "Atenção" : "OK"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function EntregasSection() {
  const d = DATA.entregas;
  const [t1, setT1] = useState<"sbar" | "line" | "area">("sbar");
  const [range, setRange] = useState<RangeKey>("all");
  const historicoData = sliceByRange(d.historico, range);
  const series = [
    { key: "prazo", color: C.green },
    { key: "atrasado", color: C.red },
    { key: "transito", color: C.amber },
  ];
  return (
    <div className="flex flex-col gap-4">
      <RangeFilterBar value={range} onChange={setRange} />
      <KpiRow items={d.kpis} />
      <Card>
        <SectionHead
          title="Performance de Entregas"
          sub="12 MESES"
          actions={<ChartSwitcher value={t1} onChange={setT1} options={["sbar", "line", "area"]} />}
        />
        <div style={{ height: 280 }}>
          <ResponsiveContainer key={t1}>
            {t1 === "sbar" ? (
              <BarChart data={historicoData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                {series.map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} />
                ))}
              </BarChart>
            ) : t1 === "line" ? (
              <LineChart data={historicoData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={historicoData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                {series.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stackId="a"
                    stroke={s.color}
                    strokeWidth={2}
                    fill={s.color}
                    fillOpacity={0.12}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionHead title="Transportadoras" sub="ON-TIME RATE" />
        <div className="flex flex-col gap-4">
          {d.transp.map((t) => {
            const tone = t.tone === "green" ? C.green : t.tone === "amber" ? C.amber : C.red;
            return (
              <div key={t.nome}>
                <div className="mb-1.5 flex justify-between font-geist text-[11px]">
                  <span style={{ color: C.text }}>{t.nome}</span>
                  <span className="tabular-nums" style={{ color: tone }}>
                    {t.pct}%
                  </span>
                </div>
                <div className="h-1.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full" style={{ width: `${t.pct}%`, background: tone }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ClientesSection() {
  const d = DATA.clientes;
  const [t1, setT1] = useState<"bar" | "line" | "area">("bar");
  const [t2, setT2] = useState<"donut" | "bar">("donut");
  const [range, setRange] = useState<RangeKey>("all");
  const flowData = sliceByRange(d.flow, range);
  return (
    <div className="flex flex-col gap-4">
      <RangeFilterBar value={range} onChange={setRange} />
      <KpiRow items={d.kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionHead
            title="Novos vs Churn"
            sub="POR MÊS"
            actions={
              <ChartSwitcher value={t1} onChange={setT1} options={["bar", "line", "area"]} />
            }
          />
          <div style={{ height: 280 }}>
            <ResponsiveContainer key={t1}>
              {t1 === "bar" ? (
                <BarChart
                  data={flowData}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  stackOffset="sign"
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="novos" fill={C.green} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="churn" fill={C.red} radius={[3, 3, 0, 0]} />
                </BarChart>
              ) : t1 === "line" ? (
                <LineChart data={flowData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Tooltip {...tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="novos"
                    stroke={C.green}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="churn"
                    stroke={C.red}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              ) : (
                <AreaChart data={flowData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Tooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="novos"
                    stroke={C.green}
                    strokeWidth={2}
                    fill={C.green}
                    fillOpacity={0.12}
                  />
                  <Area
                    type="monotone"
                    dataKey="churn"
                    stroke={C.red}
                    strokeWidth={2}
                    fill={C.red}
                    fillOpacity={0.12}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <SectionHead
            title="Segmentação"
            sub="BASE DE CLIENTES"
            actions={<ChartSwitcher value={t2} onChange={setT2} options={["donut", "bar"]} />}
          />
          <div style={{ height: 220 }}>
            <ResponsiveContainer key={t2}>
              {t2 === "donut" ? (
                <PieChart>
                  <Pie
                    data={d.seg}
                    dataKey="value"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {d.seg.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              ) : (
                <BarChart data={d.seg} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {d.seg.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 font-geist text-[11px]">
            {d.seg.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between"
                style={{ color: C.mutedStrong }}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span style={{ color: C.text }}>{s.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProdutosApiSection() {
  const qProdutos = useProdutos();
  const [search, setSearch] = useState("");
  const [chartMode, setChartMode] = useState<"hbar" | "bar">("hbar");
  const produtos = qProdutos.data?.produtos ?? [];
  const ativos = produtos.filter((p) => p.ativo === 1);
  const comEstoque = produtos.filter((p) => p.ESTOQUE > 0);
  const saldosNegativos = produtos.filter((p) => p.ESTOQUE < 0);
  const semMarca = produtos.filter((p) => !p.MARCA).length;
  const totalEstoque = produtos.reduce((acc, p) => acc + p.ESTOQUE, 0);
  const formatQty = (value: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

  const byUso = useMemo(() => {
    const grouped = produtos.reduce<Record<string, { name: string; value: number; estoque: number }>>(
      (map, produto) => {
        const key = produto.USOPROD || "Sem uso";
        if (!map[key]) map[key] = { name: key, value: 0, estoque: 0 };
        map[key].value += 1;
        map[key].estoque += produto.ESTOQUE;
        return map;
      },
      {},
    );
    return Object.values(grouped).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [produtos]);

  const byMarca = useMemo(() => {
    const grouped = produtos.reduce<Record<string, { name: string; value: number; estoque: number }>>(
      (map, produto) => {
        const key = produto.MARCA || "Sem marca";
        if (!map[key]) map[key] = { name: key, value: 0, estoque: 0 };
        map[key].value += 1;
        map[key].estoque += produto.ESTOQUE;
        return map;
      },
      {},
    );
    return Object.values(grouped).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [produtos]);

  const filteredProdutos = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? produtos.filter((p) =>
          [p.DESCRPROD, p.REFERENCIA, p.MARCA, p.USOPROD, p.CODVOL, String(p.CODPROD)]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : produtos;
    return [...list].sort((a, b) => Math.abs(b.ESTOQUE) - Math.abs(a.ESTOQUE)).slice(0, 40);
  }, [produtos, search]);

  const kpis: Kpi[] = [
    { label: "Produtos cadastrados", value: String(produtos.length), color: C.gold },
    { label: "Produtos ativos", value: String(ativos.length), color: C.green },
    { label: "Com estoque positivo", value: String(comEstoque.length), color: C.blue },
    {
      label: "Saldos negativos",
      value: String(saldosNegativos.length),
      color: saldosNegativos.length > 0 ? C.red : C.green,
      alert: saldosNegativos.length > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {qProdutos.error && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-geist text-[11px]"
          style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red }}
        >
          <span>
            {qProdutos.error instanceof ApiError
              ? qProdutos.error.message
              : "Erro ao carregar produtos."}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 uppercase tracking-[0.12em]"
            style={{ border: `1px solid ${C.red}77`, background: "transparent" }}
            onClick={() => void qProdutos.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <KpiRow items={qProdutos.data ? kpis : DATA.produtos.kpis} />

      <Card>
        <SectionHead
          title="Produtos por Uso"
          sub={`Estoque total ${formatQty(totalEstoque)} · Sem marca ${semMarca}`}
          actions={<ChartSwitcher value={chartMode} onChange={setChartMode} options={["hbar", "bar"]} />}
        />
        <div style={{ height: 280 }}>
          <ResponsiveContainer key={chartMode}>
            {chartMode === "hbar" ? (
              <BarChart layout="vertical" data={byUso} margin={{ top: 8, right: 16, left: 20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={axisStyle} axisLine={false} tickLine={false} width={95} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" fill={C.gold} radius={[0, 3, 3, 0]} />
              </BarChart>
            ) : (
              <BarChart data={byUso} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" fill={C.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <SectionHead title="Produtos por Marca" sub="Top cadastros" />
        <div className="grid gap-2">
          {byMarca.map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[1fr_auto] gap-3 rounded px-3 py-2"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="truncate" style={{ color: C.text }}>
                {row.name}
              </div>
              <div className="tabular-nums" style={{ color: C.gold }}>
                {row.value}
              </div>
            </div>
          ))}
          {byMarca.length === 0 && (
            <div className="py-4 text-center font-geist text-sm" style={{ color: C.muted }}>
              Sem produtos carregados.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHead title="Catalogo de Produtos" sub="Cadastro + estoque" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por codigo, descricao, marca, uso ou unidade"
          className="mb-3 bg-[#09090B] text-white"
        />
        <div className="overflow-x-auto">
          <table className="w-full font-geist text-[12px]">
            <thead>
              <tr style={{ color: C.muted, fontSize: 10 }}>
                <th className="py-2 text-left font-normal uppercase tracking-wider">Produto</th>
                <th className="py-2 text-left font-normal uppercase tracking-wider">Marca</th>
                <th className="py-2 text-left font-normal uppercase tracking-wider">Uso</th>
                <th className="py-2 text-right font-normal uppercase tracking-wider">Estoque</th>
                <th className="py-2 text-right font-normal uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProdutos.map((produto) => (
                <tr key={produto.CODPROD} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="max-w-[420px] py-2.5" style={{ color: C.text }}>
                    <div className="truncate">{produto.DESCRPROD}</div>
                    <div className="mt-1 text-[10px]" style={{ color: C.muted }}>
                      #{produto.CODPROD} · {produto.CODVOL ?? produto.UNIDADE ?? "sem unidade"}
                      {produto.REFERENCIA ? ` · ref. ${produto.REFERENCIA}` : ""}
                    </div>
                  </td>
                  <td className="py-2.5" style={{ color: C.mutedStrong }}>
                    {produto.MARCA ?? "Sem marca"}
                  </td>
                  <td className="py-2.5" style={{ color: C.mutedStrong }}>
                    {produto.USOPROD ?? "-"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums" style={{ color: produto.ESTOQUE < 0 ? C.red : C.gold }}>
                    {formatQty(produto.ESTOQUE)}
                  </td>
                  <td className="py-2.5 text-right" style={{ color: produto.ativo ? C.green : C.muted }}>
                    {produto.ativo ? "Ativo" : "Inativo"}
                  </td>
                </tr>
              ))}
              {filteredProdutos.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center" style={{ color: C.muted }}>
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProdutosSection() {
  const d = DATA.produtos;
  const [t1, setT1] = useState<"sbar" | "line" | "area">("sbar");
  const [t2, setT2] = useState<"hbar" | "bar">("hbar");
  const [range, setRange] = useState<RangeKey>("all");
  const catsData = sliceByRange(d.cats, range);
  const cats = [
    { key: "Aço", color: C.gold },
    { key: "Tubos", color: C.blue },
    { key: "Perfis", color: C.green },
    { key: "Telas", color: "#8E6FB5" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <RangeFilterBar value={range} onChange={setRange} />
      <KpiRow items={d.kpis} />
      <Card>
        <SectionHead
          title="Vendas por Categoria"
          sub="12 MESES"
          actions={<ChartSwitcher value={t1} onChange={setT1} options={["sbar", "line", "area"]} />}
        />
        <div style={{ height: 280 }}>
          <ResponsiveContainer key={t1}>
            {t1 === "sbar" ? (
              <BarChart data={catsData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                {cats.map((c) => (
                  <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} />
                ))}
              </BarChart>
            ) : t1 === "line" ? (
              <LineChart data={catsData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                {cats.map((c) => (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    stroke={c.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={catsData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                {cats.map((c) => (
                  <Area
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    stackId="a"
                    stroke={c.color}
                    strokeWidth={2}
                    fill={c.color}
                    fillOpacity={0.12}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionHead
          title="Margem por Categoria"
          sub="ORDENADO"
          actions={<ChartSwitcher value={t2} onChange={setT2} options={["hbar", "bar"]} />}
        />
        <div style={{ height: 260 }}>
          <ResponsiveContainer key={t2}>
            {t2 === "hbar" ? (
              <BarChart
                layout="vertical"
                data={d.margem}
                margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="cat"
                  type="category"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" fill={C.gold} radius={[0, 3, 3, 0]} />
              </BarChart>
            ) : (
              <BarChart data={d.margem} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="cat" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" fill={C.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function VendedoresSection() {
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<VendedorSeleção>("todos");
  const [dataReferencia, setDataReferencia] = useState(() => localDateInputValue());
  const hoje = localDateInputValue();
  const anoReferencia = dataReferencia.slice(0, 4);
  const periodoVendas: VendedoresPeriodo = "dia";
  const periodoLabel = `Dia ${formatDatePt(dataReferencia)}`;
  const qVendedores = useVendedores();
  const qRanking = useVendedoresRanking(dataReferencia, periodoVendas);
  const qVendedoresHoje = useVendedoresLancamentosHoje(selectedVendor, dataReferencia);
  const qKpis = useFaturamentoConsolidado("todas", selectedVendor, dataReferencia);
  const qPorEmpresa = useFaturamentoPorEmpresa(selectedVendor, dataReferencia, periodoVendas);

  const vendors = qVendedores.data?.vendedores ?? [];
  const ranking = qRanking.data?.ranking ?? [];
  const selectedVendorRow = selectedVendor === "todos" ? null : ranking.find((v) => v.CODVEND === selectedVendor);
  const selectedPosition = selectedVendorRow
    ? ranking.findIndex((v) => v.CODVEND === selectedVendor) + 1
    : undefined;

  const filteredRanking = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? ranking.filter((item) => item.APELIDO.toLowerCase().includes(term))
      : ranking;
  }, [ranking, search]);

  const visibleRanking = filteredRanking.slice(0, 20);
  const companies = qPorEmpresa.data?.empresas ?? [];
  const companyChart = companies.slice(0, 8);
  const selectedLabel = selectedVendor === "todos" ? "Todos os vendedores" : selectedVendorRow?.APELIDO ?? "Vendedor";

  const kpis = [
    {
      label: "Dia selecionado",
      value: formatBRL(qKpis.data?.dia ?? 0),
      up: true,
      color: C.gold,
    },
    {
      label: "Últimos 7 dias",
      value: formatBRL(qKpis.data?.semana_7d ?? 0),
      up: true,
      color: C.green,
    },
    {
      label: "Mês selecionado",
      value: formatBRL(qKpis.data?.mes_atual ?? 0),
      up: true,
      color: C.blue,
    },
    {
      label: `Ano ${anoReferencia}`,
      value: formatBRLCompact(qKpis.data?.ano_atual ?? 0),
      up: true,
      color: C.gold,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHead
          title="Vendedores"
          sub={`Ranking e performance · ${periodoLabel}`}
          actions={
            qRanking.data ? (
              <div className="font-geist text-[11px] uppercase tracking-[0.15em]" style={{ color: C.muted }}>
                {periodoLabel}
              </div>
            ) : null
          }
        />

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_auto]">
              <div className="grid gap-3">
                <div
                  className="font-geist text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: C.muted }}
                >
                  Buscar vendedor
                </div>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Digite nome do vendedor"
                  className="mt-2 bg-[#09090B] text-white"
                />
                <VendedorSelector
                  lista={vendors}
                  value={selectedVendor}
                  onChange={setSelectedVendor}
                  disabled={qVendedores.isLoading || !!qVendedores.error}
                />
                <div className="flex flex-col gap-2">
                  <div
                    className="font-geist text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: C.muted }}
                  >
                    Selecione a data
                  </div>
                  <Input
                    type="date"
                    value={dataReferencia}
                    min={`${anoReferencia}-01-01`}
                    max={hoje}
                    onChange={(event) => {
                      if (event.target.value) setDataReferencia(event.target.value);
                    }}
                    className="h-11 w-[210px] bg-[#09090B] font-geist text-[12px] uppercase tracking-[0.08em] text-white"
                  />
                </div>
                {qVendedores.error && (
                  <div className="text-sm font-geist" style={{ color: C.red }}>
                    Erro ao carregar lista de vendedores.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedVendor("todos");
                }}
                className="rounded px-3 py-2 font-geist text-[11px] uppercase tracking-[0.12em]"
                style={{
                  border: `1px solid ${C.border}`,
                  background: "rgba(255,255,255,0.04)",
                  color: C.text,
                }}
              >
                Ver todos
              </button>
            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl border border-white/10 bg-[#09090B] p-4">
                <div
                  className="font-geist text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: C.muted }}
                >
                  Vendedor selecionado
                </div>
                <div className="mt-3 text-lg font-fraunces" style={{ color: C.text }}>
                  {selectedLabel}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[12px]" style={{ color: C.mutedStrong }}>
                  <span>{selectedPosition ? `Posição #${selectedPosition}` : "Posição —"}</span>
                  <span>•</span>
                  <span>{periodoLabel}</span>
                  <span className="font-semibold" style={{ color: C.text }}>
                    {formatBRL(qPorEmpresa.data?.total ?? 0)}
                  </span>
                </div>
              </div>
              <KpiRow items={kpis} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Card>
          <SectionHead title="Vendas por Empresa" sub={`Distribuição de receita · ${periodoLabel}`} />
          <div className="mb-3 text-sm" style={{ color: C.muted }}>
            Exibindo {selectedLabel.toLowerCase()}.
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={companyChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="NOMEFANTASIA" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="faturamento" fill={C.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-2 text-[12px]">
            {companies.slice(0, 6).map((company) => (
              <div
                key={company.CODEMP}
                className="flex items-center justify-between rounded-2xl px-3 py-2"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <span style={{ color: C.text }}>{company.NOMEFANTASIA}</span>
                <span className="tabular-nums" style={{ color: C.gold }}>
                  {formatBRL(company.faturamento)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHead title="Ranking de Vendedores" sub={`Top 20 por faturamento · ${periodoLabel}`} />
          <div className="overflow-x-auto">
            <table className="w-full font-geist text-[12px]">
              <thead>
                <tr style={{ color: C.muted, fontSize: 10 }}>
                  <th className="py-2 text-left uppercase tracking-wider">#</th>
                  <th className="py-2 text-left uppercase tracking-wider">Vendedor</th>
                  <th className="py-2 text-right uppercase tracking-wider">Faturamento</th>
                  <th className="py-2 text-right uppercase tracking-wider">%</th>
                </tr>
              </thead>
              <tbody>
                {visibleRanking.map((item, index) => {
                  const isActive = selectedVendor !== "todos" && item.CODVEND === selectedVendor;
                  return (
                    <tr
                      key={item.CODVEND}
                      onClick={() => setSelectedVendor(item.CODVEND)}
                      className="cursor-pointer"
                      style={{
                        background: isActive ? "rgba(245,213,71,0.08)" : "transparent",
                        borderTop: `1px solid ${C.border}`,
                      }}
                    >
                      <td className="py-2" style={{ color: C.mutedStrong }}>
                        {index + 1}
                      </td>
                      <td className="py-2" style={{ color: C.text }}>
                        {item.APELIDO}
                      </td>
                      <td className="py-2 text-right tabular-nums" style={{ color: C.gold }}>
                        {formatBRL(item.faturamento)}
                      </td>
                      <td className="py-2 text-right" style={{ color: C.muted }}>
                        {item.percentual.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {visibleRanking.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center" style={{ color: C.muted }}>
                      Nenhum vendedor encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {qRanking.isError && (
            <div
              className="mt-3 rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 font-geist text-sm"
              style={{ color: C.red }}
            >
              Erro ao carregar ranking de vendedores.
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionHead title="Lançamentos do Dia" sub={`Quem lançou e o que vendeu em ${formatDatePt(dataReferencia)}`} />
        {qVendedoresHoje.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-[#09090B] p-6 text-sm font-geist" style={{ color: C.muted }}>
            Carregando lançamentos do dia...
          </div>
        ) : qVendedoresHoje.isError ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 font-geist text-sm" style={{ color: C.red }}>
            Erro ao carregar lançamentos do dia.
          </div>
        ) : qVendedoresHoje.data?.lancamentos.length ? (
          <div className="grid gap-3">
            {qVendedoresHoje.data.lancamentos.map((item) => (
              <div key={item.NUNOTA} className="rounded-3xl border border-white/10 bg-[#09090B] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
                      Vendedor
                    </div>
                    <div className="mt-1 text-sm font-fraunces" style={{ color: C.text }}>
                      {item.APELIDO ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-geist text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
                      Valor
                    </div>
                    <div className="mt-1 text-sm font-fraunces" style={{ color: C.gold }}>
                      {formatBRL(item.valor)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[12px]" style={{ color: C.mutedStrong }}>
                  Nota {item.NUMNOTA ?? item.NUNOTA}{item.SERIENOTA ? `/${item.SERIENOTA}` : ""} • {item.empresa}
                </div>
                <div className="mt-3 text-[12px]" style={{ color: C.muted }}>
                  {item.itens || "Sem detalhe de produto disponível."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-[#09090B] p-6 text-sm font-geist" style={{ color: C.muted }}>
            Nenhum lançamento de faturamento encontrado para a data selecionada.
          </div>
        )}
      </Card>
    </div>
  );
}

function ComprasSection() {
  const d = DATA.compras;
  const [t1, setT1] = useState<"hbar" | "bar" | "line">("hbar");
  const [range, setRange] = useState<RangeKey>("all");
  return (
    <div className="flex flex-col gap-4">
      <RangeFilterBar value={range} onChange={setRange} />
      <KpiRow items={d.kpis} />
      <Card>
        <SectionHead
          title="Top Fornecedores"
          sub="VOLUME EM R$ MIL"
          actions={<ChartSwitcher value={t1} onChange={setT1} options={["hbar", "bar", "line"]} />}
        />
        <div style={{ height: 280 }}>
          <ResponsiveContainer key={t1}>
            {t1 === "hbar" ? (
              <BarChart
                layout="vertical"
                data={d.top}
                margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="nome"
                  type="category"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" radius={[0, 3, 3, 0]}>
                  {d.top.map((t, i) => (
                    <Cell key={i} fill={t.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : t1 === "bar" ? (
              <BarChart data={d.top} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="nome" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                  {d.top.map((t, i) => (
                    <Cell key={i} fill={t.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={d.top} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="nome" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={C.gold}
                  strokeWidth={2}
                  dot={{ fill: C.gold, r: 4 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionHead title="Avaliação de Fornecedores" sub="SCORE / 5,0" />
        <div className="flex flex-col gap-4">
          {d.rating.map((r) => {
            const tone = r.tone === "green" ? C.green : r.tone === "amber" ? C.amber : C.red;
            const pct = (r.score / 5) * 100;
            return (
              <div key={r.nome}>
                <div className="mb-1.5 flex justify-between font-geist text-[11px]">
                  <span style={{ color: C.text }}>{r.nome}</span>
                  <span className="tabular-nums" style={{ color: tone }}>
                    {r.score.toFixed(1)} / 5,0
                  </span>
                </div>
                <div className="h-1.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: tone }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function RhSection() {
  const d = DATA.rh;
  const [t1, setT1] = useState<"hbar" | "bar" | "line">("hbar");
  const [t2, setT2] = useState<"line" | "area" | "bar">("line");
  const [range, setRange] = useState<RangeKey>("all");
  const absData = sliceByRange(d.abs, range);
  return (
    <div className="flex flex-col gap-4">
      <RangeFilterBar value={range} onChange={setRange} />
      <KpiRow items={d.kpis} />
      <Card>
        <SectionHead
          title="Headcount por Área"
          sub="MAIO 2026"
          actions={<ChartSwitcher value={t1} onChange={setT1} options={["hbar", "bar", "line"]} />}
        />
        <div style={{ height: 260 }}>
          <ResponsiveContainer key={t1}>
            {t1 === "hbar" ? (
              <BarChart
                layout="vertical"
                data={d.headcount}
                margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="dep"
                  type="category"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" fill={C.gold} radius={[0, 3, 3, 0]} />
              </BarChart>
            ) : t1 === "bar" ? (
              <BarChart data={d.headcount} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dep" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" fill={C.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={d.headcount} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="dep" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={C.gold}
                  strokeWidth={2}
                  dot={{ fill: C.gold, r: 4 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionHead
          title="Absenteísmo Mensal"
          sub="% — 12 MESES"
          actions={<ChartSwitcher value={t2} onChange={setT2} options={["line", "area", "bar"]} />}
        />
        <div style={{ height: 240 }}>
          <ResponsiveContainer key={t2}>
            {t2 === "line" ? (
              <LineChart data={absData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#8E6FB5"
                  strokeWidth={2}
                  dot={{ fill: "#8E6FB5", r: 3 }}
                />
              </LineChart>
            ) : t2 === "area" ? (
              <AreaChart data={absData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#8E6FB5"
                  strokeWidth={2}
                  fill="#8E6FB5"
                  fillOpacity={0.12}
                />
              </AreaChart>
            ) : (
              <BarChart data={absData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="m" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="v" fill="#8E6FB5" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
 *  SIDEBAR
 * ============================================================ */
type NavKey =
  | "dashboard"
  | "empresas"
  | "financeiro"
  | "produtos"
  | "vendedores"
  | "compras"
  | "estoque"
  | "entregas"
  | "clientes"
  | "rh";

const NAV_GROUPS: {
  label: string;
  items: {
    key: NavKey;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: { tone: string; content: React.ReactNode };
  }[];
}[] = [
  {
    label: "VISÃO GERAL",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "empresas", label: "Empresas", icon: Building2 },
    ],
  },
  {
    label: "OPERAÇÕES",
    items: [
      { key: "financeiro", label: "Financeiro", icon: Wallet },
      { key: "produtos", label: "Produtos", icon: Package },
      { key: "vendedores", label: "Vendedores", icon: Users },
      { key: "compras", label: "Compras", icon: ShoppingCart },
      { key: "estoque", label: "Estoque", icon: Boxes, badge: { tone: C.red, content: "3" } },
      {
        key: "entregas",
        label: "Entregas",
        icon: Truck,
        badge: { tone: C.green, content: <Check size={9} strokeWidth={3} /> },
      },
    ],
  },
  {
    label: "GESTÃO",
    items: [
      { key: "clientes", label: "Clientes", icon: Users },
      { key: "rh", label: "RH", icon: UserCog },
    ],
  },
];

const PAGE_META: Record<NavKey, { title: string; sub: string }> = {
  dashboard: { title: "Visão Executiva", sub: "Indicadores consolidados em tempo real" },
  empresas: { title: "Empresas", sub: "Análise por empresa/unidade do Sankhya" },
  financeiro: { title: "Financeiro", sub: "DRE, fluxo e contas a receber" },
  produtos: { title: "Produtos", sub: "Performance e margem por SKU" },
  vendedores: { title: "Vendedores", sub: "Ranking e performance de vendas 2026" },
  compras: { title: "Compras", sub: "Fornecedores e suprimentos" },
  estoque: { title: "Estoque", sub: "Níveis, giro e alertas críticos" },
  entregas: { title: "Entregas", sub: "Logística e performance de transporte" },
  clientes: { title: "Clientes", sub: "Base ativa, NPS e churn" },
  rh: { title: "Recursos Humanos", sub: "Headcount, satisfação e produtividade" },
};

function Sidebar({
  active,
  onSelect,
  open,
  onClose,
}: {
  active: NavKey;
  onSelect: (k: NavKey) => void;
  open: boolean;
  onClose: () => void;
}) {
  const PURPLE = "#A855F7";
  const PURPLE_SOFT = "rgba(168, 85, 247, 0.12)";
  const SIDE_TEXT = "#FFFFFF";
  const SIDE_MUTED = "rgba(255,255,255,0.6)";
  const SIDE_LABEL = "rgba(255,255,255,0.4)";

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col transition-transform duration-200 lg:w-[200px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ background: "#000000", borderRight: `1px solid ${C.border}` }}
      >
        <div className="flex items-start justify-between px-5 pt-7 pb-9">
          <div>
            <div
              className="font-fraunces font-light"
              style={{ color: PURPLE, fontSize: 18, letterSpacing: "-0.01em" }}
            >
              CIP - Central de Inteligência e Performance
            </div>
            <div
              className="mt-1 font-geist text-[9px] uppercase tracking-[0.22em]"
              style={{ color: SIDE_LABEL }}
            >
              Grupo MKR
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden"
            style={{ color: SIDE_MUTED }}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="mb-6">
              <div
                className="px-3 pb-2 font-geist text-[9px] uppercase tracking-[0.2em]"
                style={{ color: SIDE_LABEL }}
              >
                {g.label}
              </div>
              {g.items.map((it) => {
                const isActive = active === it.key;
                const Icon = it.icon;
                return (
                  <button
                    key={it.key}
                    onClick={() => {
                      onSelect(it.key);
                      onClose();
                    }}
                    className="relative flex w-full items-center gap-3 px-3 py-2 font-geist text-[12px] transition-colors"
                    style={{
                      color: isActive ? SIDE_TEXT : SIDE_MUTED,
                      background: isActive ? PURPLE_SOFT : "transparent",
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute inset-y-0 left-0 w-[2px]"
                        style={{ background: PURPLE }}
                      />
                    )}
                    <Icon size={14} strokeWidth={1.5} />
                    <span className="flex-1 text-left">{it.label}</span>
                    {it.badge && (
                      <span
                        className="flex h-4 min-w-[16px] items-center justify-center px-1 font-geist text-[9px] font-medium"
                        style={{
                          background: `${it.badge.tone}22`,
                          color: it.badge.tone,
                          border: `1px solid ${it.badge.tone}55`,
                        }}
                      >
                        {it.badge.content}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

/* ============================================================
 *  TOPBAR & SHELL
 * ============================================================ */
function TopBar({ active, onMenu }: { active: NavKey; onMenu: () => void }) {
  const meta = PAGE_META[active];
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const date = now
    ? now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  const time = now
    ? now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        <button
          onClick={onMenu}
          className="lg:hidden mt-1 flex h-9 w-9 items-center justify-center"
          style={{ border: `1px solid ${C.border}`, color: C.text }}
          aria-label="Abrir menu"
        >
          <Menu size={16} />
        </button>
        <div>
          <h1
            className="font-fraunces font-light leading-tight"
            style={{ color: C.text, fontSize: "clamp(18px, 5vw, 22px)", letterSpacing: "-0.02em" }}
          >
            {meta.title}
          </h1>
          <p className="mt-1 font-geist text-[11px] sm:text-[12px]" style={{ color: C.muted }}>
            {meta.sub}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 font-geist text-[11px]"
          style={{ border: `1px solid ${C.border}`, color: C.mutedStrong }}
        >
          <span style={{ color: C.muted }}>{date}</span>
          <span style={{ color: C.borderStrong }}>·</span>
          <span className="tabular-nums" style={{ color: C.text }}>
            {time}
          </span>
        </div>
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 font-geist text-[10px] uppercase tracking-[0.18em]"
          style={{ border: `1px solid ${C.red}40`, background: `${C.red}10`, color: C.red }}
        >
          <span
            className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: C.red }}
          />
          Ao vivo
        </div>
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem("sankhya_auth_v1");
            } catch {
              void 0;
            }
            window.location.reload();
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 font-geist text-[10px] uppercase tracking-[0.18em] transition-colors"
          style={{
            border: `1px solid ${C.border}`,
            color: C.mutedStrong,
            background: "transparent",
          }}
        >
          <LogOut size={12} strokeWidth={2} />
          Sair
        </button>
      </div>
    </div>
  );
}

function Dashboard() {
  const [active, setActive] = useState<NavKey>("dashboard");
  const [navOpen, setNavOpen] = useState(false);

  const sections: Record<NavKey, React.ReactNode> = {
    dashboard: <DashboardSection />,
    empresas: <EmpresasDashboardSection />,
    financeiro: <FinanceiroSection />,
    produtos: <ProdutosApiSection />,
    vendedores: <VendedoresSection />,
    compras: <ComprasSection />,
    estoque: <EstoqueSection />,
    entregas: <EntregasSection />,
    clientes: <ClientesSection />,
    rh: <RhSection />,
  };

  return (
    <div className="font-geist min-h-screen" style={{ background: C.bg, color: C.text }}>
      <Sidebar
        active={active}
        onSelect={setActive}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <main className="px-4 py-5 sm:px-6 sm:py-6 lg:ml-[200px] lg:px-8 lg:py-8">
        <TopBar active={active} onMenu={() => setNavOpen(true)} />
        {sections[active]}
      </main>
    </div>
  );
}
