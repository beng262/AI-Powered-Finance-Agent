// CSA hardening: input validation, prompt-injection detection, and output DLP.
// These run in the orchestrator around every request (the SDD's "prompt güvenliği",
// "sızıntı önleme (DLP)", "hassas veri filtresi").
// ---- Input validation / sanitization ----
export function sanitizeInput(raw) {
    return raw
        .replace(/[\x00-\x1f\x7f]/g, "") // strip control chars
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
}
// ---- Prompt-injection detection ----
const INJECTION = [
    /ignore (the )?(previous|above|prior) (instructions|prompt|rules)/i,
    /disregard (the )?(previous|above|system)/i,
    /\b(system prompt|system message|developer message)\b/i,
    /reveal (your )?(system )?(prompt|instructions|rules)/i,
    /you are now\b|act as (an?|the)\b.*\b(unrestricted|jailbroken|dan)\b/i,
    /önceki (tüm )?(talimatlar|kurallar)[ıi]?n?[ıi]? (unut|yok say|gözard[ıi])/i,
    /sistem (talimat|mesaj|prompt)[ıi]?n?[ıi]?/i,
    /(kurallar[ıi]|talimatlar[ıi]) (yok say|unut|aş)/i,
    /(parolan?[ıi]?|şifren?[ıi]?|api ?key|connection ?string|secret)[^a-z]{0,3}(neydi|nedir|göster|ver|yaz|söyle)/i,
];
export function detectInjection(q) {
    for (const re of INJECTION)
        if (re.test(q))
            return { injected: true, pattern: re.source.slice(0, 40) };
    return { injected: false };
}
// ---- Output DLP: never let secrets/credentials leak into a response ----
const SECRET_PATTERNS = [
    /sqlserver:\/\/[^\s"']+/gi, // DB connection strings
    /password\s*=\s*[^;\s"']+/gi, // password=...
    /\bsk-[A-Za-z0-9]{16,}\b/g, // OpenAI-style keys
    /\b[A-Fa-f0-9]{32,}\b/g, // long hex secrets / API keys
    /AZURE_OPENAI_API_KEY\s*[:=]\s*\S+/gi,
];
export function scrubOutput(text) {
    let out = text;
    for (const re of SECRET_PATTERNS)
        out = out.replace(re, "[gizlendi]");
    return out;
}
// ---- Simple in-memory rate limiter (per session/IP, sliding window) ----
const HITS = new Map();
export function rateLimit(key, limit = 20, windowMs = 60_000) {
    const now = Date.now();
    const arr = (HITS.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
        const retryAfterSec = Math.ceil((windowMs - (now - arr[0])) / 1000);
        HITS.set(key, arr);
        return { ok: false, retryAfterSec };
    }
    arr.push(now);
    HITS.set(key, arr);
    return { ok: true };
}
