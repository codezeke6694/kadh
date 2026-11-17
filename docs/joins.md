# Joins: what passes between the parts of Kadh

Plain HTML, CSS and JavaScript modules. No build step, no server, no packages shipped
to users. Every part below is a file under `src/`; tests run with `node --test`.

## J1 The word (src/data/words.js)

The dictionary is the owner's Google Sheet, tab `final`
(`https://docs.google.com/spreadsheets/d/1DP8Y66XIfZoM14Zteo_EtUKmlRfT1woa86i6TVPoVHY/export?format=csv&gid=0`).
Columns: `English, Hindi, Hamskad, Navaskad, Pahari Kinnauri`, and later an optional `Topic`.

```js
// one word
{
  id: "cloud",                 // English lower-cased, spaces and symbols to "-"; a repeat gets "-2", "-3"
  en: "Cloud",
  hi: "बादल",                  // "" when the sheet has none
  dialects: {
    hamskad: { text: "जू", forms: ["जू"] },
    navaskad: { text: "मुहवा / टिन", forms: ["मुहवा", "टिन"] },
    pahari:  { text: "जानरी/जू", forms: ["जानरी", "जू"] },
  },                           // a dialect the sheet leaves empty is absent from `dialects`
  topic: "nature",             // a topic id from J5; "other" when unknown
}
```

- `text` is the cell as written, shown on word pages.
- `forms` splits `text` on `/` and `;`, trims, and drops quoted notes such as `'छोटा पर्वत'`
  and bracketed notes such as `(खेत)`. `forms[0]` is the word a game asks for; any form counts as right.

