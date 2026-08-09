import express from "express";
import { Pool } from "pg";
import { PgCollocationRepository } from "./repositories/CollocationRepository.ts";
import { CollocationServiceImpl } from "./services/CollocationService.ts";
import { createCollocationsHandler } from "./routes/collocations.ts";
import cors from 'cors';

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });
const repository = new PgCollocationRepository(pool);
const service = new CollocationServiceImpl(repository);

const app = express();
app.use(cors({origin: 'http://localhost:5173'}));
app.get("/api/collocations/:word", createCollocationsHandler(service));

app.listen(3000, () => console.log("listening on 3000"));
