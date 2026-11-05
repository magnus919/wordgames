import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  activity,
  shareText,
  assertPlugin,
  assertResult,
  puzzleNumber,
} from "../js/core.js";
import { scoreLetters, scramble } from "../js/game-kit.js";
import five, { validateGuess as fiveGuess } from "../games/fivefold/game.js";
import jumble, {
  validateGuess as jumbleGuess,
} from "../games/unjumble/game.js";
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const fc = read("../games/fivefold/catalog.json"),
  jc = read("../games/unjumble/catalog.json"),
  fm = read("../games/fivefold/manifest.json"),
  jm = read("../games/unjumble/manifest.json"),
  fp = fc.fixtures[0],
  jp = jc.fixtures[0];
test("both installed modules implement v1 and validate all their fixtures", () => {
  for (const [p, c] of [
    [five, fc],
    [jumble, jc],
  ]) {
    assert.equal(assertPlugin(p, p.id), p);
    for (const fixture of c.fixtures) {
      assert.equal(p.validatePuzzle(fixture, c.lexicons), true);
      assertResult(p.result(p.initialState(), fixture));
    }
  }
  assert.throws(() => assertPlugin({ ...five, apiVersion: 2 }, five.id));
});
test("letter scoring consumes repeated letters only once", () => {
  assert.deepEqual(scoreLetters("ALLEY", "PLANT"), [
    "present",
    "correct",
    "absent",
    "absent",
    "absent",
  ]);
  assert.deepEqual(scoreLetters("EERIE", "SHEEP"), [
    "present",
    "present",
    "absent",
    "absent",
    "absent",
  ]);
  assert.deepEqual(scoreLetters("PAPAL", "PLANT"), [
    "correct",
    "present",
    "absent",
    "absent",
    "present",
  ]);
});
test("scrambles preserve each letter instance and do not show the answer", () => {
  for (const p of jc.fixtures)
    for (let seed = 1; seed < 40; seed++) {
      const s = scramble(p.answer, seed);
      assert.notEqual(s, p.answer);
      assert.equal([...s].sort().join(""), [...p.answer].sort().join(""));
    }
});
test("Fivefold rejects foreign, invented, short, long and repeated words without a state mutation", () => {
  const state = { guesses: ["CRANE"], hints: 0 },
    before = structuredClone(state);
  for (const word of ["PERRO", "ZZZZZ", "PLAN", "PLANET", "PLÁNT", "CRANE"])
    assert.ok(fiveGuess(word, state, fp, fc.lexicons));
  assert.deepEqual(state, before);
  assert.equal(fiveGuess("PLANT", state, fp, fc.lexicons), "");
});
test("Fivefold win and loss boundaries are exact", () => {
  assert.equal(five.result({ guesses: ["PLANT"], hints: 0 }, fp).status, "won");
  assert.equal(
    five.result({ guesses: ["CRANE"], hints: 0 }, fp).status,
    "playing",
  );
  assert.equal(
    five.result({ guesses: Array(6).fill("CRANE"), hints: 0 }, fp).status,
    "lost",
  );
});
test("Unjumble accepts approved anagrams with no false penalty and detects invalid sets", () => {
  const p = jc.fixtures.find((p) => p.answer === "STREAM");
  assert.ok(p.accepted_answers.includes("MASTER"));
  assert.equal(
    jumbleGuess("MASTER", jumble.initialState(), p, jc.lexicons),
    "",
  );
  assert.equal(
    jumble.result({ guesses: ["MASTER"], hints: 0 }, p).status,
    "won",
  );
  for (const word of ["GARDER", "PERROS", "GARDE", "GGGGGG"])
    assert.ok(jumbleGuess(word, jumble.initialState(), jp, jc.lexicons));
  assert.equal(jumble.result(jumble.initialState(), jp).status, "playing");
});
test("share contract excludes answers and discloses all hint use", () => {
  const result = five.result({ guesses: ["CRANE", "PLANT"], hints: 2 }, fp);
  const text = shareText(fm, result, 1, "https://example.com/#fivefold");
  assert.match(text, /2\/6 · 2 hints/);
  assert.match(text, /🟩🟩🟩🟩🟩/);
  assert.ok(!text.includes("PLANT"));
  assert.ok(text.endsWith("#fivefold"));
  const jtext = shareText(
    jm,
    jumble.result({ guesses: ["GARDEN"], hints: 1 }, jp),
    1,
    "https://example.com/#unjumble",
  );
  assert.match(jtext, /Solved · 1 hint/);
  assert.ok(!jtext.includes("GARDEN"));
  assert.throws(() => assertResult({ ...result, graphic: ["PLANT"] }));
});
test("persisted game states are sanitized by their own modules", () => {
  assert.deepEqual(
    five.restoreState(
      { guesses: ["PERRO", "PLANT"], hints: 999 },
      fp,
      fc.lexicons,
    ),
    { guesses: ["PLANT"], hints: 2, hintIndex: 0 },
  );
  assert.deepEqual(
    jumble.restoreState({ guesses: ["MASTER"], hints: -1 }, jp, jc.lexicons),
    { guesses: [], hints: 0 },
  );
});
test("week activity and numbering are generic across game IDs", () => {
  const days = activity(
    [
      { date: "2026-11-01", game: "third-game" },
      { date: "2026-11-05", game: "fourth-game" },
    ],
    "2026-11-05",
  );
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "2026-10-30");
  assert.equal(days.filter((d) => d.played).length, 2);
  assert.equal(puzzleNumber("2026-11-05"), 1);
  assert.equal(puzzleNumber("2026-11-06"), 2);
});
