import { stat } from "node:fs/promises";
import { dirname, extname, join, parse } from "node:path";
import sharp from "sharp";

/** @typedef {import('./index.js').ConvertOptions} ConvertOptions */
/** @typedef {import('./index.js').ConvertResult} ConvertResult */

export const SUPPORTED_INPUT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".tiff",
  ".tif",
  ".bmp",
  ".avif",
  ".webp",
]);

const DEFAULT_QUALITY = 75;
const DEFAULT_EFFORT = 6;

/**
 * @param {string} inputPath
 * @returns {boolean}
 */
export function isSupportedImage(inputPath) {
  return SUPPORTED_INPUT_EXTENSIONS.has(extname(inputPath).toLowerCase());
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {number} before
 * @param {number} after
 * @returns {number}
 */
export function savingsPercent(before, after) {
  if (before === 0) return 0;
  return Math.round(((before - after) / before) * 100);
}

/**
 * @param {string} inputPath
 * @param {ConvertOptions} [options]
 * @returns {Promise<ConvertResult>}
 */
export async function convertToWebp(inputPath, options = {}) {
  if (!isSupportedImage(inputPath)) {
    throw new Error(
      `Unsupported format "${extname(inputPath)}". Supported: ${[...SUPPORTED_INPUT_EXTENSIONS].join(", ")}`
    );
  }

  const quality = clamp(options.quality ?? DEFAULT_QUALITY, 1, 100);
  const effort = clamp(options.effort ?? DEFAULT_EFFORT, 0, 6);
  const maxWidth = options.maxWidth;
  const maxHeight = options.maxHeight;

  const inputStats = await stat(inputPath);
  const inputSize = inputStats.size;

  const { dir, name } = parse(inputPath);
  const outputPath =
    options.output ??
    join(options.outputDir ?? dir, `${name}.webp`);

  if (options.outputDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(options.outputDir, { recursive: true });
  }

  let pipeline = sharp(inputPath, { failOn: "none" });

  if (maxWidth || maxHeight) {
    pipeline = pipeline.resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (options.nearLossless) {
    await pipeline
      .webp({ nearLossless: true, effort, smartSubsample: true })
      .toFile(outputPath);
  } else {
    await pipeline
      .webp({
        quality,
        effort,
        smartSubsample: true,
        alphaQuality: options.alphaQuality ?? quality,
      })
      .toFile(outputPath);
  }

  const outputStats = await stat(outputPath);
  const outputSize = outputStats.size;

  return {
    inputPath,
    outputPath,
    inputSize,
    outputSize,
    savingsPercent: savingsPercent(inputSize, outputSize),
    skipped: false,
  };
}

/**
 * @param {string} inputPath
 * @param {ConvertOptions} [options]
 * @returns {Promise<ConvertResult>}
 */
export async function convertToWebpIfSmaller(inputPath, options = {}) {
  const result = await convertToWebp(inputPath, options);

  if (result.outputSize >= result.inputSize) {
    const { unlink } = await import("node:fs/promises");
    await unlink(result.outputPath);
    return {
      ...result,
      outputPath: result.inputPath,
      outputSize: result.inputSize,
      savingsPercent: 0,
      skipped: true,
    };
  }

  return result;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
