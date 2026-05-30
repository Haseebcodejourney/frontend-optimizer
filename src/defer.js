import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

/** @typedef {import('./index.js').DeferAssetsOptions} DeferAssetsOptions */
/** @typedef {import('./index.js').DeferAssetsResult} DeferAssetsResult */
/** @typedef {import('./index.js').DeferredChange} DeferredChange */

const SCRIPT_TAG_RE =
  /<script\b([^>]*?)>([\s\S]*?)<\/script>|<script\b([^>]*?)\/>/gi;

const STYLESHEET_LINK_RE =
  /<link\b([^>]*?\brel=["']stylesheet["'][^>]*?)>|<link\b([^>]*?\bhref=["'][^"']+["'][^>]*?\brel=["']stylesheet["'][^>]*?)>/gi;

export const DEFAULT_NON_CRITICAL_SCRIPT_PATTERNS = [
  "analytics",
  "gtag",
  "googletagmanager",
  "google-analytics",
  "facebook",
  "fbevents",
  "twitter",
  "hotjar",
  "intercom",
  "chat",
  "pixel",
  "adsbygoogle",
  "doubleclick",
  "tracking",
  "recaptcha",
  "maps.googleapis",
  "sharethis",
  "disqus",
  "hubspot",
  "segment",
  "mixpanel",
  "clarity",
  "non-critical",
  "lazy",
  "deferred",
];

export const DEFAULT_NON_CRITICAL_CSS_PATTERNS = [
  "local-fonts",
  "/fonts/",
  "fontawesome",
  "font-awesome",
  "icons",
  "animation",
  "animate",
  "non-critical",
  "async",
  "deferred",
  "print.css",
  "theme",
  "vendor",
];

export const DEFAULT_CRITICAL_SCRIPT_PATTERNS = [
  "critical",
  "polyfill",
  "webpack-runtime",
  "runtime.",
  "main.",
  "app.",
  "bundle.",
  "index.",
];

export const DEFAULT_CRITICAL_CSS_PATTERNS = [
  "critical",
  "above-the-fold",
  "main.css",
  "index.css",
  "app.css",
  "styles.css",
  "global.css",
];

/**
 * @param {string} value
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function matchesAnyPattern(value, patterns) {
  const haystack = value.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        `^${pattern
          .toLowerCase()
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")}$`
      );
      return regex.test(haystack);
    }
    return haystack.includes(pattern.toLowerCase());
  });
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {boolean}
 */
export function hasHtmlAttribute(attrs, name) {
  return new RegExp(`\\b${name}\\b`, "i").test(attrs);
}

/**
 * @param {string} attrs
 * @returns {string | null}
 */
export function getAttributeValue(attrs, name) {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, "i")
  );
  return match?.[2] ?? null;
}

/**
 * @param {string} attrs
 * @param {string} name
 * @param {string} [value]
 * @returns {string}
 */
export function setHtmlAttribute(attrs, name, value) {
  if (hasHtmlAttribute(attrs, name)) return attrs;
  const trimmed = attrs.trim();
  if (value === undefined) {
    return trimmed ? `${trimmed} ${name}` : name;
  }
  return trimmed ? `${trimmed} ${name}="${value}"` : `${name}="${value}"`;
}

/**
 * @param {string} href
 * @param {DeferAssetsOptions} options
 * @returns {boolean}
 */
export function isNonCriticalScript(href, options = {}) {
  const critical = [
    ...DEFAULT_CRITICAL_SCRIPT_PATTERNS,
    ...(options.criticalScripts ?? []),
  ];
  if (matchesAnyPattern(href, critical)) return false;

  if (options.deferAllScripts) return true;

  const nonCritical = [
    ...DEFAULT_NON_CRITICAL_SCRIPT_PATTERNS,
    ...(options.nonCriticalScripts ?? []),
  ];
  return matchesAnyPattern(href, nonCritical);
}

/**
 * @param {string} href
 * @param {DeferAssetsOptions} options
 * @returns {boolean}
 */
export function isNonCriticalStylesheet(href, options = {}) {
  const critical = [
    ...DEFAULT_CRITICAL_CSS_PATTERNS,
    ...(options.criticalStylesheets ?? []),
  ];
  if (matchesAnyPattern(href, critical)) return false;

  if (options.deferAllStylesheets) return true;

  const nonCritical = [
    ...DEFAULT_NON_CRITICAL_CSS_PATTERNS,
    ...(options.nonCriticalStylesheets ?? []),
  ];
  return matchesAnyPattern(href, nonCritical);
}

/**
 * @param {string} attrs
 * @returns {boolean}
 */
export function isAlreadyDeferredStylesheet(attrs) {
  const media = getAttributeValue(attrs, "media");
  const onload = getAttributeValue(attrs, "onload");
  return (
    (media && media.toLowerCase() === "print" && Boolean(onload)) ||
    getAttributeValue(attrs, "rel")?.toLowerCase() === "preload"
  );
}

/**
 * @param {string} attrs
 * @returns {boolean}
 */
