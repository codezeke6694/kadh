// True or false rush (docs/joins.md J3): 60 seconds of a Kinnauri word and a meaning; is it right?
export const ROUND_SECONDS = 60;
const TICK_MS = 250;
const MS_PER_SECOND = 1000;
const TRUE_SHARE = 0.5;
const KEY_TRUE = "ArrowRight";
const KEY_FALSE = "ArrowLeft";
const FLASH = { right: "tf-flash-right", wrong: "tf-flash-wrong" };

const realClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

function meaningOf(word, lang) {
  return word[lang] || word.en;
}

function pickOne(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

// About half true; a false pair borrows a meaning that differs from the word's own,
// and a word with no such meaning to borrow is shown true.
export function makePair(words, { dialect, lang, rng = Math.random }) {
  const word = pickOne(words, rng);
  const own = meaningOf(word, lang);
  const pair = { word, form: word.dialects[dialect].forms[0], ownMeaning: own, meaning: own, isTrue: true };
  if (rng() < TRUE_SHARE) return pair;
  const others = words.map((other) => meaningOf(other, lang)).filter((meaning) => meaning !== own);
  if (!others.length) return pair;
  return { ...pair, meaning: pickOne(others, rng), isTrue: false };
}

export function isRightAnswer(pair, saidTrue) {
  return pair.isTrue === saidTrue;
}

export function secondsLeft(startedAt, now) {
  return Math.max(0, ROUND_SECONDS - Math.floor((now - startedAt) / MS_PER_SECOND));
}

function make(doc, tag, className, text = "") {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function makeAnswerButton(doc, className, text, onClick) {
  const button = make(doc, "button", `tf-answer ${className}`, text);
  button.setAttribute("type", "button");
  button.addEventListener("click", onClick);
  return button;
}

function drawBoard(doc, el, t, answer) {
  const seconds = make(doc, "span", "tf-seconds", String(ROUND_SECONDS));
  const timer = make(doc, "p", "tf-timer");
  timer.setAttribute("role", "timer");
  timer.append(seconds, make(doc, "span", "tf-seconds-label", t("tf.seconds")));
  const score = make(doc, "span", "tf-score", "0");
  const scoreLine = make(doc, "p", "tf-score-line");
  scoreLine.append(make(doc, "span", "tf-score-label", t("tf.score")), score);
  const drain = make(doc, "div", "tf-drain");
  const top = make(doc, "div", "tf-top");
  top.append(timer, scoreLine);
  const stage = make(doc, "div", "tf-stage");
  const feedback = make(doc, "p", "tf-feedback");
  feedback.setAttribute("aria-live", "polite");
  const answers = make(doc, "div", "tf-answers");
  answers.append(
    makeAnswerButton(doc, "tf-false", `← ${t("tf.false")}`, () => answer(false)),
    makeAnswerButton(doc, "tf-true", `${t("tf.true")} →`, () => answer(true)),
  );
  const board = make(doc, "div", "tf");
  board.append(top, drain, stage, feedback, answers, make(doc, "p", "tf-keys muted", t("tf.keys")));
  el.replaceChildren(board);
  return { seconds, score, stage, feedback };
}

// A fresh card for each pair, so its flash (for the answer just given) plays on arrival.
function drawCard(doc, stage, t, pair, flash) {
  const cardEl = make(doc, "div", flash ? `tf-card ${flash}` : "tf-card");
  cardEl.append(
    make(doc, "p", "tf-word", pair.form),
    make(doc, "p", "tf-means muted", t("tf.means")),
    make(doc, "p", "tf-meaning", pair.meaning),
  );
  stage.replaceChildren(cardEl);
}

function showFeedback(view, t, pair, right) {
  view.feedback.className = `tf-feedback ${right ? "tf-feedback-right" : "tf-feedback-wrong"}`;
  view.feedback.textContent = right ? t("tf.right") : `${t("tf.wrong")} ${pair.form} = ${pair.ownMeaning}`;
}

// The game itself, with the clock and the random source handed in so tests need not wait.
export function mountRush(el, { words, dialect, lang, t, onAnswer, onFinish }, { clock = realClock, rng = Math.random } = {}) {
  const doc = el.ownerDocument;
  const round = { pair: null, shown: 0, score: 0, over: false };
  const view = drawBoard(doc, el, t, answer);
  const startedAt = clock.now();

  function nextPair(flash) {
    round.pair = makePair(words, { dialect, lang, rng });
    round.shown += 1;
    drawCard(doc, view.stage, t, round.pair, flash);
  }

  function answer(saidTrue) {
    if (round.over) return;
    const right = isRightAnswer(round.pair, saidTrue);
    if (right) round.score += 1;
    view.score.textContent = String(round.score);
    onAnswer(round.pair.word.id, right);
    showFeedback(view, t, round.pair, right);
    nextPair(right ? FLASH.right : FLASH.wrong);
  }

  function onKey(event) {
    if (event.key !== KEY_TRUE && event.key !== KEY_FALSE) return;
    event.preventDefault();
    answer(event.key === KEY_TRUE);
  }

  function tick() {
    const left = secondsLeft(startedAt, clock.now());
    view.seconds.textContent = String(left);
    if (left > 0) return;
    stop();
    onFinish({ score: round.score, total: round.shown });
  }

  function stop() {
    if (round.over) return;
    round.over = true;
    clock.clearInterval(timerId);
    doc.removeEventListener("keydown", onKey);
  }

  nextPair(null);
  doc.addEventListener("keydown", onKey);
  const timerId = clock.setInterval(tick, TICK_MS);
  return stop;
}

export default {
  id: "true-false",
  title: { en: "True or false rush", hi: "सही या गलत दौड़" },
  blurb: { en: "60 seconds. Does the word mean that? Tap True or False as fast as you can.", hi: "60 सेकंड। क्या शब्द का यही मतलब है? जितनी जल्दी हो सके सही या गलत दबाएँ।" },
  icon: "⚡",
  minWords: 4,
  mount: (el, context) => mountRush(el, context),
};
