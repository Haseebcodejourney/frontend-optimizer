import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

/** @typedef {import('./index.js').LocalizeFontsOptions} LocalizeFontsOptions */
/** @typedef {import('./index.js').LocalizeFontsResult} LocalizeFontsResult */
/** @typedef {import('./index.js').FontFileResult} FontFileResult */

const MODERN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const FONT_STYLESHEET_HOSTS = [
  "fonts.googleapis.com",
  "fonts.bunny.net",
  "fonts.cdnfonts.com",
];

const HTML_LINK_RE =
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/gi;

const CSS_IMPORT_RE =
  /@import\s+(?:url\()?["']?([^"')]+)["']?\)?[^;]*;/gi;

const CSS_URL_RE = /url\(["']?([^"')]+)["']?\)/gi;

const FONT_EXT_RE = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
const FONT_FACE_RE = /@font-face\s*\{[^}]+\}/gi;
const PRELOAD_LINK_RE =
  /<link\b[^>]*\brel=["']preload["'][^>]*\bas=["']font["'][^>]*>/gi;

/**
 * @param {string} css
 * @param {string} [display=swap]
 * @returns {string}
 */
export function ensureFontDisplaySwap(css, display = "swap") {
  return css.replace(FONT_FACE_RE, (block) => {
    if (/font-display\s*:/i.test(block)) {
      return block.replace(/font-display\s*:\s*[^;]+/i, `font-display: ${display}`);
    }
    return block.replace(/\{/, ` {\n  font-display: ${display};`);
  });
}

/**
 * @param {string} css
 * @returns {{ href: string, type: string }[]}
 */
export function extractPreloadableFontsFromCss(css) {
  /** @type {{ href: string, type: string }[]} */
  const fonts = [];

  for (const block of css.match(FONT_FACE_RE) ?? []) {
    const urlMatch = block.match(/url\(["']?([^"')]+)["']?\)/i);
    if (!urlMatch) continue;

    const href = urlMatch[1].trim();
    if (!FONT_EXT_RE.test(href)) continue;

    const ext = extname(href.split("?")[0]).toLowerCase();
    const type =
      ext === ".woff2"
        ? "font/woff2"
        : ext === ".woff"
          ? "font/woff"
          : ext === ".ttf"
            ? "font/ttf"
            : "font/woff2";

    fonts.push({ href, type });
  }

  return fonts;
}

/**
 * @param {string} html
 * @param {{ href: string, type: string }[]} fonts
 * @param {string} cssBaseDir
 * @param {string} htmlBaseDir
 * @returns {string}
 */
export function injectFontPreloads(html, fonts, cssBaseDir, htmlBaseDir) {
  if (fonts.length === 0) return html;

  const existing = new Set(
    [...html.matchAll(PRELOAD_LINK_RE)].map((match) => match[0])
  );

  const preloadTags = fonts
    .map(({ href, type }) => {
      const absoluteFontPath = resolve(cssBaseDir, href.split("?")[0]);
      let relativeHref = relative(htmlBaseDir, absoluteFontPath).replace(/\\/g, "/");
      if (!relativeHref.startsWith(".")) {
        relativeHref = `./${relativeHref}`;
      }

      const tag = `<link rel="preload" href="${relativeHref}" as="font" type="${type}" crossorigin>`;
      if ([...existing].some((entry) => entry.includes(relativeHref))) {
        return "";
      }
      return tag;
    })
    .filter(Boolean)
    .join("\n");

  if (!preloadTags) return html;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${preloadTags}`);
  }

  return `${preloadTags}\n${html}`;
}

/**
 * @param {{ href: string, type: string }[]} fonts
 * @param {string[]} [patterns]
 * @param {number} [limit=2]
 * @returns {{ href: string, type: string }[]}
 */
export function selectKeyFontsForPreload(fonts, patterns, limit = 2) {
  if (patterns && patterns.length > 0) {
    const matched = fonts.filter(({ href }) =>
      patterns.some((pattern) => href.toLowerCase().includes(pattern.toLowerCase()))
    );
    if (matched.length > 0) {
      return matched.slice(0, limit);
    }
  }

  const woff2 = fonts.filter(({ href, type }) =>
    href.endsWith(".woff2") || type === "font/woff2"
  );
  return (woff2.length > 0 ? woff2 : fonts).slice(0, limit);
}

/**
 * @param {string} html
 * @param {string} fileDir
 * @param {LocalizeFontsOptions} [options]
 * @returns {Promise<string>}
 */
export async function applyFontPerformanceToHtml(html, fileDir, options = {}) {
  if (options.fontDisplaySwap === false && options.preloadFonts === false) {
    return html;
  }

  const cssFileName = options.fontsCssName ?? "local-fonts.css";
  const fontsDir = resolve(fileDir, options.fontsDir ?? "./fonts");
  const cssPath = join(fontsDir, cssFileName);

  let cssContent = "";
  try {
    cssContent = await readFile(cssPath, "utf8");
  } catch {
    return html;
  }

  if (options.fontDisplaySwap !== false) {
    const nextCss = ensureFontDisplaySwap(
      cssContent,
      options.fontDisplay ?? "swap"
    );
    if (nextCss !== cssContent) {
      cssContent = nextCss;
      await writeFile(cssPath, cssContent, "utf8");
    }
  }

  if (options.preloadFonts === false) {
    return html;
  }

  const preloadable = extractPreloadableFontsFromCss(cssContent);
  const selected = selectKeyFontsForPreload(
    preloadable,
    options.preloadFontPatterns,
    options.preloadFontCount ?? 2
  );

  return injectFontPreloads(html, selected, fontsDir, fileDir);
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isFontStylesheetUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return FONT_STYLESHEET_HOSTS.some(
      (pattern) => host === pattern || host.endsWith(`.${pattern}`)
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isRemoteFontFileUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  return FONT_EXT_RE.test(url.split("#")[0]);
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractFontLinksFromHtml(html) {
  const links = [];
  for (const match of html.matchAll(HTML_LINK_RE)) {
    const href = match[1] ?? match[2];
    if (href && isFontStylesheetUrl(href)) {
      links.push(href);
    }
  }
  return [...new Set(links)];
}

/**
 * @param {string} css
 * @returns {string[]}
 */
export function extractFontImportsFromCss(css) {
  const imports = [];
  for (const match of css.matchAll(CSS_IMPORT_RE)) {
    const href = match[1]?.trim();
    if (href && (isFontStylesheetUrl(href) || /^https?:\/\//i.test(href))) {
      imports.push(href);
    }
  }
  return [...new Set(imports)];
}

/**
 * @param {string} css
 * @returns {string[]}
 */
export function extractRemoteFontUrlsFromCss(css) {
  const urls = [];
  for (const match of css.matchAll(CSS_URL_RE)) {
    const href = match[1]?.trim();
    if (href && isRemoteFontFileUrl(href)) {
      urls.push(href);
    }
  }
  return [...new Set(urls)];
}

/**
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * @param {string} fontUrl
 * @param {number} index
 * @returns {string}
 */
function filenameFromFontUrl(fontUrl, index) {
  try {
    const parsed = new URL(fontUrl);
    const base = sanitizeFilename(basename(parsed.pathname.split("?")[0]));
    if (base && extname(base)) return base;
  } catch {
    /* fall through */
  }
  return `font-${index}.woff2`;
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": MODERN_UA },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  return response.text();
}

/**
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<number>}
 */
async function downloadBinary(url, destPath) {
  const response = await fetch(url, {
    headers: { "User-Agent": MODERN_UA },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
  return buffer.byteLength;
}

/**
 * @param {string} css
 * @param {Map<string, string>} urlMap - remote url -> relative filename
 * @returns {string}
 */
export function rewriteFontUrls(css, urlMap) {
  return css.replace(CSS_URL_RE, (full, rawUrl) => {
    const url = rawUrl.trim();
    const local = urlMap.get(url);
    if (!local) return full;
    return `url("${local}")`;
  });
}

/**
 * @param {string} stylesheetUrl
 * @param {string} fontsDir
 * @param {Map<string, string>} globalUrlMap
 * @returns {Promise<{ css: string, files: FontFileResult[] }>}
 */
async function localizeStylesheetCss(stylesheetUrl, fontsDir, globalUrlMap) {
  const css = await fetchText(stylesheetUrl);
  const remoteUrls = extractRemoteFontUrlsFromCss(css);

  /** @type {FontFileResult[]} */
  const files = [];
  const localMap = new Map();

  let index = globalUrlMap.size;

  for (const remoteUrl of remoteUrls) {
    if (globalUrlMap.has(remoteUrl)) {
      localMap.set(remoteUrl, globalUrlMap.get(remoteUrl));
      continue;
    }

    const filename = filenameFromFontUrl(remoteUrl, index++);
    const destPath = join(fontsDir, filename);
    const size = await downloadBinary(remoteUrl, destPath);

    globalUrlMap.set(remoteUrl, filename);
    localMap.set(remoteUrl, filename);
    files.push({ remoteUrl, localPath: destPath, filename, size });
  }

  return {
    css: rewriteFontUrls(css, localMap),
    files,
  };
}

/**
 * @param {string} filePath
 * @param {LocalizeFontsOptions} [options]
 * @returns {Promise<LocalizeFontsResult>}
 */
export async function localizeFontsInFile(filePath, options = {}) {
  const absolutePath = resolve(filePath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${absolutePath}`);
  }

  const ext = extname(absolutePath).toLowerCase();
  if (ext !== ".html" && ext !== ".htm" && ext !== ".css") {
    throw new Error(`Unsupported file type "${ext}". Use .html or .css`);
  }

  const fileDir = dirname(absolutePath);
  const fontsDir = resolve(fileDir, options.fontsDir ?? "./fonts");
  const cssFileName = options.fontsCssName ?? "local-fonts.css";
  const fontsCssPath = join(fontsDir, cssFileName);
  const updateSource = options.updateSource !== false;

  await mkdir(fontsDir, { recursive: true });

  const source = await readFile(absolutePath, "utf8");
  /** @type {string[]} */
  const stylesheetUrls = [];
  /** @type {FontFileResult[]} */
  const downloadedFiles = [];
  /** @type {string[]} */
  const localizedCssBlocks = [];

  const globalUrlMap = new Map();

  if (ext === ".html" || ext === ".htm") {
    stylesheetUrls.push(...extractFontLinksFromHtml(source));
  } else {
    stylesheetUrls.push(...extractFontImportsFromCss(source));
    const inlineUrls = extractRemoteFontUrlsFromCss(source);
    for (const remoteUrl of inlineUrls) {
      if (globalUrlMap.has(remoteUrl)) continue;

      const filename = filenameFromFontUrl(remoteUrl, globalUrlMap.size);
      const destPath = join(fontsDir, filename);
      const size = await downloadBinary(remoteUrl, destPath);
      globalUrlMap.set(remoteUrl, filename);
      downloadedFiles.push({ remoteUrl, localPath: destPath, filename, size });
    }

    if (downloadedFiles.length > 0 && stylesheetUrls.length === 0) {
      localizedCssBlocks.push(rewriteFontUrls(source, globalUrlMap));
    }
  }

  for (const stylesheetUrl of stylesheetUrls) {
    const { css, files } = await localizeStylesheetCss(
      stylesheetUrl,
      fontsDir,
      globalUrlMap
    );
    localizedCssBlocks.push(css);
    downloadedFiles.push(...files);
  }

  let outputContent = source;
  let fontsCssRelative = relative(fileDir, fontsCssPath).replace(/\\/g, "/");
  if (!fontsCssRelative.startsWith(".")) {
    fontsCssRelative = `./${fontsCssRelative}`;
  }

  if (localizedCssBlocks.length > 0) {
    let mergedCss = localizedCssBlocks.join("\n\n");
    if (options.fontDisplaySwap !== false) {
      mergedCss = ensureFontDisplaySwap(mergedCss, options.fontDisplay ?? "swap");
    }
    await writeFile(fontsCssPath, mergedCss, "utf8");

    if (updateSource) {
      if (ext === ".html" || ext === ".htm") {
        outputContent = replaceHtmlFontLinks(outputContent, stylesheetUrls, fontsCssRelative);
        outputContent = await applyFontPerformanceToHtml(outputContent, fileDir, options);
      } else {
        outputContent = replaceCssFontImports(outputContent, stylesheetUrls);
        if (stylesheetUrls.length === 0 && globalUrlMap.size > 0) {
          outputContent = rewriteFontUrls(outputContent, globalUrlMap);
        } else if (stylesheetUrls.length > 0) {
          outputContent = `@import url("${fontsCssRelative}");\n${outputContent}`;
        }
      }

      await writeFile(absolutePath, outputContent, "utf8");
    }
  }

  return {
    filePath: absolutePath,
    fontsDir,
    fontsCssPath: localizedCssBlocks.length > 0 ? fontsCssPath : null,
    fontsCssRelative: localizedCssBlocks.length > 0 ? fontsCssRelative : null,
    stylesheetUrls,
    downloadedFiles,
    updated: localizedCssBlocks.length > 0 && updateSource,
  };
}

