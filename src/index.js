import fastGlob from "fast-glob";
import { convertToWebp, convertToWebpIfSmaller, isSupportedImage } from "./convert.js";

export {
  convertToWebp,
  convertToWebpIfSmaller,
  formatBytes,
  isSupportedImage,
  savingsPercent,
  SUPPORTED_INPUT_EXTENSIONS,
} from "./convert.js";

export {
  extractFontImportsFromCss,
  extractFontLinksFromHtml,
  extractRemoteFontUrlsFromCss,
  extractPreloadableFontsFromCss,
  ensureFontDisplaySwap,
  injectFontPreloads,
  selectKeyFontsForPreload,
  applyFontPerformanceToHtml,
  isFontStylesheetUrl,
  isRemoteFontFileUrl,
  localizeFonts,
  localizeFontsInFile,
  rewriteFontUrls,
  FONT_STYLESHEET_HOSTS,
} from "./fonts.js";

export {
  addExplicitDimensions,
  isLcpImageCandidate,
  isThirdPartyScript,
  optimizeHtml,
  optimizeHtmlContent,
  optimizeHtmlInFile,
  reduceThirdPartyScripts,
  setLcpFetchPriority,
  setExplicitDimensions,
  readImageDimensions,
  LCP_IMAGE_PATTERNS,
} from "./html-optimize.js";

export {
  deferAssets,
  deferAssetsInFile,
  deferAssetsInHtml,
  DEFAULT_CRITICAL_CSS_PATTERNS,
  DEFAULT_CRITICAL_SCRIPT_PATTERNS,
  DEFAULT_NON_CRITICAL_CSS_PATTERNS,
  DEFAULT_NON_CRITICAL_SCRIPT_PATTERNS,
  getAttributeValue,
  hasHtmlAttribute,
  isNonCriticalScript,
  isNonCriticalStylesheet,
  matchesAnyPattern,
  setHtmlAttribute,
} from "./defer.js";

/**
 * @typedef {Object} ConvertOptions
 * @property {string} [output] - Full path for the output .webp file
 * @property {string} [outputDir] - Directory for output files (keeps original filename)
 * @property {number} [quality=75] - WebP quality 1–100 (lower = smaller file)
 * @property {number} [effort=6] - Compression effort 0–6 (higher = smaller, slower)
 * @property {number} [maxWidth] - Resize if wider than this (preserves aspect ratio)
 * @property {number} [maxHeight] - Resize if taller than this
 * @property {number} [alphaQuality] - Quality for transparent areas
 * @property {boolean} [nearLossless] - Near-lossless WebP (larger but sharper)
 * @property {boolean} [onlyIfSmaller] - Skip output when WebP is not smaller
 */

/**
 * @typedef {Object} ConvertResult
 * @property {string} inputPath
 * @property {string} outputPath
 * @property {number} inputSize
 * @property {number} outputSize
 * @property {number} savingsPercent
 * @property {boolean} skipped
 */

/**
 * @typedef {Object} BatchResult
 * @property {ConvertResult[]} results
 * @property {number} totalInputBytes
 * @property {number} totalOutputBytes
 * @property {number} converted
 * @property {number} skipped
 * @property {number} failed
 */

/**
 * @typedef {Object} FontFileResult
 * @property {string} remoteUrl
 * @property {string} localPath
 * @property {string} filename
 * @property {number} size
 */

/**
 * @typedef {Object} LocalizeFontsOptions
 * @property {string} [fontsDir="./fonts"] - Folder for downloaded font files (relative to source file)
 * @property {string} [fontsCssName="local-fonts.css"] - Generated stylesheet name
 * @property {boolean} [updateSource=true] - Rewrite HTML/CSS to use local fonts
 * @property {boolean} [fontDisplaySwap=true] - Add font-display: swap to @font-face rules
 * @property {string} [fontDisplay="swap"] - font-display value
 * @property {boolean} [preloadFonts=true] - Inject preload links for key font files
 * @property {number} [preloadFontCount=2] - Max fonts to preload
 * @property {string[]} [preloadFontPatterns] - Prefer fonts matching these patterns
 */

/**
 * @typedef {Object} LocalizeFontsResult
 * @property {string} filePath
 * @property {string} fontsDir
 * @property {string | null} fontsCssPath
 * @property {string | null} fontsCssRelative
 * @property {string[]} stylesheetUrls
 * @property {FontFileResult[]} downloadedFiles
 * @property {boolean} updated
 */

