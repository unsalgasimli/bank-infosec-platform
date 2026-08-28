import * as fs from 'fs';

const dict: Record<string, string> = {
  'Enterprise Risk Register & Heat Matrix': 'Müəssisə Risk Reyestri və İstilik Matrisi',
  'ISO 31000 / NIST RMF 5×5 Risk matrix assessment, inherent vs residual risk calculation, and treatment tracking.': 'ISO 31000 / NIST RMF 5×5 Risk matrisi qiymətləndirməsi, ilkin və qalıq riskin hesablanması və nəzarət tədbirlərinin izlənməsi.',
  'Portfolio Risks': 'Portfel Riski',
  'New Risk Assessment': 'Yeni Risk Qiymətləndirməsi',
  'Treatment:': 'Tədbir növü:',
  'All Strategies': 'Bütün Strategiyalar',
  'Mitigate (Control)': 'Azaltma (Nəzarət)',
  'Accept (Governance)': 'Qəbul (İdarəetmə)',
  'Transfer (Insurance/Vendor)': 'Ötürmə (Sığorta/Tərəfdaş)',
  'Avoid (Decommission)': 'Yayınma (İstismardan çıxarma)',
  'Active Risk Portfolio': 'Aktiv Risk Portfeli',
  'No enterprise risks matched the active matrix cell or search filters.': 'Aktiv matris xanasına və ya axtarış filtrlərinə uyğun müəssisə riski tapılmadı.',
  '5×5 Enterprise Risk Heat Matrix': '5×5 Müəssisə Risk İstilik Matrisi',
  'Click on any cell to filter the risks by exact likelihood & impact': 'Dəqiq ehtimal və təsirə görə riskləri filtrləmək üçün istənilən xanaya klikləyin',
  'Impact (Severity of Consequence)': 'Təsir (Nəticənin Ciddiliyi)',
  'Almost Certain': 'Demək olar ki, qaçılmaz',
  'Likely': 'Çox ehtimal',
  'Possible': 'Mümkün',
  'Unlikely': 'Az ehtimal',
  'Rare': 'Nadir',
  'Negligible': 'Əhəmiyyətsiz',
  'Minor': 'Kiçik',
  'Moderate': 'Mülayim',
  'Significant': 'Əhəmiyyətli',
  'Catastrophic': 'Fəlakətli',
  'Filtered': 'Filtrləndi',
  'Likelihood': 'Ehtimal',
  'Impact': 'Təsir',
  'Dual-Control Approvals & Governance Gates': 'İkili Nəzarət Təsdiqləri və İdarəetmə Qapıları',
  'Cryptographic 4-eyes authorization gates for high-risk exceptions, production changes, and CAB releases.': 'Yüksək riskli istisnalar, istehsalat dəyişiklikləri və CAB buraxılışları üçün 4-göz avtorizasiya qapıları.',
  'Pending Authorizations': 'Gözləyən avtorizasiyalar',
  'You have zero outstanding governance gates or dual-control authorizations requiring your decision.': 'Qərarınızı tələb edən heç bir gözləyən idarəetmə qapısı və ya ikili nəzarət avtorizasiyası yoxdur.',
  'New Workflow': 'Yeni İş Axını',
  'Nodes': 'Düyünlər',
  'Variables': 'Dəyişənlər',
  'HUMAN WORK': 'İNSAN İCRASI',
  'Ticket input': 'Müraciət daxiletməsi',
  'Task': 'Tapşırıq',
  'Approval': 'Təsdiq',
  'Information request': 'Məlumat tələbi',
  'FLOW CONTROL': 'AXIN NƏZARƏTİ',
  'Condition': 'Şərt',
  'Parallel split': 'Paralel bölünmə',
  'Parallel join': 'Paralel birləşmə',
  'Wait / timer': 'Gözləmə / taymer',
  'Subworkflow': 'Alt iş axını',
  'AUTOMATION': 'AVTOMATLAŞDIRMA',
  'System action': 'Sistem əməliyyatı',
  'Integration action': 'İnteqrasiya əməliyyatı',
  'Select a node to configure it.': 'Konfiqurasiya etmək üçün düyünü seçin.',
  'PRE-FLIGHT': 'İLKİN YOXLAMA',
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
console.log('Successfully enriched I18nContext with Risk and Governance translations!');
