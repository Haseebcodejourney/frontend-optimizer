# frontend-optimizer

CLI to optimize front-end assets — WebP images, self-hosted fonts, LCP, dimensions, and deferred JS/CSS.

[![npm version](https://img.shields.io/npm/v/frontend-optimizer.svg)](https://www.npmjs.com/package/frontend-optimizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Author:** [Hamza Haseeb](https://github.com/Haseebcodejourney)

## Install

```bash
npm install -g frontend-optimizer
```

Or run without installing:

```bash
npx frontend-optimizer optimize ./your-project
```

## Quick start

Optimize an entire project folder:

```bash
npx frontend-optimizer optimize ./src
```

This runs four steps:

1. **Images** — Convert PNG, JPEG, GIF, etc. to compressed WebP
2. **Fonts** — Self-host Google Fonts, add `font-display: swap`, preload key fonts
3. **HTML** — Add `width`/`height`, LCP `fetchpriority="high"`, defer third-party scripts
4. **Defer** — Defer non-critical JavaScript and async-load non-critical CSS

## Commands

| Command | Description |
|---------|-------------|
| `optimize` | Full pipeline (images + fonts + HTML + defer) |
| `images` | Convert images to WebP |
| `fonts` | Download and self-host web fonts |
| `html` | Dimensions, LCP fetch priority, third-party scripts |
| `defer` | Defer non-critical JS and CSS |

### Examples

```bash
# Full optimization
npx frontend-optimizer optimize ./public

# Images only (aggressive compression)
npx frontend-optimizer images ./assets -q 65 --max-width 1920

# Self-host Google Fonts
npx frontend-optimizer fonts ./index.html

# HTML performance (LCP image, dimensions)
npx frontend-optimizer html ./index.html --lcp-image hero

# Defer analytics and non-critical assets
npx frontend-optimizer defer ./index.html
```

After global install, you can also use:

```bash
front-end optimize ./src
```

## Features

### Images (WebP)

- Converts PNG, JPG, JPEG, GIF, TIFF, BMP, AVIF → WebP
- Often reduces file size from MB to KB
- Optional resize (`--max-width`, `--max-height`)

### Fonts

- Downloads fonts from Google Fonts, Bunny Fonts, and similar CDNs
- **Self-hosts** font files locally
- Adds **`font-display: swap`** to every `@font-face`
- **Preloads** key `.woff2` files for faster rendering

### HTML

- **`fetchpriority="high"`** on the LCP (hero) image
- **Explicit `width` and `height`** on images, videos, iframes, and embeds (reduces layout shift)
- **Third-party scripts** deferred (analytics, ads, tracking, etc.)

### Defer non-critical assets

- Adds `defer` to analytics, chat, and tracking scripts
- Async-loads non-critical CSS (fonts, animations, icons) via the `media="print"` pattern

## API (programmatic)

```js
import {
  convertImages,
  localizeFonts,
  optimizeHtml,
  deferAssets,
} from "frontend-optimizer";

await convertImages("./photos", { quality: 75 });
await localizeFonts("./index.html");
await optimizeHtml("./index.html", { lcpImage: "hero" });
await deferAssets("./index.html");
```

## Requirements

- **Node.js 18+**

## Development

```bash
git clone https://github.com/Haseebcodejourney/frontend-optimizer.git
cd frontend-optimizer
npm install
npm run build
npm test
```

## Publish updates

Bump version in `package.json`, then:

```bash
npm run build
npm test
npm publish
```

## License

MIT © [Hamza Haseeb](https://github.com/Haseebcodejourney)
