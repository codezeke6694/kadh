# Kadh: learn Kinnauri with games
Plan id: kadh-v1
Type: story

## Done means
- A learner opens the app on a phone, picks which Kinnauri to learn (Hamskad, Navaskad or Pahari Kinnauri), and lands on a home screen with a word of the day and six games.
- Every word in the owner's Google Sheet can be searched, browsed by topic and opened on its own page showing English, Hindi and all three Kinnauri words.
- A word the owner adds to the sheet appears in the app on the next visit without anyone changing the app.
- Six games work with the chosen Kinnauri and a chosen topic: Flashcards, Pick the meaning, Match pairs, Memory flip, Word builder, True or false rush.
- Progress (words learned, day streak, best score per game) is kept on the learner's own device; no sign-in.
- Every button and instruction can be switched between English and Hindi.
- A "Submit a word" button opens the owner's Google Form once its link is set; until then it is hidden.
- Every screen works at phone, tablet and laptop width.
- It is live on GitHub Pages after the owner says "publish".

## Architecture
- database: none of our own. The words are the owner's Google Sheet (tab `final`), read as CSV in the learner's browser; a copy ships with the app for when the sheet cannot be reached.
- server: not needed, because it is a static site that reads a public sheet.
- hosting: GitHub Pages, from this repository, after the owner says publish.
- accounts: not needed, because nobody signs in; progress stays in the learner's browser.
- services: Google Sheets (read only, public CSV export); Google Forms (a link only, for submitting words).
- devices: phones first, then tablets and laptops; modern browsers.
- look: for Kinnauri learners of every age, kids to elders; warm mountain feel from Kinnaur: apple-red accent, deodar green, snowy off-white background, rounded friendly cards, small celebrations on a right answer; playful, not childish; Devanagari must be large and clear; no ads, no pop-ups, no dark patterns.
- security: the app only reads the public sheet; it never writes to it and holds no secrets or personal data. Sheet text is shown as text, never as HTML.
- scale: about 1,200 words today, up to 10,000; any number of learners (a static site).
- testing: `node --test tests/` for all logic (parsing, games, progress); the engine's browser walk of docs/journeys.md at 390, 820 and 1280 wide for screens.
- release: commit to main and GitHub Pages serves it; a release is tagged with notes and a rollback point.
- queues: not needed, because nothing runs in the background.
- monitoring: not needed for v1, because it is a free static site with no server; GitHub Pages shows if a deploy failed.
- backups: the words live in the owner's Google Sheet (Google keeps its version history); the code lives in git and on GitHub.

## Decisions
- D1 The learner picks one Kinnauri (Hamskad, Navaskad or Pahari Kinnauri) on first visit and can switch any time; games use that one, the word page shows all three. (by kamal)
- D2 The app reads the Google Sheet directly, so new words appear without changing the app. (by kamal)
- D3 No sign-in; progress is kept on the learner's device. (by kamal)
- D4 Buttons and instructions switch between English and Hindi. (by kamal)
- D5 Six games: Flashcards, Pick the meaning, Match pairs, Memory flip (chosen by kamal), plus Word builder and True or false rush (kamal asked for at least six). (by kamal)
- D6 Words get topics. A Topic column is added to the sheet once the owner has seen the topic list; until then the app uses its own topic list (data/topics.json). (by kamal)
- D7 New words are submitted through a Google Form the owner makes later; they reach the app only when the owner adds them to the sheet. (by kamal)
- D8 Built end to end and shown to the owner once at the end. (by kamal)
- D9 Warm mountain look (see Architecture: look). (by kamal)
- D10 Hosted on GitHub Pages. (by kamal)
- D11 playwright-core is installed for browser checks only, never shipped to learners. (by kamal)
- D12 Only the `final` tab is used; Sheet2 (verbs) is left for a later version because its columns are not yet in the same shape.

