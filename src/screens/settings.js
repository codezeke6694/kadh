// Settings (#/settings): the Kinnauri, the language of the buttons, and clearing progress.
import { make, LANG_KEYS } from "../app.js";
import { LANGS } from "../i18n.js";
import { setSettings, resetProgress } from "../data/progress.js";
import { makeDialectChoice, makeText } from "./welcome.js";

function makeSection(doc, headingId, heading, ...content) {
  const section = make(doc, "section", "settings-section card", { "aria-labelledby": headingId });
  section.append(makeText(doc, "h2", "", heading, { id: headingId }), ...content);
  return section;
}

function makeLangChoice(doc, { lang, t, switchLang }) {
  const group = make(doc, "div", "lang-choices", { role: "radiogroup", "aria-labelledby": "settings-lang" });
  for (const code of LANGS) {
    const button = makeText(doc, "button", "lang-choice", t(LANG_KEYS[code]), {
      type: "button", role: "radio", lang: code, "data-lang": code, "aria-checked": String(code === lang),
    });
    // The shell's own switch: it saves, relabels the header and draws this screen again.
    button.addEventListener("click", () => switchLang(code));
    group.append(button);
  }
  return group;
}

// Nothing is cleared until the learner says yes a second time.
function makeReset(doc, t) {
  const open = makeText(doc, "button", "button secondary reset-button", t("settings.reset"), { type: "button" });
  const confirm = make(doc, "div", "reset-confirm", { role: "alertdialog", "aria-labelledby": "settings-reset-ask" });
  const yes = makeText(doc, "button", "button reset-yes", t("settings.resetYes"), { type: "button" });
  const cancel = makeText(doc, "button", "button secondary reset-cancel", t("settings.resetNo"), { type: "button" });
  const actions = make(doc, "div", "reset-actions");
  actions.append(yes, cancel);
  confirm.append(makeText(doc, "p", "reset-ask", t("settings.resetAsk"), { id: "settings-reset-ask" }), actions);
  const done = make(doc, "p", "reset-done", { role: "status" });

  const asking = (isAsking) => {
    confirm.hidden = !isAsking;
    open.hidden = isAsking;
  };
  open.addEventListener("click", () => {
    done.textContent = "";
    asking(true);
    cancel.focus();
  });
  cancel.addEventListener("click", () => {
    asking(false);
    open.focus();
  });
  yes.addEventListener("click", () => {
    resetProgress();
    asking(false);
    done.textContent = t("settings.resetDone");
    open.focus();
  });
  asking(false);
  return [open, confirm, done];
}

export default function render(el, { words, settings, t, switchLang }) {
  const doc = el.ownerDocument;
  const dialectChoice = makeDialectChoice(doc, {
    words, lang: settings.lang, t, chosen: settings.dialect, labelId: "settings-dialect",
    onChoose: (dialect) => setSettings({ dialect }),
  });
  const page = make(doc, "div", "settings");
  page.append(
    makeText(doc, "h1", "", t("settings.title")),
    makeSection(doc, "settings-dialect", t("settings.dialectHeading"),
      makeText(doc, "p", "muted", t("settings.dialectHelp")), ...dialectChoice),
    makeSection(doc, "settings-lang", t("settings.langHeading"), makeLangChoice(doc, { lang: settings.lang, t, switchLang })),
    makeSection(doc, "settings-progress", t("settings.progressHeading"),
      makeText(doc, "p", "muted", t("settings.progressHelp")), ...makeReset(doc, t)),
  );
  el.replaceChildren(page);
}
