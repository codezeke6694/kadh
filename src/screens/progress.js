// My progress (docs/joins.md J2): words learned, the day streak and the best score of each game.
import { getStats } from "../data/progress.js";

// The six games of J3, in the order the home screen lists them.
export const GAME_IDS = ["flashcards", "pick-meaning", "match-pairs", "memory-flip", "word-builder", "true-false"];

const HOME_HASH = "#/";

function padded(number) {
  return String(number).padStart(2, "0");
}

// The learner's day in their own time zone, so a late-evening game counts for today.
export function localDay(date) {
  return `${date.getFullYear()}-${padded(date.getMonth() + 1)}-${padded(date.getDate())}`;
}

function isScore(value) {
  return Number.isFinite(value) && value >= 0;
}

// One row per game of J3; a game with no (or a damaged) best score has `score: null`.
export function bestScoreRows(best) {
  return GAME_IDS.map((id) => ({ id, score: isScore(best[id]) ? best[id] : null }));
}

function hasPlayed({ learned, streak, best }) {
  return learned > 0 || streak > 0 || bestScoreRows(best).some((row) => row.score !== null);
}

function make(doc, tag, className = "", text = null) {
  const el = doc.createElement(tag);
  el.className = className;
  if (text !== null) el.textContent = text;
  return el;
}

function makeStat(doc, t, className, number, labelKey, hintKey) {
  const stat = make(doc, "section", `stat ${className}`);
  const figure = make(doc, "p", "stat-figure");
  figure.append(make(doc, "span", "stat-number", String(number)), make(doc, "span", "stat-label", t(labelKey)));
  stat.append(figure, make(doc, "p", "stat-hint", t(hintKey)));
  return stat;
}

function makeBestScores(doc, t, best) {
  const section = make(doc, "section", "best card");
  const list = make(doc, "ul", "best-list");
  for (const { id, score } of bestScoreRows(best)) {
    const row = make(doc, "li", score === null ? "best-row not-played" : "best-row");
    row.setAttribute("data-game", id);
    const scoreText = score === null ? t("progress.notPlayed") : String(score);
    row.append(make(doc, "span", "best-game", t(`progress.game.${id}`)), make(doc, "span", "best-score", scoreText));
    list.append(row);
  }
  section.append(make(doc, "h2", "", t("progress.bestTitle")), list);
  return section;
}

function makeEmpty(doc, t) {
  const card = make(doc, "section", "progress-empty card");
  const link = make(doc, "a", "button", t("progress.emptyAction"));
  link.setAttribute("href", HOME_HASH);
  card.append(make(doc, "h2", "", t("progress.emptyTitle")), make(doc, "p", "", t("progress.emptyText")), link);
  return card;
}

export default function render(el, { t }) {
  const doc = el.ownerDocument;
  const stats = getStats(localDay(new Date()));
  const page = make(doc, "div", "progress-page");
  page.append(make(doc, "h1", "", t("progress.title")), make(doc, "p", "muted progress-intro", t("progress.intro")));
  if (!hasPlayed(stats)) {
    page.append(makeEmpty(doc, t));
  } else {
    const figures = make(doc, "div", "stats");
    figures.append(
      makeStat(doc, t, "stat-learned", stats.learned, "progress.learned", "progress.learnedHint"),
      makeStat(doc, t, "stat-streak", stats.streak, "progress.streak", "progress.streakHint"),
    );
    page.append(figures, makeBestScores(doc, t, stats.best));
  }
  el.replaceChildren(page);
}
