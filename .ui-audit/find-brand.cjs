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
  if (!/\.(tsx|ts|css|html)$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/[Ww]rike|Atlassian|[Jj]ira/.test(l)) {
      hits.push(f.split(path.sep).join('/') + ':' + (i + 1) + ': ' + l.trim().slice(0, 180));
    }
  });
}
console.log(hits.join('\n'));
console.log('TOTAL LINES:', hits.length);
