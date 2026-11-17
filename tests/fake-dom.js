// A small stand-in for the browser's document, for screen and game tests run by `node --test`.
export class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parent = null;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.ownText = "";
    this.className = "";
  }
  append(...nodes) {
    for (const node of nodes) node.parent = this;
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.ownText = "";
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
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
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((listener) => listener !== fn);
  }
  click() {
    for (const fn of this.listeners.click || []) fn({ preventDefault() {} });
  }
}

export function makeFakeDocument() {
  const doc = { createElement: (tagName) => new FakeElement(tagName, doc), listeners: {} };
  doc.addEventListener = FakeElement.prototype.addEventListener.bind(doc);
  doc.removeEventListener = FakeElement.prototype.removeEventListener.bind(doc);
  doc.head = new FakeElement("head", doc);
  doc.body = new FakeElement("body", doc);
  return doc;
}

export function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

export function findByClass(root, className) {
  return allElements(root).filter((el) => el.className.split(" ").includes(className));
}

// The innermost button or link whose text includes `text`.
export function findButton(root, text) {
  return allElements(root)
    .filter((el) => (el.tagName === "BUTTON" || el.tagName === "A") && el.textContent.includes(text))
    .at(-1);
}

export function useFakeStorage() {
  const items = new Map();
  const storage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  return storage;
}
