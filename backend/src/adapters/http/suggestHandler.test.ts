import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { LemmaSuggestion } from "@collocations/types";
import type { SuggestLemmas } from "../../application/ports/in/SuggestLemmas.ts";
import { createSuggestHandler } from "./suggestHandler.ts";

function fakeResponse() {
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) {
      statuses.push(code);
      return res;
    },
    set(name: string, value: string) {
      headers[name] = value;
      return res;
    },
    json(body: unknown) {
      bodies.push(body);
      return res;
    },
  };
  return { res: res as unknown as Response, statuses, bodies, headers };
}

const suggestions: LemmaSuggestion[] = [{ lemma: "Frage", wordClass: "noun", article: "die" }];

test("a missing q gets a 400, no cache header and no lookup", async () => {
  const asked: string[] = [];
  const useCase: SuggestLemmas = { suggest: async (q) => (asked.push(q), suggestions) };
  const { res, statuses, headers } = fakeResponse();

  await createSuggestHandler(useCase)({ query: {} } as unknown as Request, res);

  assert.deepEqual(statuses, [400]);
  assert.deepEqual(headers, {});
  assert.deepEqual(asked, []);
});

test("suggestions come back as the array, cacheable for an hour", async () => {
  const useCase: SuggestLemmas = { suggest: async () => suggestions };
  const { res, statuses, bodies, headers } = fakeResponse();

  await createSuggestHandler(useCase)({ query: { q: "Fra" } } as unknown as Request, res);

  assert.deepEqual(statuses, [200]);
  assert.deepEqual(bodies, [suggestions]);
  assert.equal(headers["Cache-Control"], "public, max-age=3600");
});

test("a failure is a 500 that is never cached", async () => {
  const useCase: SuggestLemmas = {
    suggest: async () => {
      throw new Error("db down");
    },
  };
  const { res, statuses, headers } = fakeResponse();
  const log = console.error;
  console.error = () => {};
  try {
    await createSuggestHandler(useCase)({ query: { q: "Fra" } } as unknown as Request, res);
  } finally {
    console.error = log;
  }

  assert.deepEqual(statuses, [500]);
  assert.deepEqual(headers, {});
});
