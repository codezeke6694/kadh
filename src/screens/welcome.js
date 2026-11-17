// First visit (#/welcome): what Kadh is, the choice of Kinnauri, then home.
import { make } from "../app.js";
import { DIALECT_COLUMNS } from "../data/words.js";
import { setSettings } from "../data/progress.js";

const DIALECTS = Object.keys(DIALECT_COLUMNS);
// A short, everyday word every learner knows; any word with all three stands in when it is missing.
const EXAMPLE_WORD_ID = "water";
const HOME_HASH = "#/";

function findExample(words) {
  const hasAll = (word) => DIALECTS.every((dialect) => word.dialects[dialect]);
  return words.find((word) => word.id === EXAMPLE_WORD_ID && hasAll(word)) ?? words.find(hasAll) ?? null;
}

export function makeText(doc, tag, className, text, attributes = {}) {
  const el = make(doc, tag, className, attributes);
  el.textContent = text;
  return el;
}

function makeOption(doc, t, dialect, example) {
  const button = make(doc, "button", "dialect-option", { type: "button", role: "radio", "data-dialect": dialect });
  const label = t(`settings.dialect.${dialect}`);
  const name = make(doc, "span", "dialect-name");
  name.append(makeText(doc, "span", "", label));
  // In Hindi the sheet's own name stays beside it, the name the learner meets everywhere else.
  if (label !== DIALECT_COLUMNS[dialect]) {
    name.append(makeText(doc, "span", "dialect-roman", DIALECT_COLUMNS[dialect], { lang: "en" }));
  }
  button.append(name);
  if (example) {
    button.append(makeText(doc, "span", "dialect-example kinnauri", example.dialects[dialect].forms[0]));
  }
  return button;
}

// The three Kinnauri as big choices, each with its word for one example; shared with settings.
export function makeDialectChoice(doc, { words, lang, t, chosen, labelId, onChoose }) {
  const example = findExample(words);
  const group = make(doc, "div", "dialect-choice", { role: "radiogroup", "aria-labelledby": labelId });
  const options = DIALECTS.map((dialect) => makeOption(doc, t, dialect, example));
  const mark = (picked) => {
    options.forEach((button, i) => button.setAttribute("aria-checked", String(DIALECTS[i] === picked)));
  };
  options.forEach((button, i) =>
    button.addEventListener("click", () => {
      mark(DIALECTS[i]);
      onChoose(DIALECTS[i]);
    }),
  );
  mark(chosen);
  group.append(...options);
  if (!example) return [group];
  const meaning = (lang === "hi" && example.hi) || example.en;
  return [group, makeText(doc, "p", "dialect-caption muted", t("settings.exampleFor").replace("{word}", meaning))];
}

export default function render(el, { words, settings, t, go }) {
  const doc = el.ownerDocument;
  let picked = settings.dialect;
  const start = makeText(doc, "button", "button start-button", t("welcome.start"), { type: "button" });
  const hint = makeText(doc, "p", "welcome-hint muted", t("welcome.pickFirst"));
  const showReady = () => {
    start.disabled = !picked;
    hint.hidden = Boolean(picked);
  };
  start.addEventListener("click", () => {
    if (!picked) return;
    setSettings({ dialect: picked });
    go(HOME_HASH);
  });

  const choice = makeDialectChoice(doc, {
    words, lang: settings.lang, t, chosen: picked, labelId: "welcome-ask",
    onChoose: (dialect) => {
      picked = dialect;
      showReady();
    },
  });
  showReady();

  const page = make(doc, "section", "welcome");
  page.append(
    makeText(doc, "h1", "welcome-title", t("welcome.title")),
    makeText(doc, "p", "welcome-lead", t("welcome.lead")),
    makeText(doc, "h2", "welcome-ask", t("welcome.ask"), { id: "welcome-ask" }),
    ...choice,
    start,
    hint,
    makeText(doc, "p", "welcome-later muted", t("welcome.later")),
  );
  el.replaceChildren(page);
}
