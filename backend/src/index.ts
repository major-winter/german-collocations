import { Pool } from "pg";
import { PgCollocationCheckStore } from "./adapters/postgres/PgCollocationCheckStore.ts";
import { PgCollocationStore } from "./adapters/postgres/PgCollocationStore.ts";
import { PgWordIndex } from "./adapters/postgres/PgWordIndex.ts";
import { createHttpApp } from "./adapters/http/app.ts";
import { CheckCollocationService } from "./application/CheckCollocationService.ts";
import { LookupCollocationsService } from "./application/LookupCollocationsService.ts";
import { SearchWordsService } from "./application/SearchWordsService.ts";

// Composition root: the only file that knows which adapter plugs into
// which port.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });

const app = createHttpApp({
  lookupCollocations: new LookupCollocationsService(new PgCollocationStore(pool)),
  searchWords: new SearchWordsService(new PgWordIndex(pool)),
  checkCollocation: new CheckCollocationService(new PgCollocationCheckStore(pool)),
});

app.listen(3000, () => console.log("listening on 3000"));
