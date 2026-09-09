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
for (const f of walk('src/client')) {
  if (!/\.(tsx|ts)$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  if (/UNKNOWN—|STAGINGSTAGING|environment.*—|MÜHİT/i.test(t)) {
    const lines = t.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/MÜHİT|UNKNOWN|environment/i.test(l) && /—|toLocaleUpperCase|toUpperCase|\+/.test(l)) {
        console.log(path.basename(f) + ':' + (i + 1) + ': ' + l.trim().slice(0, 200));
      }
    });
  }
}
