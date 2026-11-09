/* ------------------------------------------------------------------------------------
   Deterministic tools for the demo agent.

   The intent router (rules or model) only decides WHICH tool runs. Everything below is
   plain arithmetic over the demo portfolio through the library's own metrics module, so
   every figure the agent states is reproducible and none of it comes from a model.

   Tickers are matched here, by code, never by the model: a small model asked for a
   ticker will happily produce a plausible one that was not in the question.
   ------------------------------------------------------------------------------------ */

import * as M from "./lib/metrics.js";

const pick = (lang, en, tr) => (lang === "tr" ? tr : en);

/** Holdings mentioned in the question, by symbol or company name. */
export function findTickers(question, model) {
  const q = question.toLocaleLowerCase("en");
  const hits = [];
  for (const h of model.holdings) {
    const sym = new RegExp(`(^|[^a-z0-9])${h.ticker.toLowerCase()}([^a-z0-9]|$)`, "i");
    const name = h.label.toLowerCase().split(/[\s&.]+/)[0];
    if (sym.test(q) || (name.length > 3 && q.includes(name))) hits.push(h);
  }
  return hits;
}

/**
 * @returns {{ tool: string, facts: [string, string, string?][], summary: string, notice?: string }}
 *   facts are [label, value, tone] rows; summary is the template answer used when no model
 *   is loaded, when the language is not English, or when the model's wording fails the
 *   number check.
 */
