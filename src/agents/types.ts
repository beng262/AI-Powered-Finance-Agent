// Shared types for the auditable AI pipeline (UIA -> Orchestrator -> ANA/IDA, with CSA).
// Mirrors the Solution Design's Intent Taxonomy and component model, implemented as
// app code (no Azure Foundry needed). Financial numbers are computed deterministically;
// the LLM only narrates verified results.

export const INTENTS = [
  "KPI_LOOKUP", "TREND_ANALYSIS", "VARIANCE_ANALYSIS", "FORECAST_REQUEST",
  "ANOMALY_DETECTION", "RISK_ANALYSIS", "WHAT_IF_SCENARIO", "FUND_ANALYSIS",
  "DOCUMENT_QA", "REPORT_SUMMARY", "DASHBOARD_REQUEST", "CHART_REQUEST",
  "DATA_SOURCE_STATUS", "ALERT_SUBSCRIPTION", "EXPORT_REPORT", "ADMIN_AUDIT_QUERY",
  "WEB_SEARCH", "SOURCE_QUERY", "STRATEGY_SCAN", "KAP_DISCLOSURE", "FUNDAMENTALS", "MOVER_PULSE", "CHAT_FOLLOWUP", "BACKTEST", "CORRELATION", "PREDICTION_SCORE",
  "OUT_OF_SCOPE",
] as const;
export type Intent = (typeof INTENTS)[number];

export type Role = "admin" | "analist" | "cfo" | "guvenlik";

export type RouterOutput = {
  intent: Intent;
  confidence: number;
  entities: Record<string, string>;
  required_tools: string[];
  requires_clarification: boolean;
  rbac_scope: string[];
  output_format: string;
  source: "azure-openai" | "kural"; // how the routing was decided
};

// A block the UI renders: a KPI strip, an SVG chart, a table, or a narrative.
export type Block =
  | { kind: "kpi"; items: { label: string; value: string; delta?: string; tone?: "up" | "down" | "flat" }[] }
  | { kind: "chart"; title?: string; svgDark: string; svgLight: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "narrative"; text: string }
  | { kind: "links"; title?: string; items: { title: string; url: string; meta?: string }[] }
  | { kind: "trace"; title?: string; steps: { label: string; value: string }[] }
  | { kind: "notice"; tone: "info" | "warn" | "block"; text: string };

export type AgentAnswer = {
  intent: Intent;
  title: string;
  blocks: Block[];
  router: RouterOutput;
  blocked?: boolean;
};
