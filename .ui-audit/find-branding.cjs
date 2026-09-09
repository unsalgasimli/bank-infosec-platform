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
console.log('--- ATLASSIAN/JIRA ---');
for (const f of walk('src/client')) {
  if (!/\.(tsx|ts)$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/ATLASSIAN|Atlassian/i.test(l) && !/^\s*(\/\/|\*)/.test(l)) {
      console.log(path.basename(f) + ':' + (i + 1) + ': ' + l.trim().slice(0, 140));
    }
  });
}
console.log('--- Wrike user-facing strings in i18n values (AZ col) ---');
const i18n = fs.readFileSync('src/client/context/I18nContext.tsx', 'utf8');
const lines = i18n.split(/\r?\n/);
lines.forEach((l, i) => {
  if (/Wrike/i.test(l)) console.log((i + 1) + ': ' + l.trim().slice(0, 150));
});
