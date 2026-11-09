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
];
