const fs = require('fs');
const path = require('path');
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const hits = [];
for (const f of walk('src/server')) {
  if (!/\.ts$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  if (!/environment/i.test(t)) continue;
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    // assignment-ish or concat patterns involving environment
    if (/environment\s*[:=]/i.test(l) || /environment.*\+/i.test(l) || /\+\s*.*environment/i.test(l)) {
      const trimmed = l.trim();
      if (/^\s*(\/\/|\*)/.test(l)) return;
      hits.push(f.split(path.sep).join('/') + ':' + (i + 1) + ': ' + trimmed.slice(0, 180));
    }
  });
}
console.log(hits.join('\n'));
console.log('TOTAL:', hits.length);
