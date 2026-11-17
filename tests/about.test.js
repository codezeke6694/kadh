import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import render from "../src/screens/about.js";
import strings from "../src/i18n/about.js";
import { t, setLang, loadStrings } from "../src/i18n.js";

// A small stand-in for the browser's document: only what the about page uses.
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
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
    return this.ownText + this.children.map((child) => child.textContent).join(" ");
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  set innerHTML(_html) {
    throw new Error("the about page writes text only through textContent");
  }
}

function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

function renderAbout() {
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
  const view = new FakeElement("main");
  render(view, { words: [], settings: { dialect: "pahari", lang: "en" }, t, go() {}, params: {} });
  return view;
}

beforeEach(async () => {
  setLang("en");
  await loadStrings(["about"]);
});

test("the about page names the three Kinnauri", () => {
  const text = renderAbout().textContent;
  for (const name of ["Hamskad", "Navaskad", "Pahari Kinnauri"]) assert.match(text, new RegExp(name));
});

test("in Hindi the about page names the three Kinnauri in Devanagari", () => {
  setLang("hi");
  const text = renderAbout().textContent;
  for (const name of ["हमस्कद", "नवस्कद", "पहाड़ी किन्नौरी"]) assert.match(text, new RegExp(name));
});

test("the about page says what Kadh is, where Kinnauri is spoken and where the words come from", () => {
  const text = renderAbout().textContent;
  assert.match(text, /Kinnaur district/);
  assert.match(text, /Himachal Pradesh/);
  assert.match(text, /community dictionary/);
});

test("the page has one heading and a section for each of the three Kinnauri", () => {
  const elements = allElements(renderAbout());
  assert.equal(elements.filter((el) => el.tagName === "H1").length, 1);
  assert.equal(elements.filter((el) => el.className.split(" ").includes("about-dialect")).length, 3);
});

test("every English string has a Hindi one and no string is empty", () => {
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
  for (const code of ["en", "hi"]) {
    for (const [key, value] of Object.entries(strings[code])) assert.ok(value.trim(), `${code} ${key}`);
  }
});
