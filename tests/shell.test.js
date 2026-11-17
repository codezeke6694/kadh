import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseRoute, routeFor, mountShell, renderNotFound, ROUTE } from "../src/app.js";
import { t, setLang, getLang, loadStrings } from "../src/i18n.js";
import { getSettings, setSettings } from "../src/data/progress.js";

// A small stand-in for the browser's document: only what the shell uses.
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
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
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  click() {
    for (const fn of this.listeners.click || []) fn({ preventDefault() {} });
  }
}

const fakeDocument = { createElement: (tagName) => new FakeElement(tagName) };

function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

function findByClass(root, className) {
  return allElements(root).filter((el) => el.className.split(" ").includes(className));
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

beforeEach(async () => {
  useStorage();
  setSettings({ lang: "en" });
  setLang("en");
  await loadStrings();
});

test("the routes of J4 are read from the hash", () => {
  assert.deepEqual(parseRoute(""), { name: ROUTE.home, params: {} });
  assert.deepEqual(parseRoute("#/"), { name: ROUTE.home, params: {} });
  assert.deepEqual(parseRoute("#/welcome"), { name: ROUTE.welcome, params: {} });
  assert.deepEqual(parseRoute("#/words"), { name: ROUTE.words, params: {} });
  assert.deepEqual(parseRoute("#/word/cloud"), { name: ROUTE.word, params: { id: "cloud" } });
  assert.deepEqual(parseRoute("#/play/flashcards"), { name: ROUTE.play, params: { gameId: "flashcards" } });
  assert.deepEqual(parseRoute("#/progress"), { name: ROUTE.progress, params: {} });
  assert.deepEqual(parseRoute("#/settings"), { name: ROUTE.settings, params: {} });
  assert.deepEqual(parseRoute("#/about"), { name: ROUTE.about, params: {} });
});

test("a word id written in the address is decoded", () => {
  assert.deepEqual(parseRoute("#/word/thank-you%3F"), { name: ROUTE.word, params: { id: "thank-you?" } });
});

test("the Play tab with no game opens home, where the games are", () => {
  assert.equal(parseRoute("#/play").name, ROUTE.home);
});

test("an unknown, malformed or too long route is not found", () => {
  for (const hash of ["#/nowhere", "#/word", "#/word/", "#/words/extra", "#/word/%E0%A4", "#/play/a/b", "nonsense"]) {
    assert.equal(parseRoute(hash).name, ROUTE.notFound, hash);
  }
});

test("a first visit with no Kinnauri chosen opens the welcome route", () => {
  const firstVisit = { dialect: null, lang: "en" };
  assert.equal(routeFor("", firstVisit).name, ROUTE.welcome);
  assert.equal(routeFor("#/words", firstVisit).name, ROUTE.welcome);
  assert.equal(routeFor("#/welcome", firstVisit).name, ROUTE.welcome);
});

test("once a Kinnauri is chosen the asked route opens", () => {
  const chosen = { dialect: "pahari", lang: "en" };
  assert.equal(routeFor("", chosen).name, ROUTE.home);
  assert.equal(routeFor("#/words", chosen).name, ROUTE.words);
  assert.equal(routeFor("#/welcome", chosen).name, ROUTE.welcome);
});

test("t() gives the text in the chosen language", () => {
  assert.equal(t("shell.home"), "Home");
  setLang("hi");
  assert.equal(getLang(), "hi");
  assert.equal(t("shell.home"), "होम");
});

test("t() falls back to English, then to the key itself", () => {
  setLang("hi");
  assert.equal(t("no.such.key"), "no.such.key");
});

test("an unknown language is refused", () => {
  assert.throws(() => setLang("fr"), RangeError);
  assert.equal(getLang(), "en");
});

test("a part whose strings file is not there yet is harmless", async () => {
  await assert.doesNotReject(loadStrings(["shell", "not-built-yet"]));
  assert.equal(t("shell.words"), "Words");
});

test("the header shows the app name and the bottom bar its four tabs", () => {
  const root = new FakeElement("div");
  mountShell(fakeDocument, root, { onLanguageChange() {} });
  assert.equal(findByClass(root, "brand-name")[0].textContent, "Kadh");
  const tabs = findByClass(root, "tab");
  assert.deepEqual(tabs.map((tab) => tab.textContent), ["Home", "Words", "Play", "Progress"]);
  assert.deepEqual(tabs.map((tab) => tab.getAttribute("href")), ["#/", "#/words", "#/play", "#/progress"]);
});

test("the header's language switch changes the buttons between English and Hindi", () => {
  const root = new FakeElement("div");
  let changes = 0;
  mountShell(fakeDocument, root, { onLanguageChange: () => (changes += 1) });
  const [english, hindi] = findByClass(root, "lang-option");
  assert.equal(english.getAttribute("aria-pressed"), "true");

  hindi.click();
  assert.deepEqual(findByClass(root, "tab").map((tab) => tab.textContent), ["होम", "शब्द", "खेलें", "प्रगति"]);
  assert.equal(hindi.getAttribute("aria-pressed"), "true");
  assert.equal(english.getAttribute("aria-pressed"), "false");
  assert.equal(getSettings().lang, "hi");
  assert.equal(changes, 1);

  english.click();
  assert.deepEqual(findByClass(root, "tab").map((tab) => tab.textContent), ["Home", "Words", "Play", "Progress"]);
  assert.equal(getSettings().lang, "en");
});

test("the shell marks the tab of the open route", () => {
  const root = new FakeElement("div");
  const shell = mountShell(fakeDocument, root, { onLanguageChange() {} });
  shell.markTab(ROUTE.words);
  const current = findByClass(root, "tab").filter((tab) => tab.getAttribute("aria-current") === "page");
  assert.deepEqual(current.map((tab) => tab.textContent), ["Words"]);
});

test("an unknown route shows a friendly not found with a way home", () => {
  const view = new FakeElement("main");
  renderNotFound(fakeDocument, view);
  assert.match(view.textContent, /can't find that page/);
  const home = allElements(view).find((el) => el.tagName === "A");
  assert.equal(home.getAttribute("href"), "#/");
  assert.equal(home.textContent, "Go home");
});

test("index.html links base.css and every per-part stylesheet of J4", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const sheet of ["base", "settings", "kit", "home", "words", "word", "progress", "about"]) {
    assert.match(html, new RegExp(`href="styles/${sheet}\\.css"`), sheet);
  }
  assert.match(html, /<script type="module" src="src\/app\.js"><\/script>/);
});
