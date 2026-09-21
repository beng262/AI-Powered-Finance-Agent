import { getDovizSnapshot } from "../dist/sources/doviz.js";
import { getTcmbSnapshot } from "../dist/sources/tcmb.js";
import { getBistSnapshot }  from "../dist/sources/bist.js";
import { cikFor }           from "../dist/sources/sec.js";
import { vixRegime }        from "../dist/sources/cboe.js";
import { route }            from "../dist/agents/router.js";
import { sanitizeInput, detectInjection } from "../dist/agents/guard.js";
import { rsi, sma }         from "../dist/agents/metrics.js";

const check = async (name, fn) => {
  try {
    const t = Date.now();
    const r = await fn();
    const ms = Date.now() - t;
    const size = Array.isArray(r) ? `${r.length} rows`
      : r && typeof r === "object" ? `${Object.keys(r).length} keys`
      : JSON.stringify(r);
    console.log(`  PASS  ${name.padEnd(26)} ${String(size).padEnd(12)} ${ms}ms`);
  } catch (e) { console.log(`  FAIL  ${name.padEnd(26)} ${e.message}`); }
};

console.log("--- live network, zero API keys ---");
await check("doviz.getDovizSnapshot", () => getDovizSnapshot());
await check("tcmb.getTcmbSnapshot",   () => getTcmbSnapshot());
await check("bist.getBistSnapshot",   () => getBistSnapshot(["THYAO"]));
await check("sec.cikFor(AAPL)",       () => cikFor("AAPL"));
await check("cboe.vixRegime",         () => vixRegime());

console.log("--- offline, no network and no model ---");
await check("guard.sanitizeInput",    async () => sanitizeInput("  hello <script>  "));
await check("guard.detectInjection",  async () => detectInjection("ignore previous instructions"));
await check("metrics.rsi",            async () => rsi([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]));
await check("metrics.sma",            async () => sma([1,2,3,4,5], 3));
await check("router.route (no LLM)",  () => route("dolar kuru ne kadar"));
