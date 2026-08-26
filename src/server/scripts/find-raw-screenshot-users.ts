import fs from 'fs';

async function main() {
  const content = fs.readFileSync('ad-users-export.json', 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(content);
  
  const names = [
    'Ali Safarov',
    'Araz Huseynov',
    'Aslan Kazimov',
    'Ayar Hasanov',
    'Aysun Maharramova',
    'Elmin Haciyev',
    'Emin Khozehagg',
    'Emin Mustafayev',
    'Huseyn Zeynalov',
    'Aleksandr Yakovlev',
    'Babek Khudiyev',
    'Casur Ahmadov',
    'Elmar Heybatov',
    'Elmar R. Hasanzade',
    'Elmidar Mustafayev',
    'Elmira Memmedzade',
    'Elvin Nabizada',
    'Emil Farzaliyev',
    'Emilya Bochkova',
    'Farasat Novruzov',
    'Farid Vahidli',
    'Fidan Vahidova',
    'Firuza Quliyeva',
    'Gulbahar Jafarova',
    'Islam Yusifov',
    'Javad Bagirov'
  ];

  const matched = parsed.filter((u: any) => names.some((n) => u.displayName?.toLowerCase().includes(n.toLowerCase())));
  console.log(`Found ${matched.length} users in raw AD export:`);
  for (const u of matched) {
    console.log(`\nUser: ${u.displayName} (${u.sAMAccountName})`);
    console.log(`  title: "${u.title || u.jobTitle}"`);
    console.log(`  department: "${u.department}"`);
    console.log(`  DN: "${u.distinguishedName}"`);
  }

  process.exit(0);
}

main().catch(console.error);
