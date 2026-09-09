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
const files = walk('src/client').filter(f => /project|wrike|workmanagement|tasktable/i.test(f.toLowerCase()));
const hits = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/bg-white|bg-gray-50|bg-slate-50|background:\s*white|background-color:\s*#f/i.test(l)) {
      hits.push(path.basename(f) + ':' + (i + 1) + ': ' + l.trim().slice(0, 150));
    }
  });
}
console.log(hits.slice(0, 40).join('\n'));
console.log('total:', hits.length);
