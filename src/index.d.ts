export interface ConvertOptions {
  output?: string;
  outputDir?: string;
  quality?: number;
  effort?: number;
  maxWidth?: number;
  maxHeight?: number;
  alphaQuality?: number;
  nearLossless?: boolean;
  onlyIfSmaller?: boolean;
}

export interface ConvertResult {
  inputPath: string;
  outputPath: string;
  inputSize: number;
  outputSize: number;
  savingsPercent: number;
  skipped: boolean;
}

export interface BatchResult {
  results: ConvertResult[];
  totalInputBytes: number;
  totalOutputBytes: number;
  converted: number;
  skipped: number;
  failed: number;
}

export interface FontFileResult {
  remoteUrl: string;
  localPath: string;
  filename: string;
  size: number;
}

export interface LocalizeFontsOptions {
  fontsDir?: string;
  fontsCssName?: string;
  updateSource?: boolean;
  fontDisplaySwap?: boolean;
  fontDisplay?: string;
  preloadFonts?: boolean;
  preloadFontCount?: number;
  preloadFontPatterns?: string[];
}

export interface LocalizeFontsResult {
  filePath: string;
  fontsDir: string;
  fontsCssPath: string | null;
  fontsCssRelative: string | null;
  stylesheetUrls: string[];
  downloadedFiles: FontFileResult[];
  updated: boolean;
}

export interface DeferredChange {
  type: "script" | "stylesheet";
  href: string;
  action: "defer" | "async-load";
}

export interface DeferAssetsOptions {
  criticalScripts?: string[];
  nonCriticalScripts?: string[];
  criticalStylesheets?: string[];
  nonCriticalStylesheets?: string[];
  deferAllScripts?: boolean;
  deferAllStylesheets?: boolean;
  moveScriptsToBody?: boolean;
  updateSource?: boolean;
}

export interface DeferAssetsResult {
  filePath: string;
  changes: DeferredChange[];
  updated: boolean;
}

export interface HtmlOptimizationChange {
  type: "dimensions" | "fetchpriority" | "third-party-script";
  target: string;
  detail: string;
}

export interface OptimizeHtmlOptions {
  explicitDimensions?: boolean;
  defaultMediaDimensions?: boolean;
  lcpFetchPriority?: boolean;
  lcpImage?: string;
  lcpImages?: string[];
  reduceThirdParty?: boolean;
  siteOrigin?: string;
  allowThirdParty?: string[];
  markThirdParty?: boolean;
  updateSource?: boolean;
  baseDir?: string;
}

export interface OptimizeHtmlResult {
  filePath: string;
  changes: HtmlOptimizationChange[];
  updated: boolean;
}

export function convertToWebp(
  inputPath: string,
  options?: ConvertOptions
): Promise<ConvertResult>;

export function convertToWebpIfSmaller(
  inputPath: string,
  options?: ConvertOptions
): Promise<ConvertResult>;

export function convertImages(
  patterns: string | string[],
  options?: ConvertOptions & {
    recursive?: boolean;
    onError?: (file: string, error: Error) => void;
  }
): Promise<BatchResult>;

export function localizeFontsInFile(
  filePath: string,
  options?: LocalizeFontsOptions
): Promise<LocalizeFontsResult>;

export function localizeFonts(
  patterns: string | string[],
  options?: LocalizeFontsOptions & {
    recursive?: boolean;
    onError?: (file: string, error: Error) => void;
  }
): Promise<{ results: LocalizeFontsResult[]; processed: number; failed: number }>;

export function ensureFontDisplaySwap(css: string, display?: string): string;
export function extractPreloadableFontsFromCss(
  css: string
): { href: string; type: string }[];
export function injectFontPreloads(
  html: string,
  fonts: { href: string; type: string }[],
  cssBaseDir: string,
  htmlBaseDir: string
): string;
export function selectKeyFontsForPreload(
  fonts: { href: string; type: string }[],
  patterns?: string[],
  limit?: number
): { href: string; type: string }[];
export function applyFontPerformanceToHtml(
  html: string,
  fileDir: string,
  options?: LocalizeFontsOptions
): Promise<string>;

