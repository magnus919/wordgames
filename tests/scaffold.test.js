import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { assertPlugin } from "../js/core.js";
test("a scaffolded third game loads through the same module contract without core edits", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "wordgames-module-"));
  try {
    const destination = path.join(temp, "games", "third-game");
    execFileSync(process.execPath, [
      "scripts/scaffold-game.mjs",
      "third-game",
      destination,
    ]);
    await writeFile(path.join(temp, "package.json"), '{"type":"module"}');
    await mkdir(path.join(temp, "js"));
    await cp("js/game-kit.js", path.join(temp, "js", "game-kit.js"));
    const manifest = JSON.parse(
      await readFile(path.join(destination, "manifest.json")),
    );
    assert.equal(manifest.id, "third-game");
    const plugin = (
      await import(pathToFileURL(path.join(destination, "game.js")).href)
    ).default;
    assertPlugin(plugin, "third-game");
    const c = JSON.parse(
      await readFile(path.join(destination, "catalog.json")),
    );
    assert.equal(plugin.validatePuzzle(c.fixtures[0], c.lexicons), true);
    assert.equal(
      plugin.result(plugin.initialState(), c.fixtures[0]).status,
      "playing",
    );
    assert.throws(() =>
      execFileSync(
        process.execPath,
        ["scripts/scaffold-game.mjs", "third-game", destination],
        { stdio: "pipe" },
      ),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
