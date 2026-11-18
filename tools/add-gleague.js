// 2026-27 free agents: G League players with NBA history join the free agent pool, and players who went overseas leave it.
// A G League player not on an NBA roster (ESPN's 30 NBA rosters) who played in an NBA season the site has (2020-21 to
// 2025-26) is added as a free agent with his latest rating, a year older per season since. Players with no NBA rating are
// skipped. tools/overseas.json lists players who left for overseas (ids or names); they are taken out of 2026-27.
//   node tools/add-gleague.js [--write]
const fs = require('fs'), https = require('https');
const get = url => new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error('ESPN did not return JSON')); } }); }).on('error', rej));
const key = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
const WRITE = process.argv.includes('--write');
global.window = { START_LEAGUES: {} };
for (let y = 2021; y <= 2027; y++) eval(fs.readFileSync('data/start-' + y + '.js', 'utf8'));
const L = window.START_LEAGUES[2027];

(async () => {
  const roster = async (lg, need) => {
    const tl = (await get('https://site.api.espn.com/apis/site/v2/sports/basketball/' + lg + '/teams')).sports[0].leagues[0].teams.map(x => x.team);
    const names = [];
    for (const t of tl) { const r = await get('https://site.api.espn.com/apis/site/v2/sports/basketball/' + lg + '/teams/' + t.id + '/roster'); (r.athletes || []).forEach(a => names.push(a.displayName)); }
    if (tl.length < need) throw new Error(lg + ': only ' + tl.length + ' teams');
    return names;
  };
  const nba = new Set((await roster('nba', 30)).map(key));
  const gl = await roster('nba-development', 25);
  console.log('G League players', gl.length);

  // overseas: out of 2026-27
  const OV = fs.existsSync('tools/overseas.json') ? JSON.parse(fs.readFileSync('tools/overseas.json', 'utf8')) : [];
  const gone = L.players.filter(p => OV.some(o => o === p.id || key(o) === key(p.name)));
  console.log('overseas, removed:', gone.map(p => p.name + ' (' + p.team + ')').join(', ') || 'none');

  // G League players with NBA history
  const have = new Set(L.players.map(p => key(p.name)));
  const adds = [];
  gl.forEach(n => {
    const k = key(n);
    if (nba.has(k) || have.has(k) || OV.some(o => key(o) === k)) return;
    for (let y = 2026; y >= 2021; y--) {
      const p = window.START_LEAGUES[y].players.find(q => key(q.name) === k);
      if (p) { adds.push(Object.assign({}, p, { team: 'FA', age: p.age + (2027 - y), stats: null, injury: null, salary: 0, salaries: undefined, contractEnd: undefined, twoWay: false, gLeague: true })); have.add(k); return; }
    }
  });
  adds.sort((a, b) => b.ovr - a.ovr);
  console.log('G League adds', adds.length + ':', adds.map(p => p.name + ' ' + p.ovr).join(', '));
  if (!WRITE) { console.log('dry run (use --write)'); return; }
  const ids = new Set(gone.map(p => p.id));
  L.players = L.players.filter(p => !ids.has(p.id)).concat(adds.map(p => JSON.parse(JSON.stringify(p))));
  const f = 'data/start-2027.js', s = fs.readFileSync(f, 'utf8'), m = 'window.START_LEAGUES[2027] = ', a = s.indexOf(m) + m.length, b = s.indexOf('\nif (typeof module', a);
  fs.writeFileSync(f, s.slice(0, a) + JSON.stringify(L) + ';' + s.slice(b));
  console.log('written: free agents now', L.players.filter(p => p.team === 'FA').length);
})().catch(e => { console.log('stopped, nothing written:', e.message); process.exit(1); });
