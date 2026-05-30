import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  getAttributeValue,
  hasHtmlAttribute,
  setHtmlAttribute,
} from "./defer.js";

/** @typedef {import('./index.js').OptimizeHtmlOptions} OptimizeHtmlOptions */
/** @typedef {import('./index.js').OptimizeHtmlResult} OptimizeHtmlResult */
/** @typedef {import('./index.js').HtmlOptimizationChange} HtmlOptimizationChange */

const IMG_TAG_RE = /<img\b([^>]*?)(?:\/)?>/gi;
const VIDEO_TAG_RE = /<video\b([^>]*?)>/gi;
const IFRAME_TAG_RE = /<iframe\b([^>]*?)>/gi;
const EMBED_TAG_RE = /<embed\b([^>]*?)(?:\/)?>/gi;
const SCRIPT_TAG_RE =
  /<script\b([^>]*?)>([\s\S]*?)<\/script>|<script\b([^>]*?)\/>/gi;

export const LCP_IMAGE_PATTERNS = [
  "hero",
  "lcp",
  "banner",
  "featured",
  "cover",
  "main-image",
];

export const DEFAULT_THIRD_PARTY_ALLOWLIST = [];

const DEFAULT_MEDIA_DIMENSIONS = {
  iframe: { width: 640, height: 360 },
  video: { width: 1280, height: 720 },
  embed: { width: 640, height: 360 },
};

/**
 * @param {string} attrs
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function setExplicitDimensions(attrs, width, height) {
  let next = attrs;
  if (!hasHtmlAttribute(next, "width")) {
    next = setHtmlAttribute(next, "width", String(width));
  }
  if (!hasHtmlAttribute(next, "height")) {
    next = setHtmlAttribute(next, "height", String(height));
  }
  return next.trim();
}

/**
 * @param {string} src
 * @param {string} baseDir
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export async function readImageDimensions(src, baseDir) {
  if (!src || src.startsWith("data:") || /^https?:\/\//i.test(src)) {
    return null;
  }

  const imagePath = resolve(baseDir, src.split("?")[0].split("#")[0]);
  try {
    const fileStat = await stat(imagePath);
    if (!fileStat.isFile()) return null;
    const metadata = await sharp(imagePath).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

/**
 * @param {string} html
 * @param {RegExp} pattern
 * @param {(attrs: string, tagName: string) => Promise<string | null>} transform
 * @returns {Promise<string>}
 */
async function replaceTags(html, pattern, transform) {
  const matches = [...html.matchAll(pattern)];
  if (matches.length === 0) return html;

  let output = html;
  for (const match of matches) {
    const full = match[0];
    const attrs = match[1];
    const tagName = full.match(/^<(\w+)/)?.[1]?.toLowerCase() ?? "element";
    const nextAttrs = await transform(attrs, tagName);
    if (!nextAttrs) continue;

    const selfClosing = /\/>\s*$/.test(full);
    const replacement = selfClosing
      ? `<${tagName} ${nextAttrs} />`
      : `<${tagName} ${nextAttrs}>`;
    output = output.replace(full, replacement);
  }

  return output;
}

/**
 * @param {string} html
 * @param {string} baseDir
 * @param {OptimizeHtmlOptions} [options]
 * @returns {Promise<{ html: string, changes: HtmlOptimizationChange[] }>}
 */
