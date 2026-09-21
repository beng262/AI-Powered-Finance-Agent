// FINRA daily short sale volume - FREE, no key, no account.
//
// FINRA publishes, every trading day, the short volume for every US symbol across the
// consolidated tape: https://cdn.finra.org/equity/regsho/daily/CNMSshvol{YYYYMMDD}.txt
// Pipe-delimited: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
//
// This is NOT short interest (positions held) - it is the share of the day's trading that
// was executed short. The two answer different questions and the Squeeze Radar uses both:
// short interest says how big the bet is, short volume says whether it is being pressed or
// covered TODAY. Short interest is only published twice a month, so this is the only daily
// read available for free.

import { db } from "../db";

const BASE = "https://cdn.finra.org/equity/regsho/daily";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const CACHE_KEY = "finraShortVolume"; // { date, rows: {SYM: [short, total]} } for held tickers

export type ShortVolume = {
  ticker: string;
  date: string;        // YYYY-MM-DD
  shortVolume: number;
  totalVolume: number;
  shortPct: number;    // % of the day's volume executed short
};

const compact = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dashed = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

let mem: { date: string; map: Map<string, { short: number; total: number }>; at: number } | null = null;

/** Download the most recent published file, walking back over weekends/holidays.
 *  Today's file does not exist until after the close, so a few misses are normal. */
async function fetchLatestFile(maxBack = 6): Promise<{ date: string; map: Map<string, { short: number; total: number }> } | null> {
  for (let i = 0; i <= maxBack; i++) {
    const day = compact(new Date(Date.now() - i * 86_400_000));
    try {
      const r = await fetch(`${BASE}/CNMSshvol${day}.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) continue;
      const text = await r.text();
      const map = new Map<string, { short: number; total: number }>();
      for (const line of text.split("\n")) {
        // Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
        const p = line.split("|");
        if (p.length < 5 || p[0] === "Date") continue;
        const short = Number(p[2]), total = Number(p[4]);
        if (!Number.isFinite(short) || !Number.isFinite(total) || total <= 0) continue;
        map.set(p[1].toUpperCase(), { short, total });
      }
      if (map.size > 100) return { date: dashed(day), map };
    } catch { /* try the previous day */ }
  }
  return null;
}

/** Short volume for the given tickers from the latest published FINRA file.
 *  The file covers every US symbol (~10k rows), so it is fetched once and kept in memory
 *  for the process; only the requested subset is persisted. */
export async function shortVolumes(tickers: string[]): Promise<{ date: string | null; rows: ShortVolume[] }> {
  const want = [...new Set(tickers.map((t) => t.toUpperCase()))].filter((t) => !t.endsWith(".IS"));
  if (!want.length) return { date: null, rows: [] };

  if (!mem || Date.now() - mem.at > 6 * 3_600_000) {
    const f = await fetchLatestFile();
    if (f) mem = { ...f, at: Date.now() };
  }

  if (!mem) {
    // Fall back to the last persisted snapshot so the page still says something true.
    try {
      const row = await db.setting.findUnique({ where: { key: CACHE_KEY } });
      if (row?.value) {
        const c = JSON.parse(row.value) as { date: string; rows: Record<string, [number, number]> };
        return {
          date: c.date,
          rows: want.filter((t) => c.rows[t]).map((t) => {
            const [short, total] = c.rows[t];
            return { ticker: t, date: c.date, shortVolume: short, totalVolume: total, shortPct: (short / total) * 100 };
          }),
        };
      }
    } catch { /* nothing cached */ }
    return { date: null, rows: [] };
  }

  const rows: ShortVolume[] = [];
  const persist: Record<string, [number, number]> = {};
  for (const t of want) {
    const v = mem.map.get(t);
    if (!v) continue;
    rows.push({ ticker: t, date: mem.date, shortVolume: v.short, totalVolume: v.total, shortPct: (v.short / v.total) * 100 });
    persist[t] = [v.short, v.total];
  }
  try {
    const value = JSON.stringify({ date: mem.date, rows: persist });
    await db.setting.upsert({ where: { key: CACHE_KEY }, create: { key: CACHE_KEY, value }, update: { value } });
  } catch { /* best effort */ }

  return { date: mem.date, rows };
}
