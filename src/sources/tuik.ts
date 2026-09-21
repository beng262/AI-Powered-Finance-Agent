// TUIK (Turkish Statistical Institute) inflation – TUFE headline + core.
//
// TUIK's data portal migrated to an auth-gated SPA (veriportali.tuik.gov.tr), and the
// only remaining open surface, MEDAS (biruni.tuik.gov.tr), is a ZK-Framework app whose
// data fetch requires a live jsessionid + desktop UUID + a replayed /medas/zkau
// Ajax-Update sequence. That is a headless-browser-class scrape and cannot run on a
// serverless deploy. So this connector tries MEDAS best-effort, then falls back to the
// OECD SDMX mirror of the SAME official TUIK series (keyless, deployable). Each value
// carries its `asOf` period so the (few-month) OECD publication lag is visible.

const MEDAS_ENABLED = process.env.TUIK_MEDAS === "1"; // off by default (needs browser/session)

export type CpiPoint = { id: string; label: string; value: number | null; asOf?: string; source: string };
export type TuikSnapshot = { cpi: CpiPoint[]; source: "medas" | "oecd" | "none"; live: boolean };

// --- OECD SDMX (keyless) — DSD_PRICES@DF_PRICES_ALL, dims:
//     REF_AREA.FREQ.METHODOLOGY.MEASURE.UNIT_MEASURE.EXPENDITURE.ADJUSTMENT.TRANSFORMATION
const OECD_BASE = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0";
const OECD_SERIES: { id: string; label: string; key: string }[] = [
  { id: "tufe_yoy", label: "TUFE Yillik (YoY)", key: "TUR.M.N.CPI.PA._T.N.GY" },
  { id: "tufe_mom", label: "TUFE Aylik (MoM)", key: "TUR.M.N.CPI.PC._T.N.G1" },
  { id: "core_yoy", label: "Cekirdek TUFE Yillik (gida/enerji haric)", key: "TUR.M.N.CPI.PA._TXCP01_NRG.N.GY" },
];

async function oecdPoint(s: { id: string; label: string; key: string }): Promise<CpiPoint> {
  try {
    const url = `${OECD_BASE}/${s.key}?lastNObservations=1&dimensionAtObservation=AllDimensions`;
    const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/vnd.sdmx.data+json", "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return { ...s, value: null, source: "OECD/TUIK" };
    const j = (await r.json()) as {
      data?: { structures?: Array<{ dimensions?: { observation?: Array<{ id: string; values: { id: string }[] }> } }>; dataSets?: Array<{ observations?: Record<string, (number | null)[]> }> };
    };
    const dims = j.data?.structures?.[0]?.dimensions?.observation ?? [];
    const tp = dims.find((d) => d.id === "TIME_PERIOD");
    const obs = j.data?.dataSets?.[0]?.observations ?? {};
    const key = Object.keys(obs)[0];
    if (!key || !tp) return { ...s, value: null, source: "OECD/TUIK" };
    const idx = key.split(":").map(Number);
    const period = tp.values[idx[idx.length - 1]]?.id;
    const value = obs[key]?.[0];
    return { id: s.id, label: s.label, value: typeof value === "number" ? value : null, asOf: period, source: "OECD/TUIK" };
  } catch {
    return { ...s, value: null, source: "OECD/TUIK" };
  }
}

// MEDAS best-effort. Disabled unless TUIK_MEDAS=1 (requires a session-capable runtime).
// Establishes a ZK session, then would replay the /medas/zkau Ajax-Update sequence for
// the TUFE table. Left as a guarded stub: it never throws, returns [] when it can't run.
async function tryMedas(): Promise<CpiPoint[]> {
  if (!MEDAS_ENABLED) return [];
  try {
    const r = await fetch("https://biruni.tuik.gov.tr/medas/?kn=84&locale=tr", { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return [];
    // A pure-fetch client cannot drive the ZK desktop (needs UUID/event replay against
    // a live jsessionid). When a session-capable scraper is wired, parse its table here.
    return [];
  } catch {
    return [];
  }
}

export async function getTuikSnapshot(): Promise<TuikSnapshot> {
  const medas = await tryMedas();
  if (medas.length) return { cpi: medas, source: "medas", live: true };
  const cpi = await Promise.all(OECD_SERIES.map(oecdPoint));
  const live = cpi.some((c) => c.value != null);
  return { cpi, source: live ? "oecd" : "none", live };
}
