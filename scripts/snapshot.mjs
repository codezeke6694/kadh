// Rewrites data/sheet.csv (the copy shipped with the app) from the live sheet: `npm run snapshot`.
import { writeFile } from "node:fs/promises";
import { SHEET_CSV_URL } from "../src/config.js";
import { parseCsv, toWords, MIN_SHEET_WORDS } from "../src/data/words.js";

const COPY_PATH = new URL("../data/sheet.csv", import.meta.url);

const response = await fetch(SHEET_CSV_URL);
if (!response.ok) throw new Error(`${SHEET_CSV_URL}: ${response.status} ${response.statusText}`);
const text = await response.text();
const count = toWords(parseCsv(text), {}).length;
if (count < MIN_SHEET_WORDS) throw new Error(`the live sheet has ${count} words, fewer than ${MIN_SHEET_WORDS}; copy kept`);
await writeFile(COPY_PATH, text);
console.log(`data/sheet.csv: ${count} words`);
