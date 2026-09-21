// Borsa Istanbul (BIST) quotes via Yahoo Finance (".IS" tickers / "XU100.IS" indices).
// BIST has no free official real-time API; Yahoo is the integration the reference
// platform uses for "Kuresel piyasa/hisse verileri".

const YAHOO_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
};

export type BistQuote = { symbol: string; label: string; price: number | null; changePct: number | null; currency: string };

// Indices + the most-watched large caps. Adjust freely.
const BIST_INDICES: { symbol: string; label: string }[] = [
  { symbol: "XU100.IS", label: "BIST 100" },
  { symbol: "XU030.IS", label: "BIST 30" },
  { symbol: "XBANK.IS", label: "BIST Banka" },
];

async function chartQuote(symbol: string, label: string): Promise<BistQuote> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const r = await fetch(url, { cache: "no-store", headers: YAHOO_HEADERS });
    if (!r.ok) return { symbol, label, price: null, changePct: null, currency: "TRY" };
    const j = (await r.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; currency?: string } }> };
    };
    const meta = j.chart?.result?.[0]?.meta;
    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
    const changePct = price != null && prev ? (price / prev - 1) * 100 : null;
    return { symbol, label, price, changePct, currency: meta?.currency || "TRY" };
  } catch {
    return { symbol, label, price: null, changePct: null, currency: "TRY" };
  }
}

export type BistSnapshot = { indices: BistQuote[]; watchlist: BistQuote[]; live: boolean };

// `tickers` are bare BIST codes (e.g. "THYAO"); ".IS" is appended for Yahoo.
export async function getBistSnapshot(tickers: string[] = []): Promise<BistSnapshot> {
  const watch = [...new Set(tickers.map((t) => t.toUpperCase().replace(/\.IS$/, "")))]
    .slice(0, 20)
    .map((t) => ({ symbol: `${t}.IS`, label: t }));
  const [indices, watchlist] = await Promise.all([
    Promise.all(BIST_INDICES.map((i) => chartQuote(i.symbol, i.label))),
    Promise.all(watch.map((w) => chartQuote(w.symbol, w.label))),
  ]);
  return { indices, watchlist, live: indices.some((i) => i.price != null) };
}
