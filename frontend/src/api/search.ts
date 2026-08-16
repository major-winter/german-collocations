import type { WordSuggestion } from "@collocations/types";

export async function fetchSearch(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<WordSuggestion[]> {
  const url = `${baseUrl}/api/search?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return [];

  return res.json();
}
