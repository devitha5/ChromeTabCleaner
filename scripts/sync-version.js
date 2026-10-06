// Runs during `npm version <x.y.z>`: copies the new package.json version into manifest.json.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../manifest.json", import.meta.url);
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.version = process.env.npm_package_version;
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json version -> ${manifest.version}`);
