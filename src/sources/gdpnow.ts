// Atlanta Fed GDPNow nowcast.
// Preferred: FRED series GDPNOW (needs FRED_API_KEY).
// Fallback: scrape the public Atlanta Fed GDPNow page for the latest estimate.

export type GdpNowSnapshot = {
  asOf: string | null;
  value: number | null;
  live: boolean;
  source: "fred_gdpnow" | "atlanta_fed_scrape" | "atlanta_fed_gdpnow";
};

async function fromFred(apiKey: string): Promise<GdpNowSnapshot | null> {
  if (!apiKey) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDPNOW&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=3`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { observations?: { date: string; value: string }[] };
    for (const o of j.observations || []) {
      const value = parseFloat(o.value);
      if (Number.isFinite(value)) {
        return { asOf: o.date, value, live: true, source: "fred_gdpnow" };
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Best-effort scrape of https://www.atlantafed.org/research-and-data/data/gdpnow */
async function fromAtlantaPage(): Promise<GdpNowSnapshot | null> {
  try {
    const r = await fetch("https://www.atlantafed.org/research-and-data/data/gdpnow", {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ai-powered-finance-agent/0.1)",
        Accept: "text/html",
      },
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Look for patterns like "1.7 percent" / "1.68%" near GDPNow estimate language.
    const patterns = [
      /Latest GDPNow Estimate[^%]{0,200}?(-?\d+(?:\.\d+)?)\s*%/i,
      /GDPNow[^%]{0,120}?(-?\d+(?:\.\d+)?)\s*percent/i,
      /nowcast[^%]{0,80}?(-?\d+(?:\.\d+)?)\s*%/i,
      /"latest(?:Estimate|Value|Forecast)"\s*:\s*(-?\d+(?:\.\d+)?)/i,
      /data-gdpnow[^>]*>\s*(-?\d+(?:\.\d+)?)/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const value = parseFloat(m[1]);
        if (Number.isFinite(value) && Math.abs(value) < 30) {
          return {
            asOf: new Date().toISOString().slice(0, 10),
            value,
            live: true,
            source: "atlanta_fed_scrape",
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function getGdpNowSnapshot(fredApiKey = ""): Promise<GdpNowSnapshot> {
  const key = fredApiKey || process.env.FRED_API_KEY || "";
  const viaFred = await fromFred(key);
  if (viaFred) return viaFred;
  const scraped = await fromAtlantaPage();
  if (scraped) return scraped;
  return { asOf: null, value: null, live: false, source: "atlanta_fed_gdpnow" };
}
