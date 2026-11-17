// The app shell (docs/joins.md J4): header, tabs, the hash router, and the pages it draws itself.
import { loadWords, onWordsUpdated } from "./data/load.js";
import { getSettings, setSettings } from "./data/progress.js";
import { t, setLang, loadStrings, importIfThere, LANGS } from "./i18n.js";

export const ROUTE = Object.freeze({
  home: "home",
  welcome: "welcome",
  words: "words",
  word: "word",
  play: "play",
  progress: "progress",
  settings: "settings",
  about: "about",
  notFound: "not-found",
});

const HOME_HASH = "#/";
const WELCOME_HASH = "#/welcome";

// The first part of the path; `param` names its value, `optional` a second value it may have,
// `bare` is where it goes without a value.
const PATHS = {
  "": { name: ROUTE.home },
  welcome: { name: ROUTE.welcome },
  words: { name: ROUTE.words },
  word: { name: ROUTE.word, param: "id" },
  play: { name: ROUTE.play, param: "gameId", optional: "topic", bare: ROUTE.home },
  progress: { name: ROUTE.progress },
  settings: { name: ROUTE.settings },
  about: { name: ROUTE.about },
};

const SCREEN_MODULES = {
  [ROUTE.home]: "./screens/home.js",
  [ROUTE.welcome]: "./screens/welcome.js",
  [ROUTE.words]: "./screens/words.js",
  [ROUTE.word]: "./screens/word.js",
  [ROUTE.play]: "./games/kit.js",
  [ROUTE.progress]: "./screens/progress.js",
  [ROUTE.settings]: "./screens/settings.js",
  [ROUTE.about]: "./screens/about.js",
};

const TABS = [
  { route: ROUTE.home, href: HOME_HASH, key: "shell.home" },
  { route: ROUTE.words, href: "#/words", key: "shell.words" },
  { route: ROUTE.play, href: "#/play", key: "shell.play" },
  { route: ROUTE.progress, href: "#/progress", key: "shell.progress" },
];

export const LANG_KEYS = { en: "shell.langEn", hi: "shell.langHi" };

function route(name, params = {}) {
  return { name, params };
}

function decodeSegment(text) {
  try {
    return decodeURIComponent(text);
  } catch (error) {
    if (error instanceof URIError) return "";
    throw error;
  }
}

export function parseRoute(hash) {
  const [head, value, extra, ...rest] = hash.replace(/^#\/?/, "").split("/");
  const entry = Object.hasOwn(PATHS, head) ? PATHS[head] : null;
  if (!entry || rest.length || (extra !== undefined && !entry.optional)) return route(ROUTE.notFound);
  if (!entry.param) return value === undefined ? route(entry.name) : route(ROUTE.notFound);
  if (value === undefined) return entry.bare ? route(entry.bare) : route(ROUTE.notFound);
  const params = { [entry.param]: decodeSegment(value) };
  if (extra !== undefined) params[entry.optional] = decodeSegment(extra);
  return Object.values(params).every(Boolean) ? route(entry.name, params) : route(ROUTE.notFound);
}

// Until a Kinnauri is chosen every route leads to the first-visit screen.
export function routeFor(hash, settings) {
  return settings.dialect ? parseRoute(hash) : route(ROUTE.welcome);
}

export function make(doc, tag, className = "", attributes = {}) {
  const el = doc.createElement(tag);
  el.className = className;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function makeLangSwitch(doc, label, switchTo) {
  const group = label(make(doc, "div", "lang-switch", { role: "group" }), "shell.langLabel", "aria-label");
  const buttons = LANGS.map((code) => {
    const button = label(make(doc, "button", "lang-option", { type: "button", lang: code }), LANG_KEYS[code]);
    button.addEventListener("click", () => switchTo(code));
    return button;
  });
  group.append(...buttons);
  return { group, buttons };
}

// Builds the header, the page area and the tab bar; tabs sit in the header on wide screens.
export function mountShell(doc, root, { onLanguageChange }) {
  const labelled = [];
  const label = (el, key, attribute = "") => (labelled.push({ el, key, attribute }), el);
  const relabel = () => {
    for (const { el, key, attribute } of labelled) {
      if (attribute) el.setAttribute(attribute, t(key));
      else el.textContent = t(key);
    }
  };

  const header = make(doc, "header", "topbar");
  const brand = make(doc, "a", "brand", { href: HOME_HASH });
  brand.append(label(make(doc, "span", "brand-name"), "shell.appName"), label(make(doc, "span", "brand-tagline"), "shell.tagline"));
  const settingsLink = label(make(doc, "a", "settings-link", { href: "#/settings" }), "shell.settings");
  const tabs = TABS.map((tab) => label(make(doc, "a", "tab", { href: tab.href, "data-tab": tab.route }), tab.key));
  const nav = label(make(doc, "nav", "tabs"), "shell.tabsLabel", "aria-label");
  nav.append(...tabs);

  const markLang = (code) => langSwitch.buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(LANGS[i] === code)));
  const switchTo = (code) => {
    setSettings({ lang: code });
    setLang(code);
    relabel();
    markLang(code);
    onLanguageChange(code);
  };
  const langSwitch = makeLangSwitch(doc, label, switchTo);
  header.append(brand, nav, langSwitch.group, settingsLink);

  const view = make(doc, "main", "view", { id: "view", tabindex: "-1" });
  const footer = make(doc, "footer", "footer");
  footer.append(label(make(doc, "a", "", { href: "#/about" }), "shell.about"));
  root.replaceChildren(header, view, footer);

  relabel();
  markLang(getSettings().lang);
  return {
    view,
    switchLang: switchTo,
    markTab: (name) => tabs.forEach((tab, i) => tab.setAttribute("aria-current", TABS[i].route === name ? "page" : "false")),
  };
}

