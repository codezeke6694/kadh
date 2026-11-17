import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import renderWelcome from "../src/screens/welcome.js";
import renderSettings from "../src/screens/settings.js";
import { mountShell } from "../src/app.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { getSettings, setSettings, recordAnswer, recordGame, getStats, resetProgress } from "../src/data/progress.js";

const TODAY = "2026-11-17";

// A small stand-in for the browser's document: only what the screens use.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.ownText = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
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
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  click() {
    if (this.disabled) return;
    for (const fn of this.listeners.click || []) fn({ preventDefault() {} });
  }
  focus() {}
}

function makeDocument() {
  const doc = { createElement: (tagName) => new FakeElement(tagName, doc) };
  return doc;
}

function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

function findByClass(root, className) {
  return allElements(root).filter((el) => el.className.split(" ").includes(className));
}

function findOne(root, className) {
  const [found] = findByClass(root, className);
  assert.ok(found, `no .${className} on screen`);
  return found;
}

function option(root, dialect) {
  return findByClass(root, "dialect-option").find((el) => el.getAttribute("data-dialect") === dialect);
}

function useStorage() {
  const items = new Map();
  const storage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}

const WATER = {
  id: "water",
  en: "Water",
  hi: "पानी",
  dialects: {
    hamskad: { text: "ती", forms: ["ती"] },
    navaskad: { text: "छू", forms: ["छू"] },
    pahari: { text: "पानि", forms: ["पानि"] },
  },
  topic: "nature",
};
const AIR = {
  id: "air",
  en: "Air",
  hi: "वायु",
  dialects: { hamskad: { text: "लान", forms: ["लान"] }, pahari: { text: "ताअरें / भागुर", forms: ["ताअरें", "भागुर"] } },
  topic: "nature",
};

function makeScreen(render, extra = {}) {
  const el = makeDocument().createElement("main");
  const visited = [];
  const languages = [];
  const ctx = {
    words: [AIR, WATER],
    settings: getSettings(),
    t,
    go: (hash) => visited.push(hash),
    params: {},
    switchLang: (code) => languages.push(code),
    ...extra,
  };
  const cleanup = render(el, ctx);
  return { el, visited, languages, cleanup };
}

// Leaves one in-memory copy behind, so every test starts from empty saved progress.
beforeEach(async () => {
  useStorage();
  resetProgress();
  setSettings({ lang: "en" });
  setLang("en");
  await loadStrings();
});

test("the welcome screen offers Hamskad, Navaskad and Pahari Kinnauri", () => {
  const { el } = makeScreen(renderWelcome);
  const names = findByClass(el, "dialect-option").map((button) => button.getAttribute("data-dialect"));
  assert.deepEqual(names.sort(), ["hamskad", "navaskad", "pahari"]);
  const text = el.textContent;
  for (const name of ["Hamskad", "Navaskad", "Pahari Kinnauri"]) assert.match(text, new RegExp(name));
});

test("each Kinnauri on the welcome screen shows its word for an example", () => {
  const { el } = makeScreen(renderWelcome);
  assert.match(option(el, "hamskad").textContent, /ती/);
  assert.match(option(el, "navaskad").textContent, /छू/);
  assert.match(option(el, "pahari").textContent, /पानि/);
  assert.match(el.textContent, /Water/);
});

test("with no word in all three, the choices still show, without an example", () => {
  const { el } = makeScreen(renderWelcome, { words: [AIR] });
  assert.equal(findByClass(el, "dialect-option").length, 3);
  assert.equal(findByClass(el, "dialect-example").length, 0);
});

test("Start learning waits for a choice", () => {
  const { el, visited } = makeScreen(renderWelcome);
  findOne(el, "start-button").click();
  assert.deepEqual(visited, []);
  assert.equal(getSettings().dialect, null);
});

