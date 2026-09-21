// CSA - Guvenlik & Uyum. Rol bazli erisim (RBAC), OUT_OF_SCOPE guardrail, basit
// maskeleme ve kalici denetim izi. Pahali Azure servisi yok; denetim izi Setting
// tablosunda JSON olarak tutulur.

import { db } from "../db";
import type { Intent, Role, RouterOutput } from "./types";

// All scopes used anywhere in the app. "admin" owns every one of them.
export const ALL_SCOPES = [
  "finance_read", "finance_risk_read", "finance_forecast_read",
  "report_summary", "admin_audit", "portfolio_view",
] as const;

export const ROLE_SCOPES: Record<Role, string[]> = {
  admin: [...ALL_SCOPES],
  analist: ["finance_read", "finance_risk_read", "finance_forecast_read", "portfolio_view"],
  cfo: ["finance_read", "finance_risk_read", "finance_forecast_read", "report_summary", "portfolio_view"],
  guvenlik: ["finance_read", "admin_audit", "portfolio_view"],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Yönetici (Admin)", analist: "Analist", cfo: "Yönetici / CFO", guvenlik: "Güvenlik Sorumlusu",
};

export function hasScope(role: Role, scopes: string[]): boolean {
  if (role === "admin") return true; // admin is authorized for everything
  if (scopes.length === 0) return true;
  const owned = new Set(ROLE_SCOPES[role]);
  return scopes.every((s) => owned.has(s));
}

// OUT_OF_SCOPE guardrail message (no buy/sell or investment advice).
export const OUT_OF_SCOPE_MSG: Record<"tr" | "en", string> = {
  tr: "Bu asistan al-sat veya yatırım tavsiyesi vermez; yalnızca eğitim amaçlı, doğrulanmış " +
    "verilere dayalı içgörü sunar. Lütfen bir analiz, KPI, trend, risk veya rapor sorusu sorun.",
  en: "This assistant does not give buy/sell or investment advice; it only provides educational, " +
    "data-backed insight. Please ask an analysis, KPI, trend, risk or report question.",
};

// Mask long numeric identifiers (IBAN/account-like) for non-privileged roles.
export function maskFor(role: Role, text: string): string {
  if (role === "admin" || role === "cfo" || role === "guvenlik") return text;
  return text.replace(/\b(\d{4})\d{4,}(\d{2})\b/g, "$1****$2");
}

export type AuditEntry = { ts: string; role: Role; query: string; intent: string; allowed: boolean; source: string };

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const row = await db.setting.findUnique({ where: { key: "auditLog" } });
    const list: AuditEntry[] = row ? JSON.parse(row.value) : [];
    list.unshift(entry);
    const capped = list.slice(0, 200);
    await db.setting.upsert({
      where: { key: "auditLog" },
      create: { key: "auditLog", value: JSON.stringify(capped) },
      update: { value: JSON.stringify(capped) },
    });
  } catch { /* audit is best-effort */ }
}

export async function readAudit(limit = 30): Promise<AuditEntry[]> {
  try {
    const row = await db.setting.findUnique({ where: { key: "auditLog" } });
    return row ? (JSON.parse(row.value) as AuditEntry[]).slice(0, limit) : [];
  } catch { return []; }
}

// Required scope is decided HERE (in code) per intent - never trusted from the LLM
// router output, which could return arbitrary scope names and break authorization.
const INTENT_SCOPE: Record<Intent, string[]> = {
  KPI_LOOKUP: ["finance_read"], VARIANCE_ANALYSIS: ["finance_read"], TREND_ANALYSIS: ["finance_read"],
  ANOMALY_DETECTION: ["finance_read"], DASHBOARD_REQUEST: ["finance_read"], CHART_REQUEST: ["finance_read"],
  DATA_SOURCE_STATUS: ["finance_read"], REPORT_SUMMARY: ["report_summary"], FUND_ANALYSIS: ["finance_read"],
  WHAT_IF_SCENARIO: ["finance_read"], STRATEGY_SCAN: ["finance_read"], WEB_SEARCH: ["finance_read"],
  SOURCE_QUERY: ["finance_read"], DOCUMENT_QA: ["finance_read"], ALERT_SUBSCRIPTION: ["finance_read"],
  KAP_DISCLOSURE: ["finance_read"], FUNDAMENTALS: ["finance_read"], MOVER_PULSE: ["finance_read"],
  CHAT_FOLLOWUP: ["finance_read"], BACKTEST: ["finance_read"], CORRELATION: ["finance_read"],
  PREDICTION_SCORE: ["finance_read"],
  EXPORT_REPORT: ["finance_read"], FORECAST_REQUEST: ["finance_forecast_read"], RISK_ANALYSIS: ["finance_risk_read"],
  ADMIN_AUDIT_QUERY: ["admin_audit"], OUT_OF_SCOPE: [],
};

// Decide whether a routed request is permitted for the role (intent-derived scope).
export function authorize(role: Role, r: RouterOutput, loc: "tr" | "en" = "tr"): { ok: boolean; reason?: string } {
  if (r.intent === "OUT_OF_SCOPE") return { ok: false, reason: OUT_OF_SCOPE_MSG[loc] };
  const needed = INTENT_SCOPE[r.intent] ?? ["finance_read"];
  if (!hasScope(role, needed)) {
    const reason = loc === "tr"
      ? `Bu işlem için yetkiniz yok (gerekli kapsam: ${needed.join(", ")}). Rolünüz: ${ROLE_LABEL[role]}.`
      : `You are not authorized for this action (required scope: ${needed.join(", ")}). Your role: ${ROLE_LABEL[role]}.`;
    return { ok: false, reason };
  }
  return { ok: true };
}
