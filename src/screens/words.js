// The word list (#/words): search across English, Hindi and the three Kinnauri, and topic chips.
export const ALL_TOPICS = "all";
const TOPICS_URL = new URL("../../data/topics.json", import.meta.url);
// Rows drawn at once; the rest come with "Show more", so 10,000 words stay quick to draw.
const PAGE_SIZE = 60;
const WORD_HASH = "#/word/";

function normalize(text) {
  return text.normalize("NFC").trim().toLowerCase();
}

// Each word with one searchable text and the whole terms an exact search ranks first.
export function indexWords(words) {
  return words.map((word) => {
    const dialects = Object.values(word.dialects);
    const terms = [word.en, word.hi, ...dialects.flatMap((dialect) => dialect.forms)].filter(Boolean).map(normalize);
    const text = [word.en, word.hi, ...dialects.map((dialect) => dialect.text)].map(normalize).join("\n");
    return { word, text, terms: new Set(terms) };
  });
}

export function findWords(index, query, topic) {
  const inTopic = topic === ALL_TOPICS ? index : index.filter((entry) => entry.word.topic === topic);
  const wanted = normalize(query);
  if (!wanted) return inTopic.map((entry) => entry.word);
  const exact = [];
  const partial = [];
  for (const entry of inTopic) {
    if (entry.terms.has(wanted)) exact.push(entry.word);
    else if (entry.text.includes(wanted)) partial.push(entry.word);
  }
  return [...exact, ...partial];
}

// Topics only name the chips; without the file the list still works with "All words".
async function loadTopics() {
  try {
    const response = await fetch(TOPICS_URL);
    if (!response.ok) throw new Error(`${TOPICS_URL}: ${response.status} ${response.statusText}`);
    return (await response.json()).topics ?? [];
  } catch (error) {
    console.warn("topics not loaded:", error);
    return [];
  }
}

function make(doc, tag, className = "", text = "") {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function makeRow(doc, word, dialect) {
  const item = make(doc, "li");
  const link = make(doc, "a", "word-row");
  link.href = WORD_HASH + encodeURIComponent(word.id);
  const kinnauri = make(doc, "span", "word-row-kinnauri kinnauri", word.dialects[dialect]?.text || "–");
  kinnauri.lang = "hi";
  const english = make(doc, "span", "word-row-en", word.en);
  const hindi = make(doc, "span", "word-row-hi", word.hi);
  hindi.lang = "hi";
  link.append(english, hindi, kinnauri);
  item.append(link);
  return item;
}

function makeChip(doc, label, topic, isPressed) {
  const chip = make(doc, "button", "chip", label);
  chip.type = "button";
  chip.dataset.topic = topic;
  chip.setAttribute("aria-pressed", String(isPressed));
  return chip;
}

function countText(t, n) {
  return n === 1 ? t("words.countOne") : t("words.countMany").replace("{n}", n.toLocaleString());
}

// Kept while the app is open, so coming back from a word shows the same search.
const remembered = { query: "", topic: ALL_TOPICS };

function buildPage(doc, t) {
  const page = make(doc, "section", "words-page");
  const title = make(doc, "h1", "", t("words.title"));
  const search = make(doc, "label", "words-search");
  const searchLabel = make(doc, "span", "words-search-label", t("words.search"));
  const input = make(doc, "input");
  Object.assign(input, { type: "search", placeholder: t("words.searchHint"), value: remembered.query, autocomplete: "off" });
  input.setAttribute("enterkeyhint", "search");
  search.append(searchLabel, input);
  const chips = make(doc, "div", "words-topics");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", t("words.topicsLabel"));
  const count = make(doc, "p", "words-count muted");
  count.setAttribute("aria-live", "polite");
  const list = make(doc, "ul", "words-list");
  const more = make(doc, "button", "button secondary words-more", t("words.showMore"));
  more.type = "button";
  page.append(title, search, chips, count, list, more);
  return { page, input, chips, count, list, more };
}

export default async function render(el, { words, settings, t }) {
  const doc = el.ownerDocument;
  const index = indexWords(words);
  const parts = buildPage(doc, t);
  el.replaceChildren(parts.page);

  let found = [];
  let shown = 0;
  const showNextPage = () => {
    const next = found.slice(shown, shown + PAGE_SIZE);
    parts.list.append(...next.map((word) => makeRow(doc, word, settings.dialect)));
    shown += next.length;
    parts.more.hidden = shown >= found.length;
  };
  const update = () => {
    found = findWords(index, remembered.query, remembered.topic);
    parts.count.textContent = found.length ? countText(t, found.length) : t("words.none");
    parts.list.replaceChildren();
    shown = 0;
    showNextPage();
  };

  parts.input.addEventListener("input", () => {
    remembered.query = parts.input.value;
    update();
  });
  parts.more.addEventListener("click", showNextPage);
  update();

  const topics = await loadTopics();
  if (!topics.some((topic) => topic.id === remembered.topic)) remembered.topic = ALL_TOPICS;
  const chips = [
    makeChip(doc, t("words.allTopics"), ALL_TOPICS, remembered.topic === ALL_TOPICS),
    ...topics.map((topic) => makeChip(doc, `${topic.icon} ${topic[settings.lang] ?? topic.en}`, topic.id, remembered.topic === topic.id)),
  ];
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      remembered.topic = chip.dataset.topic;
      chips.forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
      update();
    });
  }
  parts.chips.replaceChildren(...chips);
  update();
}
