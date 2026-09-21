// SEC EDGAR - FREE, no key, no account. The most authoritative source in the app, because
// it is the filings themselves rather than somebody's summary of them.
//
// Two uses:
//  1. FORM 4 (insider transactions). When an officer or director buys or sells their own
//     company's stock they must file within two business days. This is the genuinely free
//     half of "smart money" - and unlike options flow it is not inferred, it is disclosed.
//  2. XBRL company facts. Real fundamentals (revenue, income, assets, debt, equity) with
//     no quota, which matters because the FMP free key is capped and regularly exhausted.
//
// SEC requires a descriptive User-Agent with a contact address and asks for <10 req/sec.
// Everything here is cached in the Setting table so we stay a polite consumer.

import { db } from "../db";

// SEC fair-access policy asks for a contact address in the User-Agent.
// Set SEC_USER_AGENT to your own before making heavy use of EDGAR.
const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() ||
  "ai-powered-finance-agent/0.1 (bengsrc@gmail.com)";
const H = { "User-Agent": SEC_UA, Accept: "application/json" };

async function secJson<T>(url: string, timeoutMs = 25000): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}
async function secText(url: string, timeoutMs = 25000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": SEC_UA }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

// ---- ticker -> CIK ---------------------------------------------------------
// The whole map is one ~1MB file; cached for a week since new listings are rare.
const TICKER_KEY = "secTickerMap";
let tickerMem: { map: Map<string, string>; at: number } | null = null;

export async function cikFor(ticker: string): Promise<string | null> {
  const t = ticker.trim().toUpperCase();
  if (!t || t.endsWith(".IS")) return null;   // SEC covers US registrants only

  if (!tickerMem || Date.now() - tickerMem.at > 6 * 3_600_000) {
    let raw: Record<string, { cik_str: number; ticker: string }> | null = null;
    try {
      const row = await db.setting.findUnique({ where: { key: TICKER_KEY } });
      if (row?.value) {
        const c = JSON.parse(row.value) as { at: number; data: Record<string, string> };
        if (Date.now() - c.at < 7 * 86_400_000) {
          tickerMem = { map: new Map(Object.entries(c.data)), at: Date.now() };
        }
      }
    } catch { /* fall through to a fresh fetch */ }

    if (!tickerMem) {
      raw = await secJson("https://www.sec.gov/files/company_tickers.json");
      if (!raw) return null;
      const map = new Map<string, string>();
      for (const v of Object.values(raw)) map.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, "0"));
      tickerMem = { map, at: Date.now() };
      try {
        const value = JSON.stringify({ at: Date.now(), data: Object.fromEntries(map) });
        await db.setting.upsert({ where: { key: TICKER_KEY }, create: { key: TICKER_KEY, value }, update: { value } });
      } catch { /* best effort */ }
    }
  }
  return tickerMem?.map.get(t) ?? null;
}

// ---- Form 4: insider transactions -----------------------------------------

/** SEC transaction codes, decoded. Only P and S are open-market decisions and therefore
 *  the only ones that carry a signal - a grant or a tax withholding tells you nothing
 *  about what the insider thinks. Lumping them all into "other" hides exactly that. */
export type InsiderAction = "ALIŞ" | "SATIŞ" | "HİBE" | "OPSİYON KULLANIMI" | "VERGİ KESİNTİSİ" | "HEDİYE" | "DİĞER";

const CODE_MAP: Record<string, InsiderAction> = {
  P: "ALIŞ",                 // open-market purchase
  S: "SATIŞ",                // open-market sale
  A: "HİBE",                 // grant / award
  M: "OPSİYON KULLANIMI",    // exercise of a derivative
  F: "VERGİ KESİNTİSİ",      // shares withheld to pay tax
  G: "HEDİYE",               // gift
};
/** True only for the two codes that reflect a deliberate market decision. */
export const isMarketSignal = (code: string) => code === "P" || code === "S";

