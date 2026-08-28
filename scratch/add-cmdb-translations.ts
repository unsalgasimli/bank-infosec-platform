import * as fs from 'fs';

const dict: Record<string, string> = {
  'Apply a saved private view…': 'Yadda saxlanılmış şəxsi görünüşü tətbiq et…',
  'Apply a saved private view...': 'Yadda saxlanılmış şəxsi görünüşü tətbiq et...',
  'Save current view': 'Cari görünüşü yadda saxla',
  'Name this private CMDB view': 'Bu şəxsi CMDB görünüşünü adlandırın',
  'Saved view': 'Yadda saxlanılmış görünüş',
  'global': 'qlobal',
  'Canonical CIs with lifecycle, ownership, provenance and dependency context.': 'Həyat dövrü, sahiblik, mənşə və asılılıq konteksti ilə əsas KV-lər.',
  'Search CI number, name, tag, hostname, serial or IP': 'KV nömrəsi, ad, etiket, host adı, seriya və ya IP axtarın',
  'All types': 'Bütün növlər',
  'All environments': 'Bütün mühitlər',
  'All lifecycle states': 'Bütün həyat dövrü vəziyyətləri',
  'All quality': 'Bütün keyfiyyət dərəcələri',
  'Missing owner': 'Sahibi çatışmır',
  'Stale CI': 'Köhnəlmiş KV',
  'Unverified': 'Yoxlanılmamış',
  'No relationships': 'Əlaqəsi yoxdur',
  'Duplicate candidate': 'Təkrar namizədi',
  'Relationship count': 'Əlaqə sayı',
  'Apply filters': 'Filtrləri tətbiq et',
  'Loading persisted CMDB records…': 'Saxlanılan CMDB qeydləri yüklənir…',
  'Loading persisted CMDB records...': 'Saxlanılan CMDB qeydləri yüklənir...',
  'No authorized CMDB records match this view.': 'Bu görünüşə uyğun səlahiyyətli CMDB qeydi yoxdur.',
  'Asset tag / serial': 'Aktiv etiketi / seriya',
  'Assigned / department': 'Təhkim edilmiş / departament',
  'Create configuration item': 'Konfiqurasiya vahidi yarat',
  'Create one canonical CMDB record; asset, application and service views derive from this CI.': 'Bir əsas CMDB qeydi yaradın; aktiv, tətbiq və xidmət görünüşləri bu KV-dən törəyir.',
  'CI type': 'KV növü',
  'Select type': 'Növü seçin',
  'Technical owner': 'Texniki sahib',
  'Business owner': 'Biznes sahibi',
  'Support group': 'Dəstək qrupu',
  'Discovery / source': 'Aşkarlama / mənbə',
  'Source ID': 'Mənbə İD',
  'Last sync': 'Son sinxronizasiya',
  'Last verified': 'Son yoxlanma',
  'No description supplied.': 'Heç bir təsvir qeyd edilməyib.',
  'Technical and subtype metadata': 'Texniki və alt növ metaməlumatları',
  'Upstream and downstream': 'Yuxarı və aşağı axın',
  'Calculated upstream business impact': 'Hesablanmış yuxarı axın biznes təsiri',
  'Direct dependencies': 'Birbaşa asılılıqlar',
  'Affected business services': 'Təsirə məruz qalan biznes xidmətləri',
  'Critical services': 'Kritik xidmətlər',
  'Dependency path': 'Asılılıq yolu',
  'Linked operational records': 'Əlaqəli əməliyyat qeydləri',
  'No linked incidents, requests, changes, projects, or tasks.': 'Əlaqəli insident, sorğu, dəyişiklik, layihə və ya tapşırıq yoxdur.',
  'Duplicate candidates': 'Təkrar namizədlər',
  'No candidates detected.': 'Heç bir namizəd aşkar edilmədi.',
  'Merge into this CI': 'Bu KV-yə birləşdir',
  'Immutable audit timeline': 'Dəyişdirilməz audit xronologiyası',
  'No audit events are available for this CI.': 'Bu KV üçün audit hadisəsi mövcud deyil.',
  'Create or view Threat Model for this CI': 'Bu KV üçün Təhdid Modelini yaradın və ya baxın',
  'Merge this duplicate into the selected CI? The source CI will be archived and its evidence retained.': 'Bu təkrarı seçilmiş KV-yə birləşdirmək istəyirsiniz? Mənbə KV arxivlənəcək və sübutları saxlanılacaq.',
  'Add persisted relationship': 'Saxlanılan əlaqə əlavə et',
  'Related CI…': 'Əlaqəli KV…',
  'Related CI...': 'Əlaqəli KV...',
  'same type and name': 'eyni növ və ad',
  'Match': 'Uyğunluq',
  'Loading CI detail…': 'KV detalları yüklənir…',
  'Loading CI detail...': 'KV detalları yüklənir...',
  'No active relationships.': 'Aktiv əlaqə yoxdur.'
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
console.log('Successfully added CMDB translations to I18nContext.tsx!');
