// Builds data/coach-old.js (window.COACH_OLD): the real head coaches of the seasons before 2003-04, for Association
// starts from 1946-47 to 2002-03, from tools/coach-old-cache.json (tools/fetch-coaches-old.py, Basketball-Reference).
//   node tools/build-coach-old.js
// COACH_OLD.open[Y][ABBR] = [coachId, since]: the coach on opening night of season Y (season-ending year), hired in `since`.
// COACH_OLD.coaches[id] = [name, offense, defense, development, motivation, years coached (season-ending years)].
// COACH_OLD.titles[name] = [years he won it]. Ratings (40 to 99) are estimates from his career record, playoff wins and
// titles up to 2002-03; coaches already in data/coaches.js keep the ratings there.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'coach-old-cache.json'), 'utf8'));
global.window = global;
require(path.join(ROOT, 'data/coaches.js'));
const known = {};
const W = global.COACHES || {};
(W.start || []).concat(W.early || [], W.pool || []).forEach(c => { known[c.id] = c; known['n:' + c.name] = c; });
// the same franchise abbreviations as tools/build-start.js
const AB = { NJN: 'BKN', CHH: 'NOH', VAN: 'MEM', NYN: 'BKN', WSB: 'WAS', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTA', KCK: 'SAC',
  PHW: 'GSW', SFW: 'GSW', MNL: 'LAL', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', SYR: 'PHI', FTW: 'DET', MLH: 'ATL', STL: 'ATL', TRI: 'ATL',
  CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', SDR: 'HOU', PHO: 'PHX' };
const ab = a => AB[a] || a;
const champ = {};
for (let y = 1947; y <= 2003; y++) {
  const f = path.join(ROOT, 'data/era-' + y + '.js');
  if (!fs.existsSync(f)) continue;
  const m = /"champion":"([A-Z]+)"/.exec(fs.readFileSync(f, 'utf8'));
  if (m) champ[y] = m[1];
}
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const coaches = {}, open = {}, titles = {}, best = {};
Object.keys(cache).sort().forEach(ys => {
  const Y = +ys, rows = cache[ys];
  open[Y] = {};
  rows.forEach(r => {
    const id = (known['n:' + r.name] && known['n:' + r.name].id) || r.id, A = ab(r.team);
    const b = best[id] || (best[id] = { name: r.name, cw: 0, cl: 0, pw: 0, pl: 0, yrs: [] });
    if (r.cw + r.cl >= b.cw + b.cl) { b.cw = r.cw; b.cl = r.cl; }
    b.pw = Math.max(b.pw, r.pw); b.pl = Math.max(b.pl, r.pl);
    if (b.yrs.indexOf(Y) < 0) b.yrs.push(Y);
    if (!open[Y][A]) open[Y][A] = [id, Y - Math.max(1, r.nth || 1) + 1];
  });
  // the champion's coach: whoever coached most of its games
  const c = champ[Y];
  if (c) {
    const r = rows.filter(x => x.team === c || ab(x.team) === ab(c)).sort((a, b) => b.g - a.g)[0];
    if (r) (titles[r.name] = titles[r.name] || []).push(Y);
  }
});
Object.keys(best).forEach(id => {
  const b = best[id], g = b.cw + b.cl, pct = g ? b.cw / g : 0.45, t = (titles[b.name] || []).length;
  const k = known[id] || known['n:' + b.name];
  if (k) { coaches[id] = [b.name, k.offense, k.defense, k.development, k.motivation, b.yrs]; return; }
  const base = 50 + (pct - 0.45) * 105 * Math.min(1, g / 160 + 0.35) + Math.min(10, b.pw / 9) + t * 3 + Math.min(6, g / 160);
  const r = n => clamp(Math.round(base + (hash(id + n) - 0.5) * 12), 40, 97);
  coaches[id] = [b.name, r('o'), r('d'), r('v'), r('m'), b.yrs];
});
const out = '/* Real NBA and BAA head coaches, 1946-47 to 2002-03 (cosmetic only), built by tools/build-coach-old.js from\n' +
  '   Basketball-Reference season coach pages (tools/coach-old-cache.json). open[Y][ABBR] = [id, season hired];\n' +
  '   coaches[id] = [name, offense, defense, development, motivation, seasons coached]; titles[name] = [years]. */\n' +
  '(function (g) { g.COACH_OLD = ' + JSON.stringify({ open, coaches, titles }) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = g.COACH_OLD;\n})(typeof window !== 'undefined' ? window : this);\n";
fs.writeFileSync(path.join(ROOT, 'data/coach-old.js'), out);
console.log('seasons', Object.keys(open).length, 'coaches', Object.keys(coaches).length, '1947 GSW', JSON.stringify(open[1947] && open[1947].GSW), 'titles', Object.keys(titles).length);
