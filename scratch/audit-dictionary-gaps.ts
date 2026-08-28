import * as fs from 'fs';
import * as path from 'path';

const i18nFile = fs.readFileSync('src/client/context/I18nContext.tsx', 'utf-8');
const candidates: string[] = JSON.parse(fs.readFileSync('scratch/untranslated_candidates.json', 'utf-8'));

// Extract keys in az dictionary
const azMatch = i18nFile.match(/const az: Record<string, string> = {([\s\S]*?)};/);
if (!azMatch) {
  console.error('Could not find az dictionary in I18nContext.tsx');
  process.exit(1);
}

const azBlock = azMatch[1];
const existingKeys = new Set<string>();
const keyRegex = /['"]([^'"]+)['"]\s*:/g;
let m;
while ((m = keyRegex.exec(azBlock)) !== null) {
  existingKeys.add(m[1].toLowerCase());
}

console.log(`Found ${existingKeys.size} unique keys in az dictionary.`);

const missingInDict: string[] = [];
for (const cand of candidates) {
  if (!existingKeys.has(cand.toLowerCase()) && !existingKeys.has(cand.trim().toLowerCase())) {
    // Filter out obvious code/tokens
    if (cand.length > 2 && !cand.startsWith('bg-') && !cand.startsWith('text-') && !cand.includes('=>')) {
      missingInDict.push(cand);
    }
  }
}

console.log(`Found ${missingInDict.length} candidate strings not present in az dictionary.`);
fs.writeFileSync('scratch/missing_translations.json', JSON.stringify(missingInDict, null, 2));
console.log('Saved to scratch/missing_translations.json');
