const fs = require('fs');
const FILE = 'src/client/components/projects/ProjectOperationsWorkspace.tsx';
let text = fs.readFileSync(FILE, 'utf8');
const swaps = [
  ['bg-white/95 backdrop-blur', 'bg-semantic-panel/95 backdrop-blur'],
  ['bg-white', 'bg-semantic-panel'],
  ['hover:bg-slate-50/70', 'hover:bg-semantic-hover'],
  ['hover:bg-slate-200/70', 'hover:bg-semantic-hover'],
  ['hover:bg-slate-100', 'hover:bg-semantic-hover'],
  ['bg-slate-50 text-slate-800 border-slate-200', 'bg-semantic-subtle text-semantic-primary border-semantic-border'],
  ['bg-slate-100 text-slate-700', 'bg-semantic-subtle text-semantic-secondary'],
];
for (const [from, to] of swaps) {
  const n = text.split(from).length - 1;
  if (!n) { console.log('0x  ' + from); continue; }
  text = text.split(from).join(to);
  console.log(n + 'x  ' + from + '  ->  ' + to);
}
fs.writeFileSync(FILE, text);
console.log('DONE');
