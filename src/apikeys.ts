/**
 * Optional third-party API keys.
 *
 * These are always the caller's own keys, read from the environment. Every source
 * that uses one degrades gracefully when it is absent: OpenFIGI and EIA work
 * unauthenticated at lower rate limits, Finnhub and Alpha Vantage simply return
 * nothing rather than throwing.
 *
 * Nothing here is required. The keyless sources (BIST, Doviz, TCMB FX, SEC EDGAR,
 * FINRA, CBOE, Yahoo) cover most of the library and need no configuration at all.
 */

const ENV_VAR = {
  bloomberg: "OPENFIGI_API_KEY",
  finnhub: "FINNHUB_API_KEY",
  alphavantage: "ALPHAVANTAGE_API_KEY",
  eia: "EIA_API_KEY",
  fred: "FRED_API_KEY",
} as const;

export type ApiProvider = keyof typeof ENV_VAR;

/** Returns the key for a provider, or an empty string when unset. */
export async function getApiKey(p: ApiProvider): Promise<string> {
  return process.env[ENV_VAR[p]]?.trim() ?? "";
}

/** Which providers currently have a key, without revealing the values. */
export async function apiKeyStatus(): Promise<Record<ApiProvider, boolean>> {
  const out = {} as Record<ApiProvider, boolean>;
  for (const p of Object.keys(ENV_VAR) as ApiProvider[]) {
    out[p] = (await getApiKey(p)).length > 0;
  }
  return out;
}
