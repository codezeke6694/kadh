// The game kit (docs/joins.md J3): the #/play/<id> screen. It draws the topic picker before a
// game and the results after; the game itself draws only its play area.
import { isGameId, loadGame } from "./index.js";
import { loadTopics } from "../data/load.js";
import { forDialect, byTopic } from "../data/words.js";
import { recordAnswer, recordGame, getStats } from "../data/progress.js";
import { renderNotFound } from "../app.js";

export const ALL_WORDS = "all";
const HOME_HASH = "#/";

// Per page, the games whose stylesheet is already linked, so a replay adds no second <link>.
const linkedStyles = new WeakMap();

export function todayText(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// All words first, then each topic (in J5 order) with enough words for the game.
export function topicChoices(words, topics, minWords) {
  if (words.length < minWords) return [];
  const choices = [{ id: ALL_WORDS, topic: null, words }];
  for (const topic of topics) {
    const inTopic = byTopic(words, topic.id);
    if (inTopic.length >= minWords) choices.push({ id: topic.id, topic, words: inTopic });
  }
  return choices;
}

export default async function render(el, ctx, sources = { loadGame, loadTopics }) {
  const doc = el.ownerDocument;
  const { gameId } = ctx.params;
  if (!isGameId(gameId)) return renderNotFound(doc, el);
  const [game, topics] = await Promise.all([sources.loadGame(gameId), sources.loadTopics()]);
  if (!game) return renderComingSoon(doc, el, ctx.t);
  const words = forDialect(ctx.words, ctx.settings.dialect);
  const session = { doc, el, ctx, game, choices: topicChoices(words, topics, game.minWords), unmount: null };
  showPicker(session);
  return () => stopGame(session);
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

function makeHomeLink(doc, t) {
  const link = make(doc, "a", "button secondary", t("kit.backHome"));
  link.setAttribute("href", HOME_HASH);
  return link;
}

// Text of a game or topic in the chosen language, English when that one is missing.
function inLang(text, lang) {
  return text[lang] || text.en;
}

function renderComingSoon(doc, el, t) {
  const card = make(doc, "section", "notice card");
  card.append(make(doc, "h1", "", t("kit.comingSoonTitle")), make(doc, "p", "", t("kit.comingSoonText")), makeHomeLink(doc, t));
  el.replaceChildren(card);
}

function makeGameHeading(session) {
  const { doc, game, ctx } = session;
  const heading = make(doc, "header", "kit-heading");
  const icon = make(doc, "span", "kit-icon", game.icon);
  icon.setAttribute("aria-hidden", "true");
  heading.append(icon, make(doc, "h1", "kit-title", inLang(game.title, ctx.settings.lang)));
  return heading;
}

function choiceName(choice, session) {
  return choice.topic ? inLang(choice.topic, session.ctx.settings.lang) : session.ctx.t("kit.allWords");
}

function makeTopicButton(session, choice) {
  const { doc, ctx } = session;
  const button = makeButton(doc, `kit-topic${choice.topic ? "" : " kit-topic-all"}`, "", () => startGame(session, choice));
  const icon = make(doc, "span", "kit-topic-icon", choice.topic?.icon ?? session.game.icon);
  icon.setAttribute("aria-hidden", "true");
  const count = make(doc, "span", "kit-topic-count", `${choice.words.length} ${ctx.t("kit.words")}`);
  button.append(icon, make(doc, "span", "kit-topic-name", choiceName(choice, session)), count);
  return button;
}

function showPicker(session) {
  const { doc, el, ctx, game, choices } = session;
  stopGame(session);
  const page = make(doc, "section", "kit kit-picker");
  page.append(makeGameHeading(session), make(doc, "p", "kit-blurb muted", inLang(game.blurb, ctx.settings.lang)));
  if (!choices.length) {
    const empty = make(doc, "div", "kit-empty card");
    empty.append(make(doc, "h2", "", ctx.t("kit.notEnoughTitle")), make(doc, "p", "", ctx.t("kit.notEnoughText")), makeHomeLink(doc, ctx.t));
    page.append(empty);
  } else {
    const list = make(doc, "div", "kit-topics");
    list.append(...choices.map((choice) => makeTopicButton(session, choice)));
    page.append(make(doc, "h2", "kit-question", ctx.t("kit.chooseWords")), list);
  }
  el.replaceChildren(page);
}

function linkGameStyles(doc, gameId) {
  if (!linkedStyles.has(doc)) linkedStyles.set(doc, new Set());
  const linked = linkedStyles.get(doc);
  if (linked.has(gameId)) return;
  linked.add(gameId);
  const link = doc.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", new URL(`./${gameId}.css`, import.meta.url).href);
  doc.head.append(link);
}

function startGame(session, choice) {
  const { doc, el, ctx, game } = session;
  stopGame(session);
  linkGameStyles(doc, game.id);
  const bar = make(doc, "div", "kit-bar");
  const topic = make(doc, "p", "kit-bar-topic muted", `${ctx.t("kit.playing")} ${choiceName(choice, session)}`);
  bar.append(makeGameHeading(session), topic, makeButton(doc, "button secondary kit-other", ctx.t("kit.otherWords"), () => showPicker(session)));
  const area = make(doc, "div", "kit-play");
  const page = make(doc, "section", "kit kit-game");
  page.append(bar, area);
  el.replaceChildren(page);

  const today = todayText(new Date());
  let finished = false;
  const onAnswer = (wordId, correct) => recordAnswer(wordId, Boolean(correct), today);
  const onFinish = (result) => {
    if (finished) return;
    const { score, total } = checkResult(result, game.id);
    finished = true;
    stopGame(session);
    showResults(session, choice, { score, total, today });
  };
  const context = { words: choice.words, dialect: ctx.settings.dialect, lang: ctx.settings.lang, t: ctx.t, today, onAnswer, onFinish };
  session.unmount = game.mount(area, context) ?? null;
}

function stopGame(session) {
  const unmount = session.unmount;
  session.unmount = null;
  if (typeof unmount === "function") unmount();
}

// A game reports its own score; a wrong one is that game's bug, named so its builder finds it.
function checkResult(result, gameId) {
  const { score, total } = result ?? {};
  const fine = Number.isInteger(total) && total >= 0 && Number.isInteger(score) && score >= 0 && score <= total;
  if (!fine) throw new RangeError(`src/games/${gameId}.js: onFinish needs a whole score from 0 to total, got score ${score} of ${total}`);
  return { score, total };
}

function showResults(session, choice, { score, total, today }) {
  const { doc, el, ctx, game } = session;
  const before = getStats(today).best[game.id] ?? 0;
  recordGame(game.id, score, today);
  const best = getStats(today).best[game.id] ?? score;

  const page = make(doc, "section", "kit kit-results card");
  const tally = make(doc, "p", "kit-tally");
  tally.append(make(doc, "span", "kit-score", String(score)), make(doc, "span", "kit-total", `/ ${total}`));
  const bestLine = make(doc, "p", "kit-best", `${ctx.t("kit.best")}: ${best}`);
  const actions = make(doc, "div", "kit-actions");
  actions.append(
    makeButton(doc, "button", ctx.t("kit.playAgain"), () => startGame(session, choice)),
    makeButton(doc, "button secondary", ctx.t("kit.otherWords"), () => showPicker(session)),
    makeHomeLink(doc, ctx.t),
  );
  page.append(makeGameHeading(session), make(doc, "h2", "kit-results-title", ctx.t("kit.resultsTitle")), tally, bestLine);
  if (score > before) page.append(make(doc, "p", "kit-new-best", ctx.t("kit.newBest")));
  page.append(make(doc, "p", "kit-bar-topic muted", choiceName(choice, session)), actions);
  el.replaceChildren(page);
}
