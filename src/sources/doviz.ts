// Doviz.com – FX, precious metals and commodities. No official API; the homepage
// embeds current values in data-socket-* spans (attr="s" = price). Best-effort scrape
// with Turkish number parsing; degrades to null when the markup changes.

export type DovizRow = { key: string; label: string; value: number | null };

// Turkish number format: "6.349,57" -> 6349.57
function trNum(s: string): number | null {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const WANTED: { key: string; label: string }[] = [
  { key: "gram-altin", label: "Gram Altin (TL)" },
  { key: "gumus", label: "Gumus (TL)" },
  { key: "USD", label: "USD/TRY" },
  { key: "EUR", label: "EUR/TRY" },
  { key: "XU100", label: "BIST 100" },
  { key: "BRENT", label: "Brent" },
];

export async function getDovizSnapshot(): Promise<{ rows: DovizRow[]; live: boolean }> {
  try {
    const r = await fetch("https://www.doviz.com/", { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if (!r.ok) return { rows: WANTED.map((w) => ({ ...w, value: null })), live: false };
    const html = await r.text();
    const rows = WANTED.map((w) => {
      const re = new RegExp(`data-socket-key="${w.key}"\\s+data-socket-attr="s"[^>]*>\\s*([\\d.,]+)`);
      const m = html.match(re);
      return { key: w.key, label: w.label, value: m ? trNum(m[1]) : null };
    });
    return { rows, live: rows.some((x) => x.value != null) };
  } catch {
    return { rows: WANTED.map((w) => ({ ...w, value: null })), live: false };
  }
}
