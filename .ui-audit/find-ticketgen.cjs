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
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/setInterval|simulate|generator|autoTicket|demoTicket|faker/i.test(l) && !/^\s*(\/\/|\*)/.test(l)) {
      hits.push(f.split(path.sep).join('/') + ':' + (i + 1) + ': ' + l.trim().slice(0, 140));
    }
  });
}
console.log(hits.slice(0, 30).join('\n') || 'no hits');
