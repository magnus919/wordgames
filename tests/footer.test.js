import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8",
);
test("one shared GitHub credit stays outside route-managed content", () => {
  const footers = [...shell.matchAll(/<footer>([\s\S]*?)<\/footer>/g)];
  assert.equal(footers.length, 1);
  const footer = footers[0][1];
  assert.match(
    footer,
    /<a[^>]+href="https:\/\/github\.com\/magnus919\/wordgames"[^>]*>\s*Wordgames on GitHub<\/a\s*>/,
  );
  assert.equal(
    (shell.match(/https:\/\/github\.com\/magnus919\/wordgames/g) || []).length,
    1,
  );
  assert.ok(shell.indexOf("</main>") < shell.indexOf("<footer>"));
  assert.doesNotMatch(footer, /\bhidden\b|target="_blank"/);
});
