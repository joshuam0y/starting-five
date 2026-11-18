// Opening night rosters for past seasons. ESPN's season stats list every team a player played for that season, in order,
// so the first one is where he opened the season. A player in a start file on the wrong team (the file's roster was a
// summer snapshot) or listed as a free agent while he really opened on a team is moved there. Players ESPN never saw
// play that season stay as they are.
//   node tools/fix-opening-rosters.js 2026 [2025 ...] [--write]      (or --all for 2002-03 to 2025-26)
const fs = require('fs'), https = require('https');
const get = url => new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error('ESPN did not return JSON')); } }); }).on('error', rej));
const key = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
const WRITE = process.argv.includes('--write');
let years = process.argv.slice(2).filter(a => /^\d{4}$/.test(a)).map(Number);
if (process.argv.includes('--all')) years = Array.from({ length: 24 }, (_, i) => 2003 + i);
const MAPT = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', NOR: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA', NJ: 'NJN', OKC: 'OKC' };

function loadStart(y) {
  const f = 'data/start-' + y + '.js', s = fs.readFileSync(f, 'utf8'), m = 'window.START_LEAGUES[' + y + '] = ';
  const a = s.indexOf(m) + m.length, tail = s.indexOf('\nif (typeof module', a), end = tail < 0 ? s.length : tail;
  const body = s.slice(a, end).replace(/;\s*$/, '');
  return { f, s, a, end, obj: JSON.parse(body) };
}

(async () => {
  for (const y of years) {
    if (!fs.existsSync('data/start-' + y + '.js')) { console.log(y, 'no start file'); continue; }
    const d = await get('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=1000&sort=offensive.avgPoints%3Adesc&season=' + y + '&seasontype=2');
    const rows = (d.athletes || []).filter(x => x.athlete && Array.isArray(x.athlete.teams) && x.athlete.teams.length);
    if (rows.length < 300) { console.log(y, 'ESPN gave', rows.length, 'players, skipped'); continue; }
    const st = loadStart(y), L = st.obj;
    // ESPN team to ours: by nickname first (Pacers), then by abbreviation
    const byName = {}, ours = new Set(L.teams.map(t => t.abbr));
    L.teams.forEach(t => { byName[String(t.name).toLowerCase()] = t.abbr; });
    const teamOf = t => { const n = byName[String(t.name || '').toLowerCase()]; if (n) return n; const ab = MAPT[t.abbreviation] || t.abbreviation; return ours.has(ab) ? ab : null; };
    // the order of ESPN's teams list is not reliable, but teamShortName is where he finished: one team is that team,
    // two teams means he opened with the other one, three or more is left alone
    const first = {}; rows.forEach(x => {
      const ts = x.athlete.teams, fin = x.athlete.teamShortName;
      let open = null;
      if (ts.length === 1) open = ts[0];
      else if (ts.length === 2 && fin) { const o = ts.filter(t => t.abbreviation !== fin); if (o.length === 1) open = o[0]; }
      const t = open && teamOf(open);
      const g = (x.categories || []).reduce((v, c, ci) => { const ns = ((d.categories || [])[ci] || {}).names || []; const i = ns.indexOf('gamesPlayed'); return i >= 0 ? c.values[i] : v; }, 0);
      if (t) first[key(x.athlete.displayName)] = { t, g: +g || 0 };
    });
    // only players wrongly listed as free agents: the teams in the files are real opening rosters, and ESPN's team order
    // is not reliable enough to overrule them (Hinrich opened 2015-16 in Chicago, ESPN would say Atlanta). Some of these
    // free agents really signed during the season, so a team only fills its open spots up to 15, most games played first
    // (late signings play the fewest), then two-way slots from 2017-18 on; the rest stay free agents.
    const want = {};
    L.players.forEach(p => { if (p.team !== 'FA' || p.retired) return; const f = first[key(p.name)]; if (f) (want[f.t] = want[f.t] || []).push([p, f.g]); });
    const moves = [], twoWays = [];
    Object.keys(want).forEach(t => {
      const on = L.players.filter(p => p.team === t && !p.retired);
      let open = Math.max(0, 15 - on.filter(p => !p.twoWay).length), tw = y >= 2018 ? Math.max(0, 3 - on.filter(p => p.twoWay).length) : 0;
      want[t].sort((a, b) => b[1] - a[1]).forEach(([p]) => { if (open > 0) { open--; moves.push([p, 'FA', t]); } else if (tw > 0) { tw--; moves.push([p, 'FA', t]); twoWays.push(p); } });
    });
    const toTeam = moves.filter(m => m[1] === 'FA').length, swap = moves.length - toTeam;
    const faLeft = L.players.filter(p => p.team === 'FA').length - toTeam;
    console.log(y, '| ESPN', rows.length, '| free agents onto their opening team', toTeam, '| team fixes', swap, '| free agents left', faLeft);
    console.log('   ', moves.slice(0, 14).map(m => m[0].name + ' ' + m[1] + '>' + m[2]).join(', '));
    if (WRITE && moves.length) {
      moves.forEach(([p, , t]) => { p.team = t; }); twoWays.forEach(p => { p.twoWay = true; });
      fs.writeFileSync(st.f, st.s.slice(0, st.a) + JSON.stringify(L) + ';' + st.s.slice(st.end));
    }
  }
})();