export async function addExplicitDimensions(html, baseDir, options = {}) {
  /** @type {HtmlOptimizationChange[]} */
  const changes = [];
  let output = html;

  output = await replaceTags(output, IMG_TAG_RE, async (attrs, tagName) => {
    if (hasHtmlAttribute(attrs, "width") && hasHtmlAttribute(attrs, "height")) {
      return null;
    }

    const src = getAttributeValue(attrs, "src");
    const dimensions = src ? await readImageDimensions(src, baseDir) : null;
    if (!dimensions) return null;

    changes.push({
      type: "dimensions",
      target: tagName,
      detail: `${dimensions.width}x${dimensions.height} → ${src}`,
    });

    return setExplicitDimensions(attrs, dimensions.width, dimensions.height);
  });

  if (options.defaultMediaDimensions !== false) {
    for (const [tagName, re] of [
      ["video", VIDEO_TAG_RE],
      ["iframe", IFRAME_TAG_RE],
      ["embed", EMBED_TAG_RE],
    ]) {
      const defaults =
        /** @type {Record<string, { width: number, height: number }>} */ (
          DEFAULT_MEDIA_DIMENSIONS
        )[tagName];

      output = await replaceTags(output, re, async (attrs) => {
        if (hasHtmlAttribute(attrs, "width") && hasHtmlAttribute(attrs, "height")) {
          return null;
        }

        if (tagName === "video") {
          const poster = getAttributeValue(attrs, "poster");
          const posterDimensions = poster
            ? await readImageDimensions(poster, baseDir)
            : null;
          if (posterDimensions) {
            changes.push({
              type: "dimensions",
              target: tagName,
              detail: `${posterDimensions.width}x${posterDimensions.height} (from poster)`,
            });
            return setExplicitDimensions(
              attrs,
              posterDimensions.width,
              posterDimensions.height
            );
          }
        }

        changes.push({
          type: "dimensions",
          target: tagName,
          detail: `${defaults.width}x${defaults.height} (default)`,
        });
        return setExplicitDimensions(attrs, defaults.width, defaults.height);
      });
    }
  }

  return { html: output, changes };
}

/**
 * @param {string} attrs
 * @param {OptimizeHtmlOptions} options
 * @returns {boolean}
 */
