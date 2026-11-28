import { test } from "node:test";
import assert from "node:assert/strict";
import { wordClassOf } from "./wordClass.ts";

test("spaCy tags map to the learner's word classes", () => {
  assert.equal(wordClassOf("NOUN"), "noun");
  assert.equal(wordClassOf("VERB"), "verb");
  assert.equal(wordClassOf("AUX"), "verb");
  assert.equal(wordClassOf("ADJ"), "adjective");
  assert.equal(wordClassOf("ADV"), "adverb");
  assert.equal(wordClassOf("PROPN"), "name");
});

test("every other tag is other", () => {
  for (const tag of ["ADP", "DET", "NUM", "PRON", "CCONJ", "SCONJ", "PART", "INTJ", "XYZ"]) {
    assert.equal(wordClassOf(tag), "other");
  }
});
