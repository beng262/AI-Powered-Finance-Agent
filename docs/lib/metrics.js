// Deterministic financial indicators computed from a daily close series.
// Pure functions, no LLM, no side effects - every number is reproducible (the SDD's
// "deterministik kod" + "denetlenebilir" principle). Inputs/formulae are surfaced as
// a calculation trace by the calling service.
export function sma(s, n) {
    if (s.length < n || n <= 0)
        return null;
    const slice = s.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / n;
}
export function ema(s, n) {
    if (s.length < n || n <= 0)
        return null;
    const k = 2 / (n + 1);
    let e = s.slice(0, n).reduce((a, b) => a + b, 0) / n; // seed with SMA
    for (let i = n; i < s.length; i++)
        e = s[i] * k + e * (1 - k);
    return e;
}
// Wilder's RSI over `n` periods (default 14). Returns 0..100 or null if too short.
export function rsi(s, n = 14) {
    if (s.length < n + 1)
        return null;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) {
        const ch = s[i] - s[i - 1];
        if (ch >= 0)
            gain += ch;
        else
            loss -= ch;
    }
    let avgGain = gain / n, avgLoss = loss / n;
    for (let i = n + 1; i < s.length; i++) {
        const ch = s[i] - s[i - 1];
        avgGain = (avgGain * (n - 1) + (ch > 0 ? ch : 0)) / n;
        avgLoss = (avgLoss * (n - 1) + (ch < 0 ? -ch : 0)) / n;
    }
    if (avgLoss === 0)
        return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}
