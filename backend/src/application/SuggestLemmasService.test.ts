import { test } from "node:test";
import assert from "node:assert/strict";
import type { LemmaSuggestion } from "@collocations/types";
import type { LemmaIndex } from "./ports/out/LemmaIndex.ts";
import { SuggestLemmasService } from "./SuggestLemmasService.ts";

function recordingIndex(rows: LemmaSuggestion[] = []) {
  const asked: { prefix: string; limit: number }[] = [];
  const index: LemmaIndex = {
    suggest: async (prefix, limit) => {
      asked.push({ prefix, limit });
      return rows;
    },
  };
  return { index, asked };
}

test("the prefix is trimmed and at most 6 lemmas are asked for", async () => {
  const rows: LemmaSuggestion[] = [{ lemma: "Frage", wordClass: "noun", article: "die" }];
  const { index, asked } = recordingIndex(rows);

  assert.deepEqual(await new SuggestLemmasService(index).suggest("  Fra "), rows);
  assert.deepEqual(asked, [{ prefix: "Fra", limit: 6 }]);
});

test("under two characters nothing is asked", async () => {
  const { index, asked } = recordingIndex();
  const service = new SuggestLemmasService(index);

  assert.deepEqual(await service.suggest("F"), []);
  assert.deepEqual(await service.suggest("  "), []);
  assert.deepEqual(asked, []);
});
