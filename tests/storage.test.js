import test from "node:test";
import assert from "node:assert/strict";
import {
  readProgress,
  writeProgress,
  readHistory,
  recordCompletion,
  progressKey,
} from "../js/storage.js";
const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
};
test("arbitrary game state and hints survive reload without cross-game or cross-day mixing", () => {
  const s = memory(),
    state = { customBoard: [1, 2, 3], hints: 2 };
  assert.ok(writeProgress(s, "2026-11-05", "third-game", 1, state, false));
  assert.deepEqual(readProgress(s, "2026-11-05", "third-game").state, state);
  assert.equal(readProgress(s, "2026-11-06", "third-game").state, null);
  assert.equal(readProgress(s, "2026-11-05", "other-game").state, null);
  assert.equal(readProgress(s, "2026-11-05", "third-game", 2).state, null);
});
test("malformed and blocked storage do not break loading", () => {
  const s = memory();
  s.setItem(progressKey("2026-11-05", "x"), "{bad");
  assert.equal(readProgress(s, "2026-11-05", "x").state, null);
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.equal(writeProgress(blocked, "2026-11-05", "x", 1, {}, false), false);
  assert.equal(readProgress(blocked, "2026-11-05", "x").state, null);
});
test("completion history accepts new modules and is idempotent", () => {
  const s = memory();
  recordCompletion(s, "2026-11-05", "third-game");
  recordCompletion(s, "2026-11-05", "third-game");
  recordCompletion(s, "2026-11-05", "fourth-game");
  assert.equal(readHistory(s).length, 2);
});
test("legacy starter saves stay available for module-specific migration", () => {
  const s = memory();
  s.setItem(progressKey("2026-11-05", "fivefold"), '["CRANE"]');
  assert.deepEqual(readProgress(s, "2026-11-05", "fivefold").state, {
    guesses: ["CRANE"],
    hints: 0,
  });
});
