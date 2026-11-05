# Build, host and operate Wordgames

All commands run from the repository root unless stated otherwise. Operator configuration lives in environment variables; start with the [configuration reference](configuration.md). Keep the same Compose project name and configuration file selection for daily operation, updates and backups.

## Prerequisites and first build

Use a host with Docker Engine/Desktop and the Docker Compose v2 plugin, a current Git checkout, outbound access to the selected LLM provider, and persistent storage for PostgreSQL. Node/Rust do not need to be installed on a Docker host: the multistage image builds Rust and includes the frontend. Docker and public hosting have not yet been exercised on the development host; see [QA evidence](qa.md) for current verification limits.

```sh
cp .env.example .env
chmod 600 .env
# Edit .env: set a random URL-safe POSTGRES_PASSWORD and the three LLM values.
docker compose config --quiet
docker compose build
docker compose up -d --no-build
docker compose ps -a
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/api/v1/daily
```

A single combined `docker compose up --build -d` is also supported. The services are:

- **postgres**: PostgreSQL 17 with a named data volume; no database port is published to the host.
- **init**: waits for DB health, applies migrations and bootstraps up to 14 dates for each game that has no editions. Successful exit is expected.
- **web**: waits for successful init, then serves the site and daily API as a non-root user. Its host port binds to loopback by default.
- **worker**: waits for init, optionally replenishes at startup and then runs cron in the foreground. The Rust generator maintains the buffer using the configured LLM, with validation before publication.

The first web pages are available without an LLM key because curated fixtures are bootstrapped. Missing credentials still leave the worker unable to replenish. Each current package has 31 canonical answers; expand the curated catalog before it exhausts its unused words. Auto-generation cannot enlarge its own English allowlist.

The Dockerfile uses locked Rust dependencies. Static shell assets are embedded in the web binary; changing them requires a rebuild. Game packages are baked into the image for direct execution, and the default Compose deployment overlays `GAMES_PATH` read-only so new packages can be installed without rebuilding Rust.

To build just a portable application image:

```sh
docker build --tag wordgames:local .
```

No registry, release pipeline, domain or credential has been provisioned by this repository. Use your chosen immutable image tag/digest when distributing images.

## Public HTTPS hosting with the supplied override

1. Point your public domain's DNS A record (and AAAA record if applicable) at the host. Make TCP ports 80 and 443 reachable. A domain with a broken IPv6 record can interfere with certificate issuance.
2. Set these values in `.env` alongside the DB/LLM settings:

   ```dotenv
   COMPOSE_FILE=compose.yaml:compose.production.yaml
   COMPOSE_PROJECT_NAME=wordgames
   SITE_DOMAIN=games.example.com
   ACME_EMAIL=operator@example.com
   WEB_BIND=127.0.0.1
   ```

3. Validate and launch:

   ```sh
   docker compose config --quiet
   docker compose build
   docker compose up -d --no-build
   docker compose logs --tail=100 caddy web worker
   curl --fail https://games.example.com/healthz
   curl --fail https://games.example.com/api/v1/daily
   ```

