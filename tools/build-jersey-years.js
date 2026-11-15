// Builds data/jersey-years.js (window.JERSEY_YEARS): for every real retired number in data/history.js, the first season
// (season-ending year) it can hang in the rafters, so a league that starts in an old season shows only the numbers
// retired by then. A number goes up after its honoree's time with the team: his last season there from the season
// files (data/era-1947.js to era-2003.js), else his years with the team on Wikipedia's "List of NBA retired numbers"
// (tools/retired-numbers-wiki.txt, the page's wikitext), plus one season.
//   node tools/build-jersey-years.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'data/history.js'));
const AB = { NJN: 'BKN', CHH: 'NOH', VAN: 'MEM', NYN: 'BKN', WSB: 'WAS', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTA', KCK: 'SAC',
  PHW: 'GSW', SFW: 'GSW', MNL: 'LAL', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', SYR: 'PHI', FTW: 'DET', MLH: 'ATL', STL: 'ATL', TRI: 'ATL',
  CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', SDR: 'HOU', SEA: 'OKC', PHO: 'PHX', NOK: 'NOH', CHA: 'CHA', NOP: 'NOH' };
const ab = a => AB[a] || a;
const norm = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// last season with each franchise, from the season files
const last = {};
for (let y = 1947; y <= 2003; y++) {
  const f = path.join(ROOT, 'data/era-' + y + '.js');
  if (!fs.existsSync(f)) continue;
  require(f);
  (global.ERA_ROSTERS[y].players || []).forEach(p => { const k = ab(p.team) + '|' + norm(p.name); last[k] = Math.max(last[k] || 0, y); });
}
// Wikipedia: team, number, name, last year with the team
const TEAM = { 'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN', 'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE', 'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET', 'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND', 'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOH', 'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS' };
const wiki = {};
const txt = fs.readFileSync(path.join(__dirname, 'retired-numbers-wiki.txt'), 'utf8');
let team = null;
txt.split('\n|-').forEach(r => {
  const m = /rowspan="\d+"\s*\|\s*\[\[([^\]|]+)/.exec(r); if (m) team = TEAM[m[1].trim()] || team;
  const n = /\{\{nts\|([^}]+)\}\}/.exec(r);
  const nm = /\{\{sortname\|([^|}]+)\|([^|}]+)/.exec(r) || /scope="row"[^|]*\|\s*\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(r);
  if (!n || !nm || !team) return;
  const name = nm[2] ? nm[1] + ' ' + nm[2] : nm[1];
  const ys = []; r.replace(/(\d{4})\s*[–-]\s*(\d{4}|present)/g, (a, b, e) => { ys.push(e === 'present' ? 2026 : +e); return a; });
  if (ys.length) wiki[team + '|' + norm(name)] = Math.max.apply(null, ys);
});
const out = {}, miss = [];
Object.keys(HISTORY_PRIOR.retiredNumbers).forEach(a => {
  HISTORY_PRIOR.retiredNumbers[a].forEach(x => {
    const k = a + '|' + norm(x.name), end = last[k] || wiki[k] || (Object.keys(wiki).find(w => w.slice(4) === norm(x.name)) && wiki[Object.keys(wiki).find(w => w.slice(4) === norm(x.name))]);
    // no date anywhere: an honorary number (an owner, a broadcaster, the fans): shown from 2004-05 on
    out[a + '|' + x.number] = end ? end + 1 : 2005;
    if (!end) miss.push(a + ' ' + x.number + ' ' + x.name);
  });
});
fs.writeFileSync(path.join(ROOT, 'data/jersey-years.js'), '/* The first season (season-ending year) each real retired number in data/history.js can be up, built by\n' +
  '   tools/build-jersey-years.js: the honoree\'s last season with the team plus one. JERSEY_YEARS["BOS|6"] = 1970. */\n' +
  '(function (g) { g.JERSEY_YEARS = ' + JSON.stringify(out) + ";\n  if (typeof module !== 'undefined' && module.exports) module.exports = g.JERSEY_YEARS;\n})(typeof window !== 'undefined' ? window : this);\n");
console.log(Object.keys(out).length, 'numbers;', 'no date:', miss.length, miss.join(', '));
console.log('BOS', HISTORY_PRIOR.retiredNumbers.BOS.map(x => x.number + ':' + out['BOS|' + x.number]).join(' '));