API (all pure, no fetch, so they can be tested):
- `parseCsv(text) -> string[][]`
- `toWords(rows, topicsMap) -> Word[]` (rows include the header; `topicsMap` is J5's map, used when the sheet has no Topic column)
- `forDialect(words, dialect) -> Word[]` (only words that have that dialect)
- `byTopic(words, topic) -> Word[]`

Loading (src/data/load.js): read `data/sheet.csv` (a copy of the sheet, shipped with the app) and
`data/topics.json` at once, then fetch the live sheet; if it arrives and parses to at least 100 words, use it
and keep its text in localStorage `kadh.sheet.v1` for the next visit. A failed fetch keeps the copy and shows
nothing alarming. `loadWords() -> Promise<Word[]>`, `onWordsUpdated(fn)`.
`scripts/snapshot.mjs` rewrites `data/sheet.csv` from the live sheet.

## J2 Progress and settings (src/data/progress.js)

Kept in the learner's browser only, localStorage key `kadh.v1`; every read and write is guarded so a
blocked storage still lets the app run.

```js
{
  dialect: "pahari" | "hamskad" | "navaskad" | null,   // null until chosen (first-visit screen)
  lang: "en" | "hi",
  words: { [wordId]: { right: 0, wrong: 0, box: 1..5, due: "2026-11-17" } },
  streak: { days: 0, last: "2026-11-17" },
  best: { [gameId]: 0 },
}
```

API: `getSettings()`, `setSettings({dialect?, lang?})`, `recordAnswer(wordId, correct, today)`,
`recordGame(gameId, score, today)`, `getStats(today) -> {learned, streak, best}`, `dueWords(words, today, n)`.
A word is "learned" at box 4 or above. Right moves a word up one box, wrong sends it to box 1.

## J3 A game (src/games/<id>.js)

```js
export default {
  id: "flashcards",            // must equal the file name
  title: { en: "Flashcards", hi: "फ़्लैशकार्ड" },   // both languages, non-empty
  blurb: { en: "...", hi: "..." },                  // one line under the title in the topic picker
  icon: "🃏",
  minWords: 4,                 // whole number >= 1; topics with fewer words (in the chosen Kinnauri) are not offered
  mount(el, { words, dialect, lang, t, today, onAnswer, onFinish }) { /* draws into el; returns an unmount function */ },
};
```

- `src/games/index.js`: `GAME_IDS` (the six, in this order), `isGameId(id)`, `loadGame(id) -> game | null`
  (null while the file is not built; an unknown id throws RangeError), `loadGames() -> [{ id, game }]` for home,
  and `checkGame(game, id)`, which `loadGame` runs: a module that breaks this contract throws a TypeError naming
  the file and the field, and the shell shows it. `tests/kit.test.js` runs `checkGame` on every built game.
- `#/play/<id>` loads `src/games/kit.js` as the screen. The kit shows "coming soon" for a game not built yet,
  links `src/games/<id>.css` into the page once (so a game's own styles go there), then draws the topic picker:
  "All words" first, then each J5 topic with at least `minWords` words in the chosen Kinnauri.
  `#/play/<id>/<topicId>` (`all` for All words; e.g. a word page's "Practise this topic") starts the game on
  that topic at once; a topic the game cannot use (unknown, or too few words) shows the picker instead.
- `mount` gets: `words` already filtered to the chosen Kinnauri and topic (never fewer than `minWords`);
  `dialect` (`"pahari" | "hamskad" | "navaskad"`, read `word.dialects[dialect].forms[0]`); `lang` (`"en" | "hi"`,
  the meaning to show is `word.en` or `word.hi`, falling back to `word.en` when `hi` is ""); `t(key)` for the game's own
  strings in `src/i18n/<id>.js`; `today` (`"YYYY-MM-DD"`, the learner's local date, for `dueWords`).
- `onAnswer(wordId, correct)` once for every answer; the kit keeps it in progress (`recordAnswer`).
- `onFinish({ score, total })` once at the end: whole numbers, `0 <= score <= total`, a higher score is better
  (it is the game's best score). A call after the first is ignored; a bad score throws, naming the game.
  The kit then calls the unmount function, so it must stop every timer and key listener the game started.
- The kit draws a bar above the play area (game name, the words in play, "Choose other words") and the results
  screen after (score / total, best, "Play again" with the same words, "Choose other words", "Back home").
  A game draws only its play area, and only inside `el`.
- Game logic sits in exported pure functions (for example `makeRound(words, n, rng)`), tested in `tests/<id>.test.js`.
  `tests/fake-dom.js` is a small stand-in document (`makeFakeDocument`, `findByClass`, `findButton`,
  `useFakeStorage`) for testing `mount` under `node --test`.

## J4 Screens and words on screen (src/app.js, src/i18n.js)

Routes (hash, so GitHub Pages needs nothing):
`#/` home, `#/welcome` first visit, `#/words` list, `#/word/<id>`, `#/play/<gameId>` and `#/play/<gameId>/<topicId>` (ctx.params.gameId, ctx.params.topic; the kit skips its topic picker when a topic is given; no `?query` in routes), `#/progress`, `#/settings`, `#/about`.

- `t(key)` returns the text in the chosen language; every on-screen word goes through it.
  Each part adds its own keys in its own file `src/i18n/<part>.js` exporting `{ en: {...}, hi: {...} }`,
  so parallel tasks never share a file.
- `src/config.js`: `SHEET_CSV_URL`, `SUBMIT_FORM_URL = ""`. While it is empty, no "Submit a word" button shows.
- `src/app.js` loads each screen with `import("./screens/<name>.js")`; a screen module exports
  `default render(el, ctx)` where `ctx = { words, settings, t, go(route), params }`.
  Screens: `home`, `welcome`, `words`, `word`, `progress`, `settings`, `about`.
- Look: shared colours, type and card/button styles live in `styles/base.css` (T1); each screen or game
  that needs more adds its own file, which `index.html` (styles/settings.css, kit.css, home.css, words.css,
  word.css, progress.css, about.css) or the kit (`src/games/<id>.css`) loads. Colours come only from the tokens in `base.css`.

## J5 Topics (data/topics.json)

```js
{ "topics": [ { "id": "nature", "en": "Nature", "hi": "प्रकृति", "icon": "🏔️" }, ... ],
  "words": { "Cloud": "nature", "Ant": "animals", ... } }   // English as in the sheet -> topic id
```

The sheet's own `Topic` column, once added, wins over this map for the words it names.
`loadTopics()` in src/data/load.js gives the `topics` list (empty when the file cannot be read); the topic
picker shows topics in that order.
