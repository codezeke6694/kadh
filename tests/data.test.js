import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, toWords, splitForms, forDialect, byTopic, MIN_SHEET_WORDS } from "../src/data/words.js";
import { loadWords, onWordsUpdated, SHEET_CACHE_KEY } from "../src/data/load.js";
import { SHEET_CSV_URL } from "../src/config.js";

const HEADER = "English,Hindi,Hamskad,Navaskad,Pahari Kinnauri";

test("parseCsv reads quoted cells with commas, quotes and line breaks", () => {
  const rows = parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,,y,z\n');
  assert.deepEqual(rows, [
    ["a", "b, c", 'say "hi"', "two\nlines"],
    ["x", "", "y", "z"],
  ]);
});

test("parseCsv of empty text gives no rows", () => {
  assert.deepEqual(parseCsv(""), []);
});

test('a cell "मुहवा / टिन" gives the two forms मुहवा and टिन', () => {
  assert.deepEqual(splitForms("मुहवा / टिन"), ["मुहवा", "टिन"]);
  assert.deepEqual(splitForms("जानरी/जू"), ["जानरी", "जू"]);
  assert.deepEqual(splitForms("आग; उडार"), ["आग", "उडार"]);
});

test("a quoted note such as 'छोटा पर्वत' is not counted as a form", () => {
  assert.deepEqual(splitForms("डोखङ 'ऊंचा, बड़ा पर्वत' / ठोल 'छोटा पर्वत'"), ["डोखङ", "ठोल"]);
  assert.deepEqual(splitForms("'छोटा पर्वत'"), []);
});

test("a bracketed note such as (खेत) is not counted as a form", () => {
  assert.deepEqual(splitForms("डौखरो  (खेत) "), ["डौखरो"]);
  assert.deepEqual(splitForms("ओस /पागलांङ (पाला)"), ["ओस", "पागलांङ"]);
  assert.deepEqual(splitForms("(खेत)"), []);
});

test("a word with an empty dialect cell has no entry for that dialect", () => {
  const [word] = toWords(parseCsv(`${HEADER}\nCavern,खाई,डाबराङ,,डाबर`), {});
  assert.deepEqual(Object.keys(word.dialects).sort(), ["hamskad", "pahari"]);
  assert.equal(word.dialects.navaskad, undefined);
});

test("toWords builds the J1 word shape", () => {
  const [word] = toWords(parseCsv(`${HEADER}\nCloud,बादल,जू,मुहवा / टिन,जानरी/जू`), { Cloud: "nature" });
  assert.deepEqual(word, {
    id: "cloud",
    en: "Cloud",
    hi: "बादल",
    dialects: {
      hamskad: { text: "जू", forms: ["जू"] },
      navaskad: { text: "मुहवा / टिन", forms: ["मुहवा", "टिन"] },
      pahari: { text: "जानरी/जू", forms: ["जानरी", "जू"] },
    },
    topic: "nature",
  });
});

test("toWords trims a padded English cell before the topic lookup", () => {
  const [word] = toWords(parseCsv(`${HEADER}\n"  Cloud \n",,जू,,`), { Cloud: "nature" });
  assert.equal(word.en, "Cloud");
  assert.equal(word.id, "cloud");
  assert.equal(word.topic, "nature");
  assert.equal(word.hi, "");
});

test("toWords gives repeats their own ids and skips rows with no English", () => {
  const csv = `${HEADER}\nSun shine/Sun,धूप,निमा,,\nSun shine/Sun,,नी,,\n,बादल,जू,,\n`;
  const words = toWords(parseCsv(csv), {});
  assert.deepEqual(words.map((w) => w.id), ["sun-shine-sun", "sun-shine-sun-2"]);
  assert.equal(words[0].topic, "other");
});

test("the sheet's Topic column wins over the topics map", () => {
  const csv = `${HEADER},Topic\nCloud,बादल,जू,,,weather\nAnt,,,,,\n`;
  const words = toWords(parseCsv(csv), { Cloud: "nature", Ant: "animals" });
  assert.deepEqual(words.map((w) => w.topic), ["weather", "animals"]);
});

test("toWords of a header only gives no words", () => {
  assert.deepEqual(toWords(parseCsv(HEADER), {}), []);
  assert.deepEqual(toWords([], {}), []);
});

