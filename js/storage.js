export const progressKey = (date, game) => `wordgames:${date}:${game}`;
export function readProgress(storage, date, game, version = 1) {
  try {
    const raw = JSON.parse(storage.getItem(progressKey(date, game)) || "null");
    if (raw?.moduleVersion === version)
      return { state: raw.state, complete: raw.complete === true };
    // Preserve progress from the first prototype; each game sanitizes its state.
    if (version === 1 && (Array.isArray(raw) || Array.isArray(raw?.guesses)))
      return {
        state: Array.isArray(raw) ? { guesses: raw, hints: 0 } : raw,
        complete: false,
      };
  } catch {
    /* Storage may be unavailable or malformed. */
  }
  return { state: null, complete: false };
}
export function writeProgress(storage, date, game, version, state, complete) {
  try {
    storage.setItem(
      progressKey(date, game),
      JSON.stringify({ moduleVersion: version, state, complete }),
    );
    return true;
  } catch {
    return false;
  }
}
export function readHistory(storage) {
  try {
    const value = JSON.parse(storage.getItem("wordgames:history") || "[]");
    return Array.isArray(value)
      ? value.filter(
          (v) =>
            typeof v.game === "string" &&
            /^[a-z][a-z0-9-]{0,47}$/.test(v.game) &&
            /^\d{4}-\d{2}-\d{2}$/.test(v.date),
        )
      : [];
  } catch {
    return [];
  }
}
export function recordCompletion(storage, date, game) {
  try {
    const history = readHistory(storage);
    if (!history.some((v) => v.date === date && v.game === game))
      history.push({ date, game });
    storage.setItem("wordgames:history", JSON.stringify(history.slice(-2000)));
    return true;
  } catch {
    return false;
  }
}
