import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', '.cache']);
const styleExtensions = new Set(['.css', '.scss', '.sass']);
const sourceExtensions = new Set(['.tsx', '.ts', '.jsx', '.js', '.html']);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function countMatches(text, expression) {
  return [...text.matchAll(expression)].length;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function specificity(selector) {
  const normalized = selector
    .replace(/::[\w-]+/g, ' ')
    .replace(/:not\(([^)]*)\)/g, ' $1 ');
  const ids = (normalized.match(/#[A-Za-z_][\w-]*/g) ?? []).length;
  const classes = (normalized.match(/\.[A-Za-z_][\w-]*/g) ?? []).length;
  const attributes = (normalized.match(/\[[^\]]+\]/g) ?? []).length;
  const pseudoClasses = (normalized.match(/:[A-Za-z-]+/g) ?? []).length;
  const elements = (normalized
    .replace(/#[A-Za-z_][\w-]*/g, ' ')
    .replace(/\.[A-Za-z_][\w-]*/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/:[A-Za-z-]+/g, ' ')
    .match(/\b(?:[A-Za-z][\w-]*)\b/g) ?? []).length;
  return ids * 100 + (classes + attributes + pseudoClasses) * 10 + elements;
}

const allFiles = walk(root);
const styleFiles = allFiles.filter((file) => styleExtensions.has(path.extname(file)));
const sourceFiles = allFiles.filter((file) => sourceExtensions.has(path.extname(file)));
const styleText = styleFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const clientFiles = sourceFiles.filter((file) => relative(file).startsWith('src/client/'));
const clientSourceText = clientFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const clientText = [styleText, clientSourceText].join('\n');
const cleanStyleText = stripComments(styleText);

const classes = [...new Set(
  [...cleanStyleText.matchAll(/(?:^|[,{\s])\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]),
)].sort();
const classAudit = classes.map((className) => {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const references = countMatches(sourceText, new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'));
  return { className, references, classification: references > 0 ? 'referenced' : 'unreferenced' };
});

const variableNames = [...new Set(
  [...cleanStyleText.matchAll(/^\s*--([A-Za-z0-9_-]+)\s*:/gm)].map((match) => match[1]),
)].sort();
const variableAudit = variableNames.map((name) => ({
  name,
  references: countMatches(`${styleText}\n${sourceText}`, new RegExp(`var\\(--${name}\\)`, 'g')),
}));

const selectorBlocks = [...cleanStyleText.matchAll(/([^{}]+)\{/g)]
  .flatMap((match) => match[1].split(','))
  .map((selector) => selector.trim())
  .filter((selector) => selector && !selector.startsWith('@'))
  .map((selector) => ({ selector, specificity: specificity(selector) }));
const rawColorMatches = clientText.match(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi) ?? [];
const authoredRawColorMatches = styleText.match(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi) ?? [];
const sourceRawColorMatches = clientSourceText.match(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi) ?? [];
const arbitraryUtilityMatches = clientText.match(/(?<![\w-])(?:bg|text|border|ring|shadow|from|to|via|p|m|gap|space-[xy]|rounded|leading|w|h|min-w|max-w|min-h|max-h|top|right|bottom|left|z|duration|delay)-\[[^\]]+\]/g) ?? [];
const arbitraryColorUtilityMatches = clientSourceText.match(/(?<![\w-])(?:bg|text|border|ring|shadow|from|to|via)-\[[^\]]+\]/g) ?? [];
const zIndexUtilities = [...new Set(clientText.match(/(?<![\w-])z-(?:\[[^\]]+\]|\d+|auto)(?![\w-])/g) ?? [])].sort();
const keyframes = [...cleanStyleText.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
const inlineStyleMatches = sourceText.match(/\bstyle\s*=\s*\{\{/g) ?? [];

const report = {
  styleFiles: styleFiles.map(relative),
  sourceFileCount: sourceFiles.length,
  cssLines: styleText.split(/\r?\n/).length,
  classSelectors: classAudit.length,
  referencedClasses: classAudit.filter((item) => item.references > 0).length,
  unreferencedClasses: classAudit.filter((item) => item.references === 0).length,
  classAudit,
  cssVariables: variableNames.length,
  unusedVariables: variableAudit.filter((item) => item.references === 0).map((item) => item.name),
  importantDeclarations: countMatches(styleText, /!important/g),
  rawColorTokensInClientStyling: rawColorMatches.length,
  rawColorUniqueInClientStyling: new Set(rawColorMatches.map((value) => value.toUpperCase())).size,
  rawColorTokensInAuthoredStyles: authoredRawColorMatches.length,
  rawColorTokensInClientSource: sourceRawColorMatches.length,
  rawColorUniqueInClientSource: new Set(sourceRawColorMatches.map((value) => value.toUpperCase())).size,
  arbitraryUtilityOccurrences: arbitraryUtilityMatches.length,
  arbitraryUtilityUnique: new Set(arbitraryUtilityMatches).size,
  arbitraryColorUtilityOccurrences: arbitraryColorUtilityMatches.length,
  arbitraryColorUtilityUnique: new Set(arbitraryColorUtilityMatches).size,
  zIndexUtilities,
  inlineStyleExpressions: inlineStyleMatches.length,
  inlineStyleFiles: clientFiles
    .filter((file) => /\bstyle\s*=\s*\{\{/.test(fs.readFileSync(file, 'utf8')))
    .map(relative),
  dynamicClassExpressionSites: countMatches(sourceText, /\bclassName\s*=\s*\{/g),
  dynamicClassMarkers: countMatches(sourceText, /\$\{|\b(?:clsx|classnames|cn)\s*\(|classList\.(?:add|remove|toggle)\s*\(/g),
  maxSelectorSpecificity: selectorBlocks.reduce((max, item) => Math.max(max, item.specificity), 0),
  highSpecificitySelectors: selectorBlocks.filter((item) => item.specificity > 30),
  keyframes: keyframes.length,
  unusedKeyframes: keyframes.filter((name) => !new RegExp(`(?:animation|animation-name)[^;{}]*${name}`).test(cleanStyleText)),
  rawValueReview: {
    important: countMatches(clientText, /!important/g),
    hashes: countMatches(clientText, /#/g),
    rgb: countMatches(clientText, /\brgb\(/gi),
    rgba: countMatches(clientText, /\brgba\(/gi),
    hsl: countMatches(clientText, /\bhsl\(/gi),
    hsla: countMatches(clientText, /\bhsla\(/gi),
    boxShadow: countMatches(clientText, /box-shadow\s*:/gi),
    borderRadius: countMatches(clientText, /border-radius\s*:/gi),
    zIndex: countMatches(clientText, /z-index\s*:/gi),
    transition: countMatches(clientText, /transition\s*:/gi),
    animation: countMatches(clientText, /animation\s*:/gi),
    inlineStyles: inlineStyleMatches.length,
  },
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--check')) {
  const failures = [];
  if (report.unreferencedClasses > 0) failures.push(`${report.unreferencedClasses} unreferenced CSS selectors`);
  if (report.unusedVariables.length > 0) failures.push(`${report.unusedVariables.length} unused CSS variables`);
  if (report.importantDeclarations > 0) failures.push(`${report.importantDeclarations} !important declarations`);
  if (report.unusedKeyframes.length > 0) failures.push(`${report.unusedKeyframes.length} unused keyframes`);
  if (report.zIndexUtilities.some((utility) => utility !== 'z-auto')) failures.push('non-semantic z-index utility classes');
  if (failures.length > 0) {
    console.error(`CSS architecture check failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}
