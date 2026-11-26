import type { Request, Response } from "express";
import type { LookupCollocations } from "../../application/ports/in/LookupCollocations.ts";

export function createCollocationsHandler(useCase: LookupCollocations) {
  return async (req: Request, res: Response): Promise<void> => {
    const wordParam = req.params.word;
    const word = Array.isArray(wordParam) ? wordParam[0] : wordParam;

    if (!word || word.trim() === "") {
      res.status(400).json({ error: "word parameter is required" });
      return;
    }
    try {
      const result = await useCase.lookup(word);

      if (!result) {
        res.status(404).json({ error: `no data found for word "${word}"` });
        return;
      }

      res.status(200).json(result);
    } catch (err) {
      console.error("Error fetching collocations:", err);
      res.status(500).json({ error: "internal server error" });
    }
  };
}
