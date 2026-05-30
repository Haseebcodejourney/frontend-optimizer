import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  convertToWebp,
  formatBytes,
  isSupportedImage,
  savingsPercent,
} from "../dist/index.js";

const fixturesDir = join(import.meta.dirname, "fixtures");
const outputDir = join(fixturesDir, "output");

test("formatBytes and savingsPercent", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(savingsPercent(1000, 250), 75);
});

test("isSupportedImage", () => {
  assert.equal(isSupportedImage("photo.PNG"), true);
  assert.equal(isSupportedImage("doc.pdf"), false);
});

test("convertToWebp shrinks a PNG", async () => {
  await mkdir(outputDir, { recursive: true });
  const inputPath = join(fixturesDir, "sample.png");
  const outputPath = join(outputDir, "sample.webp");

  await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 120, g: 180, b: 220 },
    },
  })
    .png()
    .toFile(inputPath);

  const result = await convertToWebp(inputPath, {
    output: outputPath,
    quality: 70,
  });

  assert.equal(result.skipped, false);
  assert.ok(result.outputSize < result.inputSize);
  assert.ok(result.savingsPercent > 0);

  await rm(fixturesDir, { recursive: true, force: true });
});
