import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../data-manifest.json", import.meta.url), "utf8"));
let failed = false;

for (const [file, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(new URL(`../${file}`, import.meta.url));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    console.error(`${file}: checksum mismatch\n  expected ${expected}\n  actual   ${actual}`);
    failed = true;
  } else {
    console.log(`${file}: ok`);
  }
}

if (failed) process.exitCode = 1;
