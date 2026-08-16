import express from "express";
import { Pool } from "pg";
import { PgCollocationRepository } from "./repositories/CollocationRepository.ts";
import { CollocationServiceImpl } from "./services/CollocationService.ts";
import { createCollocationsHandler } from "./routes/collocations.ts";
import cors from "cors";
import { PgWordSearchRepository } from "./repositories/WordSearchRepository.ts";
import { WordSearchServiceImpl } from "./services/WordSearchService.ts";
import { createSearchHandler } from "./routes/search.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });
const repository = new PgCollocationRepository(pool);
const collocationService = new CollocationServiceImpl(repository);
const searchRepository = new PgWordSearchRepository(pool);
const searchService = new WordSearchServiceImpl(searchRepository);

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.get(
  "/api/collocations/:word",
  createCollocationsHandler(collocationService),
);
app.get("/api/search", createSearchHandler(searchService));

app.listen(3000, () => console.log("listening on 3000"));
