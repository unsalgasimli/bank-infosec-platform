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

const PATTERNS = [
  [/lorem\s*ipsum/i, 'LOREM'],
  [/\bTODO\b(?!:)/, 'TODO'],
  [/\bFIXME\b/i, 'FIXME'],
  [/coming soon/i, 'COMING-SOON'],
  [/under construction/i, 'CONSTRUCTION'],
  [/\bdummy\b/i, 'DUMMY'],
  [/\basdf\b|\bqwer\b/i, 'MASH'],
  [/\bfoo\s*bar\b/i, 'FOOBAR'],
  [/placeholder\s+text/i, 'PLACEHOLDER-TEXT'],
  [/\btest\s+user\b|\bTest User\b/, 'TEST-USER'],
  [/John Doe|Jane Doe|John Smith/i, 'GENERIC-NAME'],
  [/example@example\.com|test@test\.com/i, 'TEST-EMAIL'],
  [/1234567890/, 'SEQ-DIGITS'],
  [/🎉|🚀|✨|🔥|👍|😄|😀|🙂|😎|💪|🙌|👏|🤖|💡/, 'EMOJI'],
  [/\bWIP\b/, 'WIP'],
  [/oops|oopsie/i, 'OOPS'],
  [/hack|hacky/i, 'HACK-WORD'],
  [/send nudes|hell yeah|damn/i, 'CASUAL'],
  [/\bAAA\b|\bBBB\b|\bCCC\b placeholder/, 'DUMMY2'],
  [/\bSample\b/ , 'SAMPLE'],
  [/\bN\/A\b/, 'NA'],
  [/ debug only|for debugging/i, 'DEBUG'],
];

const files = walk('src/client').filter(f => /\.(tsx?|css)$/.test(f));
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\r?\n/);
  const hits = [];
  lines.forEach((l, i) => {
    // skip comment-only lines for TODO-ish noise? keep, but mark
    for (const [re, tag] of PATTERNS) {
      if (re.test(l)) hits.push(`[${tag}] ${i + 1}: ${l.trim().slice(0, 150)}`);
    }
  });
  if (hits.length) {
    console.log('=== ' + f + ' (' + hits.length + ')');
    console.log([...new Set(hits)].slice(0, 12).join('\n'));
  }
}
console.log('SCAN COMPLETE');
