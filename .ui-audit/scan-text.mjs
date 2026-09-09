const fs = require('fs');
const path = require('path');
const DIR = path.resolve(process.cwd(), '.ui-audit', 'text');

// Slop patterns: placeholders, lorem, TODO, dummy data, casual language, emoji, dev leftovers
const PATTERNS = [
  [/lorem ipsum/i, 'lorem-ipsum'],
  [/\bTODO\b/, 'TODO'],
  [/\bFIXME\b/i, 'FIXME'],
  [/\bWIP\b/, 'WIP'],
  [/placeholder/i, 'placeholder'],
  [/coming soon/i, 'coming-soon'],
  [/under construction/i, 'under-construction'],
  [/\bfoobar\b|\bfoo bar\b/i, 'foo-bar'],
  [/\basdf\b|\bqwer\b/i, 'keyboard-mash'],
  [/\btest\s+(user|data|ticket|incident|item)\b/i, 'test-entity'],
  [/\bdummy\b/i, 'dummy'],
  [/\bxxx+\b/, 'xxx'],
  [/\?\?\?/, '???'],
  [/\bN\/A\b/, 'N/A-literal'],
  [/undefined|NaN\b/, 'undefined-NaN'],
  [/\[object Object\]/, 'object-object'],
  [/Something went wrong|oops|oopsie/i, 'casual-error'],
  [/Lorem|ipsum/i, 'lorem'],
  [/🎉|🚀|✨|🔥|👍|😄|😀|🙂|😎|💪|🙌|👏|🤖|💡|⚠️|❌|✅|⚡|🎯|📊|🔒|🛡/, 'emoji'],
  [/\bHURRY\b|\bWOW\b|\bAMAZING\b/i, 'marketing-speak'],
  [/click here/i, 'click-here'],
  [/%%|\{\{|\}\}/, 'template-artifact'],
  [/sample-|example-|TEST-|DRAFT/i, 'sample-draft-marker'],
  [/Lorem/,'lorem-cased'],
];

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.txt'));
let totalHits = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    for (const [re, tag] of PATTERNS) {
      if (re.test(line)) {
        hits.push(`  [${tag}] L${i + 1}: ${line.trim().slice(0, 160)}`);
      }
    }
  });
  if (hits.length) {
    console.log('=== ' + f + ' (' + hits.length + ' hits)');
    console.log([...new Set(hits)].slice(0, 25).join('\n'));
    totalHits += hits.length;
  }
}
console.log('\nTOTAL HITS:', totalHits, 'across', files.length, 'pages');
