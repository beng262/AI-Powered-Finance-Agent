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
   Qwen2.5-1.5B 19/20, about 2-4 s per question after a one-time ~40 s GPU warm-up.
   ------------------------------------------------------------------------------------ */

// Pinned: an unpinned CDN import means the page can change under us.
const WEBLLM = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm";
export const MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const MODEL_LABEL = "Qwen2.5-1.5B";
export const MODEL_MB = 850;

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

export async function webgpuAvailable() {
  try {
    if (!navigator.gpu) return false;
    return Boolean(await navigator.gpu.requestAdapter());
  } catch { return false; }
}

export const isLoaded = () => engine !== null;

/** Download (first time) and start the model. Resolves once it can answer. */
export function loadModel(onProgress) {
  if (engine) return Promise.resolve(engine);
  if (!loading) {
    loading = (async () => {
      const webllm = await import(WEBLLM);
      engine = await webllm.CreateMLCEngine(MODEL, {
        initProgressCallback: (r) => onProgress?.(r),
      });
      return engine;
    })().catch((e) => { loading = null; engine = null; throw e; });
  }
  return loading;
}

/** One of INTENTS, or null if the model produced nothing usable. */
export async function classify(question) {
  if (!engine) return null;
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
