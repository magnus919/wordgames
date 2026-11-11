# Contributing to Wordgames

Thanks for helping make daily word games more enjoyable, accessible and fair.
Magnus Hedemark (@magnus919) maintains this project. Start with an issue for a
new game, dependency, API change or broad redesign; small fixes can go straight
to a pull request. Roadmap issues are proposals, not promises of delivery.

## Development workflow

1. Fork and clone the repository. Create a focused branch from `main`.
2. Use Node.js 22+, Python 3 for static preview, and Rust 1.90 or newer.
3. Run `npm ci`, then `npm run dev` for a fixture-backed browser preview.
4. Follow [the module contract](docs/modules.md) for games and
   [deployment documentation](docs/deployment.md) for the backend.
5. Add regression tests and update affected documentation. Keep unrelated
   formatting, dependency changes and generated content out of the patch.
6. Run the checks below and open a PR with the problem, approach and evidence.
   Explain skipped checks. Include screenshots for visible UI changes.

```sh
npm run format:check
npm test
npm run check:games
cargo fmt --manifest-path backend/Cargo.toml --check
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
```

Run the explicit PostgreSQL suite in README.md against a disposable database.
GitHub-hosted CI also validates Compose, builds the image and smoke-tests the
web and worker containers. Native tests do not require Docker. Never run tests
against production databases or publish live puzzles as a side effect of tests.

## Design expectations

- Use original game names, copy and visual assets. Familiar mechanics do not
  grant permission to copy another game's branding or content.
- Provide keyboard and touch operation, visible focus and non-color feedback.
- Preserve per-game/date/version saved progress and spoiler-free sharing.
- Validate puzzle solvability and dictionary provenance, not just JSON shape.
- Keep curated answers and publication gates authoritative. Model-generated
  text is untrusted input; never silently substitute demo content in production.
- Keep player data local. Discuss any analytics, accounts or remote tracking first.
- Preserve third-party notices. See [dictionary provenance](docs/dictionaries.md).

## Review and merge

Pull requests and passing `test` CI checks are required for `main`; no second
reviewer is required because this is a sole-maintainer project. Resolve review
conversations before merge. Only the maintainer decides what to merge and when
to deploy. Contributors and automation must not bypass checks or push to `main`.

AI-assisted contributions are welcome. Describe material generated code and
how you checked it; you remain responsible for correctness, provenance and
security. Agents must also follow [AGENTS.md](AGENTS.md).

Contributions are provided under the project's MIT license. Do not submit code,
word lists or assets you lack permission to redistribute.
