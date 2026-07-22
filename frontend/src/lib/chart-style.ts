/**
 * Shared chart tooltip styling.
 * Padroniza tooltips (donut, barras, linha) com fundo elevado e texto branco.
 */
export const chartTooltipStyle = {
  backgroundColor: "rgba(30, 40, 66, 0.95)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "#F1F5F9",
  padding: "8px 10px",
  boxShadow: "none",
} as const;

export const chartTooltipItemStyle = { color: "#F1F5F9" } as const;
export const chartTooltipLabelStyle = { color: "#F1F5F9" } as const;

export const barTooltipCursor = false;

export const lineTooltipCursor = {
  stroke: "var(--color-border)",
  strokeWidth: 1,
} as const;
