/* ------------------------------------------------------------------------------------
   Demo portfolio.

   Every position below is invented. The lots, cost bases, cash balances and volatility
   settings are made up for the demo and describe nobody's real holdings.

   What is NOT invented is the arithmetic. Each holding gets a deterministic price series
   from a seeded random walk, and every figure on the dashboard - day P/L, period returns,
   the equity curve, the risk panel - is computed from those series by the library's own
   `metrics` module. Nothing is a typed-in percentage, so the numbers reconcile: the
   sub-portfolio totals add up to the header, and the period grid agrees with the chart.

   The seed is fixed, so every visitor sees the same portfolio.
   ------------------------------------------------------------------------------------ */

const DAYS = 260;             // ~one trading year, so YTD is a real window
const BASELINE_USDTRY = 50.0724;  // fallback only; the live TCMB rate is used when present

/** mulberry32 - small, fast, seeded PRNG. Same seed, same portfolio, every time. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform: uniform PRNG -> standard normal, for log-return steps. */
function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Geometric random walk of `days` closes, rescaled so the LAST close is exactly `last`.
 * Rescaling at the end means the displayed price is a chosen round number while the
 * history behind it still has realistic shape.
 *
 * @param {number} seed  fixed per ticker
 * @param {number} last  the closing price to land on
 * @param {number} drift annualised drift, e.g. 0.18 for +18%/yr
 * @param {number} vol   annualised volatility, e.g. 0.28 for 28%
 */
function walk(seed, last, drift, vol, days = DAYS) {
  const rnd = mulberry32(seed);
  const dt = 1 / 252;
  const mu = (drift - (vol * vol) / 2) * dt;
  const sd = vol * Math.sqrt(dt);
  const out = [1];
  for (let i = 1; i < days; i++) out.push(out[i - 1] * Math.exp(mu + sd * gauss(rnd)));
  const k = last / out[out.length - 1];
  return out.map((v) => Math.round(v * k * 100) / 100);
}

/** The trading calendar the series sits on: `days` weekdays ending today. */
function tradingDays(days = DAYS) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < days) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

// ---- The invented part: positions, cash, and how each name is allowed to move --------
// `price` is the close the series lands on. `drift`/`vol` are annualised.
const BOOK = [
  {
    code: "P1", name: { tr: "P1 Çekirdek", en: "P1 Core" }, cash: 142500, accent: "--green",
    note: { tr: "Uzun vadeli çekirdek pozisyonlar", en: "Long-term core positions" },
    holdings: [
      { ticker: "AAPL",  label: "Apple",            lots: 420, avgCost: 198.40, price: 268.40, seed: 101, drift: 0.22, vol: 0.26 },
      { ticker: "MSFT",  label: "Microsoft",        lots: 180, avgCost: 418.60, price: 512.75, seed: 102, drift: 0.19, vol: 0.24 },
      { ticker: "JNJ",   label: "Johnson & Johnson", lots: 310, avgCost: 164.90, price: 196.20, seed: 103, drift: 0.11, vol: 0.16 },
    ],
  },
  {
    code: "P2", name: { tr: "P2 Büyüme", en: "P2 Growth" }, cash: 64200, accent: "--purple",
    note: { tr: "Yüksek oynaklıklı büyüme adayları", en: "Higher-volatility growth names" },
    holdings: [
      { ticker: "GOOGL", label: "Alphabet",  lots: 260, avgCost: 201.30, price: 289.60,  seed: 201, drift: 0.28, vol: 0.31 },
      { ticker: "AMZN",  label: "Amazon",    lots: 240, avgCost: 214.75, price: 241.85,  seed: 202, drift: 0.14, vol: 0.33 },
      { ticker: "NFLX",  label: "Netflix",   lots: 35,  avgCost: 960.00, price: 1142.30, seed: 203, drift: 0.21, vol: 0.38 },
    ],
  },
  {
    code: "P3", name: { tr: "P3 Savunma", en: "P3 Defensive" }, cash: 38900, accent: "--blue",
    note: { tr: "Düşük beta, temettü ağırlıklı", en: "Low beta, dividend weighted" },
    holdings: [
      { ticker: "KO",  label: "Coca-Cola",   lots: 900, avgCost: 64.20,  price: 71.45,  seed: 301, drift: 0.09, vol: 0.14 },
      { ticker: "PG",  label: "P&G",         lots: 290, avgCost: 152.10, price: 158.90, seed: 302, drift: 0.06, vol: 0.15 },
      { ticker: "XOM", label: "Exxon Mobil", lots: 520, avgCost: 109.40, price: 118.25, seed: 303, drift: 0.08, vol: 0.22 },
    ],
  },
  {
    code: "P4", name: { tr: "P4 Trade", en: "P4 Trade" }, cash: 86300, accent: "--amber",
    note: { tr: "Taktik pozisyonlar, kısa tutma süresi", en: "Tactical positions, short holding period" },
    holdings: [
      { ticker: "TSM",  label: "TSMC",  lots: 310, avgCost: 243.80,  price: 298.70,  seed: 401, drift: 0.31, vol: 0.34 },
      { ticker: "ASML", label: "ASML",  lots: 48,  avgCost: 1012.00, price: 1085.40, seed: 402, drift: 0.17, vol: 0.32 },
    ],
  },
  {
    // The Turkish leg exists to show the data layer: these three tickers are also in the
    // live snapshot below, so when the snapshot has them the demo book is marked to the
    // real BIST close and converted at the real TCMB reference rate.
    code: "P5", name: { tr: "P5 Borsa İstanbul", en: "P5 Borsa Istanbul" }, cash: 310000, accent: "--red",
    currency: "TRY",
    note: { tr: "TRY cinsinden; TCMB kuruyla USD'ye çevrilir", en: "Held in TRY, converted at the CBRT rate" },
    holdings: [
      { ticker: "THYAO", label: "Türk Hava Yolları", lots: 4200, avgCost: 262.50, price: 297.25, seed: 501, drift: 0.24, vol: 0.37 },
      { ticker: "ASELS", label: "Aselsan",           lots: 3100, avgCost: 281.00, price: 330.25, seed: 502, drift: 0.29, vol: 0.35 },
      { ticker: "GARAN", label: "Garanti BBVA",      lots: 9800, avgCost: 131.20, price: 143.10, seed: 503, drift: 0.18, vol: 0.33 },
    ],
  },
];

