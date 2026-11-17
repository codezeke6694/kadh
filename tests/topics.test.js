import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const TOPICS_PATH = new URL("../data/topics.json", import.meta.url);
const SHEET_COPY_PATH = new URL("../data/sheet.csv", import.meta.url);
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1DP8Y66XIfZoM14Zteo_EtUKmlRfT1woa86i6TVPoVHY/export?format=csv&gid=0";
const MIN_WORDS_PER_TOPIC = 8;
const TOPIC_FIELDS = ["id", "en", "hi", "icon"];

// The sheet has quoted cells holding commas and line breaks, so a plain split is not enough.
function parseCsvRows(text) {
  const rows = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { rows.at(-1).push(cell); cell = ""; }
    else if (ch === "\n") { rows.at(-1).push(cell.replace(/\r$/, "")); rows.push([]); cell = ""; }
    else cell += ch;
  }
  rows.at(-1).push(cell);
  return rows;
}

// data/sheet.csv is the shipped copy; until it exists, check against the live sheet.
async function readSheetText() {
  try {
    await access(SHEET_COPY_PATH);
    return await readFile(SHEET_COPY_PATH, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error(`fetching the sheet failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function readSheetEnglish() {
  const [header, ...rows] = parseCsvRows(await readSheetText());
  assert.equal(header[0].trim(), "English", "the sheet's first column is English");
  return rows.map((row) => (row[0] ?? "").trim()).filter(Boolean);
}

const topicsFile = JSON.parse(await readFile(TOPICS_PATH, "utf8"));
const topicIds = new Set(topicsFile.topics.map((topic) => topic.id));

test("parseCsvRows keeps commas and line breaks inside quoted cells", () => {
  const rows = parseCsvRows('English,Hindi\r\n"Yak, female\n(fertile)",""\nAnt,"""x"""');
  assert.deepEqual(rows, [["English", "Hindi"], ["Yak, female\n(fertile)", ""], ["Ant", '"x"']]);
});

test("every English word in the sheet has a known topic", async () => {
  const english = await readSheetEnglish();
  assert.ok(english.length >= 1000, `the sheet has only ${english.length} words`);
  const missing = english.filter((word) => !topicIds.has(topicsFile.words[word]));
  assert.deepEqual(missing, [], "words with no topic");
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

test("topic ids are unique and there are 12 to 18 topics", () => {
  assert.equal(topicIds.size, topicsFile.topics.length, "duplicate topic id");
  assert.ok(topicIds.size >= 12 && topicIds.size <= 18, `${topicIds.size} topics`);
});

test(`every topic holds at least ${MIN_WORDS_PER_TOPIC} words`, () => {
  const counts = new Map([...topicIds].map((id) => [id, 0]));
  for (const id of Object.values(topicsFile.words)) {
    assert.ok(counts.has(id), `unknown topic id "${id}" in words`);
    counts.set(id, counts.get(id) + 1);
  }
  for (const [id, count] of counts) {
    assert.ok(count >= MIN_WORDS_PER_TOPIC, `${id} holds only ${count} words`);
  }
});
