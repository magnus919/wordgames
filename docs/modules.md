# Game module integration contract, version 1

Game packages are trusted application code. Installing one authorizes its JavaScript to run in the site origin; this is not a sandbox or public upload feature. Review code, licenses, accessibility, vocabulary and fixtures before installation. The LLM never authors or installs modules, schemas, lexicons or validators.

## Package and installation

```
my-game/
  manifest.json     # identity, presentation and server validation rules
  schema.json       # JSON Schema 2020-12 for a puzzle, no external references
  catalog.json      # reviewed fixtures and English lexicons
  game.js           # browser ES module exporting the v1 interface
  styles.css        # optional; scoped to [data-game="my-game"]
```

IDs are stable lowercase slugs, starting with a letter, at most 48 characters. Directory name and manifest ID must match. `api_version: 1` is the integration version; `version` is the package/content-state version. Both must be positive supported values. A package must contain at least one fixture; 14+ provides the intended opening buffer. Existing packages are never overwritten by the installer. Incompatible updates require an explicit content/state migration; do not bump a live version casually, since scheduled puzzles bind to that version. Retain compatibility with already published puzzle shapes.

Scaffold a package outside the live registry:

```sh
npm run new:game -- my-game
# Edit packages/my-game/{manifest.json,schema.json,catalog.json,game.js}.
cargo run --locked --manifest-path backend/Cargo.toml -- install-module packages/my-game
npm test
npm run check:games
```

The scaffolder copies the Fivefold reference implementation and gives it a new identity. It is a starting point, not a new game design. Install validates data, stages files, refuses overwrites, atomically renames the package, and updates `games/index.json` for static previews. The Rust service discovers installed directories; it does not rely on a hardcoded list. Restart services after installation. No core source edit or Rust rebuild is needed to discover a package.

With Compose, `games/` is mounted read-only into services. After installing on the host, run `docker compose run --rm init` to bootstrap that new game's reviewed content, then `docker compose restart web worker`. Existing games and dates remain untouched. The init command only bootstraps games with no existing editions. If interrupted partway, use generation to fill missing dates rather than moving existing dates.

For image-only deployment without mounts, copy the package into `/app/games` in a new image. For local static preview, the installer updates the JSON index automatically. The core JS shell, route matching, persistence, share layout, API handlers, schema gate and database schema contain no game-ID cases.

## Manifest and content contract

See the reference [Fivefold manifest](../games/fivefold/manifest.json) and [Unjumble manifest](../games/unjumble/manifest.json).

Presentation fields: `id`, `api_version`, `version`, `title`, `description`, `tagline`, `skill`, `theme` (blue/yellow/teal/purple), `art` (up to eight displayed characters), `entry` (always `game.js`). Optional `stylesheet` must be exactly `styles.css`. Names and descriptions render as text, never HTML. Keep titles short enough for phone layouts.

Each puzzle is arbitrary JSON shaped by `schema.json`; the only universal content field is `language: "en"`. The schema must reject unknown top-level fields (`additionalProperties: false`), declare required fields and impose bounded string/array lengths. External `$ref` fetches are prohibited. Use local `#` references if needed. JSON Schema provides structural validation; the host adds these semantic rules:

- `english_rules`: each rule names a JSON `pointer`, exact `length` (1–32), `lexicon` name, and `avoid_reuse`. The pointer addresses one word or a terminal array wildcard such as `/words/*`. Each value must be exact uppercase ASCII A–Z and a member of the referenced curated English lexicon. `avoid_reuse: true` contributes to the 90-day reuse check for this game.
- `clue_rules`: each rule identifies a clue `pointer` and an `answer_pointer`. Clues must be 12–180 characters, trimmed, without controls/markup. Case-insensitive literal answer leakage, including punctuation/space-separated letters, is rejected. A wildcard answer pointer checks leakage against every accepted answer.
- `anagram_rules` (optional): every word at `pointer` must have the same letter multiset as the single word at `answer_pointer`. Unjumble uses this for accepted alternatives.
- `generated_fields`: only declared clue pointers may change in a model response. They must have matching clue rules. Answers, accepted alternatives, definitions, language, and all other data remain byte-for-byte JSON-value equivalent to an approved fixture.

`catalog.json` has `fixtures` (puzzle objects) and `lexicons` (named string arrays). Both are controlled by the package author, never model output. An English label is not evidence of vocabulary membership: the host checks the allowlist. Language correctness depends on the editorial quality of that allowlist. A model cannot enlarge it. Structural checks cannot prove that a clue is English prose, accurate, fair or enjoyable; editorial and player evaluation remain necessary.

