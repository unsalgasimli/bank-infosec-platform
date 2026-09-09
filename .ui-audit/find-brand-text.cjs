const fs = require('fs');
const path = require('path');
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const hits = [];
for (const f of walk('src')) {
  if (!/\.(tsx|ts)$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    // candidate user-facing: quoted strings or JSX text containing the brand, excluding className attributes and identifier-ish uses
    const withoutClass = l.replace(/className=\{?["'`][^"'`]*["'`]\}?/g, '').replace(/className=\{`[^`]*`\}/g, '');
    if (!/[Ww]rike|Atlassian|[Jj]ira/.test(withoutClass)) return;
    const trimmed = withoutClass.trim();
    // skip pure identifier/variable usages (no quote around the brand occurrence)
    const quoted = trimmed.match(/(["'`])(?:(?!\1).)*?(?:[Ww]rike|Atlassian|[Jj]ira)(?:(?!\1).)*?\1/g);
    // JSX text nodes (brand appears outside quotes)
    const jsxText = trimmed.replace(/(["'`])(?:(?!\1).)*?\1/g, '');
    const hasJsxText = /[Ww]rike|Atlassian|[Jj]ira/.test(jsxText) && !/import|const |=>|function |\bnew\b|\.js'|\.tsx'|from '/.test(trimmed);
    if (quoted || hasJsxText) {
      hits.push(f.split(path.sep).join('/') + ':' + (i + 1) + ': ' + trimmed.slice(0, 190));
    }
  });
}
console.log(hits.join('\n'));
console.log('TOTAL:', hits.length);
