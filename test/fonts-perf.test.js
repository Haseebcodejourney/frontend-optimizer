import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensureFontDisplaySwap,
  extractPreloadableFontsFromCss,
  injectFontPreloads,
  selectKeyFontsForPreload,
} from "../dist/index.js";

test("ensureFontDisplaySwap adds swap to @font-face", () => {
  const css = `@font-face {
  font-family: 'Inter';
  src: url("inter.woff2") format('woff2');
}`;

  const result = ensureFontDisplaySwap(css);
  assert.match(result, /font-display:\s*swap/);
});

test("extractPreloadableFontsFromCss finds woff2 files", () => {
  const css = `@font-face {
  font-family: 'Inter';
  src: url("inter-regular.woff2") format('woff2');
}
@font-face {
  font-family: 'Inter';
  src: url("inter-bold.woff2") format('woff2');
}`;

  const fonts = extractPreloadableFontsFromCss(css);
  assert.equal(fonts.length, 2);
  assert.equal(fonts[0].type, "font/woff2");
});

test("injectFontPreloads adds preload links to head", () => {
  const html = `<!DOCTYPE html><html><head></head><body></body></html>`;
  const result = injectFontPreloads(
    html,
    [{ href: "inter.woff2", type: "font/woff2" }],
    "/project/fonts",
    "/project"
  );

  assert.match(result, /rel="preload"/);
  assert.match(result, /as="font"/);
  assert.match(result, /crossorigin/);
  assert.match(result, /fonts\/inter\.woff2/);
});

test("selectKeyFontsForPreload prefers matching patterns", () => {
  const fonts = [
    { href: "regular.woff2", type: "font/woff2" },
    { href: "bold.woff2", type: "font/woff2" },
  ];

  const selected = selectKeyFontsForPreload(fonts, ["bold"], 1);
  assert.equal(selected.length, 1);
  assert.match(selected[0].href, /bold/);
});
