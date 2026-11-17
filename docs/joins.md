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
  id: "flashcards",
  title: { en: "Flashcards", hi: "फ़्लैशकार्ड" },
  blurb: { en: "...", hi: "..." },
  icon: "🃏",
  minWords: 4,
  mount(el, { words, dialect, lang, t, onAnswer, onFinish }) { /* draws into el; returns an unmount function */ },
};
```

- `words` are already filtered to the chosen dialect and topic.
- `onAnswer(wordId, correct)` for every answer; `onFinish({ score, total })` once at the end.
- The shell (src/games/kit.js) draws the topic picker before and the results screen after
  (score, best, "Play again", "Back home"). A game draws only its play area.
- Game logic sits in exported pure functions (for example `makeRound(words, n, rng)`), tested in `tests/<id>.test.js`.
- The six ids: `flashcards`, `pick-meaning`, `match-pairs`, `memory-flip`, `word-builder`, `true-false`.
  `src/games/index.js` lists them and loads each with `import()`; it is written once in T2, and a game file that
  is not there yet shows as "coming soon".

## J4 Screens and words on screen (src/app.js, src/i18n.js)

Routes (hash, so GitHub Pages needs nothing):
`#/` home, `#/welcome` first visit, `#/words` list, `#/word/<id>`, `#/play/<gameId>`, `#/progress`, `#/settings`, `#/about`.

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