// Percent momentum over the last `n` sessions: close_t / close_{t-n} - 1, in %.
export function momentum(s, n) {
    if (s.length < n + 1)
        return null;
    const past = s[s.length - 1 - n];
    if (!past)
        return null;
    return (s[s.length - 1] / past - 1) * 100;
}
// Simple daily returns r_t = close_t / close_{t-1} - 1
export function dailyReturns(s) {
    const r = [];
    for (let i = 1; i < s.length; i++)
        if (s[i - 1])
            r.push(s[i] / s[i - 1] - 1);
    return r;
}
export function stdev(xs) {
    if (xs.length < 2)
        return null;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
    return Math.sqrt(v);
}
// Annualized volatility = stdev(daily returns) * sqrt(252), as a percentage.
export function annualizedVol(s) {
    const sd = stdev(dailyReturns(s));
    return sd == null ? null : sd * Math.sqrt(252) * 100;
}
// Historical VaR: the loss at the (1-conf) percentile of daily returns, as a positive %.
export function historicalVaR(s, conf = 0.95) {
    const r = dailyReturns(s).slice().sort((a, b) => a - b);
    if (r.length < 20)
        return null;
    const idx = Math.max(0, Math.floor((1 - conf) * r.length) - 1);
    return Math.abs(r[idx]) * 100;
}
// Maximum drawdown over the series, as a positive %.
export function maxDrawdown(s) {
    if (s.length < 2)
        return null;
    let peak = s[0], mdd = 0;
    for (const v of s) {
        if (v > peak)
            peak = v;
        const dd = (peak - v) / peak;
        if (dd > mdd)
            mdd = dd;
    }
    return mdd * 100;
}
export const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
// --- Indicators ported from shashankvemuri/Finance (deterministic TS versions) ---
// Full EMA series (needed by MACD).
function emaSeries(s, n) {
    if (s.length < n)
        return [];
    const k = 2 / (n + 1);
    const out = [];
    let e = s.slice(0, n).reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < s.length; i++) {
        if (i < n) {
            out.push(e);
            continue;
        }
        e = s[i] * k + e * (1 - k);
        out.push(e);
    }
    return out;
}
// MACD(12,26,9): momentum crossover indicator. Positive histogram = bullish momentum.
export function macd(s) {
    if (s.length < 35)
        return null;
    const e12 = emaSeries(s, 12), e26 = emaSeries(s, 26);
    const line = s.map((_, i) => e12[i] - e26[i]).slice(26);
    const sig = emaSeries(line, 9);
    const m = line[line.length - 1], g = sig[sig.length - 1];
    return { macd: m, signal: g, histogram: m - g };
}
// Bollinger Bands (20, 2σ) + %B position (0 = alt bant, 1 = üst bant).
export function bollinger(s, n = 20, mult = 2) {
    if (s.length < n)
        return null;
    const win = s.slice(-n);
    const mid = win.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mid) ** 2, 0) / n);
    const upper = mid + mult * sd, lower = mid - mult * sd;
    const last = s[s.length - 1];
    return { upper, middle: mid, lower, percentB: upper === lower ? 0.5 : (last - lower) / (upper - lower) };
}
// Pearson correlation of two aligned daily-return series.
export function correlation(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 20)
        return null;
    const ra = dailyReturns(a.slice(-n)), rb = dailyReturns(b.slice(-n));
    const m = Math.min(ra.length, rb.length);
    if (m < 15)
        return null;
    const xa = ra.slice(-m), xb = rb.slice(-m);
    const ma = xa.reduce((x, y) => x + y, 0) / m, mb = xb.reduce((x, y) => x + y, 0) / m;
    let num = 0, da = 0, dbv = 0;
    for (let i = 0; i < m; i++) {
        const u = xa[i] - ma, v = xb[i] - mb;
        num += u * v;
        da += u * u;
        dbv += v * v;
    }
    const den = Math.sqrt(da * dbv);
    return den === 0 ? null : num / den;
}
// SMA crossover backtest (fast/slow golden-cross): long when SMA(fast) > SMA(slow),
// flat otherwise. Returns strategy vs buy&hold over the series - educational only.
export function smaCrossBacktest(s, fast = 10, slow = 30) {
    if (s.length < slow + 10)
        return null;
    let cash = 1, shares = 0, trades = 0, wins = 0, entry = 0;
    for (let i = slow; i < s.length; i++) {
        const f = s.slice(i - fast, i).reduce((a, b) => a + b, 0) / fast;
        const sl = s.slice(i - slow, i).reduce((a, b) => a + b, 0) / slow;
        const price = s[i];
        if (f > sl && shares === 0) {
            shares = cash / price;
            cash = 0;
            entry = price;
            trades++;
        }
        else if (f <= sl && shares > 0) {
            cash = shares * price;
            if (price > entry)
                wins++;
            shares = 0;
        }
    }
    const final = cash + shares * s[s.length - 1];
    return {
        strategyPct: (final - 1) * 100,
        buyHoldPct: (s[s.length - 1] / s[slow] - 1) * 100,
        trades,
        winRate: trades > 0 && (trades > 1 || shares === 0) ? (wins / Math.max(1, trades - (shares > 0 ? 1 : 0))) * 100 : null,
        days: s.length - slow,
    };
}
export function linearForecast(s, horizon) {
    const n = s.length;
    if (n < 10 || horizon < 1)
        return null;
    // least-squares fit y = a*x + b over x = 0..n-1
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
        sx += i;
        sy += s[i];
        sxx += i * i;
        sxy += i * s[i];
    }
    const denom = n * sxx - sx * sx || 1;
    const a = (n * sxy - sx * sy) / denom;
    const b = (sy - a * sx) / n;
    // residual stdev
    let ss = 0;
    for (let i = 0; i < n; i++) {
        const e = s[i] - (a * i + b);
        ss += e * e;
    }
    const resSd = Math.sqrt(ss / Math.max(1, n - 2));
    const points = [], lower = [], upper = [];
    for (let k = 1; k <= horizon; k++) {
        const yhat = a * (n - 1 + k) + b;
        const band = 1.65 * resSd * Math.sqrt(k);
        points.push(yhat);
        lower.push(yhat - band);
        upper.push(yhat + band);
    }
    return {
        points, lower, upper,
        endEstimate: points[horizon - 1], endLow: lower[horizon - 1], endHigh: upper[horizon - 1],
        slopePerStep: a,
    };
}
