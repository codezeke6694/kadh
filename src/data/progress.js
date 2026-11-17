// Progress and settings, kept in the learner's browser only (docs/joins.md J2).

const STORAGE_KEY = "kadh.v1";
const DIALECTS = ["pahari", "hamskad", "navaskad"];
const LANGS = ["en", "hi"];
const DEFAULT_LANG = "en";
const FIRST_BOX = 1;
const LAST_BOX = 5;
const LEARNED_BOX = 4;
// Days until a word in each box comes back: box 1 at once, then doubling.
const DAYS_UNTIL_DUE = { 1: 0, 2: 2, 3: 4, 4: 8, 5: 16 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// When storage is blocked, the progress lives here for as long as the page is open.
let memoryState = null;

// Word and game ids are keys of maps with no prototype, so an id such as "__proto__"
// is stored as an ordinary key and never reaches Object.prototype.
function toIdMap(entries = {}) {
  return Object.assign(Object.create(null), entries);
}

function emptyState() {
  return { dialect: null, lang: DEFAULT_LANG, words: toIdMap(), streak: { days: 0, last: null }, best: toIdMap() };
}

function readStoredText() {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Browsers throw different errors (SecurityError, a missing localStorage); all mean "no storage".
    return null;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Saved text is only trusted part by part: a damaged part falls back to its empty value.
function parseState(text) {
  try {
    const saved = JSON.parse(text);
    if (!isRecord(saved)) return emptyState();
    const state = emptyState();
    if (DIALECTS.includes(saved.dialect)) state.dialect = saved.dialect;
    if (LANGS.includes(saved.lang)) state.lang = saved.lang;
    if (isRecord(saved.words)) state.words = toIdMap(saved.words);
    if (isRecord(saved.streak)) state.streak = saved.streak;
    if (isRecord(saved.best)) state.best = toIdMap(saved.best);
    return state;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return emptyState();
}

function loadState() {
  if (memoryState) return memoryState;
  const text = readStoredText();
  return text === null ? emptyState() : parseState(text);
}

function saveState(state) {
  memoryState = state;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Blocked or full storage: the progress stays in memory for this visit.
  }
}

function checkDate(day) {
  if (typeof day !== "string" || !DATE_PATTERN.test(day) || Number.isNaN(Date.parse(day))) {
    throw new RangeError(`not a YYYY-MM-DD date: ${day}`);
  }
}

function addDays(day, count) {
  return new Date(Date.parse(day) + count * DAY_MS).toISOString().slice(0, 10);
}

function checkChoice(value, allowed, name) {
  if (value !== undefined && !allowed.includes(value)) {
    throw new RangeError(`unknown ${name}: ${value}`);
  }
}

function updateStreak(streak, today) {
  if (streak.last === today) return streak;
  const days = streak.last === addDays(today, -1) ? streak.days + 1 : 1;
  return { days, last: today };
}

export function getSettings() {
  const { dialect, lang } = loadState();
  return { dialect, lang };
}

export function setSettings({ dialect, lang } = {}) {
  checkChoice(dialect, DIALECTS, "Kinnauri");
  checkChoice(lang, LANGS, "language");
  const state = loadState();
  if (dialect !== undefined) state.dialect = dialect;
  if (lang !== undefined) state.lang = lang;
  saveState(state);
}

export function recordAnswer(wordId, correct, today) {
  checkDate(today);
  const state = loadState();
  const word = state.words[wordId] || { right: 0, wrong: 0, box: FIRST_BOX, due: today };
  if (correct) {
    word.right += 1;
    word.box = Math.min(word.box + 1, LAST_BOX);
  } else {
    word.wrong += 1;
    word.box = FIRST_BOX;
  }
  word.due = addDays(today, DAYS_UNTIL_DUE[word.box]);
  state.words[wordId] = word;
  state.streak = updateStreak(state.streak, today);
  saveState(state);
}

export function recordGame(gameId, score, today) {
  checkDate(today);
  const state = loadState();
  state.best[gameId] = Math.max(state.best[gameId] || 0, score);
  state.streak = updateStreak(state.streak, today);
  saveState(state);
}

export function getStats(today) {
  checkDate(today);
  const { words, streak, best } = loadState();
  const learned = Object.values(words).filter((word) => word.box >= LEARNED_BOX).length;
  const streakAlive = streak.last === today || streak.last === addDays(today, -1);
  return { learned, streak: streakAlive ? streak.days : 0, best: { ...best } };
}

// Only words already met come back for review; dates in YYYY-MM-DD sort as text.
export function dueWords(words, today, n) {
  checkDate(today);
  const progress = loadState().words;
  return words
    .filter((word) => progress[word.id]?.due <= today)
    .sort((a, b) => progress[a.id].due.localeCompare(progress[b.id].due))
    .slice(0, n);
}
