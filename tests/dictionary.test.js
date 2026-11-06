import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import five, { validateGuess } from "../games/fivefold/game.js";

const catalog = JSON.parse(
  fs.readFileSync(new URL("../games/fivefold/catalog.json", import.meta.url)),
);
const puzzle = catalog.fixtures.find((fixture) => fixture.answer === "CRANE");

test("Fivefold accepts STORK for the long-legged bird clue, without treating it as the answer", () => {
  const state = five.initialState();
  assert.equal(validateGuess("STORK", state, puzzle, catalog.lexicons), "");
  const next = { ...state, guesses: ["STORK"] };
  assert.equal(five.result(next, puzzle).status, "playing");
  assert.match(
    validateGuess("STORK", next, puzzle, catalog.lexicons),
    /already tried/,
  );
  assert.deepEqual(state.guesses, []);
});

test("Fivefold accepts a broad dictionary beyond the curated answer pool", () => {
  for (const word of [
    "STORK",
    "HERON",
    "EGRET",
    "ROBIN",
    "ZEBRA",
    "QUART",
    "FJORD",
    "NYMPH",
    "JAZZY",
    "QUEUE",
  ])
    assert.equal(
      validateGuess(word, five.initialState(), puzzle, catalog.lexicons),
      "",
      word,
    );
  assert.ok(catalog.lexicons.guesses.length > 12000);
  assert.equal(
    new Set(catalog.lexicons.guesses).size,
    catalog.lexicons.guesses.length,
  );
  assert.ok(catalog.lexicons.guesses.every((word) => /^[A-Z]{5}$/.test(word)));
  assert.ok(
    catalog.lexicons.answers.every((word) =>
      catalog.lexicons.guesses.includes(word),
    ),
  );
  assert.equal(catalog.lexicons.answers.includes("STORK"), false);
  assert.equal(
    five.validatePuzzle({ ...puzzle, answer: "STORK" }, catalog.lexicons),
    false,
  );
});

test("dictionary expansion keeps invalid and repeated guesses from using a turn", () => {
  const state = { guesses: ["STORK"], hints: 1, hintIndex: null };
  const before = structuredClone(state);
  for (const word of [
    "ZZZZZ",
    "ABCDE",
    "PERRO",
    "STOR",
    "STORKS",
    "ST0RK",
    "STÖRK",
    "STORK",
  ])
    assert.ok(validateGuess(word, state, puzzle, catalog.lexicons), word);
  assert.deepEqual(state, before);
});

test("newly accepted guesses and existing hints survive a saved-state reload", () => {
  const state = { guesses: ["STORK", "HERON"], hints: 2, hintIndex: 3 };
  const restored = five.restoreState(
    JSON.parse(JSON.stringify(state)),
    puzzle,
    catalog.lexicons,
  );
  assert.deepEqual(restored, state);
  assert.equal(five.result(restored, puzzle).status, "playing");
  assert.equal(validateGuess("CRANE", restored, puzzle, catalog.lexicons), "");
  assert.equal(
    five.result(
      { ...restored, guesses: [...restored.guesses, "CRANE"] },
      puzzle,
    ).status,
    "won",
  );
});

test("checked-in Fivefold dictionary matches the pinned build-time source", () => {
  execFileSync(
    process.execPath,
    ["scripts/update-fivefold-dictionary.mjs", "--check"],
    {
      cwd: new URL("../", import.meta.url),
    },
  );
});
