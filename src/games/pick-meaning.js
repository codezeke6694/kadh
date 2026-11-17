// Pick the meaning (docs/joins.md J3): a Kinnauri word and four meanings to choose from;
// every few questions the other way round, a meaning and four Kinnauri words.

export const ROUND_LENGTH = 10;
export const CHOICE_COUNT = 4;
export const REVERSE_EVERY = 3;
const WRONG_COUNT = CHOICE_COUNT - 1;
// Skipped words (too few different choices) get retries; this bounds them.
const TRIES_PER_QUESTION = 5;
const CHEER_KEYS = ["pick.cheer1", "pick.cheer2", "pick.cheer3"];

export function meaningOf(word, lang) {
  return word[lang] || word.en;
}

function formsOf(word, dialect) {
  return word.dialects[dialect]?.forms ?? [];
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Another sheet word with the same meaning or a shared Kinnauri form would be a second right answer.
function isAlsoRight(other, asked, { dialect, lang }) {
  if (meaningOf(other, lang) === meaningOf(asked, lang)) return true;
  const askedForms = formsOf(asked, dialect);
  return formsOf(other, dialect).some((form) => askedForms.includes(form));
}

// Wrong choices from the asked word's topic first, then from the rest; every shown text different,
// and never the text of a word that is also right (two sheet words can share a meaning).
function pickWrongTexts(asked, words, options) {
  const { rng, textOf } = options;
  const alsoRight = words.filter((w) => w === asked || isAlsoRight(w, asked, options));
  const taken = new Set(alsoRight.map(textOf));
  const others = shuffle(words.filter((w) => !alsoRight.includes(w)), rng);
  const ordered = [...others.filter((w) => w.topic === asked.topic), ...others.filter((w) => w.topic !== asked.topic)];
  const wrongTexts = [];
  for (const other of ordered) {
    if (wrongTexts.length === WRONG_COUNT) break;
    if (taken.has(textOf(other))) continue;
    taken.add(textOf(other));
    wrongTexts.push(textOf(other));
  }
  return wrongTexts;
}

function makeQuestion(asked, words, reverse, options) {
  const { dialect, lang, rng } = options;
  const kinnauri = (w) => formsOf(w, dialect)[0];
  const meaning = (w) => meaningOf(w, lang);
  const textOf = reverse ? kinnauri : meaning;
  const rightText = textOf(asked);
  const wrongTexts = pickWrongTexts(asked, words, { ...options, textOf });
  if (wrongTexts.length < WRONG_COUNT) return null;
  const choices = shuffle([rightText, ...wrongTexts], rng);
  const prompt = reverse ? meaning(asked) : kinnauri(asked);
  return { wordId: asked.id, prompt, reverse, choices, answer: choices.indexOf(rightText) };
}

// The questions of one round: words in a shuffled order (again when used up), never the same twice in a row.
export function makeRound(words, { dialect, lang, n = ROUND_LENGTH, rng = Math.random }) {
  const usable = words.filter((w) => formsOf(w, dialect).length > 0);
  const questions = [];
  let order = [];
  for (let tries = 0; usable.length && questions.length < n && tries < n * TRIES_PER_QUESTION; tries += 1) {
    if (!order.length) order = shuffle(usable, rng);
    const asked = order.pop();
    if (asked.id === questions.at(-1)?.wordId) continue;
    const reverse = questions.length % REVERSE_EVERY === REVERSE_EVERY - 1;
    const question = makeQuestion(asked, usable, reverse, { dialect, lang, rng });
    if (question) questions.push(question);
  }
  return questions;
}

function make(doc, tag, className = "", text = "") {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function makeButton(doc, className, text, onClick) {
  const button = make(doc, "button", className, text);
  button.setAttribute("type", "button");
  button.addEventListener("click", onClick);
  return button;
}

function mount(el, { words, dialect, lang, t, onAnswer, onFinish }) {
  const doc = el.ownerDocument;
  const root = make(doc, "section", "pick-meaning");
  el.replaceChildren(root);
  const game = { doc, root, t, onAnswer, onFinish, questions: makeRound(words, { dialect, lang }), index: 0, score: 0, results: [] };
  if (!game.questions.length) {
    root.append(make(doc, "p", "pm-empty card", t("pick.notEnough")));
    return () => root.remove();
  }
  root.addEventListener("keydown", (event) => pickByKey(game, event));
  showQuestion(game);
  return () => root.remove();
}

function pickByKey(game, event) {
  const index = Number(event.key) - 1;
  const button = game.buttons?.[index];
  if (!button) return;
  event.preventDefault();
  button.click();
}

function makeTrail(game) {
  const { doc, questions, index, results, t } = game;
  const trail = make(doc, "ol", "pm-trail");
  trail.setAttribute("aria-label", `${t("pick.question")} ${index + 1} / ${questions.length}`);
  questions.forEach((_, i) => {
    const state = i < results.length ? (results[i] ? " pm-dot-right" : " pm-dot-wrong") : i === index ? " pm-dot-now" : "";
    trail.append(make(doc, "li", `pm-dot${state}`));
  });
  return trail;
}

function showQuestion(game) {
  const { doc, root, t } = game;
  const question = game.questions[game.index];
  const card = make(doc, "div", `pm-card card${question.reverse ? " pm-reverse" : ""}`);
  const ask = make(doc, "p", "pm-ask muted", t(question.reverse ? "pick.askKinnauri" : "pick.askMeaning"));
  card.append(ask, make(doc, "p", "pm-prompt kinnauri", question.prompt));
  const grid = make(doc, "div", "pm-choices");
  game.answered = false;
  game.buttons = question.choices.map((text, i) => {
    const button = makeButton(doc, "pm-choice", "", () => choose(game, i));
    button.setAttribute("data-right", String(i === question.answer));
    const key = make(doc, "span", "pm-key", String(i + 1));
    key.setAttribute("aria-hidden", "true");
    button.append(key, make(doc, "span", "pm-choice-text", text));
    return button;
  });
  grid.append(...game.buttons);
  game.feedback = make(doc, "div", "pm-feedback");
  game.feedback.setAttribute("aria-live", "polite");
  root.replaceChildren(makeTrail(game), card, grid, game.feedback);
  game.buttons[0].focus?.({ preventScroll: true });
}

function choose(game, picked) {
  if (game.answered) return;
  game.answered = true;
  const question = game.questions[game.index];
  const correct = picked === question.answer;
  if (correct) game.score += 1;
  game.results.push(correct);
  game.onAnswer(question.wordId, correct);
  markChoices(game, picked, question.answer);
  showFeedback(game, correct, question.choices[question.answer]);
}

function markChoices(game, picked, answer) {
  game.buttons.forEach((button, i) => {
    button.setAttribute("aria-disabled", "true");
    if (i === answer) button.className += " right";
    else if (i === picked) button.className += " wrong";
    else button.className += " pm-faded";
  });
}

function showFeedback(game, correct, rightText) {
  const { doc, t } = game;
  const last = game.index === game.questions.length - 1;
  const message = correct
    ? make(doc, "p", "pm-cheer", t(CHEER_KEYS[game.score % CHEER_KEYS.length]))
    : make(doc, "p", "pm-miss", `${t("pick.wrong")} ${rightText}`);
  const next = makeButton(doc, "button pm-next", t(last ? "pick.finish" : "pick.next"), () => goNext(game));
  game.feedback.replaceChildren(message, next);
  next.focus?.({ preventScroll: true });
}

function goNext(game) {
  if (game.index === game.questions.length - 1) {
    game.onFinish({ score: game.score, total: game.questions.length });
    return;
  }
  game.index += 1;
  showQuestion(game);
}

export default {
  id: "pick-meaning",
  title: { en: "Pick the meaning", hi: "सही अर्थ चुनें" },
  blurb: { en: "See a Kinnauri word and pick what it means from four.", hi: "किन्नौरी शब्द देखें और चार में से उसका अर्थ चुनें।" },
  icon: "🎯",
  minWords: CHOICE_COUNT,
  mount,
};
