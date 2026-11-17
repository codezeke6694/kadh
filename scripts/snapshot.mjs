// Rewrites data/sheet.csv (the copy shipped with the app) from the live sheet: `npm run snapshot`.
import { writeFile } from "node:fs/promises";
import { fetchLiveWords } from "../src/data/load.js";

const COPY_PATH = new URL("../data/sheet.csv", import.meta.url);

const { text, words } = await fetchLiveWords({});
await writeFile(COPY_PATH, text);
console.log(`data/sheet.csv: ${words.length} words`);
