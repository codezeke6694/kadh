// The word (docs/joins.md J1): parsing the sheet's CSV into words. Pure, no fetch.

// Dialect key -> the sheet's column header.
export const DIALECT_COLUMNS = {
  hamskad: "Hamskad",
  navaskad: "Navaskad",
  pahari: "Pahari Kinnauri",
};
const COLUMN_ENGLISH = "English";
const COLUMN_HINDI = "Hindi";
const COLUMN_TOPIC = "Topic";
export const UNKNOWN_TOPIC = "other";

// A live sheet smaller than this is taken as broken, not as the dictionary.
export const MIN_SHEET_WORDS = 100;

const FORM_SEPARATORS = /[/;]/;
// Notes inside a cell: (…), […], '…', "…", ‘…’, “…”.
const NOTES = /\([^)]*\)|\[[^\]]*\]|'[^']*'|"[^"]*"|‘[^’]*’|“[^”]*”/g;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) rows.push([...row, cell]);
  return rows;
}

export function splitForms(text) {
  return text
    .replace(NOTES, "")
    .split(FORM_SEPARATORS)
    .map((form) => form.trim())
    .filter(Boolean);
}

function slugify(english) {
  return english.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "word";
}

function uniqueId(english, used) {
  const base = slugify(english);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

function columnIndexes(header) {
  const names = header.map((name) => name.trim().toLowerCase());
  const find = (name) => names.indexOf(name.toLowerCase());
  const dialects = Object.entries(DIALECT_COLUMNS).map(([key, name]) => [key, find(name)]);
  return { en: find(COLUMN_ENGLISH), hi: find(COLUMN_HINDI), topic: find(COLUMN_TOPIC), dialects };
}

function readDialects(row, dialectColumns) {
  const dialects = {};
  for (const [key, index] of dialectColumns) {
    const text = (row[index] ?? "").trim();
    const forms = splitForms(text);
    // A cell holding only a note has no word a game could ask for.
    if (forms.length) dialects[key] = { text, forms };
  }
  return dialects;
}

// rows include the header; topicsMap is J5's `words` map (English as in the sheet -> topic id).
export function toWords(rows, topicsMap) {
  if (!rows.length) return [];
  const columns = columnIndexes(rows[0]);
  if (columns.en < 0) throw new Error(`the sheet has no "${COLUMN_ENGLISH}" column`);
  const used = new Set();
  const words = [];
  for (const row of rows.slice(1)) {
    const en = (row[columns.en] ?? "").trim();
    if (!en) continue;
    const sheetTopic = (row[columns.topic] ?? "").trim().toLowerCase();
    words.push({
      id: uniqueId(en, used),
      en,
      hi: (row[columns.hi] ?? "").trim(),
      dialects: readDialects(row, columns.dialects),
      topic: sheetTopic || topicsMap?.[en] || UNKNOWN_TOPIC,
    });
  }
  return words;
}

export function forDialect(words, dialect) {
  return words.filter((word) => word.dialects[dialect]);
}

export function byTopic(words, topic) {
  return words.filter((word) => word.topic === topic);
}