// Demo benchmarks, generated the same way, so the index comparison columns have something
// to compare against. These are not real index levels.
const BENCH = [
  { key: "spx", label: "S&P 500",  price: 7180.40,  seed: 901, drift: 0.13, vol: 0.14 },
  { key: "ndx", label: "Nasdaq 100", price: 26420.80, seed: 902, drift: 0.18, vol: 0.19 },
];

const TRANSACTIONS = [
  { back: 1,  action: "BUY",  sub: "P4", desc: "TSM",   qty: 60,   price: 294.10,  realized: null },
  { back: 2,  action: "SELL", sub: "P2", desc: "AMZN", qty: 40, price: 239.60, realized: 1842.40 },
  { back: 4,  action: "BUY",  sub: "P5", desc: "GARAN", qty: 1800, price: 141.05,  realized: null },
  { back: 6,  action: "SELL", sub: "P3", desc: "XOM",   qty: 120,  price: 117.90,  realized: 1014.00 },
  { back: 9,  action: "BUY",  sub: "P1", desc: "MSFT",  qty: 25,   price: 503.20,  realized: null },
  { back: 12, action: "SELL", sub: "P4", desc: "ASML",  qty: 12,   price: 1072.50, realized: -726.00 },
  { back: 15, action: "BUY",  sub: "P2", desc: "GOOGL", qty: 70,   price: 281.40,  realized: null },
  { back: 18, action: "BUY",  sub: "P5", desc: "ASELS", qty: 600,  price: 324.80,  realized: null },
];

/**
 * Build the full demo model.
 *
 * @param {object} [opts]
 * @param {number} [opts.usdTry]     live TCMB selling rate, when the snapshot has one
 * @param {Record<string, number>} [opts.bistPrices]  live BIST closes by bare ticker
 * @param {number} [opts.seedOffset] shifts every seed, for a different sample book
 * @param {"all"|"usd"|"try"} [opts.legs]  restrict to one currency leg
 */
