// Players who lost a whole season to injury under contract belong on their team's opening roster, not in free agency
// (data/injury-history.js). Each one goes onto the team that held him; a missing one is copied from his last start file.
// A full roster (15) drops its weakest veteran to free agency.   node tools/place-injured.js [--write]
const fs = require('fs');
const WHERE = {   // season: { id: team (the start file's abbreviation) }
  1978: { architi01: 'LAC' }, 1979: { waltobi01: 'POR' }, 1985: { cartwbi01: 'NYK', webstma01: 'NYK' }, 1986: { cartwbi01: 'NYK', webstma01: 'NYK' },
  1987: { dawkida01: 'BKN', nixonno01: 'LAC' }, 1988: { nixonno01: 'LAC' }, 1997: { benoida01: 'UTA' }, 1998: { workmha01: 'IND', muresgh01: 'WAS' },
  2002: { mcdyean01: 'DEN' }, 2003: { mcdyean01: 'NYK' }, 2006: { hardaan01: 'NYK' }, 2008: { livinsh01: 'LAC' }, 2012: { odengr01: 'POR' }
};
const load = y => { const f = 'data/start-' + y + '.js', s = fs.readFileSync(f, 'utf8'), m = 'window.START_LEAGUES[' + y + '] = ';
  const a = s.indexOf(m) + m.length, tail = s.indexOf('\nif (typeof module', a), end = tail < 0 ? s.length : tail;
  return { f, s, a, end, obj: JSON.parse(s.slice(a, end).replace(/;\s*$/, '')) }; };
Object.keys(WHERE).forEach(y => {
  y = +y; const st = load(y), L = st.obj;
  Object.entries(WHERE[y]).forEach(([id, t]) => {
    if (!L.teams.some(x => x.abbr === t)) { console.log(y, id, 'NO TEAM', t); return; }
    let p = L.players.find(q => q.id === id), how = 'moved';
    if (!p) {   // copy him from the last start file that has him
      for (let k = 1; k <= 3 && !p; k++) { if (!fs.existsSync('data/start-' + (y - k) + '.js')) continue; const q = load(y - k).obj.players.find(r => r.id === id); if (q) p = Object.assign({}, q, { age: q.age + k, stats: null, injury: null, salary: q.salary || 0 }); }
      if (!p) { console.log(y, id, 'not found in earlier files'); return; }
      L.players.push(p); how = 'added';
    }
    const from = p.team; p.team = t; p.twoWay = false;
    // under contract that season: keep his deal if it runs through it, else a one-year deal at his last salary
    const sal = (p.salaries || []).filter(x => x.year >= y);
    if (!sal.length) { const last = (p.salaries || []).slice(-1)[0], amt = (last && last.amount) || p.salary || 500000; p.salaries = [{ year: y, amount: amt }]; p.contractEnd = y; p.salary = amt; }
    const std = L.players.filter(q => q.team === t && !q.retired && !q.twoWay);
    let drop = '';
    if (std.length > 15) { const w = std.filter(q => q !== p && !(q.draft && +q.draft.year === y - 1)).sort((a, b) => a.ovr - b.ovr)[0]; if (w) { w.team = 'FA'; drop = ' (dropped ' + w.name + ', ' + w.ovr + ')'; } }
    console.log(y, p.name, how, from + ' -> ' + t + drop);
  });
  if (process.argv.includes('--write')) fs.writeFileSync(st.f, st.s.slice(0, st.a) + JSON.stringify(L) + ';' + st.s.slice(st.end));
});