All publication paths—including bootstrap—use the same schema, English, clue, anagram and locked-field validation at the write boundary. Published rows are immutable. `(game_id, UTC date)` is unique, and publication/reuse checks plus attempt finalization share a short transaction. Models run outside that transaction. Installing a game creates no migration requirement because puzzle bodies are JSONB with a stable envelope.

## Browser module interface

`game.js` exports a default object:

```js
export default {
  apiVersion: 1,
  id: "my-game",
  instructions: ["Plain-language instructions."],
  initialState() {
    return {};
  },
  restoreState(raw, puzzle, lexicons) {
    /* sanitize and return state */
  },
  validatePuzzle(puzzle, lexicons) {
    /* true only for usable content */
  },
  result(state, puzzle) {
    /* return the result object below */
  },
  mount(context) {
    /* build DOM once; return { update(state, locked), destroy?() } */
  },
};
```

`restoreState` must tolerate null, malformed, legacy or tampered state, cap hints/attempts and preserve valid saved progress. `result` must be pure. `validatePuzzle` must check usable content and English dictionary membership before interaction. A runtime or contract error disables that game with a readable message, rather than guessing at rules.

The mount context supplies:

| Field                          | Contract                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `root`                         | This game's DOM host, carrying `data-game=ID`; create DOM inside it.                                                            |
| `puzzle`, `lexicons`, `number` | Today's frozen content and puzzle number. Treat as read-only.                                                                   |
| `state`                        | Sanitized starting state.                                                                                                       |
| `commit(nextState)`            | Revalidates state through `restoreState`, saves it, updates the game, handles completion cookies/activity and the result panel. |
| `canPlay()`                    | Check before every state-changing action; handles completion and UTC rollover.                                                  |
| `setMessage(text)`             | Shared live region for feedback.                                                                                                |
| `feedback`                     | The live-region node; place it beside the game's entry controls. The shell preserves it across routes.                          |
| `signal`                       | AbortSignal for event listeners; aborted on unmount. Clean up timers/observers in optional `destroy`.                           |
| `ui`                           | Shared game-kit helpers.                                                                                                        |

Use `commit` instead of writing storage, cookies, scores or the database yourself. Do not fetch another day's answer or call the LLM from the browser. Checks and player state stay client-side; no guesses or activity are sent to the server. Answer inspection and clearing local data remain possible by design.

The result object includes `status` (`playing`, `won`, `lost`), `score` (short text, e.g. `2/6` or `Solved`), integer `hints`, `graphic` (an array of spoiler-free emoji rows), and end-screen text `title`, `detail`, `note`, `strategy`. The host builds the share heading, hint disclosure and URL. Graphic rows accept only the supported colored square/check symbols and whitespace; never include answers or arbitrary prose. Only return a completed status after the state meets game rules.

## Reusable game kit

`js/game-kit.js` supplies:

- `layout`, `el`, `button`, `inputForm`: accessible DOM building, a persistent native text field, uppercase normalization, mobile keyboard support and submit controls.
- `letterBoard`, `keyboard`, `legend`: guess grids, repeated-letter scoring, remembered keyboard status, and text/symbol/color cues.
- `hints`: progressive, optional hint disclosure with a stable button and live announcements. The module owns and persists how many hints were used and which letters were revealed.
- `scoreLetters`, `scramble`, `signature`, `isEnglishWord`, `wordError`, `restoreWordState`: pure helpers shared by related word games.

The shell owns daily loading, UTC clock alignment, generic routing, storage isolation/versioning, completion cookies, activity history, result screens, cross-game invitations, native share, clipboard/selectable-text fallbacks, dialogs, reset time, and module failures. Use the existing spacing/layout/color classes; optional CSS must be scoped to the game host and cannot restyle global navigation or another module.

Do not assume there are two games, hardcode another game's ID, mutate core DOM, render model strings through `innerHTML`, or register unscoped permanent listeners. Honor reduced motion and keyboard focus. Invalid input should give a useful explanation and preserve attempts. Hints should help the player reason and be disclosed in scores. No health-benefit or population-level claims without evidence.

## Acceptance for an additional game

Before shipping, test the module's puzzle validator, state restoration, valid/invalid/repeated input, every win/loss boundary, hints across reload, spoiler-free sharing and alternative answers. Add schema fixtures for malformed, non-English and wrong-length model content. Exercise 360px, 768px and 1440px screens, keyboard, touch-like tile controls, symbol cues, and focus. Run the actual worker with mocked valid and invalid provider responses. Editorial review of clue accuracy and vocabulary is separate from these tests.

The test suite scaffolds/imports a third game and separately installs/discovers a third package through the Rust CLI; both use the same contracts without changing core source.
