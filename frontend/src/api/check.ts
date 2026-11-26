import type { CollocationCheck } from "@collocations/types";

/** Decision #70. Any failure reads as "not a phrase", so search falls back to today's behaviour. */
export async function fetchCheck(
  baseUrl: string,
  q: string,
  signal?: AbortSignal,
): Promise<CollocationCheck> {
  const url = `${baseUrl}/api/check?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return { parsed: false };
  return res.json();
}
