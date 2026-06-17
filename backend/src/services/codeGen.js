const WORDS_4 = [
  'able','arch','bare','bold','calm','care','cool','cube','cure','dark',
  'dear','deep','door','draw','each','easy','edge','even','ever','face',
  'fact','fair','fall','feel','file','find','fine','fire','flag','flat',
  'flip','flow','fold','font','food','form','free','fuel','full','fund',
  'gain','game','gear','glad','glow','goal','gold','good','grab','gray',
  'grid','grow','gulf','half','hall','hand','hard','harm','head','heal',
  'heat','held','help','hero','hide','high','hill','hint','hold','hole',
  'home','hook','hope','host','huge','hunt','icon','idea','idle','item',
  'join','jump','just','keep','kind','knot','lack','lake','land','lane',
  'last','late','lead','leaf','lean','left','lend','less','lift','like',
  'line','link','lion','list','live','load','lock','long','look','loop',
  'loss','love','mail','main','make','many','mark','mass','math','mean',
  'meet','mesh','mile','mill','mind','mint','miss','mode','moon','more',
  'most','move','much','must','neat','open','pure','real','safe','slim',
  'soft','sure','tall','thin','true','vast','warm','wide','wise','yarn',
];

const WORDS_6 = [
  'bright','center','change','chosen','circle','client','closer','clouds',
  'colors','commit','common','create','custom','cycles','detail','dialog',
  'direct','domain','driven','enable','engine','expand','factor','finger',
  'follow','forest','formal','foster','freely','friend','frozen','future',
  'garden','gentle','glance','global','golden','ground','guided','happen',
  'harbor','health','hidden','higher','honest','impact','inside','island',
  'joyful','jungle','keeper','knight','launch','leader','leaves','legacy',
  'linear','linked','listen','lively','longer','lovely','master','matter',
  'member','mental','mirror','modern','moment','motion','narrow','nature',
  'nearby','nested','normal','notify','object','online','opener','option',
  'orange','origin','output','parent','people','pillar','planet','player',
  'plenty','portal','prefer','pretty','public','purple','puzzle','random',
  'reader','recent','record','remind','remote','render','repeat','report',
  'rescue','result','reveal','review','reward','rising','robust','rocket',
  'rotate','router','sample','select','series','shared','signal','silver',
  'simple','single','sketch','smooth','source','spring','stable','static',
  'status','steady','stream','string','strong','studio','submit','summit',
  'switch','system','target','tender','ticket','timber','toggle','travel',
  'tunnel','update','useful','verify','vision','wonder','worker','yellow',
];

const SUFFIX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  const allWords = [...WORDS_4, ...WORDS_6];
  const word = allWords[Math.floor(Math.random() * allWords.length)];
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
  }
  return `${word}-${suffix}`;
}

function extractKeyword(topic) {
  if (!topic) return null;
  const words = topic.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
    .filter(w => w.length >= 4)
    .sort((a, b) => b.length - a.length);
  return words.length > 0 ? words[0].slice(0, 7) : null;
}

async function generateSuggestions(pool, topic) {
  const keyword = extractKeyword(topic);
  const suggestions = [];

  if (keyword) {
    for (let i = 0; i < 5 && suggestions.length === 0; i++) {
      let suffix = '';
      for (let j = 0; j < 4; j++) suffix += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
      const code = `${keyword}-${suffix}`;
      const { rows } = await pool.query('SELECT 1 FROM polls WHERE code = $1', [code]);
      if (rows.length === 0) suggestions.push(code);
    }
  }

  let attempts = 0;
  while (suggestions.length < 3 && attempts < 30) {
    attempts++;
    const code = generateCode();
    const { rows } = await pool.query('SELECT 1 FROM polls WHERE code = $1', [code]);
    if (rows.length === 0 && !suggestions.includes(code)) suggestions.push(code);
  }
  return suggestions;
}

module.exports = { generateCode, generateSuggestions };
