export const EPOCH = Date.UTC(2026, 10, 5);
export const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const puzzleNumber = (date) =>
  Math.floor((Date.parse(date) - EPOCH) / 86400000) + 1;
export const safeId = (id) =>
  typeof id === "string" && /^[a-z][a-z0-9-]{0,47}$/.test(id);
export function activity(history, today) {
  const dates = new Set(history.map((item) => item.date));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + i);
    return { date: dateKey(date), played: dates.has(dateKey(date)) };
  });
}
export function shareText(manifest, result, number, url) {
  const hints = result.hints || 0;
  return `${manifest.title} #${number} ${result.score}${hints ? ` · ${hints} hint${hints === 1 ? "" : "s"}` : ""}\n${result.graphic.join("\n")}\n\n${url}`;
}
export function assertPlugin(plugin, id) {
  if (
    !plugin ||
    plugin.apiVersion !== 1 ||
    plugin.id !== id ||
    ![
      "initialState",
      "restoreState",
      "validatePuzzle",
      "result",
      "mount",
    ].every((k) => typeof plugin[k] === "function") ||
    !Array.isArray(plugin.instructions)
  )
    throw new Error(
      "This game module is incompatible with this version of Wordgames.",
    );
  return plugin;
}
export function assertResult(result) {
  if (
    !result ||
    !["playing", "won", "lost"].includes(result.status) ||
    typeof result.score !== "string" ||
    !Array.isArray(result.graphic) ||
    !result.graphic.every(
      (s) => typeof s === "string" && /^[🟩🟨⬜🟦🟪🟧✅❌\s]*$/u.test(s),
    ) ||
    !Number.isInteger(result.hints) ||
    result.hints < 0
  )
    throw new Error("Invalid game result contract.");
  return result;
}