// A page the shell draws itself: a title, a line of help, and what to do next.
function renderNotice(doc, el, titleKey, textKey, ...extras) {
  const card = make(doc, "section", "notice card");
  const title = make(doc, "h1");
  title.textContent = t(titleKey);
  const text = make(doc, "p");
  text.textContent = t(textKey);
  card.append(title, text, ...extras);
  el.replaceChildren(card);
}

function makeHomeLink(doc) {
  const link = make(doc, "a", "button", { href: HOME_HASH });
  link.textContent = t("shell.goHome");
  return link;
}

export function renderNotFound(doc, el) {
  renderNotice(doc, el, "shell.notFoundTitle", "shell.notFoundText", makeHomeLink(doc));
}

function renderComingSoon(doc, el) {
  renderNotice(doc, el, "shell.comingSoonTitle", "shell.comingSoonText", makeHomeLink(doc));
}

// The learner sees what failed, in the words of whatever failed.
function renderError(doc, el, error) {
  const detail = make(doc, "p", "notice-detail");
  detail.textContent = String(error?.message ?? error);
  const reload = make(doc, "button", "button", { type: "button" });
  reload.textContent = t("shell.reload");
  reload.addEventListener("click", () => globalThis.location.reload());
  renderNotice(doc, el, "shell.errorTitle", "shell.errorText", detail, reload);
}

async function loadScreen(name) {
  const module = await importIfThere(new URL(SCREEN_MODULES[name], import.meta.url).href);
  return module?.default ?? null;
}

async function start(doc) {
  setLang(getSettings().lang);
  await loadStrings();
  doc.documentElement.lang = getSettings().lang;
  let show = () => {};
  const shell = mountShell(doc, doc.getElementById("app"), {
    onLanguageChange: (code) => {
      doc.documentElement.lang = code;
      show();
    },
  });
  renderNotice(doc, shell.view, "shell.loading", "shell.tagline");

  let words;
  try {
    words = await loadWords();
  } catch (error) {
    renderError(doc, shell.view, error);
    return;
  }
  // A fresher sheet is used from the next screen on, never mid-game.
  onWordsUpdated((fresh) => (words = fresh));
  show = makeRouter(doc, shell, () => words);
  globalThis.addEventListener("hashchange", show);
  show();
}

function makeRouter(doc, shell, getWords) {
  let visits = 0;
  let cleanup = null;
  const go = (hash) => (globalThis.location.hash = hash);
  return async function show() {
    const visit = ++visits;
    const settings = getSettings();
    const { hash } = globalThis.location;
    const current = routeFor(hash, settings);
    if (current.name === ROUTE.welcome && parseRoute(hash).name !== ROUTE.welcome) {
      globalThis.history.replaceState(null, "", WELCOME_HASH);
    }
    shell.markTab(current.name);
    cleanup?.();
    cleanup = null;
    if (current.name === ROUTE.notFound) return renderNotFound(doc, shell.view);
    try {
      const render = await loadScreen(current.name);
      if (visit !== visits) return;
      if (!render) return renderComingSoon(doc, shell.view);
      shell.view.replaceChildren();
      const result = await render(shell.view, {
        words: getWords(), settings, t, go, params: current.params, switchLang: shell.switchLang,
      });
      if (typeof result === "function") cleanup = result;
    } catch (error) {
      console.error(`the ${current.name} screen failed:`, error);
      if (visit === visits) renderError(doc, shell.view, error);
    }
  };
}

if (globalThis.document) start(globalThis.document);
