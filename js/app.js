import {
  dateKey,
  activity,
  shareText,
  assertPlugin,
  assertResult,
} from "./core.js";
import {
  readProgress,
  writeProgress,
  readHistory,
  recordCompletion,
} from "./storage.js";
import { loadEdition } from "./content.js";
import * as ui from "./game-kit.js";
const $ = (id) => document.getElementById(id);
const feedback = $("message");
let payload,
  active,
  plugin,
  controller,
  state,
  abort,
  loading = false,
  storageWarning = false,
  routeVersion = 0,
  expiresAt = Infinity;
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => {
      throw Error("Storage unavailable");
    },
  };
}
const plugins = new Map();
const message = (text) => {
  feedback.textContent = text;
};
function cookieComplete(id) {
  return document.cookie.split("; ").includes(`wg_${id}=${payload.date}`);
}
function saved(game) {
  return readProgress(
    storage,
    payload.date,
    game.manifest.id,
    game.manifest.version,
  );
}
function stale() {
  if (loading || !payload) return true;
  if (
    (payload.demo && dateKey() !== payload.date) ||
    (!payload.demo && performance.now() >= expiresAt)
  ) {
    start();
    return true;
  }
  return false;
}
function teardown() {
  abort?.abort();
  controller?.destroy?.();
  controller = null;
  plugin = null;
  active = null;
  state = null;
  $("game-root").after(feedback);
  $("game-root").replaceChildren();
  delete $("game-root").dataset.game;
}
async function getPlugin(game) {
  const id = game.manifest.id;
  if (!plugins.has(id))
    plugins.set(
      id,
      import(`/games/${id}/game.js`)
        .then((module) => assertPlugin(module.default, id))
        .catch((error) => {
          plugins.delete(id);
          throw error;
        }),
    );
  return plugins.get(id);
}
async function start() {
  if (loading) return;
  loading = true;
  routeVersion++;
  teardown();
  $("loading").hidden = false;
  $("unavailable").hidden = true;
  $("home").hidden = true;
  $("game").hidden = true;
  try {
    payload = await loadEdition();
    expiresAt =
      performance.now() +
      Math.max(
        0,
        Date.parse(payload.next_reset) - Date.parse(payload.server_now),
      );
    $("demo").hidden = !payload.demo;
    await route();
  } catch (error) {
    payload = null;
    $("demo").hidden = true;
    $("unavailable").hidden = false;
    $("load-error").textContent =
      error.message || "Check your connection and try again.";
  } finally {
    loading = false;
    $("loading").hidden = true;
  }
}
function renderHome() {
  const count = payload.games.filter(
    (g) => saved(g).complete || cookieComplete(g.manifest.id),
  ).length;
  $("daily-count").textContent =
    count === payload.games.length
      ? "A lovely session. See you tomorrow."
      : `${count} of ${payload.games.length} puzzles played today`;
  $("today").textContent = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${payload.date}T12:00:00Z`));
  $("activity").replaceChildren();
  for (const day of activity(readHistory(storage), payload.date)) {
    const span = ui.el(
      "span",
      day.played ? "active" : "",
      new Intl.DateTimeFormat("en", {
        weekday: "narrow",
        timeZone: "UTC",
      }).format(new Date(`${day.date}T12:00Z`)),
    );
    span.title = `${day.date}: ${day.played ? "played" : "no completed puzzles"}`;
    span.setAttribute("aria-label", span.title);
    $("activity").append(span);
  }
  $("games").replaceChildren();
  for (const game of payload.games) {
    const m = game.manifest,
      complete = saved(game).complete || cookieComplete(m.id),
      card = ui.el(
        game.puzzle ? "a" : "div",
        `game-card${game.puzzle ? "" : " unavailable-game"}`,
      );
    if (game.puzzle) card.href = `#${m.id}`;
    card.dataset.theme = m.theme;
    const art = ui.el("div", "card-art tiles");
    art.setAttribute("aria-hidden", "true");
    for (const letter of [...m.art].slice(0, 8))
      art.append(ui.el("span", "", letter));
    const body = ui.el("div", "card-body"),
      title = ui.el("div", "game-title"),
      bottom = ui.el("div", "card-bottom");
    title.append(ui.el("h2", "", m.title), ui.el("span", "", m.skill));
    body.append(title, ui.el("p", "", m.description));
    bottom.append(
      ui.el(
        "span",
        "play",
        game.puzzle ? `Play ${m.title}` : "Puzzle coming soon",
      ),
      ui.el(
        "span",
        "status",
        complete
          ? "✓ Played today"
          : saved(game).state
            ? "Continue playing"
            : "Ready when you are",
      ),
    );
    body.append(bottom);
    card.append(art, body);
    $("games").append(card);
  }
}
async function route() {
  if (!payload) return;
  const version = ++routeVersion;
  teardown();
  renderHome();
  const id = location.hash.slice(1),
    game = payload.games.find((g) => g.manifest.id === id && g.puzzle);
  $("home").hidden = !!game;
  $("game").hidden = !game;
  $("result").hidden = true;
  $("share-fallback").hidden = true;
  message("");
  if (!game) return;
  $("game-title").textContent = game.manifest.title;
  $("game-description").textContent = game.manifest.tagline;
  $("puzzle-number").textContent = `Daily puzzle #${payload.number}`;
  try {
    const loaded = await getPlugin(game);
    if (version !== routeVersion) return;
    if (!loaded.validatePuzzle(game.puzzle.content, game.lexicons))
      throw Error(
        "This puzzle failed its game module’s content checks. Try again shortly.",
      );
    if (game.manifest.stylesheet) {
      if (game.manifest.stylesheet !== "styles.css")
        throw Error("Invalid game stylesheet.");
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `/games/${game.manifest.id}/styles.css`;
      document.head.append(link);
    }
    active = game;
    plugin = loaded;
    $("game-root").dataset.game = game.manifest.id;
    state = plugin.restoreState(
      saved(game).state ?? plugin.initialState(),
      game.puzzle.content,
      game.lexicons,
    );
    assertResult(plugin.result(state, game.puzzle.content));
    abort = new AbortController();
    if (game.manifest.stylesheet)
      abort.signal.addEventListener(
        "abort",
        () =>
          document
            .querySelector(`link[href="/games/${game.manifest.id}/styles.css"]`)
            ?.remove(),
        { once: true },
      );
    controller = plugin.mount({
      root: $("game-root"),
      puzzle: game.puzzle.content,
      lexicons: game.lexicons,
      state,
      number: payload.number,
      signal: abort.signal,
      ui,
      feedback,
      commit,
      setMessage: message,
      canPlay: () =>
        !stale() &&
        !!active &&
        !cookieComplete(active.manifest.id) &&
        plugin.result(state, active.puzzle.content).status === "playing",
    });
    if (typeof controller?.update !== "function")
      throw Error("This game module could not start.");
    update();
  } catch (error) {
    if (version !== routeVersion) return;
    teardown();
    $("game-root").append(
      ui.el(
        "p",
        "module-error",
        error.message || "This game could not load. Try again shortly.",
      ),
    );
  }
}
function commit(next) {
  if (!active || stale()) return;
  const before = assertResult(plugin.result(state, active.puzzle.content));
  if (before.status !== "playing" || cookieComplete(active.manifest.id)) return;
  state = plugin.restoreState(next, active.puzzle.content, active.lexicons);
  const result = assertResult(plugin.result(state, active.puzzle.content)),
    complete = result.status !== "playing";
  if (
    !writeProgress(
      storage,
      payload.date,
      active.manifest.id,
      active.manifest.version,
      state,
      complete,
    )
  )
    storageWarning = true;
  if (complete) {
    document.cookie = `wg_${active.manifest.id}=${payload.date}; Max-Age=172800; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    if (!recordCompletion(storage, payload.date, active.manifest.id))
      storageWarning = true;
    message(
      result.status === "won"
        ? "Solved. Nicely done!"
        : "Today’s puzzle is complete. Discover the word below.",
    );
  }
  update();
  if (complete) {
    $("result-title").tabIndex = -1;
    $("result-title").focus({ preventScroll: true });
    $("result").scrollIntoView({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  if (storageWarning)
    message(
      "This browser couldn’t save progress. Keep this page open to finish your puzzle.",
    );
}
function update() {
  if (!active || !controller) return;
  const result = assertResult(plugin.result(state, active.puzzle.content)),
    locked = cookieComplete(active.manifest.id),
    complete = result.status !== "playing" || locked;
  controller.update(state, locked);
  $("result").hidden = !complete;
  if (!complete) return;
  $("result-title").textContent =
    result.status === "playing" ? "You’ve played today." : result.title;
  $("result-detail").textContent =
    result.status === "playing"
      ? "Your completion cookie is saved, but the detailed progress is no longer available."
      : result.detail;
  $("word-note").textContent = result.status === "playing" ? "" : result.note;
  $("strategy").textContent =
    result.status === "playing" ? "" : result.strategy;
  $("share").hidden = result.status === "playing";
  const next = payload.games.find(
    (g) =>
      g.puzzle &&
      g.manifest.id !== active.manifest.id &&
      !saved(g).complete &&
      !cookieComplete(g.manifest.id),
  );
  $("next-game").href = next ? `#${next.manifest.id}` : "#";
  $("next-game").textContent = next
    ? `Try ${next.manifest.title}`
    : "Back to your word desk";
  $("reset-note").textContent =
    `Fresh puzzles at ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(payload.next_reset))} in your time zone.`;
}
async function openHelp() {
  $("game-instructions").replaceChildren();
  for (const game of active ? [active] : payload?.games || []) {
    try {
      const p = await getPlugin(game);
      $("game-instructions").append(ui.el("h3", "", game.manifest.title));
      for (const text of p.instructions)
        $("game-instructions").append(ui.el("p", "", text));
    } catch {
      $("game-instructions").append(
        ui.el("p", "", `${game.manifest.title} instructions are unavailable.`),
      );
    }
  }
  $("instructions").showModal();
}
window.addEventListener("hashchange", () => {
  if (!stale()) route();
});
window.addEventListener("storage", () => {
  if (!payload || stale()) return;
  if (active) {
    state = plugin.restoreState(
      saved(active).state ?? plugin.initialState(),
      active.puzzle.content,
      active.lexicons,
    );
    update();
  } else renderHome();
});
window.addEventListener("focus", () => {
  if (!payload || stale()) return;
  if (active) {
    state = plugin.restoreState(
      saved(active).state ?? plugin.initialState(),
      active.puzzle.content,
      active.lexicons,
    );
    update();
  } else renderHome();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) stale();
});
setInterval(() => {
  if (!document.hidden) stale();
}, 30000);
$("help").onclick = openHelp;
$("close-help").onclick = () => $("instructions").close();
$("retry").onclick = start;
$("share").onclick = async () => {
  if (!active) return;
  const result = assertResult(plugin.result(state, active.puzzle.content));
  if (result.status === "playing") return;
  const url = new URL(location.href);
  url.hash = active.manifest.id;
  url.search = "";
  const text = shareText(active.manifest, result, payload.number, url.href);
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    message("Result copied. Paste it into a message or post.");
  } catch (error) {
    if (error.name === "AbortError") return;
    $("share-fallback").hidden = false;
    $("share-fallback").value = text;
    $("share-fallback").focus();
    $("share-fallback").select();
    message("Copy the result below to share it.");
  }
};
start();
