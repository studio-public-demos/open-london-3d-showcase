import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frameDir = path.join(root, "artifacts", "video", "frames");
const outputDir = path.join(root, "assets", "demo-video");
const poster = path.join(outputDir, "open-london-3d-drive-poster.png");
const port = 4187;
const fps = 8;

const mimeTypes = {
  ".css": "text/css",
  ".geojson": "application/geo+json",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

await rm(path.join(root, "artifacts", "video"), { recursive: true, force: true });
await mkdir(frameDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
    const relativePath = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath.slice(1));
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== path.join(root, "index.html")) throw new Error("Invalid path");
    const content = await readFile(resolved);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(resolved)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
let frame = 0;
let writeQueue = Promise.resolve();
let lastFrameTimestamp = -Infinity;
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (metadata.timestamp - lastFrameTimestamp < 1 / fps) return;
  lastFrameTimestamp = metadata.timestamp;
  const filename = `frame-${String(frame).padStart(5, "0")}.jpg`;
  frame += 1;
  writeQueue = writeQueue.then(() => writeFile(path.join(frameDir, filename), Buffer.from(data, "base64")));
});

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.locator("#loading.hidden").waitFor({ state: "attached", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: poster });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });

  await page.waitForTimeout(4000);
  await page.selectOption("#playback-speed", "4");
  await page.selectOption("#camera-mode", "chase");
  await page.click("#play");
  await page.waitForTimeout(9000);

  await page.selectOption("#camera-mode", "driver");
  await page.selectOption("#lighting-mode", "dusk");
  await page.waitForTimeout(8000);

  await page.selectOption("#camera-mode", "orbit");
  await page.selectOption("#lighting-mode", "night");
  await page.waitForTimeout(8000);

  await page.selectOption("#camera-mode", "pedestrian");
  await page.selectOption("#lighting-mode", "dawn");
  await page.waitForTimeout(8000);

  await page.selectOption("#camera-mode", "overview");
  await page.selectOption("#lighting-mode", "day");
  await page.waitForTimeout(5000);

  await page.click("#provenance-toggle");
  await page.waitForTimeout(5000);

  await page.click("#provenance-toggle");
  await page.click("#performance-toggle");
  await page.selectOption("#camera-mode", "chase");
  await page.waitForTimeout(5000);

  await page.click("#performance-toggle");
  await page.selectOption("#camera-mode", "overview");
  if ((await page.locator("#play").textContent()) === "Pause") await page.click("#play");
  await page.waitForTimeout(4000);
  await cdp.send("Page.stopScreencast");
  await writeQueue;
  await writeFile(path.join(root, "artifacts", "video", "capture.json"), JSON.stringify({ frameCount: frame, duration: 56 }, null, 2));
} finally {
  await page.close();
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(`Captured ${frame} frames at ${fps} fps`);
console.log(`Captured ${poster}`);