export function runTool(intent, question, model, f, lang) {
  const d = model;
  const L = (en, tr) => pick(lang, en, tr);

  if (intent === "KPI_LOOKUP") {
    const share = (d.totalCash / d.totalEquity) * 100;
    const movers = d.holdings.slice().sort((a, b) => b.dailyPnl - a.dailyPnl);
    const best = movers[0], worst = movers[movers.length - 1];
    return {
      tool: "kpi_service",
      facts: [
        [L("Total portfolio", "Toplam portföy"), f.usd(d.totalEquity)],
        [L("Today", "Bugün"), `${f.signedUsd(d.dailyPnl)} (${f.pct(d.dailyPct)})`, d.dailyPnl >= 0 ? "up" : "down"],
        [L("Cash", "Nakit"), `${f.usd(d.totalCash)} (${f.nf(share, 1)}%)`],
        [L("Positions", "Pozisyon"), String(d.holdings.length)],
        [L("Best today", "Günün en iyisi"), `${best.ticker} ${f.signedUsd(best.dailyPnl)}`, "up"],
        [L("Worst today", "Günün en kötüsü"), `${worst.ticker} ${f.signedUsd(worst.dailyPnl)}`, "down"],
      ],
      summary: L(
        `The sample portfolio is worth ${f.usd(d.totalEquity)}. Today it is ${f.signedUsd(d.dailyPnl)} (${f.pct(d.dailyPct)}). Cash is ${f.usd(d.totalCash)}, ${f.nf(share, 1)}% of the book.`,
        `Örnek portföyün değeri ${f.usd(d.totalEquity)}. Bugün ${f.signedUsd(d.dailyPnl)} (${f.pct(d.dailyPct)}). Nakit ${f.usd(d.totalCash)}, portföyün %${f.nf(share, 1)}'i.`),
    };
  }

  if (intent === "RISK_ANALYSIS") {
    const vol = M.annualizedVol(d.equity), varp = M.historicalVaR(d.equity, 0.95), mdd = M.maxDrawdown(d.equity);
    const byWeight = d.holdings.slice().sort((a, b) => b.posValue - a.posValue)[0];
    const byVol = d.holdings.slice().sort((a, b) => M.annualizedVol(b.series) - M.annualizedVol(a.series))[0];
    return {
      tool: "risk_service",
      facts: [
        [L("Annualised volatility", "Yıllık oynaklık"), `${f.nf(vol, 1)}%`],
        [L("Daily VaR 95%", "Günlük VaR %95"), `${f.nf(varp, 2)}% (${f.usd((d.totalEquity * varp) / 100)})`, "down"],
        [L("Max drawdown", "Maksimum düşüş"), `${f.nf(mdd, 1)}%`, "down"],
        [L("Largest position", "En büyük pozisyon"), `${byWeight.ticker} ${f.nf((byWeight.posValue / d.totalEquity) * 100, 1)}%`],
        [L("Most volatile holding", "En oynak pozisyon"), `${byVol.ticker} ${f.nf(M.annualizedVol(byVol.series), 1)}%`],
      ],
      summary: L(
        `Portfolio volatility is ${f.nf(vol, 1)}% a year. On a bad day (95% confidence) the book could lose about ${f.nf(varp, 2)}%, and the worst peak-to-trough fall was ${f.nf(mdd, 1)}%. The largest position is ${byWeight.ticker} at ${f.nf((byWeight.posValue / d.totalEquity) * 100, 1)}%.`,
        `Portföy oynaklığı yıllık %${f.nf(vol, 1)}. Kötü bir günde (%95 güven) yaklaşık %${f.nf(varp, 2)} kayıp olabilir; en derin düşüş %${f.nf(mdd, 1)}. En büyük pozisyon ${byWeight.ticker}, %${f.nf((byWeight.posValue / d.totalEquity) * 100, 1)}.`),
    };
  }

  if (intent === "TREND_ANALYSIS") {
    const t = findTickers(question, d)[0];
    const series = t ? t.series : d.equity;
    const native = t ? t.native : d.equity;
    const name = t ? t.ticker : L("Portfolio", "Portföy");
    const cur = t ? (t.currency === "TRY" ? "₺" : "$") : "$";
    const last = native[native.length - 1];
    const rsi = M.rsi(series), s20 = M.sma(native, 20), s50 = M.sma(native, 50);
    const bb = M.bollinger(series), macd = M.macd(series);
    const state = rsi > 70 ? L("overbought", "aşırı alım") : rsi < 30 ? L("oversold", "aşırı satım") : L("neutral", "nötr");
    const vs = s20 ? ((last - s20) / s20) * 100 : null;
    return {
      tool: "trend_service",
      facts: [
        [L("Subject", "Konu"), name + (t ? "" : L(" (whole book)", " (tüm defter)"))],
        [L("Last", "Son"), cur + f.nf(last)],
        ["RSI(14)", `${f.nf(rsi, 1)} · ${state}`],
        ["SMA(20)", s20 == null ? "–" : cur + f.nf(s20)],
        ["SMA(50)", s50 == null ? "–" : cur + f.nf(s50)],
        [L("Price vs SMA(20)", "Fiyat / SMA(20)"), vs == null ? "–" : f.pct(vs), vs >= 0 ? "up" : "down"],
        ["MACD", macd ? (macd.histogram >= 0 ? L("bullish momentum", "yükseliş momentumu") : L("bearish momentum", "düşüş momentumu")) : "–"],
        [L("Bollinger %B", "Bollinger %B"), bb ? `${f.nf(bb.percentB * 100, 0)}%` : "–"],
      ],
      summary: L(
        `${name} last ${cur}${f.nf(last)}. RSI is ${f.nf(rsi, 1)} (${state}), and the price is ${vs != null && vs >= 0 ? "above" : "below"} its 20-day average by ${f.nf(Math.abs(vs ?? 0), 1)}%.`,
        `${name} son ${cur}${f.nf(last)}. RSI ${f.nf(rsi, 1)} (${state}); fiyat 20 günlük ortalamasının %${f.nf(Math.abs(vs ?? 0), 1)} ${vs != null && vs >= 0 ? "üzerinde" : "altında"}.`),
      notice: t ? undefined : L("No holding named in the question, so the whole book was used.", "Soruda bir pozisyon geçmediği için tüm defter kullanıldı."),
    };
  }

  if (intent === "CORRELATION") {
    let pair = findTickers(question, d).slice(0, 2);
    let note;
    if (pair.length < 2) {
      pair = d.holdings.slice().sort((a, b) => b.posValue - a.posValue).slice(0, 2);
      note = L("Fewer than two holdings named, so the two largest were compared.", "İki pozisyon belirtilmedi, en büyük ikisi karşılaştırıldı.");
    }
    const c = M.correlation(pair[0].series, pair[1].series);
    const word = c == null ? "–" : c > 0.6 ? L("strongly together", "güçlü birlikte") : c > 0.2 ? L("somewhat together", "kısmen birlikte") : c > -0.2 ? L("mostly independent", "çoğunlukla bağımsız") : L("in opposite directions", "ters yönde");
    return {
      tool: "corr_service",
      facts: [
        [L("Pair", "Çift"), `${pair[0].ticker} / ${pair[1].ticker}`],
        [L("Correlation of daily returns", "Günlük getiri korelasyonu"), c == null ? "–" : f.nf(c, 2)],
        [L("Reading", "Yorum"), word],
      ],
      summary: L(
        `${pair[0].ticker} and ${pair[1].ticker} have a daily-return correlation of ${f.nf(c, 2)}, so they move ${word}.`,
        `${pair[0].ticker} ve ${pair[1].ticker} günlük getiri korelasyonu ${f.nf(c, 2)}; ${word} hareket ediyorlar.`),
      notice: note,
    };
  }

  const wants = intent === "FUNDAMENTALS"
    ? L("fundamentals (the library's fmp source)", "temel veriler (kütüphanenin fmp kaynağı)")
    : L("news and web search", "haber ve web araması");
  if (intent === "FUNDAMENTALS" || intent === "WEB_SEARCH") {
    return {
      tool: intent === "FUNDAMENTALS" ? "fmp_service" : "web_search",
      facts: [],
      summary: L(
        `That is a ${wants} question. In the library it is routed to a live source; this static demo does not call one, so it has no figure to give.`,
        `Bu bir ${wants} sorusu. Kütüphanede canlı bir kaynağa yönlendirilir; bu statik demo kaynak çağırmaz, verilecek bir rakam yok.`),
      notice: L("Routed correctly, not executed in the demo.", "Doğru yönlendirildi, demoda çalıştırılmadı."),
    };
  }

  if (intent === "OUT_OF_SCOPE") {
    return {
      tool: "none",
      facts: [],
      summary: L("That is outside what a finance agent answers.", "Bu, bir finans ajanının cevaplayacağı bir konu değil."),
    };
  }

  // Any other intent in the library's taxonomy: routed correctly, but this demo has no tool for it.
  return {
    tool: "n/a",
    facts: [],
    summary: L(
      `Routed to ${intent}. The library has a service for that; this demo only runs portfolio, risk, trend and correlation.`,
      `${intent} niyetine yönlendirildi. Kütüphanede bunun için bir servis var; demo yalnızca portföy, risk, trend ve korelasyon çalıştırır.`),
    notice: L("Routed correctly, not executed in the demo.", "Doğru yönlendirildi, demoda çalıştırılmadı."),
  };
}
