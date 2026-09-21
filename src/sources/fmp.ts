// Financial Modeling Prep (FMP) connector - STABLE API (financialmodelingprep.com/stable).
// Legacy v3/v4 endpoints are dead for keys issued after 2025-08-31, so we use /stable.
// Rich for US/global equity fundamentals + ANALYST data (rating consensus, price targets,
// recent upgrades/downgrades). BIST/Turkish fundamentals are thin - use the Turkish
// sources layer for those.
//
// QUOTA DISCIPLINE (free key ~250 calls/day):
//   - FMP is NEVER used in the price-refresh loop (that stays on Yahoo).
//   - Every response is cached in the Setting table with a TTL, so repeat questions
//     about the same symbol cost 0 API calls until the cache expires.

import { db } from "../db";

const BASE = "https://financialmodelingprep.com/stable";
let cachedKeys: { v: string[]; at: number } | null = null;
// Set when every key returns 429 - lets callers distinguish "out of quota" from "no data".
let quotaExhausted = false;

export async function getFmpKey(): Promise<string> {
  return (await getFmpKeys())[0] ?? "";
}

/** All usable keys, most-specific first: the one saved in Settings, then the env key.
 *  Returned as a list so a key that has hit its daily cap can fall through to another. */
export async function getFmpKeys(): Promise<string[]> {
  if (cachedKeys && Date.now() - cachedKeys.at < 30_000) return cachedKeys.v;
  const keys: string[] = [];
  try {
    const row = await db.setting.findUnique({ where: { key: "fmpApiKey" } });
    if (row?.value) keys.push(row.value.trim());
  } catch { /* ignore */ }
  const env = (process.env.FMP_API_KEY || "").trim();
  if (env && !keys.includes(env)) keys.push(env);
  cachedKeys = { v: keys, at: Date.now() };
  return keys;
}

/** True when every configured key is quota-exhausted, so the UI can say so plainly. */
export function fmpQuotaExhausted(): boolean {
  return quotaExhausted;
}
export async function fmpConfigured(): Promise<boolean> { return Boolean(await getFmpKey()); }

// --- DB-backed cache (conserves the limited quota) ---
async function cacheGet<T>(k: string, ttlMs: number): Promise<T | null> {
  try {
    const row = await db.setting.findUnique({ where: { key: `fmpc:${k}` } });
    if (!row) return null;
    const { at, data } = JSON.parse(row.value) as { at: number; data: T };
    if (Date.now() - at > ttlMs) return null;
    return data;
  } catch { return null; }
}
async function cacheSet<T>(k: string, data: T): Promise<void> {
  try { await db.setting.upsert({ where: { key: `fmpc:${k}` }, create: { key: `fmpc:${k}`, value: JSON.stringify({ at: Date.now(), data }) }, update: { value: JSON.stringify({ at: Date.now(), data }) } }); } catch { /* ignore */ }
}

async function fmpGet<T>(endpoint: string, cacheKey: string, ttlMs: number): Promise<T | null> {
  const cached = await cacheGet<T>(cacheKey, ttlMs);
  if (cached !== null) return cached;
  const keys = await getFmpKeys();
  if (!keys.length) return null;

  let sawQuotaError = false;
  for (const key of keys) {
    try {
      const sep = endpoint.includes("?") ? "&" : "?";
      const r = await fetch(`${BASE}/${endpoint}${sep}apikey=${key}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      // 429 = daily cap, 401/403 = bad key: both are worth retrying with the next key
      // rather than reporting the symbol as having no data.
      if (r.status === 429 || r.status === 401 || r.status === 403) { sawQuotaError = true; continue; }
      if (!r.ok) continue;
      const j = await r.json();
      if (j && typeof j === "object" && !Array.isArray(j) && "Error Message" in j) {
        // FMP also reports quota exhaustion as a 200 with an error body.
        if (/limit reach/i.test(String((j as { "Error Message": string })["Error Message"]))) { sawQuotaError = true; continue; }
        continue;
      }
      await cacheSet(cacheKey, j);
      quotaExhausted = false;
      return j as T;
    } catch { /* try the next key */ }
  }
  if (sawQuotaError) quotaExhausted = true;
  return null;
}

const first = <T>(v: T[] | null): T | null => (Array.isArray(v) && v.length ? v[0] : null);
const DAY = 86_400_000;

export type FmpProfile = { symbol: string; companyName: string; price: number; marketCap: number; beta: number; range: string; sector: string; industry: string; exchange: string; currency: string; description: string; website: string };
export async function fmpProfile(s: string): Promise<FmpProfile | null> {
  return first(await fmpGet<FmpProfile[]>(`profile?symbol=${encodeURIComponent(s)}`, `profile:${s}`, DAY));
}

export type FmpRatios = { priceToEarningsRatioTTM?: number; priceToBookRatioTTM?: number; priceToSalesRatioTTM?: number; priceToEarningsGrowthRatioTTM?: number; debtToEquityRatioTTM?: number; returnOnEquityTTM?: number; dividendYieldTTM?: number; netProfitMarginTTM?: number };
export async function fmpRatios(s: string): Promise<FmpRatios | null> {
  return first(await fmpGet<FmpRatios[]>(`ratios-ttm?symbol=${encodeURIComponent(s)}`, `ratios:${s}`, DAY));
}

export type FmpTarget = { symbol: string; targetHigh?: number; targetLow?: number; targetConsensus?: number; targetMedian?: number };
export async function fmpPriceTarget(s: string): Promise<FmpTarget | null> {
  return first(await fmpGet<FmpTarget[]>(`price-target-consensus?symbol=${encodeURIComponent(s)}`, `target:${s}`, DAY / 2));
}

export type FmpGrades = { symbol: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; consensus: string };
export async function fmpGradesConsensus(s: string): Promise<FmpGrades | null> {
  return first(await fmpGet<FmpGrades[]>(`grades-consensus?symbol=${encodeURIComponent(s)}`, `grades:${s}`, DAY / 2));
}

export type FmpGradeAction = { symbol: string; date: string; gradingCompany: string; previousGrade: string; newGrade: string; action: string };
export async function fmpRecentGrades(s: string, limit = 6): Promise<FmpGradeAction[]> {
  const all = (await fmpGet<FmpGradeAction[]>(`grades?symbol=${encodeURIComponent(s)}&limit=${limit}`, `gradelist:${s}`, DAY / 2)) ?? [];
  return all.slice(0, limit); // the stable endpoint ignores &limit, so cap client-side
}

export type FmpRating = { symbol: string; rating: string; overallScore: number; discountedCashFlowScore?: number; returnOnEquityScore?: number; returnOnAssetsScore?: number; debtToEquityScore?: number; priceToEarningsScore?: number; priceToBookScore?: number };
export async function fmpRating(s: string): Promise<FmpRating | null> {
  return first(await fmpGet<FmpRating[]>(`ratings-snapshot?symbol=${encodeURIComponent(s)}`, `rating:${s}`, DAY));
}

// Validate a key for the Settings "test" button (stable endpoint), no persistence, no cache.
export async function fmpTestKey(key: string): Promise<{ ok: boolean; error?: string; company?: string }> {
  try {
    const r = await fetch(`${BASE}/profile?symbol=AAPL&apikey=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    if (j && typeof j === "object" && !Array.isArray(j) && "Error Message" in j) return { ok: false, error: String((j as { "Error Message": string })["Error Message"]).slice(0, 160) };
    if (Array.isArray(j) && j[0]?.companyName) return { ok: true, company: j[0].companyName };
    return { ok: false, error: "Beklenmeyen yanıt (anahtar geçersiz olabilir)." };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
