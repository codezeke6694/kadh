// On-screen text in English or Hindi (docs/joins.md J4). Each part keeps its own strings
// in src/i18n/<part>.js as { en: {...}, hi: {...} }, so parallel parts never share a file.

export const LANGS = ["en", "hi"];
const FALLBACK_LANG = "en";

// Every part that may add strings; a part not built yet is skipped.
const PARTS = [
  "shell", "settings", "kit", "home", "words", "word", "progress", "about",
  "flashcards", "pick-meaning", "match-pairs", "memory-flip", "word-builder", "true-false",
];

const strings = { en: {}, hi: {} };
let lang = FALLBACK_LANG;

export function setLang(next) {
  if (!LANGS.includes(next)) throw new RangeError(`unknown language: ${next}`);
  lang = next;
}

export function getLang() {
  return lang;
}

// Missing in the chosen language: English; missing there too: the key, so a gap shows plainly.
export function t(key) {
  return strings[lang][key] ?? strings[FALLBACK_LANG][key] ?? key;
}

export async function loadStrings(parts = PARTS) {
  const urls = parts.map((part) => new URL(`./i18n/${part}.js`, import.meta.url).href);
  const loaded = await Promise.allSettled(urls.map(importIfThere));
  loaded.forEach((result, index) => {
    if (result.status === "rejected") console.warn(`strings of ${parts[index]} not loaded:`, result.reason);
    else if (result.value) addStrings(result.value.default);
  });
}

function addStrings(part = {}) {
  for (const code of LANGS) Object.assign(strings[code], part[code]);
}

// A module of a part not built yet gives null; a module that is there but broken still throws.
export async function importIfThere(url) {
  try {
    return await import(url);
  } catch (error) {
    if (isMissingModule(error, url)) return null;
    throw error;
  }
}

// Only the module's own file missing counts: a module that is there but throws a TypeError, or
// that imports a missing file, is broken. Node names the missing file in error.url; browsers say
// the fetch of the module failed (a TypeError) with its address in the message.
export function isMissingModule(error, url) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return error.url === url;
  return error instanceof TypeError && error.message.endsWith(url);
}
