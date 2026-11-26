import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { CollocationCheck } from "@collocations/types";
import type { CheckCollocation } from "../../application/ports/in/CheckCollocation.ts";
import { createCheckHandler } from "./checkHandler.ts";

function fakeResponse() {
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  const res = {
    status(code: number) {
      statuses.push(code);
      return res;
    },
    json(body: unknown) {
      bodies.push(body);
      return res;
    },
  };
  return { res: res as unknown as Response, statuses, bodies };
}

function recordingUseCase(result: CollocationCheck) {
  const asked: string[] = [];
  const useCase: CheckCollocation = {
    check: async (q) => {
      asked.push(q);
      return result;
    },
  };
  return { useCase, asked };
}

for (const query of [{ q: " " }, {}]) {
  test(`q=${JSON.stringify(query)} gets one 400 and is never checked`, async () => {
    const { useCase, asked } = recordingUseCase({ parsed: false });
    const { res, statuses } = fakeResponse();
    await createCheckHandler(useCase)({ query } as unknown as Request, res);
    assert.deepEqual(statuses, [400]);
    assert.deepEqual(asked, []);
  });
}

test("a phrase is checked and its result sent with 200", async () => {
  const { useCase, asked } = recordingUseCase({ parsed: false });
  const { res, statuses, bodies } = fakeResponse();
  await createCheckHandler(useCase)({ query: { q: "Sport machen" } } as unknown as Request, res);
  assert.deepEqual(asked, ["Sport machen"]);
  assert.deepEqual(statuses, [200]);
  assert.deepEqual(bodies, [{ parsed: false }]);
});
