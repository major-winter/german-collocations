import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { LookupCollocations } from "../../application/ports/in/LookupCollocations.ts";
import { createCollocationsHandler } from "./collocationsHandler.ts";

function fakeResponse() {
  const statuses: number[] = [];
  const res = {
    status(code: number) {
      statuses.push(code);
      return res;
    },
    json() {
      return res;
    },
  };
  return { res: res as unknown as Response, statuses };
}

test("a blank word gets one 400 and is never looked up", async () => {
  const looked: string[] = [];
  const useCase: LookupCollocations = {
    lookup: async (word) => {
      looked.push(word);
      return null;
    },
  };
  const { res, statuses } = fakeResponse();

  await createCollocationsHandler(useCase)({ params: { word: " " } } as unknown as Request, res);

  assert.deepEqual(statuses, [400]);
  assert.deepEqual(looked, []);
});
