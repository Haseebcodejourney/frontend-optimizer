import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractFontImportsFromCss,
  extractFontLinksFromHtml,
  extractRemoteFontUrlsFromCss,
  isFontStylesheetUrl,
  rewriteFontUrls,
} from "../dist/index.js";

test("isFontStylesheetUrl detects Google Fonts", () => {
  assert.equal(
    isFontStylesheetUrl(
      "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap"
    ),
    true
  );
  assert.equal(isFontStylesheetUrl("https://example.com/style.css"), false);
});

test("extractFontLinksFromHtml", () => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">
  <link href="https://cdn.example.com/app.css" rel="stylesheet">
</head>
<body></body>
</html>`;

  const links = extractFontLinksFromHtml(html);
  assert.equal(links.length, 1);
  assert.match(links[0], /fonts\.googleapis\.com/);
});

test("extractFontImportsFromCss", () => {
  const css = `@import url('https://fonts.bunny.net/css?family=open-sans:400,700');
body { margin: 0; }`;

  const imports = extractFontImportsFromCss(css);
  assert.equal(imports.length, 1);
  assert.match(imports[0], /fonts\.bunny\.net/);
});

test("rewriteFontUrls replaces remote paths", () => {
  const css = `@font-face {
  font-family: 'Roboto';
  src: url(https://fonts.gstatic.com/s/roboto/v30/file.woff2) format('woff2');
}`;

  const urls = extractRemoteFontUrlsFromCss(css);
  assert.equal(urls.length, 1);

  const rewritten = rewriteFontUrls(
    css,
    new Map([[urls[0], "roboto.woff2"]])
  );
  assert.match(rewritten, /url\("roboto\.woff2"\)/);
  assert.doesNotMatch(rewritten, /fonts\.gstatic\.com/);
});
