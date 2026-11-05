#!/usr/bin/env node
import { cp, readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const id = process.argv[2],
  destination = path.resolve(process.argv[3] || `packages/${id}`);
if (!/^[a-z][a-z0-9-]{0,47}$/.test(id || ""))
  throw Error(
    "Usage: node scripts/scaffold-game.mjs GAME-ID [NEW-PACKAGE-DIRECTORY]",
  );
try {
  await access(destination);
  throw Error(`Destination already exists: ${destination}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const source = fileURLToPath(new URL("../games/fivefold/", import.meta.url));
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const manifest = JSON.parse(
  await readFile(path.join(destination, "manifest.json"), "utf8"),
);
manifest.id = id;
manifest.title = id
  .split("-")
  .map((s) => s[0].toUpperCase() + s.slice(1))
  .join(" ");
manifest.description = "A new daily word puzzle.";
manifest.skill = "Wordplay";
await writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const entryPath = path.join(destination, "game.js"),
  entry = await readFile(entryPath, "utf8");
const idPattern = /\bid\s*:\s*(['"])fivefold\1/;
if (!idPattern.test(entry))
  throw Error("Reference module template changed; update the scaffolder.");
await writeFile(
  entryPath,
  entry.replace(idPattern, `id: ${JSON.stringify(id)}`),
);
console.log(
  `Created ${destination}. Customize its rules and content, then validate and install it. It is not live yet.`,
);
