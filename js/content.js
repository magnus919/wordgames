import { dateKey, puzzleNumber, safeId } from "./core.js";
export function validatePayload(payload) {
  if (
    !payload ||
    !Number.isFinite(Date.parse(payload.server_now)) ||
    Date.parse(payload.server_now) >= Date.parse(payload.next_reset) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.date) ||
    !Number.isSafeInteger(payload.number) ||
    !Array.isArray(payload.games) ||
    !payload.games.length ||
    Date.parse(payload.next_reset) !==
      Date.parse(`${payload.date}T00:00:00Z`) + 86400000
  )
    throw new Error("Invalid daily puzzle response.");
  const ids = new Set();
  for (const game of payload.games) {
    const m = game.manifest;
    if (
      !safeId(m?.id) ||
      ids.has(m.id) ||
      m.api_version !== 1 ||
      !Number.isInteger(m.version) ||
      m.version < 1 ||
      m.entry !== "game.js" ||
      !["blue", "yellow", "teal", "purple"].includes(m.theme) ||
      !["title", "description", "tagline", "skill", "art"].every(
        (k) => typeof m[k] === "string" && m[k].length < 500,
      ) ||
      !game.lexicons ||
      typeof game.lexicons !== "object"
    )
      throw new Error("Invalid game module metadata.");
    ids.add(m.id);
    const p = game.puzzle;
    if (
      p !== null &&
      (!p ||
        p.date !== payload.date ||
        p.game_id !== m.id ||
        p.module_version !== m.version ||
        p.number !== payload.number ||
        p.content?.language !== "en")
    )
      throw new Error("Invalid game edition.");
  }
  return payload;
}
export async function loadEdition(fetcher = fetch, date = new Date()) {
  const response = await fetcher("/api/v1/daily", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (
    response.status === 404 &&
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    const read = async (path) => {
      const r = await fetcher(path);
      if (!r.ok) throw new Error("Preview game package unavailable.");
      return r.json();
    };
    const ids = await read("/games/index.json");
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      !ids.every(safeId) ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Invalid preview registry.");
    const key = dateKey(date),
      number = puzzleNumber(key);
    const games = await Promise.all(
      ids.map(async (id) => {
        const [manifest, catalog] = await Promise.all([
          read(`/games/${id}/manifest.json`),
          read(`/games/${id}/catalog.json`),
        ]);
        if (!Array.isArray(catalog.fixtures) || !catalog.fixtures.length)
          throw new Error("Empty preview catalog.");
        const index =
          (((number - 1) % catalog.fixtures.length) + catalog.fixtures.length) %
          catalog.fixtures.length;
        return {
          manifest,
          puzzle: {
            game_id: id,
            date: key,
            number,
            module_version: manifest.version,
            content: catalog.fixtures[index],
          },
          lexicons: catalog.lexicons,
        };
      }),
    );
    return {
      ...validatePayload({
        server_now: date.toISOString(),
        date: key,
        number,
        next_reset: new Date(Date.parse(key) + 86400000).toISOString(),
        games,
      }),
      demo: true,
    };
  }
  if (!response.ok)
    throw new Error("Today’s puzzles aren’t available yet. Try again shortly.");
  return { ...validatePayload(await response.json()), demo: false };
}
