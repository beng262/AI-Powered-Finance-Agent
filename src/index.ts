/**
 * AI Powered Finance Agent
 *
 * An intent-routing finance agent over a Turkish and US market data layer.
 * Most sources need no API key and no database: clone, install, run.
 */

// ---- agent core -------------------------------------------------------------
export * from "./agents/types.js";
export { route } from "./agents/router.js";
export * as guard from "./agents/guard.js";
export * as metrics from "./agents/metrics.js";

// ---- model provider (optional) ----------------------------------------------
export { setLLMProvider, llmConfigured } from "./ai.js";
export type { LLMProvider, ChatRequest } from "./ai.js";

// ---- cache backend (optional) -----------------------------------------------
export { setCacheBackend } from "./db.js";
export type { CacheBackend } from "./db.js";

// ---- optional third-party keys ----------------------------------------------
export { apiKeyStatus } from "./apikeys.js";
export type { ApiProvider } from "./apikeys.js";

// ---- data sources ------------------------------------------------------------
export * as bist from "./sources/bist.js";
export * as doviz from "./sources/doviz.js";
export * as tcmb from "./sources/tcmb.js";
export * as tefas from "./sources/tefas.js";
export * as tuik from "./sources/tuik.js";
export * as sec from "./sources/sec.js";
export * as finra from "./sources/finra.js";
export * as cboe from "./sources/cboe.js";
export * as registry from "./sources/registry.js";
export * as yahooOptions from "./sources/yahooOptions.js";
