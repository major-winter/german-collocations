import type { Request, Response } from "express";
import type { SuggestLemmas } from "../../application/ports/in/SuggestLemmas.ts";

// Corpus data changes only with a reload (#37), so a prefix's answer is
// good for an hour in the browser and at the proxy.
const CACHE_CONTROL = "public, max-age=3600";

export function createSuggestHandler(useCase: SuggestLemmas) {
  return async (req: Request, res: Response): Promise<void> => {
    const query = req.query.q;
    const q = Array.isArray(query) ? query[0] : query;
    if (!q || typeof q !== "string") {
      res.status(400).json({ error: `missing parameter` });
      return;
    }
    try {
      const result = await useCase.suggest(q);
      res.status(200).set("Cache-Control", CACHE_CONTROL).json(result);
    } catch (err) {
      console.error("Error suggesting lemmas:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