export function buildPortfolio(opts = {}) {
  const usdTry = opts.usdTry || BASELINE_USDTRY;
  const livePrices = opts.bistPrices || {};
  const off = opts.seedOffset || 0;
  const legs = opts.legs || "all";
  const dates = tradingDays();

  const book = BOOK.filter((s) =>
    legs === "all" || (legs === "try" ? s.currency === "TRY" : s.currency !== "TRY"));

  const subs = book.map((s) => {
    const isTry = s.currency === "TRY";
    const fx = isTry ? 1 / usdTry : 1;

    const holdings = s.holdings.map((h) => {
      const live = livePrices[h.ticker];
      const last = typeof live === "number" && live > 0 ? live : h.price;
      const native = walk(h.seed + off, last, h.drift, h.vol);          // in the local currency
      const series = isTry ? native.map((v) => v * fx) : native;  // in USD, for totals

      const price = native[native.length - 1];
      const prev = native[native.length - 2];
      const posValue = h.lots * price * fx;
      const dailyPnl = h.lots * (price - prev) * fx;

      return {
        ...h,
        live: typeof live === "number" && live > 0,
        currency: isTry ? "TRY" : "USD",
        native, series, price, prev,
        dailyPnl,
        dailyPct: prev ? ((price - prev) / prev) * 100 : 0,
        posValue,
        totalPnl: h.lots * (price - h.avgCost) * fx,
        totalPnlPct: ((price - h.avgCost) / h.avgCost) * 100,
      };
    });

    const cashUsd = s.cash * fx;
    const position = holdings.reduce((a, h) => a + h.posValue, 0);
    return {
      ...s, holdings, position, cash: cashUsd, cashNative: s.cash,
      total: position + cashUsd,
      dailyPnl: holdings.reduce((a, h) => a + h.dailyPnl, 0),
    };
  });

  const holdings = subs.flatMap((s) => s.holdings);
  const totalCash = subs.reduce((a, s) => a + s.cash, 0);
  const totalPosition = subs.reduce((a, s) => a + s.position, 0);
  const totalEquity = totalPosition + totalCash;
  const dailyPnl = subs.reduce((a, s) => a + s.dailyPnl, 0);
  const prevCloseEquity = totalEquity - dailyPnl;

  // Portfolio equity curve: lots x close summed across the book, plus cash. This is what
  // every period figure and the performance chart are read off, so they cannot disagree.
  const equity = dates.map((_, i) =>
    holdings.reduce((a, h) => a + h.lots * h.series[i], 0) + totalCash);

  const benchmarks = BENCH.map((b) => ({ ...b, series: walk(b.seed + off, b.price, b.drift, b.vol) }));

  // Window starts, as indices into the series.
  const today = dates[dates.length - 1];
  const monthStart = dates.findIndex((d) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth());
  const yearStart = dates.findIndex((d) => d.getFullYear() === today.getFullYear());
  const periods = [
    { key: "1W", labelTr: "Son 5 işlem günü", labelEn: "Last 5 sessions", from: Math.max(0, dates.length - 6) },
    { key: "MTD", labelTr: "Ay başından beri", labelEn: "Month to date", from: Math.max(0, monthStart - 1) },
    { key: "YTD", labelTr: "Yıl başından beri", labelEn: "Year to date", from: Math.max(0, yearStart - 1) },
    { key: "ALL", labelTr: "Seri başından beri", labelEn: "Since series start", from: 0 },
  ].map((p) => {
    const base = equity[p.from];
    const amount = totalEquity - base;
    const ratio = (s) => ((s[s.length - 1] - s[p.from]) / s[p.from]) * 100;
    return {
      ...p,
      amount,
      portfolio: (amount / base) * 100,
      spx: ratio(benchmarks[0].series),
      ndx: ratio(benchmarks[1].series),
      fromDate: dates[p.from],
    };
  });

  const shown = new Set(subs.map((s) => s.code));
  const transactions = TRANSACTIONS.filter((t) => shown.has(t.sub)).map((t) => {
    const d = dates[Math.max(0, dates.length - 1 - t.back)];
    return { ...t, date: d, amount: t.qty * t.price };
  });

  return {
    dates, subs, holdings, benchmarks, periods, transactions,
    totalEquity, totalPosition, totalCash, dailyPnl, prevCloseEquity,
    dailyPct: prevCloseEquity ? (dailyPnl / prevCloseEquity) * 100 : 0,
    equity,
    startCapital: equity[0],
    yearOpen: equity[Math.max(0, yearStart - 1)],
    prevCloseDate: dates[dates.length - 2],
    usdTry, usdTryLive: Boolean(opts.usdTry), legs, seedOffset: off,
    bistLive: Object.keys(livePrices).length > 0,
  };
}
