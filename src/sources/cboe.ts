// Cboe - FREE, no key. Two things nobody else gives away:
//
// 1. The official daily PUT/CALL RATIOS for the whole US options market (total, equity,
//    index, ETP). This is the market-wide positioning gauge that paid services repackage:
//    the equity ratio is retail/single-stock hedging, the index ratio is institutional
//    portfolio hedging, and they routinely disagree - which is the interesting part.
// 2. The VIX term structure (VIX9D / VIX / VIX3M). The RELATIONSHIP between them says
//    more than the level: 9-day above 3-month means the market expects trouble sooner
//    rather than later, which is the classic stress signal.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

export type PutCallRatios = {
  date: string;
  total: number | null;
  equity: number | null;
  index: number | null;
  etp: number | null;
};

type DailyStats = { ratios?: { name: string; value: string }[] };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Latest published daily options statistics, walking back over weekends/holidays. */
export async function putCallRatios(maxBack = 6): Promise<PutCallRatios | null> {
  for (let i = 0; i <= maxBack; i++) {
    const date = ymd(new Date(Date.now() - i * 86_400_000));
    try {
      const r = await fetch(`https://cdn.cboe.com/data/us/options/market_statistics/daily/${date}_daily_options`, {
        headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000), cache: "no-store",
      });
      if (!r.ok) continue;
      const j = (await r.json()) as DailyStats;
      const find = (needle: string) => {
        const hit = j.ratios?.find((x) => x.name.toUpperCase().includes(needle));
        const v = hit ? Number(hit.value) : NaN;
        return Number.isFinite(v) ? v : null;
      };
      const out = { date, total: find("TOTAL"), equity: find("EQUITY"), index: find("INDEX"), etp: find("EXCHANGE TRADED") };
      if (out.total != null || out.equity != null) return out;
    } catch { /* try the previous day */ }
  }
  return null;
}

export type VixPoint = { date: string; close: number };

/** Daily history for a Cboe index (VIX, VIX9D, VIX3M, ...). CSV: DATE,OPEN,HIGH,LOW,CLOSE
 *  with US-style dates, so the parse is explicit rather than trusting Date.parse. */
export async function cboeHistory(symbol: "VIX" | "VIX9D" | "VIX3M", limit = 400): Promise<VixPoint[]> {
  try {
    const r = await fetch(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    const out: VixPoint[] = [];
    const lines = text.trim().split("\n");
    for (const line of lines.slice(1)) {
      const p = line.split(",");
      if (p.length < 5) continue;
      const [mm, dd, yyyy] = p[0].split("/");
      const close = Number(p[4]);
      if (!yyyy || !Number.isFinite(close)) continue;
      out.push({ date: `${yyyy}-${mm}-${dd}`, close });
    }
    return out.slice(-limit);
  } catch {
    return [];
  }
}

export type VixRegime = {
  vix: number | null;
  vix9d: number | null;
  vix3m: number | null;
  /** VIX / VIX3M. Below 1 = contango (calm, the normal state); above 1 = backwardation,
   *  meaning near-term fear exceeds long-term - historically where drawdowns live. */
  termRatio: number | null;
  structure: "contango" | "düz" | "backwardation" | null;
  percentile1y: number | null;   // where today's VIX sits in its own last year
  label: string;
  note: string;
  asOf: string | null;
};

function pctile(series: number[], v: number): number | null {
  if (!series.length) return null;
  const below = series.filter((x) => x <= v).length;
  return (below / series.length) * 100;
}

/** The whole volatility picture in one deterministic read. */
export async function vixRegime(): Promise<VixRegime> {
  const [vixH, v9H, v3H] = await Promise.all([cboeHistory("VIX"), cboeHistory("VIX9D"), cboeHistory("VIX3M")]);
  const last = (a: VixPoint[]) => (a.length ? a[a.length - 1] : null);
  const vix = last(vixH), v9 = last(v9H), v3 = last(v3H);

  const termRatio = vix && v3 && v3.close ? vix.close / v3.close : null;
  const structure: VixRegime["structure"] =
    termRatio == null ? null : termRatio < 0.95 ? "contango" : termRatio <= 1.02 ? "düz" : "backwardation";

  const oneYear = vixH.slice(-252).map((p) => p.close);
  const percentile1y = vix ? pctile(oneYear, vix.close) : null;

  let label = "veri yok", note = "";
  if (vix) {
    const v = vix.close;
    label = v < 14 ? "sakin" : v < 20 ? "normal" : v < 28 ? "gergin" : v < 40 ? "korkulu" : "panik";
    note =
      structure === "backwardation"
        ? "Yakın vadeli oynaklık uzun vadeliyi aşmış (backwardation). Piyasa sorunu yakın görüyor - tarihsel olarak düşüşlerin yaşandığı rejim."
        : structure === "düz"
          ? "Vade yapısı düzleşmiş. Sakin rejimden gergine geçiş bölgesi; tek başına sinyal değil, dikkat işareti."
          : "Vade yapısı normal (contango): yakın vade uzun vadeden ucuz. Piyasanın sakin kabul ettiği durum.";
  }

  return {
    vix: vix?.close ?? null,
    vix9d: v9?.close ?? null,
    vix3m: v3?.close ?? null,
    termRatio, structure, percentile1y, label, note,
    asOf: vix?.date ?? null,
  };
}