export type InsiderTrade = {
  ticker: string;
  filedAt: string;        // YYYY-MM-DD
  periodOfReport: string;
  owner: string;
  title: string;          // officer/director role as filed
  code: string;           // the raw SEC transaction code
  action: InsiderAction;
  shares: number | null;
  price: number | null;
  value: number | null;
  sharesAfter: number | null;
  /** Rule 10b5-1 plans are scheduled in advance, so a sale under one carries far less
   *  signal than a discretionary sale. The form has a checkbox for it. */
  planned: boolean;
  url: string;
};

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
};
// Most Form 4 numeric fields are wrapped one level deeper in <value>.
const val = (xml: string, name: string): string | null => {
  const block = tag(xml, name);
  if (block == null) return null;
  const inner = tag(block, "value");
  return (inner ?? block).replace(/<[^>]*>/g, "").trim() || null;
};
const num = (s: string | null): number | null => {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function parseForm4(xml: string, ticker: string, filedAt: string, url: string): InsiderTrade[] {
  const owner = tag(xml, "rptOwnerName") ?? "bilinmiyor";
  const roles: string[] = [];
  if (/<isDirector>\s*(1|true)\s*<\/isDirector>/i.test(xml)) roles.push("Yönetim Kurulu");
  if (/<isOfficer>\s*(1|true)\s*<\/isOfficer>/i.test(xml)) roles.push(tag(xml, "officerTitle") ?? "Yönetici");
  if (/<isTenPercentOwner>\s*(1|true)\s*<\/isTenPercentOwner>/i.test(xml)) roles.push("%10+ ortak");
  const title = roles.join(", ") || "bildirilmedi";
  const periodOfReport = tag(xml, "periodOfReport") ?? filedAt;
  // A 10b5-1 plan is flagged either by the dedicated element or in the footnotes.
  const planned = /<rule10b5-1Flag>|10b5-1/i.test(xml);

  const out: InsiderTrade[] = [];
  // Only non-derivative rows: actual share purchases and sales, not option grants.
  const blocks = xml.split(/<nonDerivativeTransaction>/).slice(1).map((b) => b.split("</nonDerivativeTransaction>")[0]);
  for (const b of blocks) {
    const code = val(b, "transactionCode") ?? "";
    const acquired = (val(b, "transactionAcquiredDisposedCode") ?? "").toUpperCase();
    const shares = num(val(b, "transactionShares"));
    const price = num(val(b, "transactionPricePerShare"));
    const action: InsiderAction = CODE_MAP[code] ?? (acquired === "A" ? "DİĞER" : "DİĞER");
    out.push({
      ticker, filedAt, periodOfReport, owner, title, code, action,
      shares, price,
      value: shares != null && price != null ? shares * price : null,
      sharesAfter: num(val(b, "sharesOwnedFollowingTransaction")),
      planned, url,
    });
  }
  return out;
}

type Submissions = {
  filings?: { recent?: { form?: string[]; filingDate?: string[]; accessionNumber?: string[]; primaryDocument?: string[] } };
};

/** Recent Form 4 transactions for one ticker. `limit` filings, newest first. */
export async function insiderTrades(ticker: string, limit = 12): Promise<InsiderTrade[]> {
  const cik = await cikFor(ticker);
  if (!cik) return [];
  const cacheKey = `sec4v2:${ticker.toUpperCase()}`;   // v2: rows gained `code`
  try {
    const row = await db.setting.findUnique({ where: { key: cacheKey } });
    if (row?.value) {
      const c = JSON.parse(row.value) as { at: number; data: InsiderTrade[] };
      if (Date.now() - c.at < 6 * 3_600_000) return c.data;
    }
  } catch { /* fall through */ }

  const subs = await secJson<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const rec = subs?.filings?.recent;
  if (!rec?.form) return [];

  const picks: { acc: string; doc: string; date: string }[] = [];
  for (let i = 0; i < rec.form.length && picks.length < limit; i++) {
    if (rec.form[i] !== "4") continue;
    picks.push({ acc: (rec.accessionNumber?.[i] ?? "").replace(/-/g, ""), doc: rec.primaryDocument?.[i] ?? "", date: rec.filingDate?.[i] ?? "" });
  }

  const trades: InsiderTrade[] = [];
  for (const p of picks) {
    if (!p.acc) continue;
    const cikNum = String(Number(cik));
    // primaryDocument points at the human-readable rendering (xslF345X06/form4.xml);
    // stripping that prefix gives the machine-readable XML in the same folder.
    const file = p.doc.includes("/") ? p.doc.split("/").pop() : p.doc;
    const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${p.acc}/${file}`;
    const xml = await secText(url);
    if (!xml || !xml.includes("<ownershipDocument")) continue;
    trades.push(...parseForm4(xml, ticker.toUpperCase(), p.date, url));
  }

  try {
    const value = JSON.stringify({ at: Date.now(), data: trades });
    await db.setting.upsert({ where: { key: cacheKey }, create: { key: cacheKey, value }, update: { value } });
  } catch { /* best effort */ }
  return trades;
}

// ---- XBRL company facts: free fundamentals --------------------------------

export type SecFundamentals = {
  ticker: string;
  cik: string;
  revenue: number | null;
  netIncome: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  netMargin: number | null;      // %
  debtToEquity: number | null;
  roe: number | null;            // %
  asOf: string | null;           // end date of the period used
  fiscalPeriod: string | null;
};

type ConceptResp = { units?: Record<string, Array<{ end: string; val: number; form: string; fy?: number; fp?: string }>> };

/** Latest annual (10-K) value for a us-gaap concept.
 *
 *  Companies do not all use the same tag, AND they change tags over time - a company that
 *  reported under `Revenues` until 2018 and `RevenueFromContractWithCustomer...` after it
 *  still answers on the old tag with old data. Taking the first tag that returns anything
 *  therefore surfaced a FY2018 figure for a company filing to this day. So every candidate
 *  tag is queried and the most RECENT filing across all of them wins. */
async function latestAnnual(cik: string, tags: string[]): Promise<{ val: number; end: string; fp: string } | null> {
  let best: { val: number; end: string; fp: string } | null = null;
  for (const t of tags) {
    const j = await secJson<ConceptResp>(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${t}.json`);
    const usd = j?.units?.USD;
    if (!usd?.length) continue;
    const annual = usd.filter((x) => x.form === "10-K").sort((a, b) => a.end.localeCompare(b.end));
    const pick = annual.length ? annual[annual.length - 1] : null;
    if (pick && (!best || pick.end > best.end)) best = { val: pick.val, end: pick.end, fp: `FY${pick.fy ?? ""}` };
  }
  return best;
}

