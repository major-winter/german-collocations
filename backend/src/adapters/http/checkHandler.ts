import type { Request, Response } from "express";
import type { CheckCollocation } from "../../application/ports/in/CheckCollocation.ts";

// GET /api/check?q=eine Entscheidung machen (#70).
export function createCheckHandler(useCase: CheckCollocation) {
  return async (req: Request, res: Response): Promise<void> => {
    const query = req.query.q;
    const q = Array.isArray(query) ? query[0] : query;
    if (typeof q !== "string" || q.trim() === "") {
      res.status(400).json({ error: "q parameter is required" });
      return;
    }
    try {
      res.status(200).json(await useCase.check(q));
    } catch (err) {
      console.error("Error checking collocation:", err);
      res.status(500).json({ error: "internal server error" });
    }
  };
}