## Joins
- J1 The word: shape, parsing and loading, as in docs/joins.md J1.
- J2 Progress and settings in the browser, as in docs/joins.md J2.
- J3 A game module and the game kit, as in docs/joins.md J3.
- J4 Screens, routes, on-screen text and the look, as in docs/joins.md J4.
- J5 Topics file, as in docs/joins.md J5.

## Tasks
- T1 Words: read and parse the dictionary | 1d | type: task | points: 3 | files: src/config.js, src/data/words.js, src/data/load.js, scripts/snapshot.mjs, data/sheet.csv, tests/data.test.js, package.json | rests on: J1, D2, D12 | check: `node --test tests/data.test.js`
  docs/joins.md J1. package.json has `"type": "module"`, `"test": "node --test tests/"` and playwright-core as a dev dependency only (D11).
  accept: the words load from the copy in data/sheet.csv when the live sheet cannot be reached
  accept: the words load from the live Google Sheet when it answers
  accept: a cell "मुहवा / टिन" gives the two forms मुहवा and टिन
  accept: a quoted note such as 'छोटा पर्वत' is not counted as a form
  accept: a bracketed note such as (खेत) is not counted as a form
  accept: a word with an empty dialect cell has no entry for that dialect
- T2 Progress and settings kept on the device | 1d | type: task | points: 2 | files: src/data/progress.js, tests/progress.test.js | rests on: J2, D3 | check: `node --test tests/progress.test.js`
  docs/joins.md J2.
  accept: a right answer moves a word up one box
  accept: a wrong answer sends a word back to box 1
  accept: the streak counts days in a row
  accept: the streak starts again at 1 after a missed day
  accept: the chosen Kinnauri is still there after a reload
  accept: the chosen language is still there after a reload
  accept: everything still works when the browser blocks storage
- T3 Topics for every word | 1d | type: story | points: 3 | files: data/topics.json, tests/topics.test.js | rests on: J5, D6 | check: `node --test tests/topics.test.js`
  Fetch the sheet's CSV (the J1 address) into a temporary folder (data/sheet.csv belongs to T1) and give every English word a topic. The sheet is grouped already: nature, people and pronouns, family, body, colours, numbers, little words, animals, birds, feelings, places and directions, shapes and sizes, time, questions, food and plants, describing words. About 12 to 18 topics.
  accept: every English word in the sheet has a topic
  accept: every topic has an English name
  accept: every topic has a Hindi name
  accept: every topic has an icon
  accept: every topic holds at least 8 words
- T4 App shell and the look | 1d | type: story | points: 3 | needs: T1, T2 | files: index.html, styles/base.css, src/app.js, src/i18n.js, src/i18n/shell.js, tests/shell.test.js | rests on: J4, D4, D9 | check: `node --test tests/`
  Load the frontend-design skill first: this sets the look every other screen uses. The router of J4, `t()`, a header with the app name and a language switch, a bottom bar (Home, Words, Play, Progress) on phones. index.html links styles/base.css and every per-part stylesheet named in docs/joins.md J4 (a missing one is harmless). A first visit with no chosen Kinnauri goes to #/welcome.
  accept: the header's language switch changes the buttons between English and Hindi
  accept: a first visit with no Kinnauri chosen opens the welcome route
  accept: an unknown route shows a friendly "not found" with a way home
- T5 Welcome and settings screens | 1d | type: story | points: 3 | needs: T4 | files: src/screens/welcome.js, src/screens/settings.js, src/i18n/settings.js, styles/settings.css, tests/settings.test.js | rests on: J2, J4, D1, D4 | check: `node --test tests/settings.test.js`
  Welcome: what Kadh is in one line, the three Kinnauri as big choices with an example word each, Start learning. Settings: the same choice, the language, and "Reset my progress" with a confirm.
  accept: the welcome screen offers Hamskad, Navaskad and Pahari Kinnauri
  accept: after choosing on the welcome screen the learner lands on home
  accept: the settings screen changes the Kinnauri
  accept: the settings screen changes the language
  accept: "Reset my progress" asks the learner to confirm
  accept: after confirming, the progress is cleared
