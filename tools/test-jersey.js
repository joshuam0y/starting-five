// Jersey numbers (js/jersey.js, data/numbers.js): node tools/test-jersey.js [start years]
// Every player on a team has a number, no two teammates share one, nobody wears a number his team retired, real players
// wear their real number when it is free (two who really shared one in a season: one of them wears it); still true after a season and an offseason; a retired jersey has his number.
const fs = require('fs');
global.window = global;
console.warn = () => {};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const src = fs.readFileSync(__dirname + '/test-newstarts.js', 'utf8');
eval(src.match(/const files = \[[\s\S]*?\];\nfiles\.forEach[^\n]*\n/)[0].replace(/const files/, 'var files'));
require('../data/historic-moves.js');
require('../data/numbers.js');
require('../js/jersey.js');
const L = window.LEAGUE, J = window.JERSEY, N = window.NUMBERS;
const list = process.argv.slice(2).map(Number).filter(Boolean);
const years = list.length ? list : [2013, 1960, 1985];
const check = (s, label) => {
  const byTeam = {};
  Object.values(s.players).forEach(p => { if (p && !p.retired && s.teams[p.team]) (byTeam[p.team] = byTeam[p.team] || []).push(p); });
  const teams = Object.keys(byTeam);
  ok(teams.every(a => byTeam[a].every(p => p.jersey != null && p.jerseyTeam === a)), label + ': everyone on a team has a number');
  const dup = teams.filter(a => new Set(byTeam[a].map(p => p.jersey)).size !== byTeam[a].length);
  ok(!dup.length, label + ': no two teammates share a number (' + dup.join(',') + ')');
  const book = (s.history && s.history.retiredJerseys) || {};
  const ret = teams.filter(a => byTeam[a].some(p => (book[a] || []).some(x => String(x.number) === String(p.jersey) && x.id !== p.id)));
  ok(!ret.length, label + ': nobody wears a retired number (' + ret.join(',') + ')');
  let real = 0, match = 0;
  teams.forEach(a => byTeam[a].forEach(p => { const r = J.real(p, s.year, a); if (r != null) { real++; if (String(r) === String(p.jersey) || byTeam[a].some(q => q !== p && String(q.jersey) === String(r) && String(J.real(q, s.year, a)) === String(r))) match++; else if (process.env.DIAG) { const h = byTeam[a].find(q => q !== p && String(q.jersey) === String(r)); console.log('   ', s.year, a, p.name, 'real', r, 'wears', p.jersey, 'rows', JSON.stringify(N[String(p.base || p.id).split('@')[0]]), 'held by', h ? h.name : '-'); } } }));
  ok(!real || match / real > 0.85, label + ': real players wear their real number (' + match + ' of ' + real + ')');
  return real;
};
for (const y of years) {
  if (y !== 2013) require('../data/start-' + y + '.js');
  const s = L.newLeague(y === 2013 ? 'OKC' : window.START_LEAGUES[y].teams[0].abbr, y === 2013 ? { seed: 3 } : { seed: 3, start: y });
  const real = check(s, y + ' start');
  if (!real && N && Object.keys(N).length) console.log('  (no real numbers for ' + y + ' in data/numbers.js yet)');
  let g = 0, r;
  do { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); r = L.advance(s, 'endPlayoffs'); } while (r.stopped !== 'seasonOver' && ++g < 400);
  let st = 0;
  while (s.phase !== 'regular' && st++ < 160) { s.events.forEach(e => (e.resolved = true)); L.clearResolved(s); const r2 = L.advance(s, 'nextPhase'); if (r2 && r2.stopped === 'userPick') { const pool = Object.values(s.players).filter(p => p.team === 'DRAFT' && +p.draftYear === s.year).sort((a, b) => b.ovr - a.ovr); if (pool[0]) window.DRAFT.pick(s, s.userTeam, pool[0].id); } }
  check(s, y + ' after a season');
  const retired = Object.values((s.history && s.history.retiredJerseys) || {}).flat().filter(x => x.id);
  ok(retired.every(x => x.number != null && x.number !== ''), y + ': jerseys retired in the league have a number (' + retired.length + ')');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