/** Anything older than this is not a current picture of the business, and showing it
 *  next to a live price would be worse than showing nothing. */
const MAX_FUNDAMENTALS_AGE_DAYS = 800;   // ~2 annual reports

/** Fundamentals straight from the filings. Slower than FMP (several requests) but free,
 *  unlimited, and authoritative - used as the fallback when FMP has no quota left. */
export async function secFundamentals(ticker: string): Promise<SecFundamentals | null> {
  const cik = await cikFor(ticker);
  if (!cik) return null;
  const cacheKey = `secfunv2:${ticker.toUpperCase()}`;  // v2: tag-recency fix
  try {
    const row = await db.setting.findUnique({ where: { key: cacheKey } });
    if (row?.value) {
      const c = JSON.parse(row.value) as { at: number; data: SecFundamentals };
      if (Date.now() - c.at < 7 * 86_400_000) return c.data;
    }
  } catch { /* fall through */ }

  const [rev, ni, assets, liab, eq] = await Promise.all([
    latestAnnual(cik, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]),
    latestAnnual(cik, ["NetIncomeLoss", "ProfitLoss"]),
    latestAnnual(cik, ["Assets"]),
    latestAnnual(cik, ["Liabilities"]),
    latestAnnual(cik, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]),
  ]);
  if (!rev && !ni && !assets) return null;

  // Reject a stale set outright rather than dressing an old filing as current. A company
  // that stopped filing (or only answers on a retired tag) is better shown as "no data".
  const newest = [rev?.end, ni?.end, assets?.end].filter(Boolean).sort().pop() as string | undefined;
  if (newest && Date.now() - Date.parse(newest + "T00:00:00Z") > MAX_FUNDAMENTALS_AGE_DAYS * 86_400_000) return null;

  const out: SecFundamentals = {
    ticker: ticker.toUpperCase(), cik,
    revenue: rev?.val ?? null,
    netIncome: ni?.val ?? null,
    assets: assets?.val ?? null,
    liabilities: liab?.val ?? null,
    equity: eq?.val ?? null,
    netMargin: rev?.val && ni?.val != null && rev.val !== 0 ? (ni.val / rev.val) * 100 : null,
    debtToEquity: liab?.val != null && eq?.val ? liab.val / eq.val : null,
    roe: ni?.val != null && eq?.val ? (ni.val / eq.val) * 100 : null,
    asOf: rev?.end ?? ni?.end ?? assets?.end ?? null,
    fiscalPeriod: rev?.fp ?? ni?.fp ?? null,
  };

  try {
    const value = JSON.stringify({ at: Date.now(), data: out });
    await db.setting.upsert({ where: { key: cacheKey }, create: { key: cacheKey, value }, update: { value } });
  } catch { /* best effort */ }
  return out;
}

