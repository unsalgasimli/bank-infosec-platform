import * as fs from 'fs';

const dict: Record<string, string> = {
  'New Workflow': 'Yeni İş Axını',
  'Workflow Catalog': 'İş Axını Kataloqu',
  'Workflow name': 'İş axınının adı',
  'Personal template': 'Fərdi şablon',
  'Department template': 'Şöbə şablonu',
  'Company template': 'Şirkət şablonu',
  'Focus mode · Esc to exit': 'Fokus rejimi · Çıxış üçün Esc',
  'Publish': 'Dərc et',
  'Nodes': 'Düyünlər',
  'Variables': 'Dəyişənlər',
  'Paste': 'Yapışdır',
  'Align H': 'Üfüqi düzləndir',
  'Align V': 'Şaquli düzləndir',
  'Fit': 'Ekrana sığdır',
  'Arrange': 'Sırala',
  'Copy selection (Ctrl+C)': 'Seçimi kopyala (Ctrl+C)',
  'Paste (Ctrl+V)': 'Yapışdır (Ctrl+V)',
  'Arrange nodes on the current grid': 'Düyünləri cari tor üzrə sırala',
  'Required workflow endpoint': 'Tələb olunan iş axını son nöqtəsi',
  'Select a node to configure it.': 'Konfiqurasiya etmək üçün düyünü seçin.',
  'Pre-flight': 'İlkin yoxlama',
  '0 Errors': '0 Xəta',
  'All graph connections and preflight rules passed.': 'Bütün qrafik əlaqələri və ilkin yoxlama qaydaları keçdi.',
  'Success End': 'Müvəffəqiyyətli sonluq',
  'Start': 'Başlanğıc',
  'Complete': 'Tamamlandı',
  'Due': 'Müddət',
  'Grid and snap are on': 'Tor və yapışma aktivdir',
  'Show grid and enable snap': 'Toru göstər və yapışmanı aktivləşdir',
  'Reset zoom': 'Miqyası sıfırla',
  'Zoom in': 'Yaxınlaşdır',
  'Zoom out': 'Uzaqlaşdır',
  'Open workflow builder in focus mode': 'İş axını qurucusunu fokus rejimində aç',
  'Exit focus mode (Esc)': 'Fokus rejimindən çıx (Esc)'
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

// Add dynamic regex patterns to translate() in I18nContext.tsx if not already present
const preflightPatternMarker = "// 3. Dynamic patterns for metrics and status counts";
const dynamicPatterns = `  // 3. Dynamic patterns for metrics and status counts
  // Workflow Preflight validation messages
  const unreachableMatch = trimmed.match(/^Node\\s+[“"'](.+?)[”"']\\s+cannot be reached from start\\.?$/i);
  if (unreachableMatch) {
    const nodeName = catalog[language][unreachableMatch[1]] || unreachableMatch[1];
    return text.replace(trimmed, \`“\${nodeName}” düyününə başlanğıcdan çatmaq mümkün deyil.\`);
  }

  const noIncomingMatch = trimmed.match(/^Node\\s+[“"'](.+?)[”"']\\s+has no incoming path\\.?$/i);
  if (noIncomingMatch) {
    const nodeName = catalog[language][noIncomingMatch[1]] || noIncomingMatch[1];
    return text.replace(trimmed, \`“\${nodeName}” düyününün daxil olan yolu yoxdur.\`);
  }

  const noOutgoingMatch = trimmed.match(/^Node\\s+[“"'](.+?)[”"']\\s+has no outgoing path\\.?$/i);
  if (noOutgoingMatch) {
    const nodeName = catalog[language][noOutgoingMatch[1]] || noOutgoingMatch[1];
    return text.replace(trimmed, \`“\${nodeName}” düyününün çıxan yolu yoxdur.\`);
  }

  const terminalNoOutMatch = trimmed.match(/^Terminal node\\s+[“"'](.+?)[”"']\\s+cannot have an outgoing connection\\.?$/i);
  if (terminalNoOutMatch) {
    const nodeName = catalog[language][terminalNoOutMatch[1]] || terminalNoOutMatch[1];
    return text.replace(trimmed, \`“\${nodeName}” son düyününün çıxan əlaqəsi ola bilməz.\`);
  }

  const startNoInMatch = trimmed.match(/^The Start node cannot have an incoming connection\\.?$/i);
  if (startNoInMatch) {
    return text.replace(trimmed, 'Başlanğıc düyününün daxil olan əlaqəsi ola bilməz.');
  }

  const errCountMatch = trimmed.match(/^(\\d+)\\s+Errors?$/i);
  if (errCountMatch) {
    return text.replace(trimmed, \`\${errCountMatch[1]} Xəta\`);
  }

  const warnCountMatch = trimmed.match(/^(\\d+)\\s+Warnings?$/i);
  if (warnCountMatch) {
    return text.replace(trimmed, \`\${warnCountMatch[1]} Xəbərdarlıq\`);
  }
`;

if (!i18nContent.includes('unreachableMatch')) {
  i18nContent = i18nContent.replace(preflightPatternMarker, dynamicPatterns);
}

fs.writeFileSync('src/client/context/I18nContext.tsx', i18nContent, 'utf-8');
console.log('Successfully added Builder translations and preflight regex patterns!');
