import type { LemmaSuggestion } from "@collocations/types";

/** Decision #88. Cacheable for an hour (#85), so repeated prefixes cost nothing. */
export async function fetchSuggest(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<LemmaSuggestion[]> {
  const url = `${baseUrl}/api/suggest?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  // Throws on a server error: the suggester treats any failure as silence, not as "no suggestions".
  if (!res.ok) throw new Error(`suggest ${res.status}`);
  return res.json();
}