test("forDialect and byTopic filter words", () => {
  const words = toWords(parseCsv(`${HEADER}\nCloud,,जू,,\nAnt,,,टू,\n`), { Cloud: "nature", Ant: "animals" });
  assert.deepEqual(forDialect(words, "hamskad").map((w) => w.en), ["Cloud"]);
  assert.deepEqual(forDialect(words, "pahari"), []);
  assert.deepEqual(byTopic(words, "animals").map((w) => w.en), ["Ant"]);
});

test("the shipped copy data/sheet.csv parses to the full dictionary", async () => {
  const text = await readFile(new URL("../data/sheet.csv", import.meta.url), "utf8");
  const words = toWords(parseCsv(text), {});
  assert.ok(words.length >= MIN_SHEET_WORDS);
  assert.ok(words.some((w) => w.en === "Cloud" && w.dialects.navaskad.forms.includes("टिन")));
});

// --- loading, with fetch and localStorage stood in for the browser ---

function sheetText(firstWord, count) {
  const rows = [HEADER, `${firstWord},,जू,,`];
  for (let i = 1; i < count; i++) rows.push(`Word ${i},,जू,,`);
  return rows.join("\n");
}

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

function fakeFetch({ copy, topics, live }) {
  return async (url) => {
    const href = String(url);
    if (href === SHEET_CSV_URL) return live();
    if (href.endsWith("data/sheet.csv")) return new Response(copy);
    if (href.endsWith("data/topics.json")) return topics ? Response.json(topics) : new Response("", { status: 404 });
    throw new Error(`unexpected fetch ${href}`);
  };
}

function nextUpdate() {
  return new Promise((resolve) => onWordsUpdated(resolve));
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

test("the words load from the copy in data/sheet.csv when the live sheet cannot be reached", async () => {
  let liveAsked;
  const liveTried = new Promise((resolve) => (liveAsked = resolve));
  let updated = false;
  onWordsUpdated(() => (updated = true));
  globalThis.fetch = fakeFetch({
    copy: sheetText("Copy word", MIN_SHEET_WORDS),
    topics: { topics: [], words: { "Copy word": "nature" } },
    live: async () => {
      liveAsked();
      throw new TypeError("fetch failed");
    },
  });
  const words = await loadWords();
  await liveTried;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(words[0].en, "Copy word");
  assert.equal(words[0].topic, "nature");
  assert.equal(updated, false);
  assert.equal(localStorage.getItem(SHEET_CACHE_KEY), null);
});

test("the words load from the live Google Sheet when it answers", async () => {
  const live = sheetText("Live word", MIN_SHEET_WORDS);
  globalThis.fetch = fakeFetch({
    copy: sheetText("Copy word", MIN_SHEET_WORDS),
    topics: null,
    live: async () => new Response(live),
  });
  const update = nextUpdate();
  await loadWords();
  const words = await update;
  assert.equal(words[0].en, "Live word");
  assert.equal(words[0].topic, "other");
  assert.equal(localStorage.getItem(SHEET_CACHE_KEY), live);
});

test("the next visit starts from the live sheet kept in localStorage", async () => {
  localStorage.setItem(SHEET_CACHE_KEY, sheetText("Kept word", MIN_SHEET_WORDS));
  globalThis.fetch = fakeFetch({
    copy: sheetText("Copy word", MIN_SHEET_WORDS),
    topics: null,
    live: async () => new Response("", { status: 500 }),
  });
  const words = await loadWords();
  assert.equal(words[0].en, "Kept word");
});

test("a live sheet with fewer than the minimum words is not used", async () => {
  let updated = false;
  onWordsUpdated(() => (updated = true));
  let answered;
  const liveDone = new Promise((resolve) => (answered = resolve));
  globalThis.fetch = fakeFetch({
    copy: sheetText("Copy word", MIN_SHEET_WORDS),
    topics: null,
    live: async () => {
      answered();
      return new Response(sheetText("Short", MIN_SHEET_WORDS - 1));
    },
  });
  const words = await loadWords();
  await liveDone;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(words[0].en, "Copy word");
  assert.equal(updated, false);
  assert.equal(localStorage.getItem(SHEET_CACHE_KEY), null);
});

test("blocked storage still loads the copy", async () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  globalThis.fetch = fakeFetch({
    copy: sheetText("Copy word", MIN_SHEET_WORDS),
    topics: null,
    live: async () => new Response(sheetText("Live word", MIN_SHEET_WORDS)),
  });
  const update = nextUpdate();
  const words = await loadWords();
  assert.equal(words[0].en, "Copy word");
  assert.equal((await update)[0].en, "Live word");
});
