// 2026-27 ages for players ESPN's rosters do not cover (mostly free agents): the birth year most of the 2020-21 to 2025-26
// start files agree on (at least two seasons), so a missing birth date no longer shows as the default 25.
//   node tools/fix-ages.js [--write]
const fs = require('fs');
global.window = { START_LEAGUES: {} };
for (let y = 2021; y <= 2027; y++) { const f = 'data/start-' + y + '.js'; if (fs.existsSync(f)) eval(fs.readFileSync(f, 'utf8')); }
const L = window.START_LEAGUES[2027], fixes = [];
L.players.forEach(p => {
  const born = {};
  for (let y = 2021; y <= 2026; y++) { const o = window.START_LEAGUES[y] && window.START_LEAGUES[y].players.find(q => q.id === p.id); if (o && o.age) born[y - o.age] = (born[y - o.age] || 0) + 1; }
  const best = Object.entries(born).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 2) return;
  const age = 2027 - +best[0];
  if (age !== p.age && Math.abs(age - p.age) >= 2) fixes.push([p, age]);   // a year off is just a birthday convention
});
console.log(fixes.length + ' ages: ' + fixes.map(([p, a]) => p.name + ' ' + p.age + '>' + a).join(', '));
if (process.argv.includes('--write')) {
  fixes.forEach(([p, a]) => { p.age = a; });
  const f = 'data/start-2027.js', s = fs.readFileSync(f, 'utf8'), m = 'window.START_LEAGUES[2027] = ', a = s.indexOf(m) + m.length, b = s.lastIndexOf('};\nif (typeof module');
  fs.writeFileSync(f, s.slice(0, a) + JSON.stringify(L) + s.slice(b + 1));
  console.log('written');
}
