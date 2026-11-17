import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, toWords } from "../src/data/words.js";

const TOPICS_PATH = new URL("../data/topics.json", import.meta.url);
const SHEET_COPY_PATH = new URL("../data/sheet.csv", import.meta.url);
const MIN_WORDS_PER_TOPIC = 8;
const MIN_TOPICS = 12;
const MAX_TOPICS = 18;
const TOPIC_FIELDS = ["id", "en", "hi", "icon"];

const topicsFile = JSON.parse(await readFile(TOPICS_PATH, "utf8"));
const topicIds = new Set(topicsFile.topics.map((topic) => topic.id));
const sheetWords = toWords(parseCsv(await readFile(SHEET_COPY_PATH, "utf8")), topicsFile.words);

test("every English word in the sheet has a known topic", () => {
  assert.ok(sheetWords.length >= 1000, `the sheet has only ${sheetWords.length} words`);
  const missing = sheetWords.filter((word) => !topicIds.has(word.topic)).map((word) => word.en);
  assert.deepEqual(missing, [], "words with no topic");
});

test("every topic in the words map is a listed topic", () => {
  const unknown = Object.entries(topicsFile.words).filter(([, id]) => !topicIds.has(id));
  assert.deepEqual(unknown, [], "words pointing at an unknown topic");
});

test("every topic has an id, English name, Hindi name and icon", () => {
  for (const topic of topicsFile.topics) {
    for (const field of TOPIC_FIELDS) {
      assert.equal(typeof topic[field], "string", `${topic.id} ${field}`);
      assert.ok(topic[field].trim().length > 0, `${topic.id} has an empty ${field}`);
    }
    assert.match(topic.hi, /\p{Script=Devanagari}/u, `${topic.id} Hindi name is in Devanagari`);
  }
});

test(`topic ids are unique and there are ${MIN_TOPICS} to ${MAX_TOPICS} topics`, () => {
  assert.equal(topicIds.size, topicsFile.topics.length, "duplicate topic id");
  assert.ok(topicIds.size >= MIN_TOPICS && topicIds.size <= MAX_TOPICS, `${topicIds.size} topics`);
});

test(`every topic holds at least ${MIN_WORDS_PER_TOPIC} of the sheet's words`, () => {
  const counts = new Map([...topicIds].map((id) => [id, 0]));
  for (const word of sheetWords) {
    if (counts.has(word.topic)) counts.set(word.topic, counts.get(word.topic) + 1);
  }
  for (const [id, count] of counts) {
    assert.ok(count >= MIN_WORDS_PER_TOPIC, `${id} holds only ${count} words`);
  }
});
