import * as fs from 'fs';
import * as path from 'path';

function findFiles(dir: string, ext: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(filePath, ext));
    } else if (ext.some(e => file.endsWith(e))) {
      results.push(filePath);
    }
  }
  return results;
}

const clientDir = path.resolve('src/client/components');
const files = findFiles(clientDir, ['.tsx']);

console.log(`Found ${files.length} tsx files under src/client/components`);

// Regex for finding strings inside JSX tags e.g. >Some English Text<
const jsxTextRegex = />([A-Z][a-zA-Z0-9\s,.:;!?'"-]{3,60})</g;
// Regex for finding placeholder="Some text" or title="Some text"
const attrRegex = /(?:placeholder|title|aria-label)="([A-Z][a-zA-Z0-9\s,.:;!?'"-]{3,60})"/g;

const foundLiterals = new Set<string>();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = jsxTextRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && !text.startsWith('{') && !text.includes('className') && !text.includes('http') && !text.includes('flex')) {
      foundLiterals.add(text);
    }
  }
  while ((match = attrRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text) {
      foundLiterals.add(text);
    }
  }
}

console.log(`Found ${foundLiterals.size} unique literal strings across components.`);
const sorted = Array.from(foundLiterals).sort();
fs.writeFileSync('scratch/untranslated_candidates.json', JSON.stringify(sorted, null, 2));
console.log('Saved to scratch/untranslated_candidates.json');
