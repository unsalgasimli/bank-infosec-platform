import * as fs from 'fs';

const dict: Record<string, string> = {
  'Fixed endpoint': 'Sabit son nöqtə',
  'This default node marks where the workflow begins or completes. It is protected from deletion and duplication, but you can move it and connect it on the canvas.': 'Bu standart düyün iş axınının harada başladığını və ya başa çatdığını göstərir. Silinmə və təkrarlanmadan qorunur, lakin onu köçürə və kətan üzərində birləşdirə bilərsiniz.',
  'nodes': 'düyün',
  'edges': 'əlaqə',
  'Grid + snap': 'Tor + yapışma',
  'Freeform': 'Sərbəst forma',
};

let i18nContent = fs.readFileSync('src/client/context/I18nContext.tsx', 'utf-8');
const marker = "  'Quick Shortcuts': 'Sürətli keçidlər',";
const index = i18nContent.indexOf(marker);
if (index === -1) {
  console.error("Marker not found");
  process.exit(1);
}

let newLines = '\n';
for (const [k, v] of Object.entries(dict)) {
  const checkKey = `  '${k}':`;
  const checkKeyDbl = `  "${k}":`;
  if (!i18nContent.includes(checkKey) && !i18nContent.includes(checkKeyDbl)) {
    newLines += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`;
  }
}

i18nContent = i18nContent.slice(0, index + marker.length) + newLines + i18nContent.slice(index + marker.length);
fs.writeFileSync('src/client/context/I18nContext.tsx', i18nContent, 'utf-8');
console.log('Successfully added Builder fixed endpoint translations to I18nContext.tsx!');
