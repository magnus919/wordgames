# Wordgames

[![Checks](https://github.com/magnus919/wordgames/actions/workflows/check.yml/badge.svg)](https://github.com/magnus919/wordgames/actions/workflows/check.yml)

[Play Wordgames](https://wordgames.brandyapple.com/) · [Feature roadmap](https://github.com/magnus919/wordgames/issues)

A daily English word-game site with a Rust backend, PostgreSQL content store, scheduled LLM clue generation, and installable game packages. Gameplay checks, daily progress and sharing remain in the browser. There are no accounts, analytics, or player-guess APIs.

**Fivefold** is a six-guess letter-deduction game. **Unjumble** is a gentler six-letter rearrangement puzzle with a clue, no attempt limit, and accepted English alternatives. Both offer optional hints, accessible color/symbol feedback, saved daily progress, a word note after play, and spoiler-free sharing with hint disclosure.

Operator configuration is externalized through Docker environment variables, including LLM settings and the worker schedule. Start with the checked-in guides:

- [Configuration reference](docs/configuration.md): variables, defaults, secret handling and applying changes.
- [Build and deployment runbook](docs/deployment.md): image builds, Compose, public HTTPS, external PostgreSQL, backups and upgrades.

## Run with Docker

```sh
cp .env.example .env
# Set a long URL-safe POSTGRES_PASSWORD; add your LLM endpoint/key/model when ready.
docker compose up --build -d
```

Open http://localhost:8080. PostgreSQL is private to the Compose network and persists in a named volume. The init service migrates and bootstraps 14 dates of curated content per new game. The Rust web service runs as a non-root user. The cron worker runs at startup and at 03:17 UTC each day by default (`CRON_SCHEDULE` controls this), keeping today plus the following 13 days populated. Worker credentials stay server-side. When no provider is configured, the bootstrap buffer works but replenishment fails visibly; configure the worker before that buffer runs out.

The default web bind is loopback. For public hosting, the supplied `compose.production.yaml` adds Caddy HTTPS using `SITE_DOMAIN` and `ACME_EMAIL` environment variables; see the deployment runbook. The public API intentionally includes answers for browser checks. Do not mistake cookies for anti-cheat enforcement.

## Local development

```sh
npm run dev  # Python 3 static preview at http://localhost:5173; no runtime npm dependencies
npm test    # Node.js 22+ recommended

# Native Rust service, with an existing PostgreSQL database:
export DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/wordgames
cargo run --locked --manifest-path backend/Cargo.toml -- bootstrap
cargo run --locked --manifest-path backend/Cargo.toml -- serve
```

Rust defaults to port 8080. `GAMES_DIR` selects the package directory (default: this checkout's `games/`). Available commands are `serve`, `migrate`, `bootstrap`, `generate`, `validate-games`, and `install-module PACKAGE_DIRECTORY`.

A plain static server loads packaged fixtures as an explicitly labeled preview and repeats each finite catalog. A deployed backend outage never silently falls back to demo content. Server UTC governs the deployed day; the browser uses the server timestamp plus elapsed time for rollover, avoiding reliance on a correctly set device clock.

## Add games without editing core code

```sh
npm run new:game -- my-game
# Customize the new package in packages/my-game/.
cargo run --locked --manifest-path backend/Cargo.toml -- install-module packages/my-game
npm run check:games
```

The site discovers installed packages and provides persistence, daily scheduling, hints/UI helpers, result screens, activity and sharing. Read the [module integration contract](docs/modules.md) before authoring or installing one. The Compose services mount `games/` read-only; after installation, bootstrap the new game and restart web/worker as documented there. Packages are trusted site code, not untrusted user uploads.

## Generated content must pass a publication gate

The Rust worker calls a configured HTTPS OpenAI-compatible chat-completions endpoint using `LLM_CHAT_URL` (full URL), `LLM_API_KEY`, and `LLM_MODEL`. It chooses unused curated fixtures, asks the model to revise only declared clue fields, then evaluates the full response against:

- The package's strict JSON Schema, including exact word length and required fields.
- Uppercase A–Z and membership in its curated English lexicon; a model's English label is insufficient.
- Locked answers, definitions, accepted alternatives and other non-generated values.
- Clue bounds and literal answer leakage, plus declared anagram relationships.
- Per-game 90-day answer reuse rules, unique daily publication and immutable stored editions.

Rejected/failed attempts are recorded separately and never become daily puzzles. Each date gets at most three attempts per run (42 calls per game for a completely empty 14-day buffer); timeouts and response-size limits bound each call. Retry happens on the next scheduled run. Existing games' published dates do not change when another module is installed. Process interruption can leave a `started` audit record; retries check durable editions rather than treating that record as completion.

The current packages have **31 canonical answers each**. Fivefold accepts **12,578 five-letter English guesses** from a pinned, licensed word-game dictionary; see [dictionary provenance and regeneration](docs/dictionaries.md). Unjumble retains its curated accepted alternatives. Expand the curated catalogs before a longer launch. Generation fails closed when unused words run out; it cannot admit its own vocabulary. Automated checks establish structure, dictionary membership and publication invariants, not semantic accuracy, engaging difficulty, or cognitive/medical benefit. Human editorial and player evaluation are still needed.

## Verification

```sh
npm test
cargo fmt --manifest-path backend/Cargo.toml --check
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/DISPOSABLE_DB \
  cargo test --locked --manifest-path backend/Cargo.toml --test publishing -- --ignored
```

Database tests create isolated schemas inside a disposable database. Do not use a production database. Tests cover malformed/foreign/wrong-length model content, immutable/concurrent publication, rejection and retry audit trails, real PostgreSQL worker recovery against a mocked LLM, API availability, module installation, scoring, hints, storage, and spoiler-free sharing. CI supplies PostgreSQL and builds the Docker image. See [QA plan/evidence](docs/qa.md) and [experience/architecture decisions](docs/design.md).

Browser persistence is per date and game. Local storage saves progress/hints/activity; first-party completion cookies expire after two days. Clearing browser data, another browser, or inspecting answers can bypass the honor system. Live credentials and operator-specific deployment settings are not included in this repository.

## Community and license

See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), the
[community expectations](CODE_OF_CONDUCT.md) and [security policy](SECURITY.md).
Maintained by [Magnus Hedemark](https://github.com/magnus919).

Project code is [MIT licensed](LICENSE). Imported dictionary data retains its
[separate MIT attribution](games/fivefold/WORD-LIST-LICENSE.txt).
