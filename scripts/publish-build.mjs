import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const rootAssets = path.join(root, "assets");
const distAssets = path.join(dist, "assets");

const builtAssets = new Set(await fs.readdir(distAssets));
for (const entry of await fs.readdir(rootAssets, { withFileTypes: true })) {
  if (entry.isFile() && /\.(?:css|js)$/.test(entry.name) && !builtAssets.has(entry.name)) {
    await fs.rm(path.join(rootAssets, entry.name));
  }
}

await fs.copyFile(path.join(dist, "index.html"), path.join(root, "index.html"));
await fs.cp(distAssets, rootAssets, { recursive: true });

const redirect = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0; url=../">
    <title>Open London 3D Drive</title>
    <script>location.replace(new URL("../", location.href));</script>
  </head>
  <body><a href="../">Open London 3D Drive</a></body>
</html>
`;
await fs.writeFile(path.join(root, "demo", "index.html"), redirect);
console.log("Published dist/index.html and dist/assets to the GitHub Pages root");
