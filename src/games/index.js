// The six games (docs/joins.md J3) and loading one; a game file not built yet loads as null.
import { importIfThere, LANGS } from "../i18n.js";

export const GAME_IDS = Object.freeze([
  "flashcards", "pick-meaning", "match-pairs", "memory-flip", "word-builder", "true-false",
]);

export function isGameId(id) {
  return GAME_IDS.includes(id);
}

function hasEveryLang(text) {
  return Boolean(text) && LANGS.every((code) => typeof text[code] === "string" && text[code] !== "");
}

// Names the file and the part of the J3 contract it breaks, so a game builder sees the fix.
export function checkGame(game, id) {
  const problem = contractProblem(game, id);
  if (problem) throw new TypeError(`src/games/${id}.js: ${problem}`);
  return game;
}

function contractProblem(game, id) {
  if (!game || typeof game !== "object") return "needs a default export (the game object of J3)";
  if (game.id !== id) return `id must be "${id}", not "${game.id}"`;
  if (!hasEveryLang(game.title)) return `title needs ${LANGS.join(" and ")} text`;
  if (!hasEveryLang(game.blurb)) return `blurb needs ${LANGS.join(" and ")} text`;
  if (typeof game.icon !== "string" || !game.icon) return "icon must be a non-empty string";
  if (!Number.isInteger(game.minWords) || game.minWords < 1) return "minWords must be a whole number of at least 1";
  if (typeof game.mount !== "function") return "mount(el, context) must be a function";
  return "";
}

export async function loadGame(id) {
  if (!isGameId(id)) throw new RangeError(`unknown game: ${id}`);
  const module = await importIfThere(new URL(`./${id}.js`, import.meta.url).href);
  return module ? checkGame(module.default, id) : null;
}

// Every game in J3 order, `game` null for one not built yet (home shows those as coming soon).
export async function loadGames() {
  return Promise.all(GAME_IDS.map(async (id) => ({ id, game: await loadGame(id) })));
}
