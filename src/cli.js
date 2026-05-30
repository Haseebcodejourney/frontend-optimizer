#!/usr/bin/env node

import { Command } from "commander";
import {
  convertImages,
  deferAssets,
  formatBytes,
  localizeFonts,
  optimizeHtml,
  savingsPercent,
} from "./index.js";

const program = new Command();

program
  .name("front-end")
  .description("Front-end performance optimizer — images, fonts, HTML, defer")
  .version("1.0.1");

const splitPatterns = (value) =>
  value
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : undefined;

program
  .command("images")
  .description("Convert PNG, JPEG, GIF, and other images to optimized WebP")
  .argument("[paths...]", "Files, folders, or globs to convert")
  .option("-q, --quality <number>", "WebP quality 1–100 (lower = smaller)", "75")
  .option("-e, --effort <number>", "Compression effort 0–6", "6")
  .option("-o, --output-dir <dir>", "Write .webp files to this folder")
  .option("-w, --max-width <px>", "Max width (resize down, keep aspect ratio)")
  .option("-H, --max-height <px>", "Max height (resize down, keep aspect ratio)")
  .option("--near-lossless", "Use near-lossless WebP encoding")
  .option("--only-if-smaller", "Skip when WebP is not smaller than original")
  .option("--no-recursive", "Do not scan subfolders")
  .action(async (paths, options) => {
    if (paths.length === 0) {
      program.help();
      return;
    }

    const quality = Number(options.quality);
    const effort = Number(options.effort);

    if (Number.isNaN(quality) || quality < 1 || quality > 100) {
      console.error("Error: --quality must be between 1 and 100");
      process.exit(1);
    }

    if (Number.isNaN(effort) || effort < 0 || effort > 6) {
      console.error("Error: --effort must be between 0 and 6");
      process.exit(1);
    }

    console.log("Converting images to WebP...\n");

    const batch = await convertImages(paths, {
      quality,
      effort,
      outputDir: options.outputDir,
      maxWidth: options.maxWidth ? Number(options.maxWidth) : undefined,
      maxHeight: options.maxHeight ? Number(options.maxHeight) : undefined,
      nearLossless: options.nearLossless,
      onlyIfSmaller: options.onlyIfSmaller,
      recursive: options.recursive,
      onError: (file, error) => {
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });

    for (const result of batch.results) {
      if (result.skipped) {
        console.log(`  ○ ${result.inputPath} (kept original — WebP was larger)`);
        continue;
      }

      console.log(
        `  ✓ ${result.inputPath}\n` +
          `    ${formatBytes(result.inputSize)} → ${formatBytes(result.outputSize)} ` +
          `(-${result.savingsPercent}%)\n` +
          `    → ${result.outputPath}`
      );
    }

    console.log("—".repeat(50));
    console.log(
      `Converted: ${batch.converted} | Skipped: ${batch.skipped} | Failed: ${batch.failed}`
    );

    if (batch.results.length > 0) {
      console.log(
        `Total: ${formatBytes(batch.totalInputBytes)} → ${formatBytes(batch.totalOutputBytes)} ` +
          `(-${savingsPercent(batch.totalInputBytes, batch.totalOutputBytes)}%)`
      );
    }

    if (batch.failed > 0) {
      process.exit(1);
    }
  });

program
  .command("fonts")
  .description(
    "Self-host fonts, add font-display: swap, and preload key font files"
  )
  .argument("[paths...]", "HTML/CSS files or folders to scan")
  .option(
    "-d, --fonts-dir <dir>",
    "Folder for downloaded fonts (relative to each file)",
    "./fonts"
  )
  .option(
    "-c, --css-name <name>",
    "Generated local stylesheet filename",
    "local-fonts.css"
  )
  .option("--preload-count <number>", "Number of key fonts to preload", "2")
  .option(
    "--preload-fonts <patterns>",
    "Comma-separated font filename patterns to preload first"
  )
  .option("--no-font-display", "Do not add font-display: swap")
  .option("--no-preload", "Do not inject font preload links")
  .option("--no-update", "Download fonts only — do not rewrite source files")
  .option("--no-recursive", "Do not scan subfolders")
  .action(async (paths, options) => {
    if (paths.length === 0) {
      program.help();
      return;
    }

    console.log("Self-hosting and optimizing fonts...\n");

    const batch = await localizeFonts(paths, {
      fontsDir: options.fontsDir,
      fontsCssName: options.cssName,
      fontDisplaySwap: options.fontDisplay,
      preloadFonts: options.preload,
      preloadFontCount: Number(options.preloadCount),
      preloadFontPatterns: splitPatterns(options.preloadFonts),
      updateSource: options.update,
      recursive: options.recursive,
      onError: (file, error) => {
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });

    for (const result of batch.results) {
      console.log(`  ✓ ${result.filePath}`);

      for (const url of result.stylesheetUrls) {
        console.log(`    self-host: ${url}`);
      }

      for (const file of result.downloadedFiles) {
        console.log(`    font: ${formatBytes(file.size)} → ${file.filename}`);
      }

      if (result.fontsCssPath) {
        console.log(`    css:  ${result.fontsCssRelative} (font-display: swap)`);
      }

      if (result.updated) {
        console.log("    updated source + font preloads");
      }

      console.log("");
    }

    console.log("—".repeat(50));
    console.log(`Processed: ${batch.processed} | Failed: ${batch.failed}`);

    if (batch.failed > 0) {
      process.exit(1);
    }
  });

program
  .command("html")
  .description(
    "LCP fetchpriority, explicit dimensions, and third-party script reduction"
  )
  .argument("[paths...]", "HTML files or folders to scan")
  .option("--lcp-image <pattern>", "Mark matching image as LCP (src/class/id)")
  .option("--site-origin <url>", "Your site origin for third-party detection")
  .option(
    "--allow-third-party <patterns>",
    "Comma-separated third-party scripts to keep unchanged"
  )
  .option("--no-dimensions", "Skip width/height on img, video, iframe, embed")
  .option("--no-fetchpriority", "Skip fetchpriority=\"high\" on LCP image")
  .option("--no-third-party", "Skip third-party script deferral")
  .option("--no-update", "Preview changes without rewriting files")
  .option("--no-recursive", "Do not scan subfolders")
  .action(async (paths, options) => {
    if (paths.length === 0) {
      program.help();
      return;
    }

    console.log("Optimizing HTML performance...\n");

    const batch = await optimizeHtml(paths, {
      lcpImage: options.lcpImage,
      siteOrigin: options.siteOrigin,
      allowThirdParty: splitPatterns(options.allowThirdParty),
      explicitDimensions: options.dimensions,
      lcpFetchPriority: options.fetchpriority,
      reduceThirdParty: options.thirdParty,
      updateSource: options.update,
      recursive: options.recursive,
      onError: (file, error) => {
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });

    for (const result of batch.results) {
      console.log(`  ✓ ${result.filePath}`);
      for (const change of result.changes) {
        console.log(`    ${change.type}: ${change.detail}`);
      }
      if (result.updated) {
        console.log("    updated HTML");
      }
      console.log("");
    }

    console.log("—".repeat(50));
    console.log(`Processed: ${batch.processed} | Failed: ${batch.failed}`);

    if (batch.failed > 0) {
      process.exit(1);
    }
  });

program
  .command("defer")
  .description(
    "Defer non-critical JavaScript and load non-critical CSS asynchronously"
  )
  .argument("[paths...]", "HTML files or folders to scan")
  .option(
    "--critical-js <patterns>",
    "Comma-separated script patterns to keep blocking (never defer)"
  )
  .option(
    "--critical-css <patterns>",
    "Comma-separated stylesheet patterns to keep render-blocking"
  )
  .option(
    "--non-critical-js <patterns>",
    "Extra script patterns to defer (analytics, chat, etc.)"
  )
  .option(
    "--non-critical-css <patterns>",
    "Extra stylesheet patterns to async-load (fonts, icons, etc.)"
  )
  .option("--all-scripts", "Defer all external scripts except --critical-js")
  .option("--all-css", "Async-load all CSS except --critical-css")
  .option("--move-to-body", "Move deferred scripts before </body>")
  .option("--no-update", "Preview changes without rewriting files")
  .option("--no-recursive", "Do not scan subfolders")
  .action(async (paths, options) => {
    if (paths.length === 0) {
      program.help();
      return;
    }

    console.log("Deferring non-critical assets...\n");

    const batch = await deferAssets(paths, {
      criticalScripts: splitPatterns(options.criticalJs),
      criticalStylesheets: splitPatterns(options.criticalCss),
      nonCriticalScripts: splitPatterns(options.nonCriticalJs),
      nonCriticalStylesheets: splitPatterns(options.nonCriticalCss),
      deferAllScripts: options.allScripts,
      deferAllStylesheets: options.allCss,
      moveScriptsToBody: options.moveToBody,
      updateSource: options.update,
      recursive: options.recursive,
      onError: (file, error) => {
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });

    for (const result of batch.results) {
      console.log(`  ✓ ${result.filePath}`);
      for (const change of result.changes) {
        const label = change.type === "script" ? "script" : "css";
        console.log(`    ${label}: ${change.action} → ${change.href}`);
      }
      if (result.updated) {
        console.log("    updated HTML");
      }
      console.log("");
    }

    console.log("—".repeat(50));
    console.log(`Processed: ${batch.processed} | Failed: ${batch.failed}`);

    if (batch.failed > 0) {
      process.exit(1);
    }
  });

program
  .command("optimize")
  .description("Full pipeline — images, fonts, HTML, defer")
  .argument("[paths...]", "Project folder or files to optimize")
  .option("-q, --quality <number>", "WebP quality 1–100", "75")
  .option("-e, --effort <number>", "WebP compression effort 0–6", "6")
  .option("-o, --output-dir <dir>", "Write .webp files to this folder")
  .option("-w, --max-width <px>", "Max image width when converting to WebP")
  .option("-H, --max-height <px>", "Max image height when converting to WebP")
  .option("--only-if-smaller", "Skip WebP output when not smaller than original")
  .option("-d, --fonts-dir <dir>", "Fonts output folder", "./fonts")
  .option("--site-origin <url>", "Site origin for third-party script detection")
  .option("--lcp-image <pattern>", "LCP image match pattern")
  .option("--no-update", "Preview HTML/font changes without rewriting files")
  .option("--no-recursive", "Do not scan subfolders")
  .action(async (paths, options) => {
    if (paths.length === 0) {
      program.help();
      return;
    }

    const quality = Number(options.quality);
    const effort = Number(options.effort);

    if (Number.isNaN(quality) || quality < 1 || quality > 100) {
      console.error("Error: --quality must be between 1 and 100");
      process.exit(1);
    }

    if (Number.isNaN(effort) || effort < 0 || effort > 6) {
      console.error("Error: --effort must be between 0 and 6");
      process.exit(1);
    }

    console.log("Running full front-end optimization...\n");
    let failed = 0;

    console.log("1/4 Converting images to WebP...");
    const images = await convertImages(paths, {
      quality,
      effort,
      outputDir: options.outputDir,
      maxWidth: options.maxWidth ? Number(options.maxWidth) : undefined,
      maxHeight: options.maxHeight ? Number(options.maxHeight) : undefined,
      onlyIfSmaller: options.onlyIfSmaller,
      recursive: options.recursive,
      onError: (file, error) => {
        failed += 1;
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });

    for (const result of images.results) {
      if (result.skipped) {
        console.log(`  ○ ${result.inputPath} (kept original)`);
        continue;
      }
      console.log(
        `  ✓ ${result.inputPath} → ${formatBytes(result.inputSize)} to ${formatBytes(result.outputSize)} (-${result.savingsPercent}%)`
      );
    }
    console.log(
      `  Images: ${images.converted} converted | ${images.skipped} skipped | ${images.failed} failed`
    );
    failed += images.failed;

    console.log("\n2/4 Self-hosting fonts (font-display: swap + preload)...");
    const fonts = await localizeFonts(paths, {
      fontsDir: options.fontsDir,
      updateSource: options.update,
      recursive: options.recursive,
      onError: (file, error) => {
        failed += 1;
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });
    console.log(`  Fonts: ${fonts.processed} file(s) updated | ${fonts.failed} failed`);
    failed += fonts.failed;

    console.log("\n3/4 HTML (dimensions, LCP fetchpriority, third-party)...");
    const html = await optimizeHtml(paths, {
      siteOrigin: options.siteOrigin,
      lcpImage: options.lcpImage,
      updateSource: options.update,
      recursive: options.recursive,
      onError: (file, error) => {
        failed += 1;
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });
    console.log(`  HTML: ${html.processed} file(s) updated | ${html.failed} failed`);
    failed += html.failed;

    console.log("\n4/4 Deferring non-critical JS/CSS...");
    const defer = await deferAssets(paths, {
      deferAllScripts: false,
      updateSource: options.update,
      recursive: options.recursive,
      onError: (file, error) => {
        failed += 1;
        console.error(`  ✗ ${file}\n    ${error.message}`);
      },
    });
    console.log(`  Defer: ${defer.processed} file(s) updated | ${defer.failed} failed`);
    failed += defer.failed;

    console.log("\n—".repeat(50));
    if (images.results.length > 0) {
      console.log(
        `Image savings: ${formatBytes(images.totalInputBytes)} → ${formatBytes(images.totalOutputBytes)} (-${savingsPercent(images.totalInputBytes, images.totalOutputBytes)}%)`
      );
    }
    console.log("Done.");

    if (failed > 0) {
      process.exit(1);
    }
  });

if (process.argv.length <= 2) {
  program.help();
} else {
  program.parse();
}
