/* ------------------------------------------------------------------------------------
   On-device model for the demo page.

   A static Pages site cannot hold an API key, so the model runs in the visitor's own
   browser: Qwen2.5-1.5B-Instruct through WebLLM on WebGPU. Nothing is sent anywhere,
   there is no server and no account. The first load downloads ~850 MB (then it is cached
   by the browser), so it only starts when the visitor asks for it.

   What the model is trusted with, and what it is not - the same split the library uses:

     - It CLASSIFIES the question into an intent. The reply is constrained to a JSON
       schema whose `intent` is an enum, so it cannot answer with a label that does not
       exist. It never picks a ticker: tickers are matched deterministically in
       agent-tools.js, because a small model will invent plausible ones.
     - It does not word the answer or calculate anything. That was tried and removed:
       asked "how much cash do I have", the model replied with the total-portfolio figure
       as if it were cash. The number was in the facts, so a check on numbers passed it,
       but the claim was wrong. A true number attached to the wrong claim cannot be caught
       by checking numbers, so the answer is composed by code from the tool's figures.

   Measured while building this (20 questions, English and Turkish, the same prompt):
   keyword rules 9/20, Qwen2.5-0.5B collapsed onto one label (5/15 on an earlier set),
   Qwen2.5-1.5B 19/20, 0.4-1 s per question once warm. The warm-up (GPU kernel compile) is
   25-40 s per page visit; loadModel() does it behind a visible phase so it never lands
   inside someone's first question.
   ------------------------------------------------------------------------------------ */

// Pinned: an unpinned CDN import means the page can change under us.
const WEBLLM = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm";
// The q4f32_1 build, not q4f16_1. Both score 19/20 on our questions, but f32 warms up in
// ~25-28 s against 32-40 s for f16 (two fresh-page samples each), and it runs on GPUs
// without the `shader-f16` extension, which the f16 build requires.
export const MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
export const MODEL_LABEL = "Qwen2.5-1.5B";
export const MODEL_MB = 850;
export const WARMUP_S = 30;

export const INTENTS = ["KPI_LOOKUP", "RISK_ANALYSIS", "TREND_ANALYSIS", "CORRELATION", "FUNDAMENTALS", "WEB_SEARCH", "OUT_OF_SCOPE"];

const CLASSIFY_SYSTEM = `You label a finance question with ONE intent.
KPI_LOOKUP: how much is the portfolio worth, total value, cash, balance, how much did I make today.
RISK_ANALYSIS: risk, volatility, VaR, drawdown, how risky, concentration.
TREND_ANALYSIS: price trend, RSI, moving average, overbought/oversold, technical view of a stock.
CORRELATION: how two assets move together, diversification.
FUNDAMENTALS: P/E, earnings, revenue, valuation, balance sheet of a company.
WEB_SEARCH: news, what happened, what someone said, general market questions.
OUT_OF_SCOPE: anything not about finance or markets.
Examples:
"what is my portfolio worth" -> KPI_LOOKUP
"how much cash do I hold" -> KPI_LOOKUP
"bugün ne kadar kazandım" -> KPI_LOOKUP
"how volatile is my book" -> RISK_ANALYSIS
"what could I lose in a bad day" -> RISK_ANALYSIS
"AAPL trend last month" -> TREND_ANALYSIS
"is TSLA overbought" -> TREND_ANALYSIS
"THYAO trendi nasıl" -> TREND_ANALYSIS
"do gold and BIST move together" -> CORRELATION
"MSFT P/E ratio" -> FUNDAMENTALS
"what did the Fed say today" -> WEB_SEARCH
"give me a pasta recipe" -> OUT_OF_SCOPE
"write a poem" -> OUT_OF_SCOPE
Reply with JSON only.`;

const SCHEMA = JSON.stringify({
  type: "object",
  properties: { intent: { type: "string", enum: INTENTS } },
  required: ["intent"],
});

let engine = null;
let loading = null;
let phase = "idle"; // idle | download | compile | ready

export async function webgpuAvailable() {
  try {
    if (!navigator.gpu) return false;
    return Boolean(await navigator.gpu.requestAdapter());
  } catch { return false; }
}

/** True only once the model can answer instantly: downloaded AND compiled. */
export const isLoaded = () => phase === "ready";
export const isBusy = () => phase === "download" || phase === "compile";

/** Are the weights already in this browser's cache (so no 850 MB download)? */
export async function isCached() {
  try {
    const webllm = await import(WEBLLM);
    return await webllm.hasModelInCache(MODEL);
  } catch { return false; }
}

/**
 * Download (first time), compile, and warm the model. Resolves when it can answer.
 *
 * Where the time goes, measured on an integrated GPU: the download is a one-off (~45 s),
 * loading cached weights is ~5 s, and then the FIRST inference of any kind takes 25-40 s
 * while WebGPU compiles the model's kernels - after which a question takes 0.4-1 s. The
 * JSON-schema grammar adds under a second, so it is not the cost. That compile is paid on
 * every page visit (nothing persists it), so it is done here, behind a visible "compile"
 * phase, rather than inside the visitor's first question.
 *
 * @param {(e: {phase: "download"|"compile", progress?: number, text?: string}) => void} [onUpdate]
 */
export function loadModel(onUpdate) {
  if (phase === "ready") return Promise.resolve(engine);
  if (!loading) {
    loading = (async () => {
      phase = "download";
      const webllm = await import(WEBLLM);
      engine = await webllm.CreateMLCEngine(MODEL, {
        initProgressCallback: (r) => onUpdate?.({ phase: "download", progress: r.progress, text: r.text }),
      });
      phase = "compile";
      onUpdate?.({ phase: "compile" });
      // A real constrained classification, so the exact kernels and the grammar path are the
      // ones that get compiled - not a different code path that leaves the cost for later.
      await engine.chat.completions.create({
        messages: [{ role: "system", content: CLASSIFY_SYSTEM }, { role: "user", content: "what is my portfolio worth" }],
        temperature: 0, max_tokens: 30,
        response_format: { type: "json_object", schema: SCHEMA },
      });
      phase = "ready";
      return engine;
    })().catch((e) => { loading = null; engine = null; phase = "idle"; throw e; });
  }
  return loading;
}

/** One of INTENTS, or null if the model produced nothing usable. */
export async function classify(question) {
  if (phase !== "ready") return null;
  try {
    const r = await engine.chat.completions.create({
      messages: [{ role: "system", content: CLASSIFY_SYSTEM }, { role: "user", content: question }],
      temperature: 0, max_tokens: 30,
      response_format: { type: "json_object", schema: SCHEMA },
    });
    const intent = JSON.parse(r.choices[0].message.content).intent;
    return INTENTS.includes(intent) ? intent : null;
  } catch { return null; }
}
