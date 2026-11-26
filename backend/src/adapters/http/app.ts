import express, { type Express } from "express";
import cors from "cors";
import type { CheckCollocation } from "../../application/ports/in/CheckCollocation.ts";
import type { LookupCollocations } from "../../application/ports/in/LookupCollocations.ts";
import type { SearchWords } from "../../application/ports/in/SearchWords.ts";
import { createCheckHandler } from "./checkHandler.ts";
import { createCollocationsHandler } from "./collocationsHandler.ts";
import { createSearchHandler } from "./searchHandler.ts";

// Driving adapter: translates HTTP into calls on the inbound ports.
export function createHttpApp(useCases: {
  lookupCollocations: LookupCollocations;
  searchWords: SearchWords;
  checkCollocation: CheckCollocation;
}): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.get(
    "/api/collocations/:word",
    createCollocationsHandler(useCases.lookupCollocations),
  );
  app.get("/api/search", createSearchHandler(useCases.searchWords));
  app.get("/api/check", createCheckHandler(useCases.checkCollocation));
  return app;
}
