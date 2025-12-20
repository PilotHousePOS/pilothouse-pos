const brandAbbreviations: Record<string, string[]> = {
  'science diet': ['sd', 'scidiet', 'sci diet', 'hill', 'hills'],
  'royal canin': ['rc', 'royalc', 'royal can', 'roycan'],
  'diamond': ['diam', 'diamnd'],
  'redbarn': ['rb', 'rbp', 'redb', 'red b'],
  'orijen': ['orj', 'orij'],
};

const wordAbbreviations: Record<string, string[]> = {
  'chicken': ['ck', 'chk', 'chkn', 'chic', 'chick'],
  'lamb': ['lam', 'lmb'],
  'senior': ['sen', 'snr'],
  'puppy': ['pup', 'ppy'],
  'large': ['lg', 'lrg'],
  'small': ['sm', 'sml'],
  'breed': ['br', 'brd'],
  'grain free': ['gr fr', 'grfr', 'grf'],
  'original': ['orig'],
  'maintenance': ['mainten', 'maint'],
  'premium': ['prem'],
  'yorkshire': ['york', 'yorkie'],
  'chihuahua': ['chih', 'chihu'],
  'region': ['reg'],
};

function normalizeText(text: string): string {
  // Replace # with pound before normalizing
  let t = text.replace(/#/g, ' pound ');
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(text: string): string {
  let expanded = normalizeText(text);
  for (const [full, abbrevs] of Object.entries(brandAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  for (const [full, abbrevs] of Object.entries(wordAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  return expanded;
}

// Test cases
const tests = [
  { src: 'SD ck 5#', db: 'Science Diet Chicken 5lb' },
  { src: 'SD puppy sm br ck 4.5#', db: 'Science Diet Puppy Small Breed Chicken 4.5lb' },
  { src: 'royal can york 10#', db: 'Royal Canin Yorkshire 10lb' },
  { src: 'DIAM senior 35#', db: 'Diamond Senior 35lb' },
  { src: 'ORIJEN region 13#', db: 'Orijen Regional Red 13lb' },
];

for (const t of tests) {
  const srcExp = expandAbbreviations(t.src);
  const dbExp = expandAbbreviations(t.db);
  console.log(`\nSource: "${t.src}" -> "${srcExp}"`);
  console.log(`DB:     "${t.db}" -> "${dbExp}"`);
  
  const srcWords = new Set(srcExp.split(' ').filter(w => w.length > 1));
  const dbWords = new Set(dbExp.split(' ').filter(w => w.length > 1));
  const matches = [...srcWords].filter(w => dbWords.has(w));
  console.log(`Source words: ${[...srcWords].join(', ')}`);
  console.log(`DB words: ${[...dbWords].join(', ')}`);
  console.log(`Matches: ${matches.join(', ')} (${matches.length}/${srcWords.size})`);
}
