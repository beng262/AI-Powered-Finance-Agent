// Deterministic intent rules - the router's safety net, and the whole router when no
// model is configured.
//
// WHY ITS OWN MODULE: this file has no imports except types, so it compiles to a plain
// browser-safe ES module. The docs/ demo page runs this exact table client-side (see
// tsconfig.docs.json / `npm run docs:lib`), which means the published demo cannot drift from the
// library's real routing behaviour - there is only one copy of the rules.

import { type Intent, type RouterOutput } from "./types.js";

export type Rule = { intent: Intent; kw: RegExp; tools: string[]; scope: string[] };

export const RULES: Rule[] = [
  // Advice-seeking ("al-sat öner", "ne almalı", "fırsat var mı") is NOT refused: it is
  // answered with a technical scan + a "not investment advice" disclaimer.
  { intent: "STRATEGY_SCAN", kw: /(^\s*bak\s*$|\btara\b|\btarama\b|\btarat|\bset-?up|\bpine ?script\b|\bstrateji\b|\bsinyal\b|teknik tara|setup taram|skorla|al-?sat öner|ne almal[ıi]|hangi hisse|f[ıi]rsat|öneri|tavsiye)/i, tools: ["scan_service"], scope: ["finance_read"] },
  { intent: "RISK_ANALYSIS", kw: /\b(risk|likidite|var\b|maruz|konsantrasyon|yoğunlaşma)/i, tools: ["risk_service"], scope: ["finance_risk_read"] },
  { intent: "ANOMALY_DETECTION", kw: /\b(anomali|olağand[ıi]ş[ıi]|ani hareket|sapma|sıçrama)/i, tools: ["anomaly_service"], scope: ["finance_read"] },
  { intent: "VARIANCE_ANALYSIS", kw: /\b(maliyet|getiri|kar[ıi]?\/?zarar|fark|varyans|bütçe)/i, tools: ["variance_service"], scope: ["finance_read"] },
  { intent: "TREND_ANALYSIS", kw: /\b(trend|gidişat|son \d+ (gün|ay|hafta)|seyir|eğilim)/i, tools: ["trend_service"], scope: ["finance_read"] },
  { intent: "FORECAST_REQUEST", kw: /\b(tahmin|öngör|forecast|gelecek|projeksiyon)/i, tools: ["forecast_service"], scope: ["finance_forecast_read"] },
  { intent: "WHAT_IF_SCENARIO", kw: /\b(senaryo|olursa|what.?if|%\d+ art|şok|varsayalim|varsayalım)/i, tools: ["scenario_service"], scope: ["finance_read"] },
  { intent: "BACKTEST", kw: /(backtest|geriye dönük|geriye donuk|stratejiyi test|strateji test|geçmişte işlese|gecmiste islese|test et)/i, tools: ["backtest_service"], scope: ["finance_read"] },
  { intent: "CORRELATION", kw: /(korelasyon|birlikte hareket|çeşitlendirme|cesitlendirme|diversif)/i, tools: ["corr_service"], scope: ["finance_read"] },
  { intent: "PREDICTION_SCORE", kw: /(karne|isabet|başarı oran|basari oran|doğruluk oran|dogruluk oran|track record|hit rate|tahminler(in)? (ne kadar|doğru|dogru|tutuyor)|ne kadar (doğru|dogru|isabetli))/i, tools: ["prediction_service"], scope: ["finance_read"] },
  { intent: "MOVER_PULSE", kw: /\b(trump|elon|musk|jensen|huang|powell|altman|openai|piyasay[ıi] etkileyen|etkileyenler|tweet|instagram|insta|paylaş[ıi]m|ne (yapt[ıi]|dedi|payla[şs]t[ıi])|son hamle)/i, tools: ["mover_service"], scope: ["finance_read"] },
  { intent: "FUNDAMENTALS", kw: /\b(temel analiz|künye|k[üu]nye|f\/?k\b|p\/?e\b|pd\/?dd|roe|bilanço|bilanco|gelir tablosu|analist hedef|hedef fiyat|piyasa değeri|fundamental|değerleme|degerleme|kazanç takvimi)/i, tools: ["fmp_service"], scope: ["finance_read"] },
  { intent: "KAP_DISCLOSURE", kw: /\b(kap\b|kamuyu ayd[ıi]nlatma|kap bildirim|kap açıklama|özel durum açıklama|özel durum bildirim)/i, tools: ["kap_service"], scope: ["finance_read"] },
  { intent: "DOCUMENT_QA", kw: /\b(dosyalar[ıi]m|dosyada|belgemde|belgede|dök[üu]man|dokuman|yükledi[ğg]im|pdf'?imde|raporumda|dosyaya göre)/i, tools: ["rag_service"], scope: ["finance_read"] },
  { intent: "SOURCE_QUERY", kw: /\b(kaynaklar[ıi]m|takip etti[ğg]im|abone|youtube|kanal|son video|haberlerde|gündem|gundem|bültenler|bultenler|twitter|x'te)/i, tools: ["source_service"], scope: ["finance_read"] },
  { intent: "DATA_SOURCE_STATUS", kw: /(güncel mi|veri durumu|son veri ne|kaynak durumu|veri geldi mi|bağlı mı)/i, tools: ["metadata_service"], scope: ["finance_read"] },
  { intent: "WEB_SEARCH", kw: /\b(ara\b|aratt?[ıi]r|internette|web'?de|google'?la|haber|son durum|nedir|kimdir|ne zaman|nas[ıi]l|neden|açıkla|aciklat?)/i, tools: ["web_search"], scope: ["finance_read"] },
  { intent: "REPORT_SUMMARY", kw: /\b(özet|bülten|özetle|rapor özeti|haftal[ıi]k özet)/i, tools: ["summarization"], scope: ["finance_read"] },
  { intent: "DASHBOARD_REQUEST", kw: /\b(dashboard|pano|gösterge paneli)/i, tools: ["dashboard_service"], scope: ["finance_read"] },
  { intent: "CHART_REQUEST", kw: /\b(grafik|çizdir|chart|görsel)/i, tools: ["chart_service"], scope: ["finance_read"] },
  { intent: "ADMIN_AUDIT_QUERY", kw: /\b(kim eriş|denetim|audit|log|erişti)/i, tools: ["audit_service"], scope: ["admin_audit"] },
  { intent: "KPI_LOOKUP", kw: /\b(kpi|nakit|toplam|pozisyon|portföy|değer|bakiye|ne kadar)/i, tools: ["kpi_service"], scope: ["finance_read"] },
];

export function extractEntities(q: string): Record<string, string> {
  const e: Record<string, string> = {};
  const ticker = q.match(/\b([A-Z]{2,6})\b/);
  if (ticker) e.entity = ticker[1];
  const months = q.match(/son\s+(\d+)\s*(gün|ay|hafta)/i);
  if (months) e.date_range = months[0];
  const pct = q.match(/%\s?(\d+(?:[.,]\d+)?)/);
  if (pct) e.shock = pct[0];
  return e;
}

/**
 * Classify a query with the keyword rules alone - no model, no network, synchronous.
 *
 * `route()` calls this when the LLM is absent or returns something unusable, so this is
 * the behaviour a fresh clone gets out of the box.
 */
export function routeOffline(q: string): RouterOutput {
  for (const r of RULES) {
    if (r.kw.test(q)) {
      return {
        intent: r.intent, confidence: 0.55, entities: extractEntities(q),
        required_tools: r.tools, requires_clarification: false,
        rbac_scope: r.scope, output_format: "web_chart_and_summary", source: "kural",
      };
    }
  }
  // default: not a portfolio question -> answer it from the web
  return {
    intent: "WEB_SEARCH", confidence: 0.4, entities: extractEntities(q),
    required_tools: ["web_search"], requires_clarification: false,
    rbac_scope: ["finance_read"], output_format: "web_answer", source: "kural",
  };
}
