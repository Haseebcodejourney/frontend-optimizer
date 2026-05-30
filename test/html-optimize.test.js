import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  optimizeHtmlContent,
  reduceThirdPartyScripts,
  setLcpFetchPriority,
} from "../dist/index.js";

const sampleHtml = `<!DOCTYPE html>
<html>
<head>
  <script src="https://www.googletagmanager.com/gtag/js"></script>
  <script src="./app.js"></script>
</head>
<body>
  <img src="./hero.png" alt="Hero">
  <img src="./thumb.png" loading="lazy" alt="Thumb">
  <iframe src="https://example.com/ad"></iframe>
</body>
</html>`;

test("setLcpFetchPriority adds fetchpriority high to first image", () => {
  const { html, changes } = setLcpFetchPriority(sampleHtml);
  assert.equal(changes.length, 1);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /hero\.png/);
});

test("reduceThirdPartyScripts defers external scripts", () => {
  const { html, changes, thirdPartyScripts } = reduceThirdPartyScripts(sampleHtml);
  assert.equal(thirdPartyScripts.length, 1);
  assert.equal(changes.length, 1);
  assert.match(html, /googletagmanager\.com[^>]*defer/);
  assert.match(html, /data-third-party="deferred"/);
  assert.doesNotMatch(html, /<script[^>]*app\.js[^>]*defer/);
});

test("optimizeHtmlContent adds iframe dimensions and fetchpriority", async () => {
  const fixturesDir = join(import.meta.dirname, "fixtures-html");
  await mkdir(fixturesDir, { recursive: true });

  const imagePath = join(fixturesDir, "hero.png");
  await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toFile(imagePath);

  const html = sampleHtml.replace("./hero.png", "./fixtures-html/hero.png");
  const { html: output, changes } = await optimizeHtmlContent(html, {
    baseDir: import.meta.dirname,
    reduceThirdParty: false,
  });

  assert.ok(changes.some((change) => change.type === "dimensions"));
  assert.ok(changes.some((change) => change.type === "fetchpriority"));
  assert.match(output, /width="800"/);
  assert.match(output, /height="600"/);
  assert.match(output, /fetchpriority="high"/);

  await rm(fixturesDir, { recursive: true, force: true });
});