- T6 Game kit: topic picker and results | 1d | type: story | points: 3 | needs: T4 | files: src/games/index.js, src/games/kit.js, src/i18n/kit.js, styles/kit.css, tests/kit.test.js | rests on: J3, J5 | check: `node --test tests/kit.test.js`
  docs/joins.md J3: the list of six games (a missing file shows "coming soon"), the #/play/<id> route, the topic picker (All words, or one topic with enough words for the game) before a game, the results screen after (score, best, Play again, Back home), and passing answers to progress.
  accept: a game opens with a topic picker that offers "All words"
  accept: the topic picker offers each topic with enough words for that game
  accept: after a game the results screen shows the score
  accept: the results screen shows the best score for that game
  accept: "Play again" starts the same game with the same topic
- T7 Home screen | 1d | type: story | points: 3 | needs: T3, T6 | files: src/screens/home.js, src/i18n/home.js, styles/home.css, tests/home.test.js | rests on: J1, J4, D7 | check: `node --test tests/home.test.js`
  Word of the day (the same for everyone on a given day), the six games as big cards, a "Words to review" count, and a "Submit a word" button only when SUBMIT_FORM_URL is set.
  accept: the word of the day is the same on two reloads on the same day
  accept: the home screen shows the six games
  accept: with no form link set there is no "Submit a word" button
  accept: with a form link set the "Submit a word" button opens the form in a new tab
- T8 Word list with search and topics | 1d | type: story | points: 3 | needs: T3, T4 | files: src/screens/words.js, src/i18n/words.js, styles/words.css, tests/words.test.js | rests on: J1, J5 | check: `node --test tests/words.test.js`
  Search across English, Hindi and all three Kinnauri; topic chips; each row shows English, Hindi and the chosen Kinnauri; stays fast with 10,000 words.
  accept: searching "Cloud" finds Cloud
  accept: searching "बादल" finds Cloud
  accept: searching "जू" finds Cloud
  accept: tapping a topic chip shows only that topic's words
- T9 Word page | 1d | type: story | points: 2 | needs: T4 | files: src/screens/word.js, src/i18n/word.js, styles/word.css, tests/word.test.js | rests on: J1 | check: `node --test tests/word.test.js`
  English, Hindi, the three Kinnauri with their names (the chosen one first), the topic, and "Practise this topic".
  accept: a word page shows the English and Hindi words
  accept: a word page shows all three Kinnauri words with their names
  accept: a Kinnauri the sheet leaves empty shows "not recorded yet"
- T10 My progress screen | 1d | type: story | points: 2 | needs: T4 | files: src/screens/progress.js, src/i18n/progress.js, styles/progress.css, tests/progress-screen.test.js | rests on: J2 | check: `node --test tests/progress-screen.test.js`
  accept: it shows how many words are learned
  accept: it shows the day streak
  accept: it shows the best score for each game played
- T11 About page | 4h | type: story | points: 1 | needs: T4 | files: src/screens/about.js, src/i18n/about.js, styles/about.css | rests on: J4 | check: `node --test tests/`
  What Kadh is, the three Kinnauri and where they are spoken, where the words come from.
  accept: the about page names the three Kinnauri
- T12 Game: Flashcards | 1d | type: story | points: 3 | needs: T3, T6 | files: src/games/flashcards.js, src/games/flashcards.css, src/i18n/flashcards.js, tests/flashcards.test.js | rests on: J3 | check: `node --test tests/flashcards.test.js`
  A deck of 10 from the topic, words due for review first. The Kinnauri word on the front; tap to flip to the meaning in the chosen language; "I knew it" / "Still learning".
  accept: tapping the card flips it to show the meaning
  accept: "Still learning" brings the word back later in the same deck
  accept: the results screen shows how many were known out of the deck