test("after choosing on the welcome screen the learner lands on home", () => {
  const { el, visited } = makeScreen(renderWelcome);
  option(el, "navaskad").click();
  assert.equal(option(el, "navaskad").getAttribute("aria-checked"), "true");
  assert.equal(option(el, "hamskad").getAttribute("aria-checked"), "false");
  findOne(el, "start-button").click();
  assert.equal(getSettings().dialect, "navaskad");
  assert.deepEqual(visited, ["#/"]);
});

test("the settings screen changes the Kinnauri", () => {
  setSettings({ dialect: "pahari" });
  const { el } = makeScreen(renderSettings);
  assert.equal(option(el, "pahari").getAttribute("aria-checked"), "true");
  option(el, "hamskad").click();
  assert.equal(getSettings().dialect, "hamskad");
  assert.equal(option(el, "hamskad").getAttribute("aria-checked"), "true");
  assert.equal(option(el, "pahari").getAttribute("aria-checked"), "false");
});

test("the settings screen changes the language", () => {
  setSettings({ dialect: "pahari" });
  const { el, languages } = makeScreen(renderSettings);
  const hindi = findByClass(el, "lang-choice").find((b) => b.getAttribute("data-lang") === "hi");
  hindi.click();
  assert.deepEqual(languages, ["hi"]);
});

test("the shell's language switch, handed to screens, saves and relabels", () => {
  const doc = makeDocument();
  const root = doc.createElement("div");
  const changed = [];
  const shell = mountShell(doc, root, { onLanguageChange: (code) => changed.push(code) });
  shell.switchLang("hi");
  assert.equal(getSettings().lang, "hi");
  assert.deepEqual(changed, ["hi"]);
  assert.match(findOne(root, "brand-tagline").textContent, /किन्नौरी/);
});

test('"Reset my progress" asks the learner to confirm', () => {
  setSettings({ dialect: "pahari" });
  recordAnswer("water", true, TODAY);
  const { el } = makeScreen(renderSettings);
  const confirm = findOne(el, "reset-confirm");
  assert.equal(confirm.hidden, true);
  findOne(el, "reset-button").click();
  assert.equal(confirm.hidden, false);
  assert.equal(getStats(TODAY).streak, 1, "nothing is cleared before the learner confirms");
  findOne(el, "reset-cancel").click();
  assert.equal(confirm.hidden, true);
  assert.equal(getStats(TODAY).streak, 1);
});

test("after confirming, the progress is cleared", () => {
  setSettings({ dialect: "pahari", lang: "en" });
  for (let i = 0; i < 4; i += 1) recordAnswer("water", true, TODAY);
  recordGame("flashcards", 9, TODAY);
  assert.equal(getStats(TODAY).learned, 1);
  const { el } = makeScreen(renderSettings);
  findOne(el, "reset-button").click();
  findOne(el, "reset-yes").click();
  assert.deepEqual(getStats(TODAY), { learned: 0, streak: 0, best: {} });
  assert.deepEqual(getSettings(), { dialect: "pahari", lang: "en" }, "the choices stay");
  assert.equal(findOne(el, "reset-confirm").hidden, true);
  assert.match(findOne(el, "reset-done").textContent, /\S/);
});

test("resetProgress clears saved progress across a reload too", () => {
  recordAnswer("water", true, TODAY);
  resetProgress();
  const saved = JSON.parse(globalThis.localStorage.getItem("kadh.v1"));
  assert.deepEqual(saved.words, {});
  assert.deepEqual(saved.best, {});
  assert.equal(saved.streak.days, 0);
});

test("every settings and welcome word has English and Hindi", async () => {
  const { default: strings } = await import("../src/i18n/settings.js");
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
  for (const value of [...Object.values(strings.en), ...Object.values(strings.hi)]) assert.ok(value.trim());
});

test("the settings screen reads in Hindi when Hindi is chosen", () => {
  setSettings({ dialect: "pahari", lang: "hi" });
  setLang("hi");
  const { el } = makeScreen(renderSettings);
  assert.match(el.textContent, /प्रगति/);
});
