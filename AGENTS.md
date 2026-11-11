# Agent contribution guide

Read README.md and CONTRIBUTING.md before changing this repository. Use relevant
files in docs/ for configuration, modules, dictionaries, deployment and QA.

## Map

- `games/<id>/`: trusted game packages, manifests, schemas and curated catalogs.
- `js/`: browser shell, shared UI, content validation and local persistence.
- `backend/`: Rust API, PostgreSQL editions, generation and publication gates.
- `tests/`, `backend/tests/`: JavaScript and Rust tests.
- `ops/`, `compose*.yaml`, `Dockerfile`: runtime packaging and worker scheduling.

## Guardrails

- Work on a branch with scoped commits. Preserve user edits; do not rewrite
  history, force-push, merge, deploy or change repository policy without approval.
- Never commit credentials, `.env`, database dumps, user data or private operator
  details. `.env.example` must contain placeholders only.
- Do not invoke real paid model endpoints or production databases in tests.
- Preserve daily edition immutability, answer locking, vocabulary checks and
  local progress compatibility. Schema/version changes need migration thinking.
- Scaffold new games with `npm run new:game -- <id>`; follow docs/modules.md.
  Do not assume the current schema can express a new mechanic without checking.
- Prefer deterministic fixtures and tests over assertions that generated content
  is correct. Distinguish structural validity from semantic quality.
- Do not fetch or install untrusted game packages: modules execute as site code.
- Keep third-party licenses and provenance with imported data and dependencies.

Run the checks in CONTRIBUTING.md. Inspect affected browser behavior for UI
work, including keyboard/touch, reload, repeated input and day rollover. Report
exact checks passed, failed or not run. A local pass is not proof of a remote CI
pass or a successful deployment. Never weaken a test to conceal a failure.
