// The word page (#/word/<id>): English, Hindi, the three Kinnauri (the chosen one first), the topic.
import { DIALECT_COLUMNS } from "../data/words.js";

const DIALECTS = Object.keys(DIALECT_COLUMNS);
const PRACTISE_GAME = "flashcards";
const WORDS_HASH = "#/words";
const TOPICS_URL = new URL("../../data/topics.json", import.meta.url);

export function findWord(words, id) {
  return words.find((word) => word.id === id) ?? null;
}

export function dialectsInOrder(chosen) {
  if (!DIALECTS.includes(chosen)) return DIALECTS;
  return [chosen, ...DIALECTS.filter((dialect) => dialect !== chosen)];
}

export function practiseHash(topicId) {
  return `#/play/${PRACTISE_GAME}?topic=${encodeURIComponent(topicId)}`;
}

// The topic's name and icon are a nicety: offline or broken, the page shows the topic id.
async function loadTopic(topicId) {
  try {
    const response = await fetch(TOPICS_URL);
    if (!response.ok) throw new Error(`${TOPICS_URL}: ${response.status} ${response.statusText}`);
    const { topics = [] } = await response.json();
    return topics.find((topic) => topic.id === topicId) ?? null;
  } catch (error) {
    console.warn("topic names not loaded:", error);
    return null;
  }
}

function make(doc, tag, className, text) {
  const el = doc.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// An empty cell reads "not recorded yet" in the page's language, not as Devanagari.
function makeWordText(doc, className, text, t) {
  if (text) return make(doc, "p", `${className} kinnauri`, text);
  return make(doc, "p", `${className} word-empty muted`, t("word.notRecorded"));
}

function makeHeading(doc, word, t) {
  const head = make(doc, "header", "word-head");
  const english = make(doc, "h1", "word-en", word.en);
  english.setAttribute("lang", "en");
  const hindi = makeWordText(doc, "word-hi", word.hi, t);
  if (word.hi) hindi.setAttribute("lang", "hi");
  head.append(english, hindi);
  return head;
}

function makeDialectRow(doc, word, dialect, chosen, t) {
  const row = make(doc, "li", dialect === chosen ? "word-dialect chosen" : "word-dialect");
  const name = make(doc, "p", "word-dialect-name", t(`word.dialect.${dialect}`));
  row.append(name, makeWordText(doc, "word-dialect-text", word.dialects[dialect]?.text ?? "", t));
  if (dialect === chosen) row.append(make(doc, "p", "word-yours", t("word.yours")));
  return row;
}

function makeDialects(doc, word, chosen, t) {
  const section = make(doc, "section", "word-kinnauri");
  section.setAttribute("aria-label", t("word.kinnauriLabel"));
  const list = make(doc, "ul", "word-dialects");
  list.append(...dialectsInOrder(chosen).map((dialect) => makeDialectRow(doc, word, dialect, chosen, t)));
  section.append(list);
  return section;
}

function makeTopic(doc, word, topic, lang, t) {
  const foot = make(doc, "footer", "word-foot");
  const label = make(doc, "p", "word-topic");
  const name = topic ? `${topic.icon} ${topic[lang] ?? topic.en}` : word.topic;
  label.append(make(doc, "span", "muted", `${t("word.topic")}: `), make(doc, "span", "word-topic-name", name));
  const practise = make(doc, "a", "button word-practise", t("word.practise"));
  practise.setAttribute("href", practiseHash(word.topic));
  foot.append(label, practise);
  return foot;
}

function renderMissing(doc, el, t) {
  const card = make(doc, "section", "notice card word-missing");
  const back = make(doc, "a", "button word-missing-back", t("word.allWords"));
  back.setAttribute("href", WORDS_HASH);
  card.append(make(doc, "h1", "", t("word.missingTitle")), make(doc, "p", "", t("word.missingText")), back);
  el.replaceChildren(card);
}

export default async function render(el, { words, settings, t, params }) {
  const doc = el.ownerDocument;
  const word = findWord(words, params.id);
  if (!word) return renderMissing(doc, el, t);
  const topic = await loadTopic(word.topic);
  const page = make(doc, "article", "word-page");
  page.append(makeHeading(doc, word, t), makeDialects(doc, word, settings.dialect, t), makeTopic(doc, word, topic, settings.lang, t));
  el.replaceChildren(page);
}
