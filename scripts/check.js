const { spawnSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const files = ["server.js", "main.js", "preload.js"];
function walk(folder) {
  for (const file of readdirSync(folder, { withFileTypes: true })) {
    const name = join(folder, file.name);
    if (file.isDirectory()) walk(name);
    else if (name.endsWith(".js")) files.push(name);
  }
}
for (const folder of ["src", "shared", "js", "test"]) walk(folder);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax OK: ${files.length} files`);