/**
 * @param {string} html
 * @param {string[]} remoteUrls
 * @param {string} localCssHref
 * @returns {string}
 */
function replaceHtmlFontLinks(html, remoteUrls, localCssHref) {
  let output = html;
  let insertedLocal = false;

  for (const remoteUrl of remoteUrls) {
    const escaped = escapeRegex(remoteUrl);
    const linkRe = new RegExp(
      `<link\\b[^>]*\\bhref=["']${escaped}["'][^>]*\\brel=["']stylesheet["'][^>]*>|<link\\b[^>]*\\brel=["']stylesheet["'][^>]*\\bhref=["']${escaped}["'][^>]*>`,
      "gi"
    );

    output = output.replace(linkRe, () => {
      if (insertedLocal) return "";
      insertedLocal = true;
      return `<link rel="stylesheet" href="${localCssHref}">`;
    });
  }

  return output;
}

/**
 * @param {string} css
 * @param {string[]} remoteUrls
 * @returns {string}
 */
function replaceCssFontImports(css, remoteUrls) {
  let output = css;
  for (const remoteUrl of remoteUrls) {
    const escaped = escapeRegex(remoteUrl);
    const importRe = new RegExp(
      `@import\\s+(?:url\\()?["']?${escaped}["']?\\)?[^;]*;\\s*`,
      "gi"
    );
    output = output.replace(importRe, "");
  }
  return output;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string | string[]} patterns
 * @param {LocalizeFontsOptions & { recursive?: boolean; onError?: (file: string, error: Error) => void }} [options]
 * @returns {Promise<{ results: LocalizeFontsResult[]; processed: number; failed: number }>}
 */
export async function localizeFonts(patterns, options = {}) {
  const fastGlob = (await import("fast-glob")).default;
  const inputs = Array.isArray(patterns) ? patterns : [patterns];

  const files = await fastGlob(
    inputs.flatMap((input) => {
      const normalized = input.replace(/\\/g, "/");
      if (normalized.includes("*")) return normalized;
      if (/\.(html?|css)$/i.test(normalized)) return normalized;
      return options.recursive !== false
        ? `${normalized}/**/*.{html,htm,css}`
        : `${normalized}/*.{html,htm,css}`;
    }),
    { onlyFiles: true, absolute: true }
  );

  /** @type {LocalizeFontsResult[]} */
  const results = [];
  let failed = 0;

  for (const file of files) {
    try {
      const result = await localizeFontsInFile(file, options);
      if (result.stylesheetUrls.length > 0 || result.downloadedFiles.length > 0) {
        results.push(result);
      }
    } catch (error) {
      failed += 1;
      options.onError?.(file, /** @type {Error} */ (error));
    }
  }

  return {
    results,
    processed: results.length,
    failed,
  };
}
