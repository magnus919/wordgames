import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { letterMeaning, scoreLetters } from "../js/game-kit.js";

test("Fivefold feedback uses the requested meanings without changing scoring", () => {
  assert.deepEqual(letterMeaning, {
    correct: "Right letter in the right place",
    present: "Right letter in the wrong place",
    absent: "Wrong letter",
  });
  assert.deepEqual(scoreLetters("DRIVE", "SHORE"), [
    "absent",
    "present",
    "absent",
    "absent",
    "correct",
  ]);
});

test("board, keyboard and legend use the same green, yellow and red palette", () => {
  const css = fs.readFileSync(
    new URL("../styles.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /color-scheme: only light/);
  assert.match(css, /--feedback-yellow: #ffdf00/);
  assert.match(css, /--feedback-red: #b91c1c/);
  for (const [state, variable] of [
    ["correct", "green"],
    ["present", "feedback-yellow"],
    ["absent", "feedback-red"],
  ]) {
    assert.match(
      css,
      new RegExp(
        `\\.tile\\.${state},\\s*\\.sample\\.${state}\\s*\\{\\s*background: var\\(--${variable}\\)`,
      ),
    );
    assert.match(
      css,
      new RegExp(
        `\\.key\\.${state}\\s*\\{\\s*background: var\\(--${variable}\\)`,
      ),
    );
  }
});
