# AI Powered Finance Agent

An intent-routing finance agent over a Turkish and US market data layer.

Most of it needs **no API key, no database and no account**. Clone, install, run.

```bash
npm install && npm run build && npm run demo
```

```
--- live network, zero API keys ---
  PASS  doviz.getDovizSnapshot     2 keys        199ms
  PASS  tcmb.getTcmbSnapshot       5 keys         88ms
  PASS  bist.getBistSnapshot       3 keys        257ms
  PASS  sec.cikFor(AAPL)           "0000320193"  141ms
  PASS  cboe.vixRegime             9 keys        658ms
--- offline, no network and no model ---
  PASS  guard.sanitizeInput        ...
  PASS  router.route (no LLM)      ...
```

## Why

Most market-data libraries assume you are American and that you will pay for a key.
Turkish sources are poorly served: BIST quotes, TCMB exchange rates, TEFAS fund prices
and TUIK inflation each have their own shape, their own encoding quirks, and their own
habit of changing without notice. This library wraps them behind one typed interface,
alongside the US sources worth having, and keeps the whole thing runnable by someone who
has just cloned it.

## Data sources

| Source | Covers | Key |
|---|---|---|
| `bist` | Borsa Istanbul quotes | none |
| `doviz` | Live FX and gold | none |
| `tcmb` | Official CBRT rates | none for FX, free key for EVDS series |
| `tefas` | Turkish mutual fund prices | none |
| `tuik` | Turkish inflation and macro series | none |
| `sec` | EDGAR filings, insider trades, fundamentals | none |
| `finra` | Short interest | none |
| `cboe` | VIX term structure, put/call ratios | none |
| `registry` | Symbol resolution across the above | none |
| `yahooOptions` | Option chains, extended hours | none |
| `bloomberg` | OpenFIGI symbology | optional, raises rate limit |
| `finnhub`, `alphavantage`, `eia`, `fmp`, `gdpnow` | Quotes, energy, macro | own key |

Sources that take a key degrade quietly without one rather than throwing.

### The Yahoo session

`yahooAuth` handles the cookie-and-crumb pair Yahoo requires for option chains and
extended-hours quotes. The pair is cached and refreshed on expiry. This is the part that
took longest to get right and has the fewest good examples online.

## Agent core

```ts
import { route, guard, metrics } from "ai-powered-finance-agent";

guard.detectInjection("ignore previous instructions");  // { injected: true, pattern: ... }
guard.rateLimit("user-42", 20, 60_000);                 // { ok: true }
metrics.rsi(closes);                                     // 14-period RSI
await route("dolar kuru ne kadar");                      // { intent: "fx", ... }
```

- **`router`** classifies a query into an intent. With a model it uses one; without a
  model it falls back to keyword matching, so it always returns something.
- **`guard`** does input sanitisation, prompt-injection detection, output scrubbing and
  rate limiting.
- **`metrics`** is dependency-free technical analysis: SMA, EMA, RSI, momentum, returns.

## Bring your own model

The router is the only part that wants an LLM, and it is optional.

```ts
import { setLLMProvider } from "ai-powered-finance-agent";

setLLMProvider(async ({ system, user, maxTokens }) => {
  const res = await myClient.chat({ system, user, maxTokens });
  return res.text;
});
```

Any provider works. Nothing in the library is tied to one vendor.

## Bring your own cache

Sources cache with an in-memory store by default, which is why there is no database
requirement. Point it anywhere to share the cache across processes:

```ts
import { setCacheBackend } from "ai-powered-finance-agent";

setCacheBackend({
  async get(key) { return redis.get(key); },
  async set(key, value) { await redis.set(key, value); },
});
```

Caching is best-effort throughout. If the backend fails, the request goes to the network.

## Optional environment

Nothing is required. Every variable below is optional.

| Variable | Effect when set |
|---|---|
| `SEC_USER_AGENT` | Contact string sent to SEC EDGAR. Their fair-access policy asks for one, so set your own before heavy use. |
| `OPENFIGI_API_KEY` | Raises the OpenFIGI symbology rate limit |
| `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY` | Enables those quote sources |
| `EIA_API_KEY`, `FRED_API_KEY` | Enables US energy and macro series |
| `TCMB_EVDS_KEY` | Enables CBRT EVDS series. FX rates work without it. |

## Requirements

Node 18 or newer. **Zero runtime dependencies.**

## License

MIT
