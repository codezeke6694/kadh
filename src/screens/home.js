// Home (#/): the word of the day, the six games, the words to review, and "Submit a word" (docs/joins.md J4).
import { make } from "../app.js";
import { loadGames } from "../games/index.js";
import { todayText } from "../games/kit.js";
import { forDialect } from "../data/words.js";
import { dueWords } from "../data/progress.js";
import { SUBMIT_FORM_URL } from "../config.js";
import { makeText } from "./welcome.js";

const REVIEW_GAME_HASH = "#/play/flashcards";
// Fallback icons for a game whose file is not built yet; a built game brings its own.
const GAME_ICONS = {
  flashcards: "🃏", "pick-meaning": "🎯", "match-pairs": "🔗", "memory-flip": "🧠", "word-builder": "🧩", "true-false": "⚡",
};

// The same day gives the same number everywhere, so every learner meets the same word.
function dayNumber(today) {
  let hash = 0;
  for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

export function pickWordOfDay(words, dialect, today) {
  const choices = forDialect(words, dialect);
  return choices.length ? choices[dayNumber(today) % choices.length] : null;
}

function meaningOf(word, lang) {
  return (lang === "hi" && word.hi) || word.en;
}

function makeWordOfDay(doc, { t, settings }, word) {
  const card = make(doc, "a", "home-wotd", { href: `#/word/${encodeURIComponent(word.id)}` });
  const kinnauri = makeText(doc, "span", "home-wotd-word kinnauri", word.dialects[settings.dialect].forms[0]);
  card.append(
    makeText(doc, "span", "home-wotd-label", t("home.wordOfDay")),
    kinnauri,
    makeText(doc, "span", "home-wotd-meaning", meaningOf(word, settings.lang)),
    makeText(doc, "span", "home-wotd-more", t("home.seeWord")),
  );
  return card;
}

function makeGameCard(doc, t, lang, { id, game }) {
  const card = make(doc, "a", "home-game", { href: `#/play/${id}`, "data-game": id });
  const icon = makeText(doc, "span", "home-game-icon", game?.icon ?? GAME_ICONS[id], { "aria-hidden": "true" });
  const title = game ? game.title[lang] || game.title.en : t(`home.game.${id}.title`);
  const blurb = game ? game.blurb[lang] || game.blurb.en : t(`home.game.${id}.blurb`);
  card.append(icon, makeText(doc, "span", "home-game-title", title), makeText(doc, "span", "home-game-blurb", blurb));
  return card;
}

function makeGames(doc, t, lang, games) {
  const section = make(doc, "section", "home-games", { "aria-labelledby": "home-games-title" });
  const list = make(doc, "div", "home-game-list");
  list.append(...games.map((entry) => makeGameCard(doc, t, lang, entry)));
  section.append(makeText(doc, "h2", "", t("home.gamesTitle"), { id: "home-games-title" }), list);
  return section;
}

function makeReview(doc, t, count) {
  const card = make(doc, "a", "home-review", { href: REVIEW_GAME_HASH });
  card.append(
    makeText(doc, "span", "home-review-count", String(count)),
    makeText(doc, "span", "home-review-label", t("home.toReview")),
    makeText(doc, "span", "home-review-hint muted", t(count ? "home.reviewNow" : "home.reviewNone")),
  );
  return card;
}

// Only shown once the owner has made the form (plan D7); it opens outside the app.
function makeSubmit(doc, t, formUrl) {
  if (!formUrl) return null;
  const section = make(doc, "section", "home-submit card");
  const link = makeText(doc, "a", "button secondary", t("home.submit"), { href: formUrl, target: "_blank", rel: "noopener noreferrer" });
  section.append(makeText(doc, "p", "muted", t("home.submitHelp")), link);
  return section;
}

export default async function render(el, ctx, sources = { loadGames, formUrl: SUBMIT_FORM_URL }) {
  const doc = el.ownerDocument;
  const { words, settings, t } = ctx;
  const today = todayText(new Date());
  const games = await sources.loadGames();
  const word = pickWordOfDay(words, settings.dialect, today);
  const due = dueWords(forDialect(words, settings.dialect), today, Infinity).length;

  const page = make(doc, "div", "home");
  const top = make(doc, "div", "home-top");
  if (word) top.append(makeWordOfDay(doc, ctx, word));
  top.append(makeReview(doc, t, due));
  page.append(makeText(doc, "h1", "home-title", t("home.title")), top, makeGames(doc, t, settings.lang, games));
  const submit = makeSubmit(doc, t, sources.formUrl);
  if (submit) page.append(submit);
  el.replaceChildren(page);
}