- T13 Game: Pick the meaning | 1d | type: story | points: 3 | needs: T3, T6 | files: src/games/pick-meaning.js, src/games/pick-meaning.css, src/i18n/pick-meaning.js, tests/pick-meaning.test.js | rests on: J3 | check: `node --test tests/pick-meaning.test.js`
  10 questions: a Kinnauri word and four meanings, wrong ones from the same topic when it has enough words. Every few questions the other way round.
  accept: each question has exactly one right answer
  accept: each question has four different choices
  accept: a wrong pick shows which one was right
  accept: the score at the end matches the right answers given
- T14 Game: Match pairs | 1d | type: story | points: 3 | needs: T3, T6 | files: src/games/match-pairs.js, src/games/match-pairs.css, src/i18n/match-pairs.js, tests/match-pairs.test.js | rests on: J3 | check: `node --test tests/match-pairs.test.js`
  Six Kinnauri words in one column, their meanings shuffled in the other; tap one of each to pair them; a timer runs; three boards per round.
  accept: a right pair locks green
  accept: a wrong pair shakes and clears
  accept: the round ends after three boards
  accept: the results show the time taken
- T15 Game: Memory flip | 1d | type: story | points: 3 | needs: T3, T6 | files: src/games/memory-flip.js, src/games/memory-flip.css, src/i18n/memory-flip.js, tests/memory-flip.test.js | rests on: J3 | check: `node --test tests/memory-flip.test.js`
  Twelve face-down cards (six words, six meanings); flip two at a time; a match stays up; count the moves.
  accept: two cards that match stay face up
  accept: two cards that do not match turn back after a moment
  accept: the game ends when all pairs are found
  accept: the results show the number of moves
- T16 Game: Word builder | 1d | type: story | points: 3 | needs: T3, T6 | files: src/games/word-builder.js, src/games/word-builder.css, src/i18n/word-builder.js, tests/word-builder.test.js | rests on: J3 | check: `node --test tests/word-builder.test.js`
  The meaning is shown; the Kinnauri word is split into syllables (letters kept whole with their vowel signs, Intl.Segmenter) and shuffled; tap them into order. Only words of two or more syllables.
  accept: a Devanagari letter is never split from its vowel sign
  accept: tapping a placed syllable sends it back
  accept: the syllables in the right order are marked correct
  accept: "Show me" reveals the word
  accept: a word revealed with "Show me" counts as wrong
- T17 Game: True or false rush | 1d | type: story | points: 3 | needs: T3, T6 | files: src/games/true-false.js, src/games/true-false.css, src/i18n/true-false.js, tests/true-false.test.js | rests on: J3 | check: `node --test tests/true-false.test.js`
  60 seconds; a Kinnauri word and a meaning; tap True or False (or the arrow keys); about half are true.
  accept: the timer counts down from 60
  accept: the game ends when the timer reaches 0
  accept: the results show the score
  accept: each answer flashes right or wrong
  accept: the next pair appears at once after an answer
- T18 Whole-product check and fixes | 1d | type: task | points: 3 | needs: T5, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17 | check: `node --test tests/`
  Walk every flow in docs/journeys.md at phone, tablet and laptop width; play every game in both languages and all three Kinnauri; file what fails as bugs into this plan.
  accept: every flow in docs/journeys.md passes at 390, 820 and 1280 wide
  accept: every game can be played to its results screen with each of the three Kinnauri
- T19 Publish on GitHub Pages | 1d | type: story | points: 2 | needs: T18 | kind: release | check: `engine live https://codezeke6694.github.io/kadh/ --expect 1.0.0 --wait 600`
  After the owner sees the finished app and says publish: security check, owner acceptance, tag, push to GitHub, turn on Pages. Then, with the owner's yes, add the Topic column to the sheet from data/topics.json. The address is confirmed with the owner at publish time.
  accept: the app answers at its GitHub Pages address
  accept: the live app loads words from the Google Sheet
  accept: the release notes are shared with the owner