The override adds Caddy on ports 80/443. The checked-in `ops/Caddyfile` reads domain/contact values from environment and proxies to `web:8080` on the private network. Caddy handles certificate acquisition/renewal and HTTP-to-HTTPS redirection, with certificate state kept in named volumes. No Caddyfile edit is needed for your domain. These behaviors follow [Caddy's automatic HTTPS guidance](https://caddyserver.com/docs/quick-starts/https) and [environment substitution syntax](https://caddyserver.com/docs/caddyfile/concepts).

Alternatively, keep only `compose.yaml` and use an existing host/platform HTTPS reverse proxy targeting `127.0.0.1:8080`. Inside a shared Docker network, target `web:8080`; container `localhost` does not refer to another service. Keep PostgreSQL private. The API deliberately sends answers to browsers; TLS does not change the honor-system gameplay design.

The production override is a runnable template, not evidence that a public domain/certificate deployment has been verified. The images and package versions should be reviewed/pinned for your release process.

## Provider setup and changing configuration

Set `LLM_CHAT_URL`, `LLM_API_KEY`, and `LLM_MODEL` externally, then recreate worker:

```sh
docker compose up -d --no-deps --force-recreate worker
# Optional manual pass; uses worker's configured container environment.
docker compose run --rm --no-deps worker /app/wordgames generate
```

The URL is a **full HTTPS chat-completions endpoint**, not only a hostname or `/v1` base URL. Provider keys are never build arguments and are not passed to the web service. The endpoint must support the request/response contract described in [configuration.md](configuration.md). Do not add credentials to a game module or frontend file.

`CRON_SCHEDULE='17 3 * * *'` and `GENERATE_ON_STARTUP=true` are the defaults. For example, `CRON_SCHEDULE='0 */6 * * *'` checks every six hours in UTC. Each run skips durable published dates, but concurrent runs can still spend duplicate model cost. `GENERATE_ON_STARTUP=false` is useful when only the scheduled run should call the provider.

A manual generation command exits nonzero for missing configuration, provider failure or an incomplete buffer. No missing day is silently filled with rejected content. Old published dates remain intact. Inspect logs and audit rows, fix the cause, then retry. A completely full buffer makes no model requests, so a successful no-op does not prove provider credentials work. There is no live provider probe command yet.

See the configuration reference for all variables. `docker compose restart` does not replace container environment; use `up --force-recreate` after changes.

## Running against an external PostgreSQL service

The default Compose stack intentionally owns its bundled database. For an external DB, build the portable image and launch each role with a `DATABASE_URL` supplied by your hosting platform (including the appropriate TLS options for that service). The external database must exist and the configured migration principal must be able to create the application tables/functions.

For a Docker host, prepare two protected environment files **outside source control**:

```dotenv
# /secure/wordgames-web.env (example values; use your actual URI)
DATABASE_URL=postgres://USER:ENCODED_PASSWORD@database.example:5432/wordgames?sslmode=require
GAMES_DIR=/app/games
RUST_LOG=wordgames=info,tower_http=info
```

```dotenv
# /secure/wordgames-worker.env: same DATABASE_URL/GAMES_DIR/RUST_LOG, plus:
LLM_CHAT_URL=https://your-provider.example/v1/chat/completions
LLM_API_KEY=your-provider-key
LLM_MODEL=your-model-id
CRON_SCHEDULE=17 3 * * *
GENERATE_ON_STARTUP=true
```

Then run:

```sh
docker run --rm --env-file /secure/wordgames-web.env wordgames:local /app/wordgames bootstrap
docker run -d --name wordgames-web --restart unless-stopped \
  --env-file /secure/wordgames-web.env -p 127.0.0.1:8080:8080 wordgames:local
docker run -d --name wordgames-worker --restart unless-stopped --user root \
  --env-file /secure/wordgames-worker.env wordgames:local /app/worker.sh
```

These direct-image roles use the baked-in packages unless you mount a reviewed package directory at `/app/games`. Put your HTTPS proxy in front of web. Follow the database provider's certificate requirements; `sslmode=verify-full` with the appropriate trusted CA is preferable where supported/configured. The sample `require` setting requests TLS but does not establish all provider-specific certificate requirements.

Do not pass the worker env file to web: that would unnecessarily expose the LLM key to another role. Docker `--env-file` uses literal values; do not copy Compose-specific quoting/interpolation into these direct-container files. Container environment is not automatically read from the checkout's `.env`.

## Routine operation

```sh
docker compose ps -a
docker compose logs --tail=100 web worker
docker compose exec -T worker cat /etc/crontabs/root
# Inspect publication outcomes without exposing raw model requests or keys:
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT game_id,puzzle_date,outcome,reason FROM generation_attempts ORDER BY id DESC LIMIT 20"'
```

`/healthz` checks DB connectivity, while `/api/v1/daily` verifies current puzzle availability. Neither alone proves that the future buffer is healthy. Audit the edition schedule as well:

```sh
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT game_id,min(puzzle_date),max(puzzle_date),count(*) FROM editions WHERE puzzle_date >= (now() AT TIME ZONE '\''UTC'\'')::date GROUP BY game_id"'
```

The worker logs JSON to stdout/stderr through the container, including date/game and attempt status; no raw bearer keys or connection strings are intentionally logged. Avoid verbose HTTP wire logging with real credentials. A process crash may leave a `started` audit record; retries use committed editions as the publication authority.

For a new game, follow [modules.md](modules.md), then run `docker compose run --rm init` and recreate/restart web/worker to reload installed packages. Preserve the already scheduled shapes/versions of existing games.

## Backups and restore drills

The PostgreSQL named volume survives container replacement and ordinary `docker compose down`. A volume is not a backup. Keep encrypted/off-host backups according to your recovery requirements, and test restoring them.

```sh
mkdir -p backups
# Custom-format PostgreSQL dump; stdout is the backup, not SQL printed to logs.
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/wordgames.dump
```

`backups/` is ignored by Git and excluded from the Docker build context. Separately retain your reviewed game packages, release revision, and protected environment settings. Production Caddy's `/data` and `/config` volumes hold its certificate state; preserve them when replacing the host.

Restore into a **fresh isolated project** first, using the same database identity settings:

```sh
COMPOSE_PROJECT_NAME=wordgames-restore docker compose up -d --wait postgres
COMPOSE_PROJECT_NAME=wordgames-restore docker compose exec -T postgres sh -c \
  'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/wordgames.dump
```

This starts only the isolated database, not web/worker. Confirm row counts and scheduled dates through `psql`, then test the application against that restored database before a real recovery. Do not restore into the live database or start a generator against the restore target before inspecting it. Do not use `down --volumes` on your production project unless permanent data removal is intended.

## Updates and rollback

1. Take a database backup and retain the current code/image revision plus protected configuration.
2. Check out the reviewed new revision. Run `docker compose config --quiet` and `docker compose build`.
3. Apply with `docker compose up -d --no-build`; changed containers are recreated. An explicit `docker compose run --rm init` can be used for reviewed bootstrap/migration work. Normal startup also runs migrations; migration errors prevent serving against an incompatible DB.
4. Check health, daily API, logs and future content, and verify that game packages match stored schema/state versions.

Keep PostgreSQL major version upgrades separate from application updates. Initialization env variables do not migrate an existing DB identity. Migrations are forward-only; reverting an image is safe only if the old code is compatible with the current schema and published package versions. Otherwise plan a tested restore/migration recovery rather than automatically rolling backward. Recreating worker can trigger generation when `GENERATE_ON_STARTUP=true`.

## Troubleshooting

| Symptom                                    | Check                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Compose refuses to start                   | Required env values, `config --quiet`, quoted cron schedule and consistent project name/file selection.                               |
| Init exits nonzero                         | DB health/credentials, migration logs, readable valid game packages and matching existing schema. A successful init exit is expected. |
| Web is healthy but daily API returns 503   | Today's validated editions are missing or invalid. Inspect init/generation logs and schedule rows.                                    |
| Worker runs but nothing new appears        | Buffer may already be full; otherwise inspect provider settings, rejection reasons, catalog exhaustion and rendered crontab.          |
| Environment edit has no effect             | Recreate the affected container; a restart retains its old environment.                                                               |
| Existing database rejects changed password | Changing `.env` did not rotate the stored PostgreSQL credential. Coordinate an actual DB password change and container recreation.    |
| Caddy cannot obtain a certificate          | Public DNS/IPv6, reachable ports 80/443, correct domain, outbound ACME access and Caddy logs.                                         |
| A newly installed game does not appear     | Correct `GAMES_PATH`, manifest/entry contract, init for the new game and web/worker reload.                                           |

Local Compose configuration validation, full container execution, live provider compatibility and public certificate issuance are distinct checks. Consult the current [QA record](qa.md) rather than treating this runbook as a claim of production readiness.
