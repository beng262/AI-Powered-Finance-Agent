// Turkish data-source layer. Assembles the live Tier-1 feeds (TCMB FX + EVDS,
// BIST via Yahoo, TEFAS funds, Doviz.com) into one snapshot, renders it as a
// prompt block for the report generator, and produces the "Kaynak damgasi"
// citation list covering every registered source.

import { getTcmbSnapshot } from "./tcmb";
import { getBistSnapshot } from "./bist";
import { getDovizSnapshot } from "./doviz";
import { getFunds } from "./tefas";
import { getTuikSnapshot } from "./tuik";
import { citationList } from "./registry";

export { SOURCES, SOURCE_BY_CODE } from "./registry";
export type { SourceDef } from "./registry";

export type TRSnapshot = {
  asOf: string;
  tcmb: Awaited<ReturnType<typeof getTcmbSnapshot>>;
  bist: Awaited<ReturnType<typeof getBistSnapshot>>;
  doviz: Awaited<ReturnType<typeof getDovizSnapshot>>;
  funds: Awaited<ReturnType<typeof getFunds>>;
  tuik: Awaited<ReturnType<typeof getTuikSnapshot>>;
  liveCodes: Set<string>;
};

export async function getTRSnapshot(opts?: { bistTickers?: string[]; fundCodes?: string[] }): Promise<TRSnapshot> {
  const [tcmb, bist, doviz, funds, tuik] = await Promise.all([
    getTcmbSnapshot(),
    getBistSnapshot(opts?.bistTickers ?? []),
    getDovizSnapshot(),
    getFunds(opts?.fundCodes ?? []),
    getTuikSnapshot(),
  ]);

  const liveCodes = new Set<string>();
  if (tcmb.liveFx || tcmb.evds.some((e) => e.value != null)) liveCodes.add("tcmb");
  if (bist.live) { liveCodes.add("bist"); liveCodes.add("yahoo"); }
  if (doviz.live) liveCodes.add("doviz");
  if (funds.live) liveCodes.add("tefas");
  if (tuik.live) liveCodes.add("tuik");

  return { asOf: new Date().toISOString(), tcmb, bist, doviz, funds, tuik, liveCodes };
}

const fmtN = (n: number | null | undefined, d = 2) => (n == null ? "dogrulanamadi" : n.toFixed(d));
const fmtPct = (n: number | null | undefined) => (n == null ? "dogrulanamadi" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%");

// Compact prompt block: only real values; missing -> "dogrulanamadi".
export function trSnapshotToPromptBlock(s: TRSnapshot): string {
  const lines: string[] = ["Turkiye piyasa/makro verisi (gercek):"];

  const fx = s.tcmb.fx.filter((f) => f.selling != null).map((f) => `${f.code} ${fmtN(f.selling, 4)}`).join(", ");
  lines.push(`TCMB doviz (satis, ${s.tcmb.asOf || "?"}): ${fx || "dogrulanamadi"}`);
  const evds = s.tcmb.evds.map((e) => `${e.label}: ${fmtN(e.value)}${e.asOf ? ` [${e.asOf}]` : ""}`).join("; ");
  lines.push(`TCMB EVDS: ${evds}`);

  const cpi = s.tuik.cpi.map((c) => `${c.label}: ${fmtPct(c.value)}${c.asOf ? ` [${c.asOf}]` : ""}`).join("; ");
  lines.push(`TUIK enflasyon (kaynak: ${s.tuik.source}): ${cpi || "dogrulanamadi"}`);

  const idx = s.bist.indices.map((i) => `${i.label} ${fmtN(i.price)} (${fmtPct(i.changePct)})`).join(", ");
  lines.push(`BIST endeksleri (Yahoo): ${idx || "dogrulanamadi"}`);
  if (s.bist.watchlist.length) {
    const wl = s.bist.watchlist.filter((w) => w.price != null).map((w) => `${w.label} ${fmtN(w.price)} (${fmtPct(w.changePct)})`).join(", ");
    if (wl) lines.push(`BIST hisseler: ${wl}`);
  }

  const dv = s.doviz.rows.filter((r) => r.value != null).map((r) => `${r.label} ${fmtN(r.value)}`).join(", ");
  lines.push(`Doviz.com (emtia/altin): ${dv || "dogrulanamadi"}`);

  if (s.funds.funds.length) {
    const fn = s.funds.funds.map((f) => `${f.code} ${fmtN(f.price, 6)}${f.date ? ` [${f.date}]` : ""}`).join(", ");
    lines.push(`TEFAS fonlar: ${fn}`);
  }

  return lines.join("\n");
}

// Full "Kaynak damgasi" reference list (markdown) for the report footer.
export function trCitationBlock(s: TRSnapshot): string {
  return citationList(s.liveCodes);
}
