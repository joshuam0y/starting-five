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
if (process.argv.includes('--all')) years = Array.from({ length: 79 }, (_, i) => 1948 + i).filter(y => y !== 2013);
const MAPT = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', NOR: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA', NJ: 'NJN', OKC: 'OKC' };

function loadStart(y) {
  const f = 'data/start-' + y + '.js', s = fs.readFileSync(f, 'utf8'), m = 'window.START_LEAGUES[' + y + '] = ';
  const a = s.indexOf(m) + m.length, tail = s.indexOf('\nif (typeof module', a), end = tail < 0 ? s.length : tail;
  const body = s.slice(a, end).replace(/;\s*$/, '');
  return { f, s, a, end, obj: JSON.parse(body) };
}

global.window = global; eval(fs.readFileSync('data/drafts.js', 'utf8'));   // real draft classes 2013 to 2026: first-round picks
const players = y => { const f = 'data/start-' + y + '.js'; return fs.existsSync(f) ? loadStart(y).obj.players : y === 2013 ? null : null; };
(async () => {
  for (const y of years) {
    if (!fs.existsSync('data/start-' + y + '.js')) { console.log(y, 'no start file'); continue; }
    const st = loadStart(y), L = st.obj;
    // ESPN's season (2002-03 on): who played, and where he opened
    let rows = [];
    if (y >= 2003) {
      const d = await get('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=1000&sort=offensive.avgPoints%3Adesc&season=' + y + '&seasontype=2');
      rows = (d.athletes || []).filter(x => x.athlete && Array.isArray(x.athlete.teams) && x.athlete.teams.length);
      if (rows.length < 300) rows = [];   // 2011-12 (the lockout) comes back thin
    }
    const played = new Set(rows.map(x => key(x.athlete.displayName)));
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
      const t = open && teamOf(open); if (t) first[key(x.athlete.displayName)] = t;
    });
    // 1. players wrongly listed as free agents go to their opening team. Teams already in the file stay (ESPN's order is
    // not reliable enough to overrule them: Hinrich opened 2015-16 in Chicago). A team fills open spots up to 15: this
    // season's draft picks first, then by rating. A full team still takes a pick or a 72+ player in place of its weakest
    // veteran (a summer roster missing its star had someone extra on it), then two-way slots from 2017-18 on.
    // last year's first-round picks: guaranteed contracts, so one ESPN never saw play (hurt) goes to his team next season
    const firstRd = new Set((global.DRAFTS[y - 1] || []).filter(x => !x.undrafted && x.realPick && x.realPick <= 30).map(x => x.id));
    const nextTeam = {}; (players(y + 1) || []).forEach(p => { if (p.team && p.team !== 'FA' && p.team !== 'DRAFT' && ours.has(p.team)) nextTeam[p.id] = p.team; });
    const rookie = p => (p.draft && +p.draft.year === y - 1) || firstRd.has(p.id);
    const want = {};
    L.players.forEach(p => { if (p.team !== 'FA' || p.retired) return; const t = first[key(p.name)] || (firstRd.has(p.id) && nextTeam[p.id]); if (t) (want[t] = want[t] || []).push(p); });
    let placed = 0, bumped = [];
    Object.keys(want).forEach(t => {
      want[t].sort((a, b) => (rookie(b) - rookie(a)) || (b.ovr - a.ovr)).forEach(p => {
        const on = L.players.filter(q => q.team === t && !q.retired), std = on.filter(q => !q.twoWay);
        if (std.length < 15) { p.team = t; placed++; return; }
        if (rookie(p) || p.ovr >= 72) {
          const weak = std.filter(q => !rookie(q) && q.ovr < p.ovr).sort((a, b) => a.ovr - b.ovr)[0];
          if (weak) { weak.team = 'FA'; bumped.push(weak.name); p.team = t; placed++; return; }
        }
        if (y >= 2018 && on.length - std.length < 3) { p.team = t; p.twoWay = true; placed++; }
      });
    });
    // 2. the free agent class, built like 2K's 2012-13 one: everyone who played last season, is on no opening roster,
    // and plays again (this season per ESPN, or next season's file): unsigned on opening night, signed later or a year on
    const prev = players(y - 1), next = players(y + 1), have = new Set(L.players.map(p => p.id));
    const nextIds = new Set((next || []).map(p => p.id));
    const cls = (prev || []).filter(p => p.team !== 'DRAFT' && !p.retired && !have.has(p.id) && (nextIds.has(p.id) || played.has(key(p.name))) && p.age + 1 <= 40);
    cls.forEach(p => { L.players.push({ id: p.id, name: p.name, team: 'FA', pos: p.pos, age: p.age + 1, ht: p.ht, wt: p.wt, attrs: p.attrs, ovr: p.ovr, nbaId: p.nbaId || null, tend: p.tend, stats: null, injury: null, face: null, rated2k13: false, salary: 0 }); have.add(p.id); });
    const fa = L.players.filter(p => p.team === 'FA');
    console.log(y, '| onto opening teams', placed, bumped.length ? '(bumped ' + bumped.length + ')' : '', '| class added', cls.length, '| free agents', fa.length);
    if (WRITE) fs.writeFileSync(st.f, st.s.slice(0, st.a) + JSON.stringify(L) + ';' + st.s.slice(st.end));
  }
})();
