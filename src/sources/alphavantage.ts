// Alpha Vantage — free equity / FX quotes (demo key rate-limits hard; user key preferred).
// https://www.alphavantage.co/documentation/

import { getApiKey } from "../apikeys";

const BASE = "https://www.alphavantage.co/query";

export async function getAlphaVantageKey(): Promise<string> {
  return getApiKey("alphavantage");
}

export async function alphaVantageConfigured(): Promise<boolean> {
  return Boolean(await getAlphaVantageKey());
}

export async function alphaVantageTestKey(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!key.trim()) return { ok: false, error: "Anahtar boş." };
  try {
    const url = `${BASE}?function=GLOBAL_QUOTE&symbol=IBM&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { ok: false, error: `Alpha Vantage yanıtı: ${r.status}` };
    const j = (await r.json()) as Record<string, unknown>;
    if (j.Note || j.Information) return { ok: false, error: "Kota/limit — anahtar kabul edildi ancak şu an kısıtlı." };
    if (j["Error Message"]) return { ok: false, error: String(j["Error Message"]).slice(0, 120) };
    const gq = j["Global Quote"] as Record<string, string> | undefined;
    if (!gq || !gq["05. price"]) return { ok: false, error: "Beklenmeyen yanıt." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 120) };
  }
}

export type AvQuote = { ticker: string; price: number; prevClose: number; source: "alphavantage" };

export async function alphaVantageQuote(ticker: string): Promise<AvQuote | null> {
  const key = await getAlphaVantageKey();
  if (!key) return null;
  try {
    const url = `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { "Global Quote"?: Record<string, string>; Note?: string };
    if (j.Note) return null;
    const gq = j["Global Quote"];
    const price = parseFloat(gq?.["05. price"] || "");
    const prev = parseFloat(gq?.["08. previous close"] || "");
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      ticker: ticker.toUpperCase(),
      price,
      prevClose: Number.isFinite(prev) ? prev : price,
      source: "alphavantage",
    };
  } catch {
    return null;
  }
}

/** Sequential — Alpha Vantage free tier is ~5 req/min. */
export async function alphaVantageQuotes(tickers: string[]): Promise<AvQuote[]> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(0, 5);
  const out: AvQuote[] = [];
  for (const t of unique) {
    const q = await alphaVantageQuote(t);
    if (q) out.push(q);
  }
  return out;
}
