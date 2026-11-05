import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadEdition, validatePayload } from "../js/content.js";
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url))),
  m = read("../games/fivefold/manifest.json"),
  c = read("../games/fivefold/catalog.json");
const valid = () => ({
  server_now: "2026-11-05T12:00:00Z",
  date: "2026-11-05",
  number: 1,
  next_reset: "2026-11-06T00:00:00Z",
  games: [
    {
      manifest: structuredClone(m),
      puzzle: {
        game_id: m.id,
        date: "2026-11-05",
        number: 1,
        module_version: 1,
        content: c.fixtures[0],
      },
      lexicons: c.lexicons,
    },
  ],
});
test("API response binds each game to the server day and version", () => {
  assert.equal(
    validatePayload(valid()).games[0].puzzle.content.answer,
    "PLANT",
  );
  const p = valid();
  p.games[0].puzzle.date = "2026-11-06";
  assert.throws(() => validatePayload(p));
  const q = valid();
  q.games[0].manifest.id = "../unsafe";
  assert.throws(() => validatePayload(q));
  const r = valid();
  r.games.push(r.games[0]);
  assert.throws(() => validatePayload(r));
});
test("only a static server gets labeled demo content, with discovered packages", async () => {
  const fetcher = async (path) => {
    if (path === "/api/v1/daily")
      return new Response("Not found", { status: 404 });
    if (path === "/games/index.json") return Response.json(["fivefold"]);
    if (path.endsWith("manifest.json")) return Response.json(m);
    return Response.json(c);
  };
  const demo = await loadEdition(fetcher, new Date("2026-11-05T12:00Z"));
  assert.equal(demo.demo, true);
  assert.equal(demo.games[0].puzzle.content.answer, "PLANT");
  await assert.rejects(
    loadEdition(async () =>
      Response.json({ error: "unavailable" }, { status: 503 }),
    ),
  );
  await assert.rejects(
    loadEdition(async () =>
      Response.json({ error: "missing" }, { status: 404 }),
    ),
  );
});
test("API server date remains authoritative with an incorrect device date", async () => {
  const p = await loadEdition(
    async () => Response.json(valid()),
    new Date("2027-01-01"),
  );
  assert.equal(p.date, "2026-11-05");
  assert.equal(p.demo, false);
});
test("adding another package needs no frontend game ID switch", () => {
  const p = valid();
  p.games[0].manifest.id = "third-game";
  p.games[0].puzzle.game_id = "third-game";
  assert.equal(validatePayload(p).games[0].manifest.id, "third-game");
});
