// Plays the main modes start to finish in a phone-sized browser and fails on any page error or blank screen.
// Serve the repo first (python3 -m http.server 8123). Needs puppeteer-core (NODE_PATH) and Chrome (CHROME_PATH).
//   node tools/e2e-phone.js
// 1. The Daily auction, bidding and passing to the end, then the share text (theme, squares, percent).
// 2. Head to Head on one phone with the auction, both sides played to the end of the series.
// 3. The Association: a new league, a whole season and the offseason simmed, every league page visited at each phase.
const pp = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8123';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const w = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const say = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) bad++; };

(async () => {
  const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  const errCheck = (label, from) => { const n = errs.length - from; say(n === 0, label + (n ? ': ' + errs.slice(from).slice(0, 3).join(' || ') : '')); };
  try {
    await p.goto(BASE + '/#/home', { waitUntil: 'load' }); await w(2500);
    await p.evaluate(() => {
      localStorage.setItem('a13-dy-tour', '1');
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied.push(t); } }, configurable: true });
      UI.profile.signedIn = () => false; UI.profile.rpc = async () => [];
    });

    // 1. the Daily
    let e0 = errs.length;
    await p.evaluate(() => { const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); Object.keys(localStorage).filter(k => k.indexOf('a13-rk-d-' + d) === 0).forEach(k => localStorage.removeItem(k)); location.hash = '#/daily/play'; });
    let state = '', turns = 0;
    for (let i = 0; i < 300 && state !== 'done'; i++) {
      await w(350);
      state = await p.evaluate(k => {
        if (document.getElementById('dlShare')) return 'done';
        const r = document.getElementById('aucRaise'), s = document.getElementById('aucPass');
        if (k % 3 && r && !r.disabled) { r.click(); return 'bid'; }   // mostly bid, sometimes pass, so both paths run
        if (s && !s.disabled) { s.click(); return 'pass'; }
        return 'wait';
      }, i);
      if (state !== 'wait') turns++;
    }
    say(state === 'done', 'daily: played to the end (' + turns + ' moves)');
    await w(1500);
    const txt = await p.evaluate(async () => { const x = document.getElementById('dlShare'); if (!x) return ''; x.click(); await new Promise(r => setTimeout(r, 400)); return window.__copied.slice(-1)[0] || ''; });
    say(/^Starting Five Daily #\d+ \| .+ \u{1F3C0}\n[\u{1F7E5}-\u{1F7EA}]{5}\n\d+\.\d% of a perfect five\n/u.test(txt), 'daily: share text has the theme, five squares and the percent');
    errCheck('daily: no page errors', e0);

    // 2. Head to Head, one phone, auction
    e0 = errs.length;
    await p.evaluate(() => { location.hash = '#/home'; }); await w(300);
    await p.evaluate(() => { location.hash = '#/challenge/vs'; }); await w(1500);
    await p.evaluate(() => { const x = [...document.querySelectorAll('#app button')].find(e => /^SAME PHONE/.test(e.textContent.trim())); if (x) x.click(); }); await w(400);
    await p.evaluate(() => { const x = [...document.querySelectorAll('#app button')].find(e => /^AUCTION/.test(e.textContent.trim())); if (x) x.click(); }); await w(400);
    await p.evaluate(() => { const x = document.getElementById('vsStart'); if (x) x.click(); }); await w(1500);
    let h2h = '';
    for (let i = 0; i < 600 && h2h !== 'done'; i++) {
      await w(250);
      h2h = await p.evaluate(k => {
        if (/\/vs\/result/.test(location.hash) && /WINS \d-\d/.test((document.getElementById('app') || {}).innerText || '')) return 'done';
        for (const id of ['whSkip', 'rvGo', 'vsFinal']) { const x = document.getElementById(id); if (x && !x.disabled) { x.click(); return id; } }
        const r = document.getElementById('aucRaise'), s = document.getElementById('aucPass');
        if (k % 2 && r && !r.disabled) { r.click(); return 'bid'; }
        if (s && !s.disabled) { s.click(); return 'pass'; }
        // after the auction: the gold button moves the series on (to the series, watch the next game)
        const go = [...document.querySelectorAll('#app .btn-gold')].find(x => !x.disabled && !/SETUP|HOME|MENU|NEW|REMATCH|AGAIN/i.test(x.textContent));
        if (go) { go.click(); return 'go'; }
        return 'wait';
      }, i);
    }
    // the series line has to match the games: count each side's wins from the scores
    await w(1200);
    const sr = await p.evaluate(() => {
      const t = (document.getElementById('app') || {}).innerText || '', m = /PLAYER (\d) WINS (\d)-(\d)/.exec(t), wins = [0, 0, 0];
      for (const g of t.matchAll(/PLAYER (\d) (\d+) @ PLAYER (\d) (\d+)/g)) wins[+g[2] > +g[4] ? +g[1] : +g[3]]++;
      return m ? { w: +m[1], a: +m[2], b: +m[3], wins } : { none: location.hash + ' ' + t.slice(0, 200).replace(/\n/g, ' / ') };
    });
    if (sr && sr.none) console.log('     page:', sr.none);
    say(!!sr && !sr.none && sr.wins[sr.w] === sr.a && sr.wins[3 - sr.w] === sr.b, 'head to head: the series result matches the game scores' + (sr ? ' (' + sr.a + '-' + sr.b + ', games ' + (sr.wins || []).slice(1).join('-') + ')' : ' (no result line)'));
    say(h2h === 'done', 'head to head: auction and series played to the end');
    errCheck('head to head: no page errors', e0);

    // 3. The Association: a season and an offseason, every page at each phase
    e0 = errs.length;
    const pages = await p.evaluate(() => { UI.state.game = LEAGUE.newLeague('OKC', { seed: 7 }); UI.state.slot = UI.state.slot || 1; return Object.keys(UI.pages).sort(); });
    const visitAll = async label => {
      const blank = [];
      for (const n of pages) {
        await p.evaluate(x => { location.hash = '#/' + x; }, n); await w(120);
        const len = await p.evaluate(() => ((document.getElementById('app') || {}).innerText || '').trim().length);
        if (!len) blank.push(n);
      }
      say(!blank.length, 'association ' + label + ': ' + pages.length + ' pages' + (blank.length ? ', blank: ' + blank.join(',') : ''));
    };
    await visitAll('preseason');
    const step = async (how, label) => {
      const r = await p.evaluate(h => {
        const s = UI.state.game; let out = null, guard = 0;
        do {
          s.events.forEach(e => { e.resolved = true; }); LEAGUE.clearResolved(s); out = LEAGUE.advance(s, h);
          if (out && out.stopped === 'userPick') {   // the user's draft pick: the best prospect left
            const pool = Object.values(s.players).filter(q => q.team === 'DRAFT' && +q.draftYear === s.year).sort((a, b) => (a.undrafted - b.undrafted) || (b.ovr - a.ovr));
            if (pool.length) DRAFT.pick(s, s.userTeam, pool[0].id);
            out = { stopped: 'event' };
          }
        } while (out && out.stopped === 'event' && ++guard < 120);
        return { phase: s.phase, sp: s.season && s.season.phase, year: s.year, stopped: out && out.stopped };
      }, how);
      return r;
    };
    let r = null;
    for (let i = 0; i < 40; i++) { r = await step('endPlayoffs', 'sim'); if (r.stopped === 'seasonOver') break; }
    say(r && r.stopped === 'seasonOver', 'association: season simmed to the end');
    await visitAll('season over');
    for (let i = 0; i < 40; i++) { r = await step('nextPhase', 'offseason'); if (r.phase === 'regular' || r.phase === 'preseason') break; }
    say(r && (r.phase === 'regular' || r.phase === 'preseason'), 'association: offseason played through to the next season');
    await visitAll('next season');
    errCheck('association: no page errors', e0);
  } catch (e) { say(false, 'crashed: ' + e.message); }
  await b.close();
  console.log(bad ? 'FAILED: ' + bad : 'all ok');
  process.exit(bad ? 1 : 0);
})();
