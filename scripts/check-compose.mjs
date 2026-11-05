#!/usr/bin/env node
// Configuration-only integration check. No Docker daemon or real credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const command = process.argv.slice(2);
if (!command.length)
  throw Error(
    "Usage: node scripts/check-compose.mjs docker compose (or PATH/TO/docker-compose)",
  );
const [binary, ...prefix] = command;
const cwd = fileURLToPath(new URL("../", import.meta.url));
const env = {
  ...process.env,
  COMPOSE_FILE: "compose.yaml",
  COMPOSE_PROJECT_NAME: "wordgames-config-check",
  POSTGRES_DB: "configuration_db",
  POSTGRES_USER: "configuration_user",
  POSTGRES_PASSWORD: "configuration_test_only",
  LLM_CHAT_URL: "https://provider.example/v1/chat/completions",
  LLM_API_KEY: "configuration_sentinel_not_a_credential",
  LLM_MODEL: "configuration-model",
  CRON_SCHEDULE: "0 */6 * * *",
  GENERATE_ON_STARTUP: "false",
  PORT: "18080",
  WEB_BIND: "127.0.0.1",
  GAMES_PATH: "/tmp/wordgames-config-games",
  RUST_LOG: "wordgames=debug,tower_http=info",
  SITE_DOMAIN: "games.example.com",
  ACME_EMAIL: "operator@example.com",
};
for (const production of [false, true]) {
  const args = [
    ...prefix,
    "--env-file",
    ".env.example",
    "-f",
    "compose.yaml",
    ...(production ? ["-f", "compose.production.yaml"] : []),
    "config",
    "--format",
    "json",
  ];
  const config = JSON.parse(
    execFileSync(binary, args, { cwd, env, encoding: "utf8" }),
  );
  for (const role of ["init", "web", "worker"]) {
    const service = config.services[role];
    assert.equal(
      service.environment.DATABASE_URL,
      "postgres://configuration_user:configuration_test_only@postgres:5432/configuration_db",
    );
    assert.equal(service.environment.RUST_LOG, env.RUST_LOG);
    assert.ok(
      service.volumes.some(
        (v) =>
          v.source === env.GAMES_PATH &&
          v.target === "/app/games" &&
          v.read_only === true,
      ),
    );
  }
  for (const role of [
    "postgres",
    "init",
    "web",
    ...(production ? ["caddy"] : []),
  ]) {
    assert.equal(
      Object.keys(config.services[role].environment || {}).some((k) =>
        k.startsWith("LLM_"),
      ),
      false,
      `LLM settings leaked to ${role}`,
    );
  }
  for (const variable of [
    "LLM_CHAT_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "CRON_SCHEDULE",
    "GENERATE_ON_STARTUP",
  ])
    assert.equal(config.services.worker.environment[variable], env[variable]);
  assert.equal(
    config.services.postgres.environment.POSTGRES_DB,
    env.POSTGRES_DB,
  );
  assert.equal(
    config.services.postgres.environment.POSTGRES_USER,
    env.POSTGRES_USER,
  );
  assert.equal(config.services.postgres.ports, undefined);
  assert.ok(
    config.services.web.ports.some(
      (p) => String(p.published) === "18080" && p.host_ip === "127.0.0.1",
    ),
  );
  if (production) {
    assert.equal(
      config.services.caddy.environment.SITE_DOMAIN,
      env.SITE_DOMAIN,
    );
    assert.equal(config.services.caddy.environment.ACME_EMAIL, env.ACME_EMAIL);
  } else assert.equal(config.services.caddy, undefined);
  console.log(
    `${production ? "HTTPS" : "Local"} Compose configuration and environment isolation passed.`,
  );
}
