// The about page (docs/joins.md J4): what Kadh is, the three Kinnauri, where the words come from.
import { DIALECT_COLUMNS } from "../data/words.js";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function makeSection(t, titleKey, textKey, ...extras) {
  const section = make("section", "about-section card");
  section.append(make("h2", "", t(titleKey)), make("p", "", t(textKey)), ...extras);
  return section;
}

function makeDialectList(t) {
  const list = make("ul", "about-dialects");
  for (const key of Object.keys(DIALECT_COLUMNS)) {
    list.append(make("li", "about-dialect", t(`about.dialect.${key}`)));
  }
  return list;
}

export default function render(el, { t }) {
  const page = make("article", "about");
  const intro = make("header", "about-intro");
  intro.append(make("h1", "", t("about.title")), make("p", "about-lead", t("about.intro")));
  page.append(
    intro,
    makeSection(t, "about.dialectsTitle", "about.dialectsText", makeDialectList(t)),
    makeSection(t, "about.sourceTitle", "about.sourceText"),
  );
  el.replaceChildren(page);
}
