// Builds a clean copy of the extension (no tests, node_modules, docs) and zips it.
//   dist/ChromeTabCleaner/              -> "Load unpacked" this folder
//   dist/ChromeTabCleaner-v<version>.zip -> upload to the Chrome Web Store / attach to a release
import { cpSync, existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Everything the extension needs at runtime. Add new runtime files here.
const FILES = ["manifest.json", "background.js", "popup.html", "popup.css", "popup.js", "lib", "icons"];

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const out = join(dist, "ChromeTabCleaner");

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest.json is ${manifest.version}, package.json is ${pkg.version}.`);
  console.error("Run `npm version <x.y.z>` to update both.");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of FILES) {
  if (!existsSync(join(root, f))) throw new Error(`Missing runtime file: ${f}`);
  cpSync(join(root, f), join(out, f), { recursive: true });
}

const zip = `ChromeTabCleaner-v${manifest.version}.zip`;
execFileSync("zip", ["-qr", "-X", join(dist, zip), ".", "-x", ".*"], { cwd: out });
console.log(`Built dist/ChromeTabCleaner/ and dist/${zip}`);
