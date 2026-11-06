# Acceptance and QA evidence

These are implementer-run checks, not independent acceptance certification. No separate evaluator, human editorial panel or real-device lab has reviewed this version.

## Risk-based acceptance contract

| Risk                                     | Priority | Required oracle/check                                                                                                                                    |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad model content reaches a player       | Blocking | Reject wrong lengths, non-English allowlist misses, Unicode, lowercase, missing/unknown fields, wrong assigned words, leaked answers and oversized text. |
| Retry changes a live puzzle              | Blocking | Unique game/date key, immutable trigger, transactional publication, duplicate and concurrent insertion tests.                                            |
| Model/provider failure empties today     | Blocking | Buffered content, failed/rejected attempt records, no edition on invalid output, explicit API unavailability.                                            |
| A new game requires editing core         | Blocking | Scaffold/import a third package, install/discover it through the Rust CLI, reject overwrites, generic state and registry tests.                          |
| Guess scoring is unfair                  | Blocking | Repeated-letter oracles, approved anagrams, invalid/repeated guesses consume no attempts, hints persisted and disclosed.                                 |
| Daily state resets or mixes games/dates  | Blocking | Date/version binding, server clock authority, isolated storage, reload checks for both games.                                                            |
| Controls exclude devices or players      | High     | 360/768/1440px layouts with no overflow, tile controls, native/physical keyboards, focus, text/symbol/color cues.                                        |
| Clue accuracy and appropriate difficulty | High     | Curated definitions; structure is not semantic proof. Requires editorial evaluation and player research.                                                 |
| Deployment or scheduling fails           | High     | Container build, Compose health/API, cron startup, DB restart/persistence. Requires Docker runtime evidence.                                             |

## Fivefold dictionary regression, November 6, 2026

The live Fivefold clue “Think of a bird with long legs.” reproduced the reported rejection of STORK. The accepted guess list had only 781 entries. The [dictionary update](dictionaries.md) expands it to 12,578 five-letter words while retaining every original guess and leaving all answer lists, fixtures, schema versions and game logic unchanged.

- `npm test`: **25 passed**, including STORK acceptance, other common words outside the answer pool, invalid and repeated input without state mutation, preserved guesses/hints after reload, and deterministic generation from the pinned source.
- `npm run format:check`, `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and `npm run check:games`: passed.
- Rust unit/non-DB integration tests: **6 passed**. The explicit PostgreSQL suite: **4 passed** in a fresh isolated temporary instance. An initial attempt against yesterday's inactive disposable instance timed out; no production database was used for tests.
- Independent review confirmed all 781 original guesses are retained and every other catalog field is identical. The imported dictionary's MIT notice is included in the game package so Docker copies it with the dictionary.

## Automated results, November 5, 2026

- `npm test`: **20 passed**. Includes registry/clock boundaries, both game contracts, invalid vocabulary, duplicate-letter scoring, alternate anagrams, hints and sharing, generic storage, a scaffolded third game's actual dynamic import, and cron configuration/injection rejection.
- `cargo test --locked --manifest-path backend/Cargo.toml`: **4 domain tests and 2 non-DB integration tests passed**. The four DB tests are intentionally ignored by this command and were separately executed below. Model tests use a local HTTP mock, including malformed JSON, HTTP 429 and oversized output. Installer tests stage/discover a third package and reject overwrites.
- Explicit PostgreSQL suite: **4 passed**, against isolated schemas in temporary PostgreSQL **17.11**. Tests exercise concurrent publication, immutable update/delete, reuse rejection, validation failure without a row, audit/retry recovery, today's API availability, and the real Rust replenishment loop rejecting three wrong-length model responses then publishing one valid retry. A second worker pass publishes zero duplicates.
- `cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings`: passed.
- Rust formatting and Prettier checks: passed.

During development, two DB tests initially collided on timestamp-only schema names. Fixture identity now includes process ID plus an atomic counter; the full DB suite passes with isolated schemas. An initial scaffolder copy failure was corrected and is covered by the dynamic-import test. These were repaired failures, not silently skipped cases.

No real provider calls were made. Temporary PostgreSQL test tooling lives under `/private/tmp/wordgames-pg`, outside the application dependency tree. No system database service was installed. The local Rust preview uses that temporary database with curated bootstrap content; it is not a deployed production service.

## Browser charter and observations

Required cases were recorded before execution: invalid/repeated input must preserve the remaining-turn count; a hint must survive reload; both completed games must survive reload; home must show both completed; scores must disclose assistance and omit answers; phone/tablet/desktop must not overflow.

Observed in the in-app browser:

| Case                           | Observation                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid Fivefold word          | `PERRO` rejected, six guesses still available.                                                                                          |
| Repeated Fivefold guess        | Repeated `CRANE` rejected, five guesses remained in the static prototype run. Pure tests also verify no state mutation.                 |
| Hint and progress reload       | After `CRANE` and one hint, reload restored five guesses and the semantic hint.                                                         |
| Letter feedback                | `CRANE` against `PLANT` showed A/N correct, C/R/E absent; symbols and a position summary agreed.                                        |
| Fivefold completed reload      | `PLANT` solved in two guesses with one hint; both the grid and hint disclosure survived reload on the Rust/PostgreSQL site.             |
| Unjumble tiles                 | Tapping G then A produced `GA`; shuffling kept that answer and marked used tile instances.                                              |
| Unjumble constraints           | `GARDER` rejected with “Use each tile exactly once.” No attempt limit or penalty.                                                       |
| Unjumble completed reload      | `GARDEN` solved with a hint; reload retained the completed result.                                                                      |
| Return invitation and activity | Fivefold invited Unjumble. After both solves, home showed both “Played today” statuses and today's activity dot.                        |
| Responsive widths              | Tested 360px, 768px and 1440px viewports; document width did not exceed viewport width. Screenshots inspected for landing/game layouts. |

The final native service was restarted after validation to serve the current embedded shell. Screenshots are saved as `wordgames-desktop.jpg` and `wordgames-tablet.jpg` in the Codex visualization output directory for this chat.

## Evidence still missing

Docker Engine is not installed on this host. Configuration-only checks were run with the official standalone Docker Compose **v5.7.0**, downloaded to a temporary directory and checksum-verified against the release metadata. Both the local Compose file and the HTTPS override render successfully. `scripts/check-compose.mjs` verifies custom database names/credentials, logging, port and package-mount settings, worker schedule/startup settings, and that LLM variables reach only worker. Shell syntax checks also passed for the worker scripts and ten deployment/configuration documentation examples.

Local Docker image build, container execution, cron process behavior, Caddy certificate issuance and container restart/persistence remain **not verified**. CI is configured to build the image, run Compose, validate a healthy daily API and check cron startup, but that workflow has not run on a remote repository. Native PostgreSQL tests establish database/application behavior, not container deployment readiness.

Native mobile share sheets, clipboard-denial fallback, screen-reader behavior, real touch devices, and the full browser matrix remain unverified. Share formatting and answer exclusion have automated coverage; that does not establish every platform integration. Browser emulated sizes are not physical device evidence.

The starter catalogs have 31 canonical answers per game. Fivefold now uses a broader, pinned [English guess dictionary](dictionaries.md); Unjumble retains its curated vocabulary. English membership means membership in the curated module lexicon; neither an LLM language label nor JSON Schema can certify semantic language quality. Catalog expansion, human editorial checks, real-player engagement testing and a configured provider are required before a sustained public launch. No cognitive or health benefit is claimed.
