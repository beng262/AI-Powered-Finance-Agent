// TCMB connectors.
//
// 1) Daily FX rates  – https://www.tcmb.gov.tr/kurlar/today.xml  (public, no key,
//    stable for 20+ years). This is the reliable source for doviz kurlari.
// 2) EVDS web service – rates / inflation / reserves. EVDS is migrating from the
//    evds2 host to evds3; the key-based REST path is in flux, so this connector is
//    best-effort: it reads from TCMB_EVDS_BASE (overridable) and degrades to null
//    (-> "dogrulanamadi" in the report) when the endpoint is unreachable.

const EVDS_KEY = process.env.TCMB_EVDS_KEY || "";
// Default to the historically documented base; override via env when TCMB
// publishes the evds3 web-service path (e.g. https://evds3.tcmb.gov.tr/igmevdsms-dis/service/evds).
const EVDS_BASE = process.env.TCMB_EVDS_BASE || "https://evds2.tcmb.gov.tr/service/evds";

export type FxRate = { code: string; name: string; buying: number | null; selling: number | null };
export type TcmbSnapshot = {
  asOf: string | null;
  fx: FxRate[];
  evds: { id: string; label: string; value: number | null; asOf?: string }[];
  configured: { evds: boolean };
  liveFx: boolean;
};

const FX_CODES = ["USD", "EUR", "GBP", "CHF", "JPY"];

function pickTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}
const num = (s: string | null) => (s && Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);

// Parse TCMB today.xml without an XML dependency (the format is flat & stable).
async function fetchFx(): Promise<{ asOf: string | null; fx: FxRate[] }> {
  try {
    const r = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { cache: "no-store" });
    if (!r.ok) return { asOf: null, fx: [] };
    const xml = await r.text();
    const asOf = xml.match(/Tarih="([^"]+)"/)?.[1] ?? null;
    const fx: FxRate[] = [];
    for (const code of FX_CODES) {
      const block = xml.match(new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?</Currency>`))?.[0];
      if (!block) { fx.push({ code, name: code, buying: null, selling: null }); continue; }
      fx.push({
        code,
        name: pickTag(block, "Isim") || code,
        buying: num(pickTag(block, "ForexBuying")),
        selling: num(pickTag(block, "ForexSelling")),
      });
    }
    return { asOf, fx };
  } catch {
    return { asOf: null, fx: [] };
  }
}

// EVDS series codes (DD-MM-YYYY dates, key in `key` header since 2024-04-05).
const EVDS_SERIES: { id: string; label: string }[] = [
  { id: "TP.APIFON4", label: "Agirlikli Ort. Fonlama Maliyeti" }, // policy/funding rate proxy
  { id: "TP.AB.A01", label: "Brut Doviz Rezervleri (mn USD)" },
  { id: "TP.FG.J0", label: "TUFE Endeksi (TUIK/EVDS)" },
];

async function fetchEvds(): Promise<TcmbSnapshot["evds"]> {
  if (!EVDS_KEY) return EVDS_SERIES.map((s) => ({ ...s, value: null }));
  const end = new Date();
  const start = new Date(end.getTime() - 120 * 86400_000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  const series = EVDS_SERIES.map((s) => s.id).join("-");
  const url = `${EVDS_BASE.replace(/\/$/, "")}/?series=${series}&startDate=${fmt(start)}&endDate=${fmt(end)}&type=json`;
  try {
    const r = await fetch(url, { cache: "no-store", redirect: "manual", headers: { key: EVDS_KEY, "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return EVDS_SERIES.map((s) => ({ ...s, value: null }));
    const j = (await r.json()) as { items?: Record<string, string>[] };
    const items = j.items || [];
    return EVDS_SERIES.map((s) => {
      const col = s.id.replace(/[.\-]/g, "_");
      // walk from newest item backwards to the first non-empty value
      let value: number | null = null, asOf: string | undefined;
      for (let i = items.length - 1; i >= 0; i--) {
        const raw = items[i][col];
        if (raw != null && raw !== "" && Number.isFinite(parseFloat(raw))) { value = parseFloat(raw); asOf = items[i]["Tarih"]; break; }
      }
      return { ...s, value, asOf };
    });
  } catch {
    return EVDS_SERIES.map((s) => ({ ...s, value: null }));
  }
}

export async function getTcmbSnapshot(): Promise<TcmbSnapshot> {
  const [{ asOf, fx }, evds] = await Promise.all([fetchFx(), fetchEvds()]);
  return { asOf, fx, evds, configured: { evds: Boolean(EVDS_KEY) }, liveFx: fx.some((f) => f.buying != null) };
}
