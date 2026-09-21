// Bloomberg connectivity via OpenFIGI (Bloomberg's free open symbology API).
// Full Terminal / Data License quote feeds need a paid Bloomberg contract; this
// layer maps tickers → FIGI / Bloomberg ticker / exchange / sector so reports and
// chat can cite Bloomberg identifiers. Optional X-OPENFIGI-APIKEY raises rate limits.
// Docs: https://www.openfigi.com/api

import { getApiKey } from "../apikeys";

export type BloombergMap = {
  ticker: string;
  figi: string | null;
  compositeFigi: string | null;
  name: string | null;
  bloombergTicker: string | null;
  exchCode: string | null;
  marketSector: string | null;
  securityType: string | null;
  source: "openfigi";
};

type FigiHit = {
  figi?: string;
  compositeFIGI?: string;
  name?: string;
  ticker?: string;
  exchCode?: string;
  marketSector?: string;
  securityType?: string;
};

export async function getBloombergKey(): Promise<string> {
  return getApiKey("bloomberg");
}

export async function bloombergConfigured(): Promise<boolean> {
  // OpenFIGI works without a key (lower rate limits); "configured" means a key is saved.
  return Boolean(await getBloombergKey());
}

export async function bloombergTestKey(key: string): Promise<{ ok: boolean; error?: string; sample?: string }> {
  if (!key.trim()) return { ok: false, error: "Anahtar boş." };
  try {
    const r = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OPENFIGI-APIKEY": key },
      body: JSON.stringify([{ idType: "TICKER", idValue: "AAPL", exchCode: "US" }]),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, error: "OpenFIGI anahtarı reddedildi." };
    if (!r.ok) return { ok: false, error: `OpenFIGI yanıtı: ${r.status}` };
    const j = (await r.json()) as { data?: FigiHit[] }[];
    const name = j?.[0]?.data?.[0]?.name;
    return { ok: true, sample: name || "AAPL" };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 120) };
  }
}

/** Map one or more equity tickers to Bloomberg/OpenFIGI identifiers. */
export async function mapTickersToBloomberg(tickers: string[]): Promise<BloombergMap[]> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase().replace(/\.IS$/i, "")).filter(Boolean))].slice(0, 25);
  if (!unique.length) return [];

  const key = await getBloombergKey();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (key) headers["X-OPENFIGI-APIKEY"] = key;

  const body = unique.map((t) => ({
    idType: "TICKER" as const,
    idValue: t,
    // Prefer US listing; OpenFIGI still returns best match when exchCode is omitted for non-US.
    ...(t.length <= 5 ? { exchCode: "US" } : {}),
  }));

  try {
    const r = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    const rows = (await r.json()) as { data?: FigiHit[]; error?: string }[];
    return unique.map((ticker, i) => {
      const hit = rows[i]?.data?.[0];
      const bbTicker = hit?.ticker && hit?.exchCode ? `${hit.ticker} ${hit.exchCode} Equity` : hit?.ticker ?? null;
      return {
        ticker,
        figi: hit?.figi ?? null,
        compositeFigi: hit?.compositeFIGI ?? null,
        name: hit?.name ?? null,
        bloombergTicker: bbTicker,
        exchCode: hit?.exchCode ?? null,
        marketSector: hit?.marketSector ?? null,
        securityType: hit?.securityType ?? null,
        source: "openfigi" as const,
      };
    });
  } catch {
    return [];
  }
}

export async function mapTickerToBloomberg(ticker: string): Promise<BloombergMap | null> {
  const [row] = await mapTickersToBloomberg([ticker]);
  return row?.figi || row?.name ? row : null;
}

/** Compact prompt block for report / chat enrichment. */
export function bloombergToPromptBlock(rows: BloombergMap[]): string {
  const live = rows.filter((r) => r.figi || r.bloombergTicker);
  if (!live.length) return "Bloomberg/OpenFIGI: dogrulanamadi";
  return (
    "Bloomberg kimlikleri (OpenFIGI):\n" +
    live
      .map((r) => {
        const parts = [
          r.bloombergTicker || r.ticker,
          r.figi ? `FIGI ${r.figi}` : null,
          r.marketSector,
          r.name,
        ].filter(Boolean);
        return `- ${parts.join(" | ")}`;
      })
      .join("\n")
  );
}
