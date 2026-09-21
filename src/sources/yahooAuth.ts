// Shared Yahoo Finance session (cookie + crumb).
//
// Since ~2024 Yahoo's JSON endpoints - the options chain, the v7 batch quote and
// quoteSummary - reject anonymous requests: they need a cookie plus a "crumb" token.
// It is still FREE and needs no account, but the handshake costs two requests, so the
// pair is cached in the Setting table (shared across server instances) for an hour.
//
// Everything that talks to those endpoints goes through here, so a stale crumb is
// re-fetched once in a single place instead of each caller inventing its own retry.

import { db } from "../db";

export const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const KEY = "yahooCrumbCache";
const TTL_MS = 3_600_000;

export type YahooSession = { cookie: string; crumb: string };

let mem: (YahooSession & { at: number }) | null = null;

async function fetchSession(): Promise<YahooSession | null> {
  try {
    const jar = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": YAHOO_UA }, signal: AbortSignal.timeout(12000) });
    const cookie = jar.headers.get("set-cookie") || "";
    const r = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": YAHOO_UA, Cookie: cookie },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const crumb = (await r.text()).trim();
    // A login wall answers with HTML instead of the short token.
    if (!crumb || crumb.length > 40 || crumb.includes("<")) return null;
    const s = { cookie, crumb };
    mem = { ...s, at: Date.now() };
    const value = JSON.stringify({ ...s, at: Date.now() });
    try {
      await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    } catch { /* cache is best-effort; the session still works this request */ }
    return s;
  } catch {
    return null;
  }
}

export async function yahooSession(force = false): Promise<YahooSession | null> {
  if (!force) {
    if (mem && Date.now() - mem.at < TTL_MS) return { cookie: mem.cookie, crumb: mem.crumb };
    try {
      const row = await db.setting.findUnique({ where: { key: KEY } });
      if (row?.value) {
        const c = JSON.parse(row.value) as YahooSession & { at: number };
        if (c.crumb && Date.now() - c.at < TTL_MS) { mem = c; return { cookie: c.cookie, crumb: c.crumb }; }
      }
    } catch { /* fall through to a fresh handshake */ }
  } else {
    mem = null;
  }
  return fetchSession();
}

/** GET a query1.finance.yahoo.com path with the crumb attached. Retries once with a
 *  fresh session on 401/403, which is what an expired crumb looks like. */
export async function yahooJson<T>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  timeoutMs = 15000,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await yahooSession(attempt === 1);
    if (!s) return null;
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), crumb: s.crumb });
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/${path}?${qs}`, {
        headers: { "User-Agent": YAHOO_UA, Cookie: s.cookie, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.status === 401 || r.status === 403) continue; // stale crumb - retry once
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch {
      return null;
    }
  }
  return null;
}
