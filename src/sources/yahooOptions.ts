// Yahoo options chain - free, keyless (needs only the shared cookie+crumb session).
// One place to fetch a chain, so the flow scanner, the open-position book, the LEAP
// radar and the earnings expected-move all hit the same short-lived cache instead of
// re-downloading the same chain three times per page.

import { yahooJson } from "./yahooAuth";

export type OptionContract = {
  contractSymbol: string;
  strike: number;
  lastPrice: number;
  change?: number;
  percentChange?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
  expiration?: number;
  lastTradeDate?: number;
};

export type OptionChain = {
  ticker: string;
  underlying: number | null;
  currency: string;
  expirations: number[]; // every listed expiry, epoch seconds (UTC midnight)
  expiry: number | null; // the expiry this payload actually contains
  calls: OptionContract[];
  puts: OptionContract[];
};

type Raw = {
  optionChain?: {
    result?: Array<{
      quote?: { regularMarketPrice?: number; currency?: string };
      expirationDates?: number[];
      options?: Array<{ expirationDate?: number; calls?: OptionContract[]; puts?: OptionContract[] }>;
    }>;
  };
};

// Chains move slowly relative to a page render; 60s keeps a dashboard that shows the same
// ticker in three panels down to a single network call.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; v: OptionChain | null }>();

export async function getChain(ticker: string, expiryEpoch?: number): Promise<OptionChain | null> {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return null;
  const key = `${sym}|${expiryEpoch ?? "near"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;

  const params: Record<string, string | number> = {};
  if (expiryEpoch) params.date = expiryEpoch;
  const j = await yahooJson<Raw>(`v7/finance/options/${encodeURIComponent(sym)}`, params);
  const res = j?.optionChain?.result?.[0];
  let out: OptionChain | null = null;
  if (res) {
    const slice = res.options?.[0];
    out = {
      ticker: sym,
      underlying: res.quote?.regularMarketPrice ?? null,
      currency: res.quote?.currency || "USD",
      expirations: res.expirationDates ?? [],
      expiry: slice?.expirationDate ?? expiryEpoch ?? null,
      calls: slice?.calls ?? [],
      puts: slice?.puts ?? [],
    };
    // A symbol with no listed options (most BIST names) returns a result with no chain -
    // that is a real answer, not a failure, so it is cached as an empty chain.
  }
  cache.set(key, { at: Date.now(), v: out });
  return out;
}

/** Every listed expiry for a symbol (epoch seconds), cheapest via the near-dated call. */
export async function getExpirations(ticker: string): Promise<number[]> {
  const c = await getChain(ticker);
  return c?.expirations ?? [];
}

/** The listed expiry closest to a wanted date - Yahoo only serves exact listed dates. */
export function nearestExpiry(expirations: number[], wantedEpochSec: number): number | null {
  if (!expirations.length) return null;
  return expirations.reduce((best, e) => (Math.abs(e - wantedEpochSec) < Math.abs(best - wantedEpochSec) ? e : best), expirations[0]);
}

/** First listed expiry on or after a date (used for "the chain that covers earnings"). */
export function firstExpiryAfter(expirations: number[], epochSec: number): number | null {
  const later = expirations.filter((e) => e >= epochSec).sort((a, b) => a - b);
  return later.length ? later[0] : null;
}

/** Yahoo returns placeholder implied volatilities (1e-5, or absurdly large values) when
 *  it cannot compute one. Showing those as "0%" would be worse than showing nothing, so
 *  every caller reads IV through here. */
export const usableIV = (v: number | null | undefined): number | null =>
  typeof v === "number" && v > 0.01 && v < 5 ? v : null;

export const contractMid = (c: OptionContract): number | null => {
  const bid = c.bid ?? 0, ask = c.ask ?? 0;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  return Number.isFinite(c.lastPrice) && c.lastPrice > 0 ? c.lastPrice : null;
};

export const nearestStrike = (list: OptionContract[], target: number): OptionContract | null =>
  list.length ? list.reduce((b, c) => (Math.abs(c.strike - target) < Math.abs(b.strike - target) ? c : b), list[0]) : null;

export const epochOfYmd = (ymd: string): number => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 1000);
export const ymdOfEpoch = (e: number): string => new Date(e * 1000).toISOString().slice(0, 10);
