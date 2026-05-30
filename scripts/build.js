import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const distDir = join(root, "dist");

mkdirSync(distDir, { recursive: true });
const binDir = join(root, "bin");
mkdirSync(binDir, { recursive: true });

for (const file of ["index.js", "convert.js", "fonts.js", "defer.js", "html-optimize.js", "cli.js"]) {
  let content = readFileSync(join(srcDir, file), "utf8");
  content = content.replace(/from "\.\/([^"]+)\.js"/g, 'from "./$1.js"');
  writeFileSync(join(distDir, file), content);
}

writeFileSync(
  join(distDir, "index.d.ts"),
  readFileSync(join(srcDir, "index.d.ts"), "utf8")
);

const cliPath = join(distDir, "cli.js");
const cli = readFileSync(cliPath, "utf8");
if (!cli.startsWith("#!")) {
  writeFileSync(cliPath, `#!/usr/bin/env node\n${cli}`);
}

for (const binName of ["frontend-optimizer", "front-end"]) {
  writeFileSync(join(binDir, binName), readFileSync(cliPath, "utf8"));
}

console.log("Built dist/ and bin/");
