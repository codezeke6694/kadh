import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, toWords } from "../src/data/words.js";
import { indexWords, findWords, ALL_TOPICS } from "../src/screens/words.js";
import strings from "../src/i18n/words.js";

const topicsFile = JSON.parse(await readFile(new URL("../data/topics.json", import.meta.url), "utf8"));
const sheetWords = toWords(parseCsv(await readFile(new URL("../data/sheet.csv", import.meta.url), "utf8")), topicsFile.words);
const sheetIndex = indexWords(sheetWords);
const BIG_LIST_SIZE = 10_000;
const BIG_LIST_SEARCH_MS = 100;

const ids = (words) => words.map((word) => word.id);

test("searching Cloud in English finds Cloud", () => {
  assert.ok(ids(findWords(sheetIndex, "Cloud", ALL_TOPICS)).includes("cloud"));
  assert.ok(ids(findWords(sheetIndex, "  cLOUD ", ALL_TOPICS)).includes("cloud"));
});

test("searching बादल in Hindi finds Cloud", () => {
  assert.ok(ids(findWords(sheetIndex, "बादल", ALL_TOPICS)).includes("cloud"));
});

test("searching जू finds Cloud through its Kinnauri words, exact matches first", () => {
  const found = findWords(sheetIndex, "जू", ALL_TOPICS);
  assert.ok(ids(found).includes("cloud"));
  assert.ok(found.every((word) => JSON.stringify(word).includes("जू")));
  assert.equal(found[0].id, "cloud");
});

test("searching each Kinnauri finds its word", () => {
  assert.ok(ids(findWords(sheetIndex, "मुहवा", ALL_TOPICS)).includes("cloud"));
  assert.ok(ids(findWords(sheetIndex, "जानरी", ALL_TOPICS)).includes("cloud"));
});

test("a topic shows only that topic's words", () => {
  const animals = findWords(sheetIndex, "", "animals");
  assert.ok(animals.length > 0);
  assert.ok(animals.every((word) => word.topic === "animals"));
  assert.ok(ids(animals).includes("ant"));
  assert.deepEqual(findWords(sheetIndex, "Cloud", "animals"), []);
});

test("an empty search shows every word; a word not there shows none", () => {
  assert.equal(findWords(sheetIndex, "", ALL_TOPICS).length, sheetWords.length);
  assert.equal(findWords(sheetIndex, "   ", ALL_TOPICS).length, sheetWords.length);
  assert.deepEqual(findWords(sheetIndex, "zzqx-not-a-word", ALL_TOPICS), []);
  assert.deepEqual(findWords(indexWords([]), "Cloud", ALL_TOPICS), []);
});

test("a word with no Hindi and no dialects is still found by its English", () => {
  const bare = [{ id: "bare", en: "Bare", hi: "", dialects: {}, topic: "other" }];
  assert.deepEqual(ids(findWords(indexWords(bare), "bar", ALL_TOPICS)), ["bare"]);
});

test("searching 10,000 words stays fast", () => {
  const many = Array.from({ length: BIG_LIST_SIZE }, (_, i) => sheetWords[i % sheetWords.length]);
  const index = indexWords(many);
  const started = performance.now();
  findWords(index, "जू", ALL_TOPICS);
  findWords(index, "a", "animals");
  assert.ok(performance.now() - started < BIG_LIST_SEARCH_MS);
});

test("the screen's words exist in English and Hindi", () => {
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
  assert.ok(strings.en["words.search"]);
});