/**
 * @typedef {Object} DeferredChange
 * @property {"script" | "stylesheet"} type
 * @property {string} href
 * @property {"defer" | "async-load"} action
 */

/**
 * @typedef {Object} DeferAssetsOptions
 * @property {string[]} [criticalScripts] - Never defer matching scripts
 * @property {string[]} [nonCriticalScripts] - Extra patterns treated as non-critical
 * @property {string[]} [criticalStylesheets] - Keep render-blocking
 * @property {string[]} [nonCriticalStylesheets] - Extra patterns to load async
 * @property {boolean} [deferAllScripts] - Defer all external scripts except critical
 * @property {boolean} [deferAllStylesheets] - Async-load all CSS except critical
 * @property {boolean} [moveScriptsToBody] - Move deferred scripts before </body>
 * @property {boolean} [updateSource=true] - Write changes back to the HTML file
 */

/**
 * @typedef {Object} DeferAssetsResult
 * @property {string} filePath
 * @property {DeferredChange[]} changes
 * @property {boolean} updated
 */

/**
 * @typedef {Object} HtmlOptimizationChange
 * @property {"dimensions" | "fetchpriority" | "third-party-script"} type
 * @property {string} target
 * @property {string} detail
 */

/**
 * @typedef {Object} OptimizeHtmlOptions
 * @property {boolean} [explicitDimensions=true] - Add width/height to img, video, iframe, embed
 * @property {boolean} [defaultMediaDimensions=true] - Use defaults when media size unknown
 * @property {boolean} [lcpFetchPriority=true] - Set fetchpriority="high" on LCP image
 * @property {string} [lcpImage] - LCP image src/id/class substring match
 * @property {string[]} [lcpImages] - Extra LCP match patterns
 * @property {boolean} [reduceThirdParty=true] - Defer third-party external scripts
 * @property {string} [siteOrigin] - Site origin for first-party vs third-party detection
 * @property {string[]} [allowThirdParty] - Third-party scripts to skip
 * @property {boolean} [markThirdParty=true] - Add data-third-party="deferred"
 * @property {boolean} [updateSource=true] - Write HTML changes to disk
 * @property {string} [baseDir] - Base directory for resolving relative asset paths
 */

/**
 * @typedef {Object} OptimizeHtmlResult
 * @property {string} filePath
 * @property {HtmlOptimizationChange[]} changes
 * @property {boolean} updated
 */

/**
 * Find and convert images under a directory or glob pattern.
 *
 * @param {string | string[]} patterns - File path, directory, or glob(s)
 * @param {ConvertOptions & { recursive?: boolean }} [options]
 * @returns {Promise<BatchResult>}
 */
export async function convertImages(patterns, options = {}) {
  const inputs = Array.isArray(patterns) ? patterns : [patterns];
  const files = await fastGlob(
    inputs.flatMap((input) => {
      const normalized = input.replace(/\\/g, "/");
      if (normalized.includes("*")) return normalized;
      if (normalized.endsWith("/")) {
        return options.recursive !== false
          ? `${normalized}**/*.{png,jpg,jpeg,gif,tiff,tif,bmp,avif,webp}`
          : `${normalized}*.{png,jpg,jpeg,gif,tiff,tif,bmp,avif,webp}`;
      }
      return isSupportedImage(normalized)
        ? normalized
        : options.recursive !== false
          ? `${normalized}/**/*.{png,jpg,jpeg,gif,tiff,tif,bmp,avif,webp}`
          : `${normalized}/*.{png,jpg,jpeg,gif,tiff,tif,bmp,avif,webp}`;
    }),
    { onlyFiles: true, absolute: true }
  );

  const convert = options.onlyIfSmaller ? convertToWebpIfSmaller : convertToWebp;
  /** @type {ConvertResult[]} */
  const results = [];
  let failed = 0;

  for (const file of files) {
    try {
      const outputDir = options.outputDir;
      const perFileOptions = outputDir
        ? { ...options, outputDir, output: undefined }
        : options;

      const result = await convert(file, perFileOptions);
      results.push(result);
    } catch (error) {
      failed += 1;
      if (options.onError) {
        options.onError(file, /** @type {Error} */ (error));
      }
    }
  }

  const converted = results.filter((r) => !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const totalInputBytes = results.reduce((sum, r) => sum + r.inputSize, 0);
  const totalOutputBytes = results.reduce(
    (sum, r) => sum + (r.skipped ? r.inputSize : r.outputSize),
    0
  );

  return {
    results,
    totalInputBytes,
    totalOutputBytes,
    converted,
    skipped,
    failed,
  };
}
