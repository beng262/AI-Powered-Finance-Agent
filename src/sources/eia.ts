// U.S. Energy Information Administration (EIA) open data — oil / gas / inventory.
// Free key: https://www.eia.gov/opendata/register.php

import { getApiKey } from "../apikeys";

const BASE = "https://api.eia.gov/v2";

export async function getEiaKey(): Promise<string> {
  return getApiKey("eia");
}

export async function eiaConfigured(): Promise<boolean> {
  return Boolean(await getEiaKey());
}

export async function eiaTestKey(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!key.trim()) return { ok: false, error: "Anahtar boş." };
  try {
    const url = `${BASE}/petroleum/pri/spt/data/?api_key=${encodeURIComponent(key)}&frequency=daily&data[0]=value&facets[product][]=EPCBRENT&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (r.status === 401 || r.status === 403) return { ok: false, error: "EIA anahtarı reddedildi." };
    if (!r.ok) return { ok: false, error: `EIA yanıtı: ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 120) };
  }
}

export type EiaPoint = { id: string; label: string; value: number | null; asOf: string | null; unit?: string };

async function eiaLatest(path: string, productFacet: string, label: string, id: string): Promise<EiaPoint> {
  const key = await getEiaKey();
  if (!key) return { id, label, value: null, asOf: null };
  try {
    const url =
      `${BASE}/${path}/data/?api_key=${encodeURIComponent(key)}` +
      `&frequency=daily&data[0]=value&facets[product][]=${encodeURIComponent(productFacet)}` +
      `&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { id, label, value: null, asOf: null };
    const j = (await r.json()) as {
      response?: { data?: { period?: string; value?: number | string; "units-description"?: string }[] };
    };
    const row = j.response?.data?.[0];
    const value = row?.value == null ? null : typeof row.value === "number" ? row.value : parseFloat(String(row.value));
    return {
      id,
      label,
      value: Number.isFinite(value as number) ? (value as number) : null,
      asOf: row?.period || null,
      unit: row?.["units-description"],
    };
  } catch {
    return { id, label, value: null, asOf: null };
  }
}

export type EiaSnapshot = { live: boolean; points: EiaPoint[] };

export async function getEiaSnapshot(): Promise<EiaSnapshot> {
  const points = await Promise.all([
    eiaLatest("petroleum/pri/spt", "EPCBRENT", "Brent spot", "brent"),
    eiaLatest("petroleum/pri/spt", "EPCWTI", "WTI spot", "wti"),
  ]);
  return { live: points.some((p) => p.value != null), points };
}
