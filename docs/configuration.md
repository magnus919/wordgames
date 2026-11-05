# Configuration reference

Application/operator settings are supplied at runtime through container environment variables. No LLM key, endpoint, model, domain or database password belongs in source code, the image, a game package or browser JavaScript. The repository provides `.env.example`; real `.env` files are ignored by Git and excluded from the Docker build context.

With Compose, `.env` is an input to variable substitution, not a file the Rust process reads. `compose.yaml` explicitly passes each service only its settings. In particular, the LLM variables go to **worker only**, and domain/certificate variables go to **Caddy only**. Exported shell variables take precedence over `.env`; an alternative file can be selected with `docker compose --env-file /absolute/path/wordgames.env ...`. See [Docker's environment-variable reference](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation).

## Compose inputs

| Variable               | Default                               | Purpose / recipient                                                                                                                                              |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`    | Required                              | Bundled DB's initial password and the application connection strings. Use a long random URL-safe value.                                                          |
| `POSTGRES_DB`          | `wordgames`                           | Initial database name and application database selection.                                                                                                        |
| `POSTGRES_USER`        | `wordgames`                           | Initial database user and application connections.                                                                                                               |
| `PORT`                 | `8080`                                | Host port mapped to the web service's internal port 8080.                                                                                                        |
| `WEB_BIND`             | `127.0.0.1`                           | Host interface for the web port. The production Caddy service reaches web over the private Compose network.                                                      |
| `GAMES_PATH`           | `./games`                             | Host package directory mounted read-only at `/app/games` in init, web and worker. Relative to the Compose project directory.                                     |
| `RUST_LOG`             | `wordgames=info,tower_http=info`      | Rust logging filter, passed to init/web/worker.                                                                                                                  |
| `LLM_CHAT_URL`         | Empty                                 | Worker: full HTTPS chat-completions URL, such as `https://your-provider.example/v1/chat/completions`. Not a base URL.                                            |
| `LLM_API_KEY`          | Empty                                 | Worker: bearer credential for that endpoint. Never exposed to web, Caddy or the browser.                                                                         |
| `LLM_MODEL`            | Empty                                 | Worker: exact model identifier recognized by the provider.                                                                                                       |
| `CRON_SCHEDULE`        | `17 3 * * *`                          | Worker: five numeric cron fields in UTC. Quote the value in `.env`. Digits, spaces, `*`, `/`, `,` and `-` are supported; named months/days and `@daily` are not. |
| `GENERATE_ON_STARTUP`  | `true`                                | Worker: `true` runs one replenishment pass before starting cron; `false` starts cron after migrations without that pass. Other values fail startup.              |
| `COMPOSE_FILE`         | `compose.yaml` in the example         | Compose CLI setting. For the supplied Linux/macOS HTTPS deployment use `compose.yaml:compose.production.yaml`.                                                   |
| `COMPOSE_PROJECT_NAME` | `wordgames` in the example            | Compose CLI setting: stable namespace for containers, network and persistent volumes. Keep it consistent across deployments.                                     |
| `SITE_DOMAIN`          | Required only for production override | Caddy: a public DNS hostname such as `games.example.com`, without scheme/path.                                                                                   |
| `ACME_EMAIL`           | Required only for production override | Caddy: certificate-management contact address.                                                                                                                   |

The bundled PostgreSQL URI is assembled from `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. Use letters/digits/underscore for the DB name/user and letters/digits/hyphen/underscore for the password, because this Compose file does not URL-encode them. With a separately supplied `DATABASE_URL`, percent-encode reserved characters in URI components.

PostgreSQL initialization variables apply to a **new volume**. Editing them does not rename a database/user or rotate an existing database password. For an existing database, perform the corresponding DB operation first during an appropriate maintenance window, then update environment values and recreate application containers. Preserve the volume and existing identity for routine deployments.

## Direct image/native Rust settings

These are used when running the image directly or the native Rust binary. Compose intentionally supplies stable internal addresses/paths rather than asking operators to configure them twice.

| Variable                                   | Default                                               | Scope                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Required                                              | init/web/worker: PostgreSQL URI. Direct image execution can point to an external database. Compose constructs this value for its bundled database.          |
| `BIND_ADDRESS`                             | `0.0.0.0:8080`                                        | Web: container/native socket. Compose fixes this internal address; use `PORT` and `WEB_BIND` for its host publication.                                      |
| `GAMES_DIR`                                | `/app/games` in the image; checkout `games/` natively | Package location inside the process filesystem. A direct Docker bind mount can replace the baked-in packages. Compose uses `GAMES_PATH` for its host mount. |
| `RUST_LOG`                                 | As above                                              | Rust process logging.                                                                                                                                       |
| `LLM_CHAT_URL`, `LLM_API_KEY`, `LLM_MODEL` | Required by `generate`                                | Same provider settings as above. All three must be non-empty.                                                                                               |
| `CRON_SCHEDULE`, `GENERATE_ON_STARTUP`     | As above                                              | Used by `/app/worker.sh`, not by a one-shot `generate` command.                                                                                             |

Use a full HTTPS endpoint whose protocol supports OpenAI-style `messages`, `response_format: {"type":"json_object"}`, `max_tokens`, and `choices[0].message.content`. Compatibility with any individual provider/model is not yet verified. Redirects are disabled, and plain HTTP is allowed only for loopback development. A container's `localhost` refers to itself, not the host or another Compose service.

Missing provider settings do not prevent the web service from serving bootstrapped content. Worker generation fails visibly, and cron remains available for later runs. A structurally valid but wrong-length, non-approved-English or otherwise invalid response is rejected and audited; it does not replace published puzzles. `.env` secrets can contain special characters, but quote them using Compose's documented `.env` syntax when needed. Avoid printing `docker compose config` output into public logs because it contains resolved credentials; use `config --quiet` for a check.

## Applying changes

Environment changes require **container recreation**, not only `docker compose restart`:

```sh
# After editing LLM settings or scheduling:
docker compose up -d --no-deps --force-recreate worker

# After editing host web binding or logging:
docker compose up -d --no-deps --force-recreate web

# After editing domain or certificate contact (production override enabled):
docker compose up -d --no-deps --force-recreate caddy
```

The worker reads environment on startup, renders a private root crontab, validates the numeric five-field syntax, and fixes the command to the Rust `generate` subcommand. It does not evaluate cron text as shell code. UTC is the scheduler/image time zone and the puzzle-day policy; do not override it. Cron itself validates numerical ranges. Inspect worker logs after changing a schedule.

An operator can inject these same variables from a hosting platform or secret manager instead of using `.env`. Environment values are visible to administrators who can inspect containers; no secret-file provider is implemented here.

## Versioned policies and game data

Not everything is an operator setting. Game manifests, schemas, approved English lexicons, reviewed fixtures, rule implementations and hint rules are versioned **package data/code**, mounted under `GAMES_DIR`. Change them through the [module workflow](modules.md), not through an LLM environment variable.

The following are currently fixed application policies: 14-day content buffer including today; 90-day per-game answer reuse exclusion; three attempts per missing game/date per run; 45-second provider timeout, 10-second connection timeout, 128 KiB response cap and 1,000 requested output tokens; publication/schema validation limits and UTC daily rollover. They are documented rather than represented as nonfunctional environment toggles. No additional tuning variable is supported unless listed here.

## Configuration verification

Run `node scripts/check-compose.mjs docker compose` to render both configurations using sentinel values and assert custom database settings, schedule/startup values, port/mount overrides and LLM credential isolation. This never starts containers or calls a model. The same check accepts a standalone Compose executable path. `npm test` separately checks cron rendering and rejection of command/newline injection.
