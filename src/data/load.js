// Loading the words (docs/joins.md J1): the shipped copy or the last live sheet first, then the live sheet.
import { SHEET_CSV_URL } from "../config.js";
import { parseCsv, toWords, MIN_SHEET_WORDS } from "./words.js";

export const SHEET_CACHE_KEY = "kadh.sheet.v1";
const COPY_URL = new URL("../../data/sheet.csv", import.meta.url);
const TOPICS_URL = new URL("../../data/topics.json", import.meta.url);

const listeners = new Set();

export function onWordsUpdated(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadWords() {
  const cached = readCachedSheet();
  const [text, topicsMap] = await Promise.all([cached ?? fetchText(COPY_URL), readTopicsMap()]);
  refreshFromLiveSheet(topicsMap);
  return toWords(parseCsv(text), topicsMap);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

// Topics are optional: without the file every word falls under the unknown topic.
async function readTopicsMap() {
  try {
    const response = await fetch(TOPICS_URL);
    if (!response.ok) return {};
    return (await response.json()).words ?? {};
  } catch (error) {
    console.warn("topics not loaded:", error);
    return {};
  }
}

async function refreshFromLiveSheet(topicsMap) {
  let text;
  try {
    text = await fetchText(SHEET_CSV_URL);
  } catch (error) {
    // Offline or blocked: the copy already shown stays, quietly.
    console.warn("live sheet not reached:", error);
    return;
  }
  const words = toWords(parseCsv(text), topicsMap);
  if (words.length < MIN_SHEET_WORDS) return;
  keepCachedSheet(text);
  for (const fn of listeners) fn(words);
}

// Storage can be blocked (private mode, settings); the app runs without it.
function readCachedSheet() {
  try {
    return globalThis.localStorage?.getItem(SHEET_CACHE_KEY) ?? null;
  } catch {
    return null;
  }
}

function keepCachedSheet(text) {
  try {
    globalThis.localStorage?.setItem(SHEET_CACHE_KEY, text);
  } catch (error) {
    console.warn("live sheet not kept:", error);
  }
}
