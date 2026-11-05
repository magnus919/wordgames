# Daily word desk

## Experience and visual plan

Audience: English-language players looking for a short, thoughtful daily ritual. The primary job is to make trying, learning, and returning feel good. No timer, leaderboard, streak loss, or claim of medical/cognitive improvement.

Tokens: paper #F5F6FC, ink #18233E, cobalt #2649DF, lavender #E3E8FF, sunflower #FFDF63, fern #267651. Avenir Next / Avenir with a system sans fallback; weight and generous letter spacing on game pieces rather than decorative headline effects. Left-aligned introductions; centered boards. Flat letter trays supply the visual identity, with restrained borders around controls.

Layout alternatives considered:

```text
A: [intro | daily progress]    B: [large marketing hero]
   [game trays, in pairs]         [equal feature cards]
   [a quiet return cue]          [separate game CTA]
```

Choose A: the games themselves are the invitation. On phones the intro, trays and progress stack; on larger screens game trays sit beside one another. During play, the board stays centered and a companion panel explains what to do. Decorative arrows and unnecessary metadata were removed. The distinctive element is the tactile letter tray.

Fivefold: six guesses, curated five-letter English vocabulary, duplicate attempts free, remaining turns explicit. Keyboard letters and tiles include ✓ / • / × plus a text legend. A constraint summary preserves known positions. Optional hints reveal a semantic clue, then one still-unknown position; the revealed position and hint usage are saved. Hints are disclosed in sharing. A native input is available in “Type a guess instead,” alongside the on-screen keyboard. Finished games teach the word's meaning and offer a strategy prompt.

Unjumble is a gentle warm-up. Six tiles can be tapped into an answer, edited with a normal text field or keyboard, shuffled freely, and cleared. Used tile instances remain distinguishable for repeated letters. A clue invites meaning-based retrieval. Any curated English anagram wins. Because all approved arrangements are accepted, there is no artificial three-attempt limit. Invalid entries are explained without penalty. Its score records a solve and hint use.

Return cues: daily completion count, a seven-day activity strip, reset time in the player's local time zone, and an invitation to try another game. No invented global statistics or punitive streak messaging. Shared scores disclose assistance and omit answers. Completion moves focus to the result heading; reduced-motion preferences are honored.

These activities involve letter deduction, lexical retrieval and semantic association. This is a design intent, not evidence of durable cognitive improvement. Player research and editorial evaluation have not been conducted.

## Runtime and module boundaries

PostgreSQL is the source of truth for dated content in deployed mode. Each `(game_id, UTC date)` is an independently published puzzle with an immutable JSON envelope. Adding a game cannot replace another game's puzzle. Browser checks remain authoritative for the casual play experience; answers are inspectable. There are no player accounts or guess-collection endpoints.

Rust/Axum serves explicit frontend assets, package assets, a public game registry, today's content and a DB health check. Packages are discovered from `GAMES_DIR`. Arbitrary source directories and secrets are not served. The frontend shell discovers the same registry and dynamically imports each game's module. A game-specific runtime failure is contained to that game. Per-game state restoration and result hooks keep the shell independent of gameplay rules.

See the [versioned module contract](modules.md) for package structure, installation, schema rules, browser hooks and reusable UI helpers. JSON Schema controls shape; host rules enforce English allowlist membership, exact word lengths, clue leakage, optional anagram relations and locked content. No model-produced code, schema or lexicon is executed or admitted.

The daily API exposes current-date puzzles only, uses server UTC, and returns 503 when no current puzzles are available. If a newly installed game lacks today's content while other games are ready, it appears explicitly unavailable. The browser never substitutes demo content for a backend outage. A plain static Python development server gets a labeled preview only when the API returns a non-JSON 404. Deployed rollover uses server time plus elapsed browser time, so a wrong device clock does not select a different puzzle.

## Generation and publication

The Rust CLI worker runs from cron, maintaining today plus the next 13 days for every installed game. For each missing date it chooses a curated, unused fixture. The model receives the schema and template and may revise only the package's declared clue fields. Every model response is untrusted.

Exact lengths, A–Z, curated English membership, schema requirements/extra-field rejection, locked answers/definitions, clue bounds, literal answer leakage and anagram relationships are blocking gates. English membership is an explicit editorial allowlist, not a model language label or probabilistic guess. Catalog coverage is deliberately bounded and needs expansion for public use. Semantic clue accuracy and enjoyment are not established by these gates.

Each attempt retains game, date, model name, package version, validation version, status and a bounded reason code. Rejected output and provider failures create no published puzzle. Published content is linked to its successful attempt. No request body, bearer key or database DSN is logged by the application. Retries are bounded to three per game/date per run and at most 42 calls per game for a completely empty buffer, with 45-second request timeouts and 128 KiB response caps. Cron tries again at the next configured invocation (daily by default). A crash may leave a `started` record; durable edition state determines retry behavior.

Publication uses a short transaction with an advisory transaction lock, rechecks the game's 90-day answer reuse window, inserts the puzzle and finalizes the attempt atomically. No transaction is open during an LLM request. Concurrent jobs may incur duplicate model cost but publish one edition per game/date. A unique key and an immutable update/delete trigger protect the result. The gate also runs at the durable write boundary, independently of the generator's earlier checks.

Bootstrap fills up to 14 dates for a game that has no editions, using curated fixtures and the same validation gate. It does not roll the finite catalog forward automatically. Each starter game has 31 canonical answers. Generation fails closed when unused approved words run out. Expand catalogs before exhausting them; the model cannot expand its own allowlist.

## Implementation sources

[Axum Router/serve](https://docs.rs/axum/latest/axum/struct.Router.html), [SQLx embedded migrations](https://docs.rs/sqlx/0.8.6/sqlx/macro.migrate.html), [Reqwest client timeouts](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html), and [JSON Schema reusable validators and disabled external resolution](https://docs.rs/jsonschema/0.33.0/jsonschema/) informed implementation. `backend/Cargo.lock` records resolved dependencies. These documents describe APIs; they do not certify this deployment.
