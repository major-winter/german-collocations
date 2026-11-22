import express, { type Express } from "express";
import cors from "cors";
import type { LookupCollocations } from "../../application/ports/in/LookupCollocations.ts";
import type { SearchWords } from "../../application/ports/in/SearchWords.ts";
import { createCollocationsHandler } from "./collocationsHandler.ts";
import { createSearchHandler } from "./searchHandler.ts";

// Driving adapter: translates HTTP into calls on the inbound ports.
export function createHttpApp(useCases: {
  lookupCollocations: LookupCollocations;
  searchWords: SearchWords;
}): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.get(
    "/api/collocations/:word",
    createCollocationsHandler(useCases.lookupCollocations),
  );
  app.get("/api/search", createSearchHandler(useCases.searchWords));
  return app;
}
