import type { CollocationResponse } from "@collocations/types";

export async function fetchCollocations(
  baseUrl: string,
  word: string,
  signal?: AbortSignal,
): Promise<CollocationResponse | null> {
  const url = `${baseUrl}/api/collocations/${encodeURIComponent(word)}`;

  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new Error(
      `Collocation lookup failed for "${word}": ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as CollocationResponse;
}
