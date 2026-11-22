// Real seasons lost, every season in history (1947-48 on), from data/era-YYYY.js (every player who played that season, with
// his games): a rotation player (30+ games, 15+ minutes) who then played 10 games or fewer (or none) for one or two seasons
// and came back. Hand-checked absences that were not injuries are left out (NOT below: retirements, suspensions, military
// service, contract holdouts, overseas). Writes data/injury-history.js: window.INJURY_HISTORY = { bbrefId: [season years] }.
//   node tools/build-injury-history.js [--write]
const fs = require('fs');
global.window = global;
// each season from its era file, else its opening-roster file (stats = that season's real line, null when he never played)
const years = []; for (let y = 1947; y <= 2026; y++) if (fs.existsSync('data/era-' + y + '.js') || fs.existsSync('data/start-' + y + '.js')) years.push(y);
const G = {};   // id -> { year: { g, mpg, ovr, name } }
global.START_LEAGUES = {};
years.forEach(y => { const f = fs.existsSync('data/era-' + y + '.js') ? 'data/era-' + y + '.js' : 'data/start-' + y + '.js'; eval(fs.readFileSync(f, 'utf8')); });
const E = Object.assign({}, global.START_LEAGUES, global.ERA_ROSTERS);
years.forEach(y => { const L = E[y]; if (!L) return; (L.players || []).forEach(r => {
  if (!Array.isArray(r) && (r.team === 'DRAFT' || r.retired)) return;
  const p = Array.isArray(r) ? { id: r[0], name: r[1], ovr: r[7], stats: r[10] } : { id: r.id, name: r.name, ovr: r.ovr, stats: r.stats && [r.stats.g, r.stats.gs, r.stats.mpg] };
  if (!p.stats || !(+p.stats[0] > 0)) return;   // on a roster but never played: counted as a lost season below
  const s = p.stats || []; (G[p.id] = G[p.id] || {})[y] = { g: +s[0] || 0, mpg: +s[2] || 0, ovr: p.ovr, name: p.name };
}); });
// Who counts: starters and up (rated 72+) by the rule above, minus absences that were not injuries (hand-checked:
// retirements, Europe, the ABA, holdouts, suspensions, military service); below 72 only the hand-checked injuries in YES.
const NOT = {   // name: [years]
  'Michael Jordan': [1994], 'Ron Artest': [2005], 'George Mikan': [1955], 'Billy Cunningham': [1973, 1974], 'Arvydas Sabonis': [2002],
  'Dominique Wilkins': [1996, 1998], 'Dave Cowens': [1981, 1982], 'Paul Arizin': [1953, 1954], 'Spencer Haywood': [1981],
  'Robert Reid': [1983], 'Richard Dumas': [1994], 'Gus Williams': [1981], 'Joe Barry Carroll': [1985], 'Eddie Johnson': [1995],
  'Mitchell Wiggins': [1988, 1989, 1991], 'Sidney Moncrief': [1990], 'Tom Chambers': [1996], 'Bison Dele': [1997],
  'Horace Grant': [2003], 'Winston Garland': [1994], 'Todd Day': [1998, 1999], 'Xavier McDaniel': [1996], 'Benoit Benjamin': [1997],
  'Mahmoud Abdul-Rauf': [1999, 2000], 'Willie Burton': [1996], 'John Williams': [1992], 'Haywoode Workman': [1992, 1993]
};
Object.assign(NOT, { 'Metta World Peace': [2005], 'Jerry Stackhouse': [2009, 2011], 'Jamaal Tinsley': [2009], 'Jannero Pargo': [2009],
  'Carlos Arroyo': [2009], 'Carlos Delfino': [2009], 'Von Wafer': [2010], 'Anfernee Hardaway': [2007] });
// lost to injury but outside the rule (no comeback, a longer gap, or a short season before): always in
const FORCE = { 'Yao Ming': [2010, 2011], 'Greg Oden': [2011, 2012], 'Grant Hill': [2004], 'Shaun Livingston': [2008], 'Brandon Roy': [2012] };
const YES = {   // below 72, real injuries
  'Sam Bowie': [1987, 1988], 'Bill Cartwright': [1985, 1986], 'Darryl Dawkins': [1987, 1988], 'Marvin Webster': [1985, 1986],
  'Mychal Thompson': [1980], 'Phil Jackson': [1970], 'Tom Boerwinkle': [1973], 'Danny Fortson': [2001], 'Pervis Ellison': [1997],
  'Chris Dudley': [1994], 'Haywoode Workman': [1997, 1998], 'David Benoit': [1997]
};
const out = {}, rows = [];
Object.keys(G).forEach(id => {
  const H = G[id];
  years.forEach(y => {
    const a = H[y - 1]; if (!a || a.g < 30 || a.mpg < 15) return;                 // a real rotation player the season before
    const lost = n => !H[n] || H[n].g <= 10;
    if (!lost(y) || y === 1947) return;
    // he came back: 1 or 2 seasons away, then 11+ games
    let back = null; for (let k = 1; k <= 2; k++) if (H[y + k] && H[y + k].g > 10) { back = y + k; break; }
    if (!back) return;
    if (y === 2012 && H[y] && H[y].g > 0) return;   // 2011-12, the lockout: a short season, not a lost one
    const span = []; for (let z = y; z < back; z++) if (lost(z)) span.push(z);
    span.forEach(z => { if ((NOT[a.name] || []).includes(z)) return; if (a.ovr < 72 && !(YES[a.name] || []).includes(z)) return; out[id] = out[id] || []; if (!out[id].includes(z)) out[id].push(z); rows.push([z, a.name, a.ovr, H[z] ? H[z].g : 0]); });
  });
});
Object.keys(FORCE).forEach(n => { const id = Object.keys(G).find(i => Object.values(G[i]).some(r => r.name === n)); if (!id) { console.log('FORCE: no player', n); return; }
  out[id] = out[id] || []; FORCE[n].forEach(z => { if (!out[id].includes(z)) { out[id].push(z); rows.push([z, n, 99, 0]); } }); });
Object.keys(out).forEach(id => { out[id] = out[id].filter(z => z <= 2012); if (!out[id].length) delete out[id]; });   // 2012-13 on: the hand-made list in js/league.js
rows.sort((x, y) => y[2] - x[2]);
console.log('lost seasons:', rows.length, '| players:', Object.keys(out).length);
console.log('by decade:', JSON.stringify(rows.reduce((m, r) => { const d = Math.floor((r[0] - 1) / 10) * 10; m[d] = (m[d] || 0) + 1; return m; }, {})));
if (process.argv.includes('--rest')) console.log(rows.slice(70).sort((a,b)=>a[0]-b[0]).map(r => r[0] + ' ' + r[1] + ' ' + r[2]).join(' | '));
else console.log(rows.slice(0, 70).map(r => r[0] + ' ' + r[1] + ' (' + r[2] + ', ' + r[3] + 'g)').join('\n'));
if (process.argv.includes('--write')) {
  const ids = Object.keys(out).sort();
  fs.writeFileSync('data/injury-history.js', '/* Real seasons lost, 1947-48 on (tools/build-injury-history.js from data/era-YYYY.js): a rotation player who played 10 games\n   or fewer for a season or two, then came back. js/league.js sits him out that season in a league that is on his real path. */\nwindow.INJURY_HISTORY = {' + ids.map(i => JSON.stringify(i) + ':' + JSON.stringify(out[i].sort())).join(',') + '};\n');
  console.log('wrote data/injury-history.js');
}