export function extractFontLinksFromHtml(html: string): string[];
export function extractFontImportsFromCss(css: string): string[];
export function extractRemoteFontUrlsFromCss(css: string): string[];
export function isFontStylesheetUrl(url: string): boolean;
export function isRemoteFontFileUrl(url: string): boolean;
export function rewriteFontUrls(css: string, urlMap: Map<string, string>): string;

export function deferAssetsInHtml(
  html: string,
  options?: DeferAssetsOptions
): { html: string; changes: DeferredChange[] };

export function deferAssetsInFile(
  filePath: string,
  options?: DeferAssetsOptions
): Promise<DeferAssetsResult>;

export function deferAssets(
  patterns: string | string[],
  options?: DeferAssetsOptions & {
    recursive?: boolean;
    onError?: (file: string, error: Error) => void;
  }
): Promise<{ results: DeferAssetsResult[]; processed: number; failed: number }>;

export function addExplicitDimensions(
  html: string,
  baseDir: string,
  options?: OptimizeHtmlOptions
): Promise<{ html: string; changes: HtmlOptimizationChange[] }>;

export function setLcpFetchPriority(
  html: string,
  options?: OptimizeHtmlOptions
): { html: string; changes: HtmlOptimizationChange[] };

export function reduceThirdPartyScripts(
  html: string,
  options?: OptimizeHtmlOptions
): { html: string; changes: HtmlOptimizationChange[]; thirdPartyScripts: string[] };

export function optimizeHtmlContent(
  html: string,
  options?: OptimizeHtmlOptions
): Promise<{ html: string; changes: HtmlOptimizationChange[] }>;

export function optimizeHtmlInFile(
  filePath: string,
  options?: OptimizeHtmlOptions
): Promise<OptimizeHtmlResult>;

export function optimizeHtml(
  patterns: string | string[],
  options?: OptimizeHtmlOptions & {
    recursive?: boolean;
    onError?: (file: string, error: Error) => void;
  }
): Promise<{ results: OptimizeHtmlResult[]; processed: number; failed: number }>;

export function isNonCriticalScript(href: string, options?: DeferAssetsOptions): boolean;
export function isNonCriticalStylesheet(href: string, options?: DeferAssetsOptions): boolean;
export function isLcpImageCandidate(attrs: string, options?: OptimizeHtmlOptions): boolean;
export function isThirdPartyScript(
  src: string,
  siteOrigin?: string,
  allowlist?: string[]
): boolean;
export function setExplicitDimensions(
  attrs: string,
  width: number,
  height: number
): string;
export function readImageDimensions(
  src: string,
  baseDir: string
): Promise<{ width: number; height: number } | null>;
export function matchesAnyPattern(value: string, patterns: string[]): boolean;
export function hasHtmlAttribute(attrs: string, name: string): boolean;
export function getAttributeValue(attrs: string, name: string): string | null;
export function setHtmlAttribute(attrs: string, name: string, value?: string): string;

export function formatBytes(bytes: number): string;
export function isSupportedImage(inputPath: string): boolean;
export function savingsPercent(before: number, after: number): number;

export const SUPPORTED_INPUT_EXTENSIONS: Set<string>;
export const FONT_STYLESHEET_HOSTS: string[];
export const DEFAULT_NON_CRITICAL_SCRIPT_PATTERNS: string[];
export const DEFAULT_NON_CRITICAL_CSS_PATTERNS: string[];
export const DEFAULT_CRITICAL_SCRIPT_PATTERNS: string[];
export const DEFAULT_CRITICAL_CSS_PATTERNS: string[];
export const LCP_IMAGE_PATTERNS: string[];
