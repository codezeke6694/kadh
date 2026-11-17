import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import render, { findWord, dialectsInOrder, practiseHash } from "../src/screens/word.js";
import { t, setLang, loadStrings } from "../src/i18n.js";

const TOPICS_PATH = new URL("../data/topics.json", import.meta.url);

// A small stand-in for the browser's document: only what the word page uses.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.ownText = "";
    this.className = "";
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
    this.ownText = "";
  }
  set textContent(text) {
    this.children = [];
    this.ownText = String(text);
  }
  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

const fakeDocument = { createElement: (tagName) => new FakeElement(tagName, fakeDocument) };

function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

function findByClass(root, className) {
  return allElements(root).filter((el) => el.className.split(" ").includes(className));
}

const CLOUD = {
  id: "cloud",
  en: "Cloud",
  hi: "बादल",
  dialects: {
    hamskad: { text: "जू", forms: ["जू"] },
    navaskad: { text: "मुहवा / टिन", forms: ["मुहवा", "टिन"] },
    pahari: { text: "जानरी/जू", forms: ["जानरी", "जू"] },
  },
  topic: "nature",
};

const ANT = {
  id: "ant",
  en: "Ant",
  hi: "",
  dialects: { pahari: { text: "<b>रिंगमा</b>", forms: ["रिंगमा"] } },
  topic: "animals",
};

const WORDS = [CLOUD, ANT];

// Node's fetch cannot read a file: URL, so the page's topics come from the file on disk.
async function useTopicsFile() {
  const text = await readFile(TOPICS_PATH, "utf8");
  globalThis.fetch = async () => new Response(text, { status: 200 });
}

async function show(id, settings = { dialect: "pahari", lang: "en" }) {
  const el = new FakeElement("main", fakeDocument);
  await render(el, { words: WORDS, settings, t, go() {}, params: { id } });
  return el;
}

beforeEach(async () => {
  setLang("en");
  await loadStrings(["shell", "word"]);
  await useTopicsFile();
});

test("a word is found by its id, and an unknown id finds nothing", () => {
  assert.equal(findWord(WORDS, "cloud"), CLOUD);
  assert.equal(findWord(WORDS, "no-such-word"), null);
  assert.equal(findWord([], "cloud"), null);
});

test("the chosen Kinnauri comes first, then the other two", () => {
  assert.deepEqual(dialectsInOrder("navaskad"), ["navaskad", "hamskad", "pahari"]);
  assert.deepEqual(dialectsInOrder("pahari"), ["pahari", "hamskad", "navaskad"]);
  assert.deepEqual(dialectsInOrder(null), ["hamskad", "navaskad", "pahari"]);
});

test("Practise this topic leads to flashcards on the word's topic", () => {
  assert.equal(practiseHash("nature"), "#/play/flashcards?topic=nature");
  assert.equal(practiseHash("a b"), "#/play/flashcards?topic=a%20b");
});

test("a word page shows the English and Hindi words", async () => {
  const el = await show("cloud");
  assert.equal(findByClass(el, "word-en")[0].textContent, "Cloud");
  assert.equal(findByClass(el, "word-hi")[0].textContent, "बादल");
});

test("a word page shows all three Kinnauri words with their names", async () => {
  const el = await show("cloud", { dialect: "navaskad", lang: "en" });
  const rows = findByClass(el, "word-dialect");
  assert.equal(rows.length, 3);
  const names = rows.map((row) => findByClass(row, "word-dialect-name")[0].textContent);
  const texts = rows.map((row) => findByClass(row, "word-dialect-text")[0].textContent);
  assert.deepEqual(names, ["Navaskad", "Hamskad", "Pahari Kinnauri"]);
  assert.deepEqual(texts, ["मुहवा / टिन", "जू", "जानरी/जू"]);
  assert.ok(rows[0].className.includes("chosen"), "the chosen Kinnauri is marked");
});

test("a Kinnauri the sheet leaves empty shows not recorded yet", async () => {
  const el = await show("ant");
  const rows = findByClass(el, "word-dialect");
  const texts = rows.map((row) => findByClass(row, "word-dialect-text")[0].textContent);
  assert.deepEqual(texts, ["<b>रिंगमा</b>", "not recorded yet", "not recorded yet"]);
  assert.equal(findByClass(el, "word-hi")[0].textContent, "not recorded yet");
});

test("the sheet's text is shown as text, never as markup", async () => {
  const el = await show("ant");
  const text = findByClass(el, "word-dialect-text")[0];
  assert.equal(text.children.length, 0);
  assert.equal(text.ownText, "<b>रिंगमा</b>");
});

test("the page shows the topic in the chosen language and links to practise it", async () => {
  const el = await show("cloud");
  assert.match(findByClass(el, "word-topic")[0].textContent, /Nature/);
  const practise = findByClass(el, "word-practise")[0];
  assert.equal(practise.textContent, "Practise this topic");
  assert.equal(practise.getAttribute("href"), "#/play/flashcards?topic=nature");

  setLang("hi");
  const hindi = await show("cloud", { dialect: "pahari", lang: "hi" });
  assert.match(findByClass(hindi, "word-topic")[0].textContent, /प्रकृति/);
});

test("without the topics file the topic id still shows", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  const el = await show("cloud");
  assert.match(findByClass(el, "word-topic")[0].textContent, /nature/);
});

test("an unknown id shows a friendly not-found with a link to the word list", async () => {
  const el = await show("no-such-word");
  assert.equal(findByClass(el, "word-dialect").length, 0);
  const back = findByClass(el, "word-missing-back")[0];
  assert.equal(back.getAttribute("href"), "#/words");
  assert.equal(back.textContent, "See all words");
  assert.match(el.textContent, /We don't have that word/);
});

test("every word-page string has a Hindi version", async () => {
  const { default: strings } = await import("../src/i18n/word.js");
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
});