export function isLcpImageCandidate(attrs, options = {}) {
  const src = getAttributeValue(attrs, "src") ?? "";
  const className = getAttributeValue(attrs, "class") ?? "";
  const id = getAttributeValue(attrs, "id") ?? "";
  const haystack = `${src} ${className} ${id}`.toLowerCase();

  if (options.lcpImage && haystack.includes(options.lcpImage.toLowerCase())) {
    return true;
  }

  if (options.lcpImages?.some((pattern) => haystack.includes(pattern.toLowerCase()))) {
    return true;
  }

  return LCP_IMAGE_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/**
 * @param {string} html
 * @param {OptimizeHtmlOptions} [options]
 * @returns {{ html: string, changes: HtmlOptimizationChange[] }}
 */
export function setLcpFetchPriority(html, options = {}) {
  /** @type {HtmlOptimizationChange[]} */
  const changes = [];
  let lcpApplied = false;

  const output = html.replace(IMG_TAG_RE, (full, attrs) => {
    if (lcpApplied) return full;
    if (hasHtmlAttribute(attrs, "fetchpriority")) return full;
    if (/loading=["']lazy["']/i.test(attrs)) return full;

    const isExplicitLcp =
      options.lcpImage ||
      (options.lcpImages && options.lcpImages.length > 0)
        ? isLcpImageCandidate(attrs, options)
        : false;

    const isFirstEligible =
      !lcpApplied &&
      getAttributeValue(attrs, "src") &&
      !/loading=["']lazy["']/i.test(attrs);

    if (!isExplicitLcp && !isFirstEligible) return full;
    if (isExplicitLcp || isFirstEligible) {
      lcpApplied = true;
    } else {
      return full;
    }

    let next = setHtmlAttribute(attrs, "fetchpriority", "high");
    if (/loading=["']lazy["']/i.test(next)) {
      next = next.replace(/\sloading=["']lazy["']/i, "");
    }

    changes.push({
      type: "fetchpriority",
      target: "img",
      detail: getAttributeValue(attrs, "src") ?? "lcp image",
    });

    return `<img ${next.trim()}>`;
  });

  return { html: output, changes };
}

/**
 * @param {string} src
 * @param {string | undefined} siteOrigin
 * @param {string[]} allowlist
 * @returns {boolean}
 */
export function isThirdPartyScript(src, siteOrigin, allowlist = []) {
  if (!src) return false;
  if (allowlist.some((pattern) => src.toLowerCase().includes(pattern.toLowerCase()))) {
    return false;
  }

  if (!/^https?:\/\//i.test(src)) return false;

  if (!siteOrigin) return true;

  try {
    const scriptHost = new URL(src).hostname.toLowerCase();
    const siteHost = new URL(siteOrigin).hostname.toLowerCase();
    return scriptHost !== siteHost;
  } catch {
    return true;
  }
}

/**
 * @param {string} html
 * @param {OptimizeHtmlOptions} [options]
 * @returns {{ html: string, changes: HtmlOptimizationChange[], thirdPartyScripts: string[] }}
 */
export function reduceThirdPartyScripts(html, options = {}) {
  /** @type {HtmlOptimizationChange[]} */
  const changes = [];
  /** @type {string[]} */
  const thirdPartyScripts = [];
  const allowlist = [
    ...DEFAULT_THIRD_PARTY_ALLOWLIST,
    ...(options.allowThirdParty ?? []),
  ];

  const output = html.replace(
    SCRIPT_TAG_RE,
    (full, attrs = "", innerHtml = "", selfClosingAttrs = "") => {
      const tagAttrs = attrs || selfClosingAttrs;
      const src = getAttributeValue(tagAttrs, "src");
      if (!src || innerHtml.trim().length > 0) return full;
      if (!isThirdPartyScript(src, options.siteOrigin, allowlist)) return full;

      thirdPartyScripts.push(src);

      let next = tagAttrs;
      if (!hasHtmlAttribute(next, "defer")) {
        next = setHtmlAttribute(next, "defer");
      }
      if (options.markThirdParty !== false) {
        next = setHtmlAttribute(next, "data-third-party", "deferred");
      }

      changes.push({
        type: "third-party-script",
        target: "script",
        detail: src,
      });

      if (selfClosingAttrs) {
        return `<script ${next.trim()} />`;
      }
      return `<script ${next.trim()}></script>`;
    }
  );

  return { html: output, changes, thirdPartyScripts };
}

/**
 * @param {string} html
 * @param {OptimizeHtmlOptions} [options]
 * @returns {Promise<{ html: string, changes: HtmlOptimizationChange[] }>}
 */
export async function optimizeHtmlContent(html, options = {}) {
  /** @type {HtmlOptimizationChange[]} */
  const changes = [];
  let output = html;
  const baseDir = options.baseDir ?? process.cwd();

  if (options.explicitDimensions !== false) {
    const result = await addExplicitDimensions(output, baseDir, options);
    output = result.html;
    changes.push(...result.changes);
  }

  if (options.lcpFetchPriority !== false) {
    const result = setLcpFetchPriority(output, options);
    output = result.html;
    changes.push(...result.changes);
  }

  if (options.reduceThirdParty !== false) {
    const result = reduceThirdPartyScripts(output, options);
    output = result.html;
    changes.push(...result.changes);
  }

  return { html: output, changes };
}

/**
 * @param {string} filePath
 * @param {OptimizeHtmlOptions} [options]
 * @returns {Promise<OptimizeHtmlResult>}
 */
export async function optimizeHtmlInFile(filePath, options = {}) {
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
  const { html, changes } = await optimizeHtmlContent(source, {
    ...options,
    baseDir: dirname(absolutePath),
  });
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
 * @param {OptimizeHtmlOptions & { recursive?: boolean; onError?: (file: string, error: Error) => void }} [options]
 * @returns {Promise<{ results: OptimizeHtmlResult[]; processed: number; failed: number }>}
 */
export async function optimizeHtml(patterns, options = {}) {
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

  /** @type {OptimizeHtmlResult[]} */
  const results = [];
  let failed = 0;

  for (const file of files) {
    try {
      const result = await optimizeHtmlInFile(file, options);
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
