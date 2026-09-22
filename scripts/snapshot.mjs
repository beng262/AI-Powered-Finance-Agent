// Runs server-side (locally or in CI), writes the JSON the Pages dashboard renders.
// Exists because most of these sources send no CORS header, so a browser cannot
// call them directly. See docs/index.html.
import { writeFileSync, mkdirSync } from "node:fs";
import { getDovizSnapshot } from "../dist/sources/doviz.js";
import { getTcmbSnapshot }  from "../dist/sources/tcmb.js";
import { getBistSnapshot }  from "../dist/sources/bist.js";
import { vixRegime }        from "../dist/sources/cboe.js";
import { secFundamentals }  from "../dist/sources/sec.js";

const safe = async (name, fn) => {
  try { return { ok: true, data: await fn() }; }
  catch (e) { console.error(`  ${name}: ${e.message}`); return { ok: false, error: String(e.message ?? e) }; }
};

const BIST = ["THYAO", "ASELS", "GARAN", "KCHOL", "EREGL", "SISE"];

const snapshot = {
  generatedAt: new Date().toISOString(),
  doviz: await safe("doviz", () => getDovizSnapshot()),
  tcmb:  await safe("tcmb",  () => getTcmbSnapshot()),
  bist:  await safe("bist",  () => getBistSnapshot(BIST)),
  vix:   await safe("cboe",  () => vixRegime()),
  aapl:  await safe("sec",   () => secFundamentals("AAPL")),
};

mkdirSync("docs/data", { recursive: true });
writeFileSync("docs/data/snapshot.json", JSON.stringify(snapshot, null, 2));
const ok = Object.entries(snapshot).filter(([k, v]) => v && v.ok).length;
console.log(`wrote docs/data/snapshot.json  (${ok} sources ok)`);
