// Word builder (docs/joins.md J3): the meaning is shown, the Kinnauri word lies in shuffled
// syllables, and the learner taps them into order.

export const ROUND_SIZE = 8;
const MIN_SYLLABLES = 2;
const VIRAMA = "्";
// Spaces, hyphens and commas between words are not pieces to place.
const NOT_LETTERS = /[^\p{L}\p{M}]/gu;
const SHUFFLE_TRIES = 10;
const UNDO_KEY = "Backspace";

const graphemes = new Intl.Segmenter("hi", { granularity: "grapheme" });

// Graphemes keep a letter with its vowel sign; a consonant ending in a virama joins the next one,
// because older browsers split a conjunct like "न्न" there. A word-final dead consonant
// (as in "छेक्याम्") closes the syllable before it rather than standing alone as a half letter.
export function splitSyllables(text) {
  const syllables = [];
  let carried = "";
  for (const { segment } of graphemes.segment(text.replace(NOT_LETTERS, ""))) {
    carried += segment;
    if (segment.endsWith(VIRAMA)) continue;
    syllables.push(carried);
    carried = "";
  }
  if (carried && syllables.length) syllables[syllables.length - 1] += carried;
  else if (carried) syllables.push(carried);
  return syllables;
}

function askedForm(word, dialect) {
  return word.dialects[dialect]?.forms[0] ?? "";
}

export function isPlayable(word, dialect) {
  return splitSyllables(askedForm(word, dialect)).length >= MIN_SYLLABLES;
}

function shuffle(items, rng) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function makeRound(words, dialect, size, rng) {
  return shuffle(words.filter((word) => isPlayable(word, dialect)), rng).slice(0, size);
}

// A shuffle that leaves the word already built is no puzzle; when every order is the same
// (as in "ला ला"), that is all there is.
export function shuffleSyllables(syllables, rng) {
  const asked = syllables.join("");
  for (let tries = 0; tries < SHUFFLE_TRIES; tries++) {
    const shuffled = shuffle(syllables, rng);
    if (shuffled.join("") !== asked) return shuffled;
  }
  const rotated = [...syllables.slice(1), syllables[0]];
  return rotated.join("") !== asked ? rotated : [...syllables];
}

export function isRightOrder(placed, word, dialect) {
  const built = placed.join("");
  return word.dialects[dialect].forms.some((form) => form.replace(NOT_LETTERS, "") === built);
}

function meaningOf(word, lang) {
  return (lang === "hi" && word.hi) || word.en;
}

function make(doc, tag, className, text = "") {
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

export default {
  id: "word-builder",
  title: { en: "Word builder", hi: "शब्द बनाओ" },
  blurb: { en: "Put the pieces of a Kinnauri word back in order.", hi: "किन्नौरी शब्द के टुकड़ों को सही क्रम में जोड़ें।" },
  icon: "🧱",
  minWords: 4,
  mount(el, context, rng = Math.random) {
    const round = makeRound(context.words, context.dialect, ROUND_SIZE, rng);
    const play = { el, context, rng, round, index: 0, score: 0 };
    const onKey = (event) => undoLast(play, event);
    el.addEventListener("keydown", onKey);
    if (round.length) showWord(play);
    else showNoWords(play);
    return () => el.removeEventListener("keydown", onKey);
  },
};

function showNoWords({ el, context }) {
  const doc = el.ownerDocument;
  const box = make(doc, "div", "wb card");
  box.append(make(doc, "p", "wb-feedback", context.t("wordBuilder.noWords")));
  el.replaceChildren(box);
}

function showWord(play) {
  const word = play.round[play.index];
  play.word = word;
  play.placed = [];
  play.pool = shuffleSyllables(splitSyllables(askedForm(word, play.context.dialect)), play.rng);
  play.missed = false;
  play.done = false;
  play.feedback = "";
  draw(play);
}

// Each tile moves between the pool and the answer by its place in the list, so a syllable
// that appears twice (as in "लाला") moves one copy at a time.
function place(play, index) {
  play.placed.push(...play.pool.splice(index, 1));
  play.feedback = "";
  if (!play.pool.length) checkBuilt(play);
  draw(play);
}

function sendBack(play, index) {
  play.pool.push(...play.placed.splice(index, 1));
  play.feedback = "";
  draw(play);
}

function undoLast(play, event) {
  if (event.key !== UNDO_KEY || play.done || !play.placed.length) return;
  event.preventDefault();
  sendBack(play, play.placed.length - 1);
}

function checkBuilt(play) {
  if (isRightOrder(play.placed, play.word, play.context.dialect)) return finishWord(play, !play.missed);
  play.missed = true;
  play.feedback = "wordBuilder.tryAgain";
}

function showMe(play) {
  play.placed = splitSyllables(askedForm(play.word, play.context.dialect));
  play.pool = [];
  finishWord(play, false);
  play.feedback = "wordBuilder.revealed";
  draw(play);
}

function finishWord(play, correct) {
  play.done = true;
  play.correct = correct;
  play.feedback = correct ? "wordBuilder.right" : "wordBuilder.rightAfterTries";
  if (correct) play.score += 1;
  play.context.onAnswer(play.word.id, correct);
}

function next(play) {
  play.index += 1;
  if (play.index < play.round.length) return showWord(play);
  play.context.onFinish({ score: play.score, total: play.round.length });
}

function draw(play) {
  const { el, context } = play;
  const doc = el.ownerDocument;
  const t = context.t;
  const box = make(doc, "section", "wb");
  const progress = make(doc, "p", "wb-progress muted", `${play.index + 1} / ${play.round.length}`);
  const meaning = make(doc, "p", "wb-meaning", meaningOf(play.word, context.lang));
  const answer = make(doc, "div", `wb-answer${play.done && play.correct ? " wb-right" : ""}${play.done && !play.correct ? " wb-shown" : ""}`);
  answer.setAttribute("aria-label", t("wordBuilder.yourWord"));
  answer.setAttribute("lang", "hi");
  answer.append(...play.placed.map((syllable, index) => makeTile(play, syllable, () => sendBack(play, index))));
  const pool = make(doc, "div", "wb-pool");
  pool.setAttribute("aria-label", t("wordBuilder.pieces"));
  pool.setAttribute("lang", "hi");
  pool.append(...play.pool.map((syllable, index) => makeTile(play, syllable, () => place(play, index))));
  box.append(progress, make(doc, "p", "wb-ask muted", t("wordBuilder.ask")), meaning, answer, pool);
  box.append(makeFeedback(doc, play), makeActions(doc, play));
  el.replaceChildren(box);
}

function makeTile(play, syllable, onClick) {
  const tile = makeButton(play.el.ownerDocument, "wb-tile", syllable, onClick);
  if (play.done) tile.setAttribute("disabled", "");
  return tile;
}

function makeFeedback(doc, play) {
  const feedback = make(doc, "p", `wb-feedback${play.done && play.correct ? " wb-cheer" : ""}`);
  feedback.setAttribute("role", "status");
  if (play.feedback) feedback.textContent = play.context.t(play.feedback);
  return feedback;
}

function makeActions(doc, play) {
  const t = play.context.t;
  const actions = make(doc, "div", "wb-actions");
  if (!play.done) {
    actions.append(makeButton(doc, "button secondary wb-show", t("wordBuilder.showMe"), () => showMe(play)));
    return actions;
  }
  const last = play.index + 1 === play.round.length;
  actions.append(makeButton(doc, "button wb-next", t(last ? "wordBuilder.seeScore" : "wordBuilder.next"), () => next(play)));
  return actions;
}