export function shouldSkipScriptTag(attrs, innerHtml) {
  const src = getAttributeValue(attrs, "src");
  if (!src) return true;
  if (innerHtml.trim().length > 0) return true;
  if (hasHtmlAttribute(attrs, "defer")) return true;
  if (hasHtmlAttribute(attrs, "async")) return true;
  if (/type=["']module["']/i.test(attrs)) return true;
  if (hasHtmlAttribute(attrs, "nomodule")) return true;
  return false;
}

/**
 * @param {string} attrs
 * @param {string} href
 * @returns {string}
 */
export function deferStylesheetTag(attrs, href) {
  let next = attrs.replace(/\smedia=["'][^"']*["']/i, "");
  next = setHtmlAttribute(next, "media", "print");
  next = setHtmlAttribute(next, "onload", "this.media='all'");
  return `<link ${next.trim()}>\n<noscript><link rel="stylesheet" href="${href}"></noscript>`;
}

/**
 * @param {string} html
 * @param {DeferAssetsOptions} [options]
 * @returns {{ html: string, changes: DeferredChange[] }}
 */
export function deferAssetsInHtml(html, options = {}) {
  /** @type {DeferredChange[]} */
  const changes = [];
  let output = html;

  output = output.replace(SCRIPT_TAG_RE, (full, attrs = "", innerHtml = "", selfClosingAttrs = "") => {
    const tagAttrs = attrs || selfClosingAttrs;
    if (shouldSkipScriptTag(tagAttrs, innerHtml)) return full;

    const src = getAttributeValue(tagAttrs, "src");
    if (!src || !isNonCriticalScript(src, options)) return full;

    const nextAttrs = setHtmlAttribute(tagAttrs, "defer");
    changes.push({
      type: "script",
      href: src,
      action: "defer",
    });

    if (selfClosingAttrs) {
      return `<script ${nextAttrs.trim()} />`;
    }
    return `<script ${nextAttrs.trim()}></script>`;
  });

  output = output.replace(
    STYLESHEET_LINK_RE,
    (full, attrsA = "", attrsB = "") => {
      const attrs = attrsA || attrsB;
      if (isAlreadyDeferredStylesheet(attrs)) return full;

      const href = getAttributeValue(attrs, "href");
      if (!href || !isNonCriticalStylesheet(href, options)) return full;

      changes.push({
        type: "stylesheet",
        href,
        action: "async-load",
      });

      return deferStylesheetTag(attrs, href);
    }
  );

  if (options.moveScriptsToBody && changes.some((c) => c.type === "script")) {
    output = moveDeferredScriptsToBody(output);
  }

  return {
    html: output,
    changes,
  };
}

/**
 * @param {string} html
 * @returns {string}
 */
function moveDeferredScriptsToBody(html) {
  const deferredScripts = [];
  let withoutScripts = html.replace(
    /<script\b([^>]*\bdefer\b[^>]*?)>\s*<\/script>/gi,
    (full, attrs) => {
      deferredScripts.push(`<script ${attrs.trim()}></script>`);
      return "";
    }
  );

  if (deferredScripts.length === 0) return html;

  if (/<\/body>/i.test(withoutScripts)) {
    return withoutScripts.replace(
      /<\/body>/i,
      `${deferredScripts.join("\n")}\n</body>`
    );
  }

  return `${withoutScripts}\n${deferredScripts.join("\n")}`;
}

/**
 * @param {string} filePath
 * @param {DeferAssetsOptions} [options]
 * @returns {Promise<DeferAssetsResult>}
 */
export async function deferAssetsInFile(filePath, options = {}) {
  const absolutePath = resolve(filePath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${absolutePath}`);
  }

  const ext = extname(absolutePath).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") {
    throw new Error(`Unsupported file type "${ext}". Use .html or .htm`);
  }

  const source = await readFile(absolutePath, "utf8");
  const { html, changes } = deferAssetsInHtml(source, options);
  const updateSource = options.updateSource !== false;

  if (updateSource && changes.length > 0) {
    await writeFile(absolutePath, html, "utf8");
  }

  return {
    filePath: absolutePath,
    changes,
    updated: updateSource && changes.length > 0,
  };
}

/**
 * @param {string | string[]} patterns
 * @param {DeferAssetsOptions & { recursive?: boolean; onError?: (file: string, error: Error) => void }} [options]
 * @returns {Promise<{ results: DeferAssetsResult[]; processed: number; failed: number }>}
 */
export async function deferAssets(patterns, options = {}) {
  const fastGlob = (await import("fast-glob")).default;
  const inputs = Array.isArray(patterns) ? patterns : [patterns];

  const files = await fastGlob(
    inputs.flatMap((input) => {
      const normalized = input.replace(/\\/g, "/");
      if (normalized.includes("*")) return normalized;
      if (/\.html?$/i.test(normalized)) return normalized;
      return options.recursive !== false
        ? `${normalized}/**/*.{html,htm}`
        : `${normalized}/*.{html,htm}`;
    }),
    { onlyFiles: true, absolute: true }
  );

  /** @type {DeferAssetsResult[]} */
  const results = [];
  let failed = 0;

  for (const file of files) {
    try {
      const result = await deferAssetsInFile(file, options);
      if (result.changes.length > 0) {
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
