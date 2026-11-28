import { Pool } from "pg";
import { PgCollocationCheckStore } from "./adapters/postgres/PgCollocationCheckStore.ts";
import { PgCollocationStore } from "./adapters/postgres/PgCollocationStore.ts";
import { PgUsageCounter } from "./adapters/postgres/PgUsageCounter.ts";
import { PgWordIndex } from "./adapters/postgres/PgWordIndex.ts";
import { createHttpApp } from "./adapters/http/app.ts";
import { CheckCollocationService } from "./application/CheckCollocationService.ts";
import { CountingCheckCollocation, CountingLookupCollocations } from "./application/CountingUseCases.ts";
import { LookupCollocationsService } from "./application/LookupCollocationsService.ts";
import { SearchWordsService } from "./application/SearchWordsService.ts";
import { SuggestLemmasService } from "./application/SuggestLemmasService.ts";
import { PgLemmaIndex } from "./adapters/postgres/PgLemmaIndex.ts";

// Composition root: the only file that knows which adapter plugs into
// which port.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });

const usage = new PgUsageCounter(pool);

const app = createHttpApp({
  lookupCollocations: new CountingLookupCollocations(
    new LookupCollocationsService(new PgCollocationStore(pool)),
    usage,
  ),
  searchWords: new SearchWordsService(new PgWordIndex(pool)),
  suggestLemmas: new SuggestLemmasService(new PgLemmaIndex(pool)),
  checkCollocation: new CountingCheckCollocation(
    new CheckCollocationService(new PgCollocationCheckStore(pool)),
    usage,
  ),
});

app.listen(3000, () => console.log("listening on 3000"));
