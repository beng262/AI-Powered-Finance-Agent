// TEFAS (Turkiye Elektronik Fon Alim Satim Platformu) fund data.
// TEFAS exposes no official API; the community endpoint moves/disables periodically
// (currently returns ERR-006). Wired best-effort with an overridable endpoint so it
// can be re-pointed without a code change; degrades to null when unavailable.

const TEFAS_API = process.env.TEFAS_API || "https://www.tefas.gov.tr/api/DB/BindHistoryInfo";

export type FundRow = { code: string; title: string | null; price: number | null; date: string | null };

const DDMMYYYY = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

// Fetch latest price for each fund code (e.g. ["AAK","TTE"]). Empty input -> [].
export async function getFunds(codes: string[]): Promise<{ funds: FundRow[]; live: boolean }> {
  const wanted = [...new Set(codes.map((c) => c.toUpperCase()))];
  if (wanted.length === 0) return { funds: [], live: false };
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 86400_000);
  const out: FundRow[] = [];
  let live = false;
  for (const code of wanted) {
    try {
      const r = await fetch(TEFAS_API, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0",
          Referer: "https://www.tefas.gov.tr/TarihselVeriler.aspx",
        },
        body: `fontip=YAT&fonkod=${code}&bastarih=${DDMMYYYY(start)}&bittarih=${DDMMYYYY(end)}`,
      });
      if (!r.ok) { out.push({ code, title: null, price: null, date: null }); continue; }
      const j = (await r.json()) as { data?: Array<{ FONUNVAN?: string; FIYAT?: number; TARIH?: string | number }> };
      const rows = j.data || [];
      const last = rows[rows.length - 1];
      if (last && typeof last.FIYAT === "number") {
        live = true;
        const ts = typeof last.TARIH === "number" ? new Date(last.TARIH) : null;
        out.push({ code, title: last.FONUNVAN ?? null, price: last.FIYAT, date: ts ? ts.toISOString().slice(0, 10) : String(last.TARIH ?? "") });
      } else {
        out.push({ code, title: null, price: null, date: null });
      }
    } catch {
      out.push({ code, title: null, price: null, date: null });
    }
  }
  return { funds: out, live };
}
