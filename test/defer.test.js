import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deferAssetsInHtml,
  isNonCriticalScript,
  isNonCriticalStylesheet,
} from "../dist/index.js";

const sampleHtml = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="./css/main.css">
  <link rel="stylesheet" href="./fonts/local-fonts.css">
  <link rel="stylesheet" href="./css/animations.css">
  <script src="./js/app.js"></script>
  <script src="https://www.googletagmanager.com/gtag/js?id=UA-123"></script>
</head>
<body>
  <script src="./js/analytics.js"></script>
</body>
</html>`;

test("isNonCriticalScript detects analytics", () => {
  assert.equal(
    isNonCriticalScript("https://www.googletagmanager.com/gtag/js?id=UA-123"),
    true
  );
  assert.equal(isNonCriticalScript("./js/app.js"), false);
});

test("isNonCriticalStylesheet detects font and animation css", () => {
  assert.equal(isNonCriticalStylesheet("./fonts/local-fonts.css"), true);
  assert.equal(isNonCriticalStylesheet("./css/animations.css"), true);
  assert.equal(isNonCriticalStylesheet("./css/main.css"), false);
});

test("deferAssetsInHtml adds defer to analytics and async-loads non-critical css", () => {
  const { html, changes } = deferAssetsInHtml(sampleHtml);

  assert.equal(changes.length, 4);
  assert.match(html, /googletagmanager\.com[^>]*defer/);
  assert.match(html, /media="print"/);
  assert.match(html, /onload="this\.media='all'"/);
  assert.match(html, /<noscript><link rel="stylesheet" href="\.\/fonts\/local-fonts\.css"><\/noscript>/);
  assert.doesNotMatch(html, /<script[^>]*app\.js[^>]*defer/);
  assert.doesNotMatch(html, /main\.css" media="print"/);
});

test("deferAssetsInHtml with --all-scripts defers app bundle", () => {
  const { html } = deferAssetsInHtml(sampleHtml, {
    deferAllScripts: true,
    criticalScripts: ["app.js"],
  });

  assert.doesNotMatch(html, /<script[^>]*app\.js[^>]*defer/);
  assert.match(html, /analytics\.js[^>]*defer/);
});
