import type { Request, Response } from "express";
import type { SearchWords } from "../../application/ports/useCases.ts";

export function createSearchHandler(useCase: SearchWords) {
  return async (req: Request, res: Response): Promise<void> => {
    const query = req.query.q;
    const q = Array.isArray(query) ? query[0] : query;
    if (!q || typeof q !== "string") {
      res.status(400).json({ error: `missing parameter` });
      return;
    }
    try {
      const result = await useCase.search(q);
      res.status(200).json(result);
    } catch (err) {
      console.error("Error searching words:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