export type InsiderSummary = {
  ticker: string;
  trades: InsiderTrade[];
  buys: number; sells: number;
  buyValue: number; sellValue: number;
  netValue: number;
  buyers: string[];          // distinct insiders who BOUGHT on the open market
  sellers: string[];
  /** Several different insiders buying in the same window is the one insider pattern with
   *  a real research pedigree - a single buy is noise, a cluster is a statement. */
  clusterBuy: boolean;
  plannedSellShare: number | null;  // % of sale value under a pre-arranged 10b5-1 plan
  verdict: string;
};

/** Aggregate one ticker's Form 4 flow into something a reader can act on. */
export async function insiderSummary(ticker: string, limit = 12): Promise<InsiderSummary> {
  const trades = await insiderTrades(ticker, limit);
  const market = trades.filter((t) => isMarketSignal(t.code));
  const buysArr = market.filter((t) => t.action === "ALIŞ");
  const sellsArr = market.filter((t) => t.action === "SATIŞ");
  const sum = (a: InsiderTrade[]) => a.reduce((x, t) => x + (t.value ?? 0), 0);
  const buyValue = sum(buysArr), sellValue = sum(sellsArr);
  const buyers = [...new Set(buysArr.map((t) => t.owner))];
  const sellers = [...new Set(sellsArr.map((t) => t.owner))];
  const plannedSell = sum(sellsArr.filter((t) => t.planned));

  const clusterBuy = buyers.length >= 2;
  let verdict: string;
  if (!market.length) {
    verdict = trades.length
      ? "Son bildirimlerde açık piyasa alım/satımı yok - yalnızca hisse hibesi, opsiyon kullanımı veya vergi kesintisi var. Bunlar yönetimin görüşü hakkında bilgi taşımaz."
      : "Bu sembol için yakın tarihli Form 4 bildirimi bulunamadı.";
  } else if (clusterBuy) {
    verdict = `${buyers.length} farklı içeriden kişi açık piyasadan alım yaptı (küme alımı) - tek bir alımdan çok daha anlamlı bir işaret.`;
  } else if (buyValue > sellValue) {
    verdict = "Açık piyasa işlemlerinde alım satıştan ağır basıyor.";
  } else if (sellValue > 0 && plannedSell / sellValue > 0.7) {
    verdict = "Satışların büyük bölümü önceden planlanmış 10b5-1 programı kapsamında - takvimli satışlar görüş beyanı sayılmaz.";
  } else {
    verdict = "Açık piyasa işlemlerinde satış ağır basıyor.";
  }

  return {
    ticker: ticker.toUpperCase(), trades,
    buys: buysArr.length, sells: sellsArr.length,
    buyValue, sellValue, netValue: buyValue - sellValue,
    buyers, sellers, clusterBuy,
    plannedSellShare: sellValue > 0 ? (plannedSell / sellValue) * 100 : null,
    verdict,
  };
}
