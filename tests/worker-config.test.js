import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const render = (value) =>
  spawnSync("sh", ["ops/render-crontab.sh"], {
    encoding: "utf8",
    env: { ...process.env, CRON_SCHEDULE: value },
  });
test("worker cron is externally configured and keeps its command fixed", () => {
  for (const [value, expected] of [
    ["", "17 3 * * *"],
    ["0 */6 * * *", "0 */6 * * *"],
    ["5,35 1-4 * * 1-5", "5,35 1-4 * * 1-5"],
  ]) {
    const result = render(value);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      `${expected} /app/wordgames generate >> /proc/1/fd/1 2>> /proc/1/fd/2\n`,
    );
  }
});
test("worker cron rejects injected commands, newlines and wrong field counts", () => {
  for (const value of [
    "* * * *",
    "* * * * * *",
    "@daily",
    "* * * * *; echo bad",
    "$(echo bad) * * * *",
    "0 1 * * *\n0 2 * * *",
    "0\t1 * * *",
  ]) {
    const result = render(value);
    assert.notEqual(result.status, 0, value);
    assert.equal(result.stdout, "");
  }
});
