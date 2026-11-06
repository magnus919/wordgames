import fs from "node:fs";
import wordListPath from "word-list";

// Build-time only: browsers and the Rust service use the checked-in catalog.
const catalogPath = new URL("../games/fivefold/catalog.json", import.meta.url);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const guesses = [
  ...new Set([
    ...fs
      .readFileSync(wordListPath, "utf8")
      .split(/\r?\n/)
      .filter((word) => /^[a-z]{5}$/.test(word))
      .map((word) => word.toUpperCase()),
    ...catalog.lexicons.answers,
  ]),
].sort();

if (process.argv.includes("--check")) {
  if (JSON.stringify(catalog.lexicons.guesses) !== JSON.stringify(guesses)) {
    throw new Error(
      "Fivefold dictionary is stale. Run npm run update:fivefold-dictionary.",
    );
  }
} else {
  catalog.lexicons.guesses = guesses;
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}
console.log(
  `Fivefold dictionary: ${guesses.length} accepted five-letter words.`,
);
