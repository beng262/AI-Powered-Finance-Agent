// Finnhub — free-tier quotes, company news, and economic calendar.
// https://finnhub.io/docs/api

import { getApiKey } from "../apikeys";

const BASE = "https://finnhub.io/api/v1";

export async function getFinnhubKey(): Promise<string> {
  return getApiKey("finnhub");
}

export async function finnhubConfigured(): Promise<boolean> {
  return Boolean(await getFinnhubKey());
}

export async function finnhubTestKey(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!key.trim()) return { ok: false, error: "Anahtar boş." };
  try {
    const r = await fetch(`${BASE}/quote?symbol=AAPL&token=${encodeURIComponent(key)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, error: "Finnhub anahtarı reddedildi." };
    if (!r.ok) return { ok: false, error: `Finnhub yanıtı: ${r.status}` };
    const j = (await r.json()) as { c?: number; error?: string };
    if (j.error) return { ok: false, error: String(j.error).slice(0, 120) };
    if (typeof j.c !== "number" || j.c <= 0) return { ok: false, error: "Beklenmeyen yanıt." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 120) };
  }
}

export type FinnhubQuote = { ticker: string; price: number; prevClose: number; source: "finnhub" };

export async function finnhubQuote(ticker: string): Promise<FinnhubQuote | null> {
  const key = await getFinnhubKey();
  if (!key) return null;
  try {
    const r = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(key)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { c?: number; pc?: number };
    if (typeof j.c !== "number" || !Number.isFinite(j.c) || j.c <= 0) return null;
    return { ticker: ticker.toUpperCase(), price: j.c, prevClose: typeof j.pc === "number" ? j.pc : j.c, source: "finnhub" };
  } catch {
    return null;
  }
}

export async function finnhubQuotes(tickers: string[]): Promise<FinnhubQuote[]> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(0, 20);
  const out: FinnhubQuote[] = [];
  // Free tier is rate-limited; small parallel batches.
  for (let i = 0; i < unique.length; i += 4) {
    const chunk = unique.slice(i, i + 4);
    const rows = await Promise.all(chunk.map((t) => finnhubQuote(t)));
    for (const q of rows) if (q) out.push(q);
  }
  return out;
}
