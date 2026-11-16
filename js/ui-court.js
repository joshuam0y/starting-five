// Court view: a top-down court that plays a game's play-by-play with the ten players as dots and the ball.
// The events, scorers, lineups and score come straight from the engine's structured play-by-play
// (res.pbx and res.pbl, see packPbx in js/engine.js); only where the players stand is made up.
// Used by the live game page (js/ui-live.js) and the replay page (#/watch/<gameId>, from a box score).
// The pure part (COURT.timeline, COURT.linesAt) also runs under Node for tools/test-court.js.
(function (root) {
  'use strict';
  const ENG = () => root.ENGINE || null;

  // =====================================================================
  // Timeline: one event per pbp line, with the score and the ten on the floor
  // =====================================================================
  const KINDS = ['note', 'tip', 'end', 'final', 'make', 'miss', 'sfoul', 'ft', 'oreb', 'dreb', 'tov', 'pf', 'foulout', 'inj', 'sub', 'extra'];
  const EXTRAS = ['', 'timeout', 'tech', 'eject'];
  const SHOTS = ['close', 'post', 'mid', 'three'];
  const TOVS = ['plain', 'steal', 'foul'];
  const LINE = /^(Q\d|OT\d+) (\d+):(\d\d) (?:([A-Z][A-Z0-9]{1,3}) )?(.*?)(?: \((\d+)-(\d+)\))?$/;
  const SIDES = ['home', 'away'];
  const other = s => (s === 'home' ? 'away' : 'home');
  const keyOf = (side, i) => (side === 'home' ? 'h' : 'a') + i;
  const sideOf = key => (key[0] === 'h' ? 'home' : 'away');
  const idxOf = key => +key.slice(1);
  function bitsOf(mask) {
    const out = [];
    for (let i = 0; mask > 0; i++) { if (mask % 2) out.push(i); mask = Math.floor(mask / 2); }
    return out;
  }
  function periodIndex(p) { return p[0] === 'Q' ? Number(p.slice(1)) - 1 : 3 + Number(p.slice(2)); }
  function periodStart(p) { const i = periodIndex(p); return i < 4 ? i * 720 : 2880 + (i - 4) * 300; }
  function periodLength(p) { return periodIndex(p) < 4 ? 720 : 300; }

  // A stored or fresh game result has what the court needs.
  function available(game) {
    const E = ENG();
    return !!(game && Array.isArray(game.pbp) && Array.isArray(game.pbx) && game.pbx.length === game.pbp.length &&
      Array.isArray(game.pbl) && game.pbl.length && game.home && game.away && E && typeof E.unpackPbx === 'function');
  }

  // Returns { home, away, events } or null. Each event:
  // { i, k (KINDS), side ('home'/'away', the team the line is about; for a tip the team that wins it), team, per, clock,
  //   t (seconds played), body, text, a, b, c (player keys 'h3' / 'a0', see packPbx for who is who), shot, made, att, tov,
  //   pts (scored on this line), hs, as (score after it), ts (score printed on the line, if any), on: { home, away } keys,
  //   stats: [[key, 'pts' | 'reb' | 'ast', n]] }
  function timeline(game) {
    if (!available(game)) return null;
    const E = ENG();
    const pbl = game.pbl;
    const events = [];
    let hs = 0, as = 0, li = 0, on = null, per = 'Q1', clock = '12:00', t = 0;
    const lineup = row => ({ home: bitsOf(row[1]).map(i => keyOf('home', i)), away: bitsOf(row[2]).map(i => keyOf('away', i)) });
    game.pbp.forEach((line, i) => {
      while (li + 1 < pbl.length && pbl[li + 1][0] <= i) { li++; on = null; }
      if (!on) on = lineup(pbl[li]);
      const m = LINE.exec(String(line));
      if (m) {
        per = m[1]; clock = m[2] + ':' + m[3];
        t = periodStart(per) + periodLength(per) - (+m[2] * 60 + +m[3]);
      }
      const u = E.unpackPbx(game.pbx[i]);
      const k = KINDS[u.k] || 'note';
      const side = SIDES[u.side];
      const mine = j => (j >= 0 ? keyOf(side, j) : null);
      const theirs = j => (j >= 0 ? keyOf(other(side), j) : null);
      const ev = { i, k, side: null, team: m && m[4] ? m[4] : null, per, clock, t, body: m ? m[5] : String(line), text: String(line),
        a: null, b: null, c: null, pts: 0, hs: 0, as: 0, ts: m && m[6] != null ? { as: +m[6], hs: +m[7] } : null, on, stats: [] };
      if (k !== 'note' && k !== 'end' && k !== 'final') { ev.side = side; ev.a = mine(u.a); }
      if (k === 'make') {
        ev.b = mine(u.b); ev.c = theirs(u.c); ev.shot = SHOTS[u.x] || 'close';
        ev.pts = ev.shot === 'three' ? 3 : 2;
        if (ev.a) ev.stats.push([ev.a, 'pts', ev.pts]);
        if (ev.b) ev.stats.push([ev.b, 'ast', 1]);
      } else if (k === 'miss' || k === 'sfoul') {
        ev.b = theirs(u.b); ev.shot = SHOTS[u.x] || 'close';
      } else if (k === 'ft') {
        ev.made = Math.floor(u.x / 4); ev.att = u.x % 4; ev.pts = ev.made;
        if (ev.a && ev.made) ev.stats.push([ev.a, 'pts', ev.made]);
      } else if (k === 'oreb' || k === 'dreb') {
        if (ev.a) ev.stats.push([ev.a, 'reb', 1]);
      } else if (k === 'tov') {
        ev.b = theirs(u.b); ev.tov = TOVS[u.x] || 'plain';
      } else if (k === 'pf') {
        ev.flag = u.x || 0;   // 1 or 2: a flagrant
      } else if (k === 'extra') {
        ev.ex = EXTRAS[u.x] || 'note';
      }
      if (ev.pts) { if (side === 'home') hs += ev.pts; else as += ev.pts; }
      ev.hs = hs; ev.as = as;
      events.push(ev);
    });
    return { home: game.home.abbr, away: game.away.abbr, events };
  }

  // Points, rebounds and assists of every player after the first n events: { key: { pts, reb, ast } }.
  function linesAt(tl, n) {
    const out = {};
    const evs = (tl && tl.events) || [];
    for (let i = 0; i < Math.min(n, evs.length); i++) {
      evs[i].stats.forEach(([key, st, v]) => {
        const row = out[key] || (out[key] = { pts: 0, reb: 0, ast: 0 });
        row[st] += v;
      });
    }
    return out;
  }

  const COURT = { KINDS, timeline, linesAt, available, keyOf, sideOf, idxOf, bitsOf };
  root.COURT = COURT;
  if (typeof module !== 'undefined' && module.exports) module.exports = COURT;

  // =====================================================================
  // The view (browser only)
  // =====================================================================
  const UI = root.UI;
  if (!UI || typeof document === 'undefined') return;
  const esc = UI.esc;

  // Court coordinates are feet: x along the length (0 to 94), y across (0 to 50). Home attacks the
  // right basket in the first half and the left one after halftime.
  const CW = 94, CH = 50, M = 3, HOOP = 5.25, RIM = 10;
  const V_WIN = 66;            // phones show the court upright, this many feet at a time; the camera follows the ball
  const NARROW = 560;          // container width below which the court stands upright
  const R_DOT = 2.1, R_HIT = 3.6;
  const HAND = [1.8, 1.1];     // where a player holds the ball, from the middle of his dot
  const POSR = { PG: 0, G: 0.5, SG: 1, GF: 1.5, SF: 2, F: 2.5, PF: 3, FC: 3.5, C: 4 };
  const OFF_SPOTS = [[27, 25], [21, 42], [21, 8], [15, 34], [7, 18]];   // [feet from the attacked baseline, y] by position
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const ease = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const lastName = n => { const parts = String(n || '').trim().split(/\s+/); return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''; };
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  let uid = 0;

  function lum(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 0.2;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  // Home wears white with the team color, away wears the team color (bright enough to see on the dark floor).
  function kits(home, away, teamOf) {
    const cols = abbr => { const t = (teamOf || UI.team)(abbr) || {}; return (t.colors && t.colors.length ? t.colors : ['#555', '#999']).concat(['#555', '#999']); };
    const hc = cols(home), ac = cols(away);
    const ink = [hc[0], hc[1]].find(c => lum(c) < 0.4) || '#1a1a1a';
    const fill = [ac[0], ac[1]].find(c => lum(c) > 0.05 && lum(c) < 0.7) || '#6d6d75';
    return {
      home: { fill: '#f4f1e8', ring: ink, text: ink, paint: hc[0] },
      away: { fill, ring: '#ffffff', text: lum(fill) > 0.45 ? '#111111' : '#ffffff' }
    };
  }

  // Lines of the floor, drawn in court coordinates.
  // The floor of its season (year = the season-ending year; none means today's): no three-point line before 1979-80 and
  // a 22-foot one all the way around from 1994-95 to 1996-97; a 6-foot lane before 1951-52 and a 12-foot one until 1964-65;
  // the restricted-area arc from 1997-98.
  function floorSvg(id, paint, paint2, abHome, abAway, year) {
    const Y = +year || 9999, lw = Y < 1952 ? 6 : Y < 1965 ? 12 : 16, ly = 25 - lw / 2;
    const three = Y < 1980 ? '' : Y >= 1995 && Y <= 1997 ? '<path class="ct-ln" d="M0 3 H5.25 A22 22 0 0 1 5.25 47 H0"/>' : '<path class="ct-ln" d="M0 3 H14.2 A23.75 23.75 0 0 1 14.2 47 H0"/>';
    const half = (col, ab, flip) => `
      <rect class="ct-paint" x="0" y="${ly}" width="19" height="${lw}" fill="${esc(col)}"/>
      <text class="ct-end" x="0" y="0" transform="${flip ? 'translate(-1.5 25) scale(-1 1) rotate(-90)' : 'translate(-1.5 25) rotate(-90)'}">${esc(ab || '')}</text>
      <rect class="ct-ln" x="0" y="${ly}" width="19" height="${lw}"/>
      <path class="ct-ln" d="M19 19 A6 6 0 0 1 19 31"/>
      <path class="ct-ln ct-dash" d="M19 19 A6 6 0 0 0 19 31"/>
      ${Y >= 1998 ? '<path class="ct-ln" d="M5.25 21 A4 4 0 0 1 5.25 29"/>' : ''}
      ${three}
      ${[7, 11, 14].map(x => `<path class="ct-ln" d="M${x} ${ly} V${ly - 0.7} M${x} ${ly + lw} V${ly + lw + 0.7}"/>`).join('')}
      <path class="ct-board" d="M4 22 V28"/>
      <circle class="ct-rim" cx="5.25" cy="25" r="0.75"/>`;
    return `
      <defs><pattern id="ctWood${id}" width="94" height="2.5" patternUnits="userSpaceOnUse">
        <rect width="94" height="2.5" class="ct-plank"/><rect width="94" height="2.5" class="ct-plank2" y="0" opacity=".5"/><path d="M0 2.45 H94" class="ct-seam"/></pattern>
        <radialGradient id="ctGloss${id}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
      <rect x="${-M}" y="${-M}" width="${CW + 2 * M}" height="${CH + 2 * M}" class="ct-apron"/>
      <rect x="0" y="0" width="${CW}" height="${CH}" fill="url(#ctWood${id})"/>
      <rect x="0" y="0" width="${CW}" height="${CH}" class="ct-ln ct-edge"/>
      <path class="ct-ln" d="M47 0 V50"/>
      <circle class="ct-ln" cx="47" cy="25" r="6"/><circle class="ct-ln" cx="47" cy="25" r="2"/>
      <circle class="ct-mid-fill" cx="47" cy="25" r="6" fill="${esc(paint)}"/>
      ${half(paint, abHome)}
      <g transform="translate(94 0) scale(-1 1)">${half(paint2, abAway, true)}</g>
      <rect x="0" y="0" width="${CW}" height="${CH}" fill="url(#ctGloss${id})" pointer-events="none"/>`;
  }

  // ---------- mount ----------
  // opts: { game (result with pbp, pbx, pbl), start (event index to start from), autoplay, onStep(i), onEnd(),
  //   team(abbr), player(id), logo(abbr, size): lookups for games outside the save (the Draft Challenge) }
  COURT.mount = function (el, opts) {
    opts = opts || {};
    const logoOf = opts.logo || UI.logo, playerOf = opts.player || UI.player;
    const tl = timeline(opts.game);
    if (!tl) { el.innerHTML = '<p class="muted">The court view needs the play-by-play of this game, which is not kept.</p>'; return null; }
    const game = opts.game;
    const evs = tl.events;
    const id = ++uid;
    const kit = kits(tl.home, tl.away, opts.team);
    const abbr = { home: tl.home, away: tl.away };
    const YEAR = +(opts.year || (opts.game && opts.game.year)) || 9999;
    // where the five stand in a half-court set, by era: the wings out past the arc once there is one, and from
    // 1994-95 a stretch four in the far corner
    const SPOTS = YEAR >= 1995 ? [[28.5, 25], [24, 44], [24, 6], [5, 47.5], [7.5, 18]]
      : YEAR >= 1980 ? [[28, 25], [23.5, 43], [23.5, 7], [15, 34], [7, 18]] : OFF_SPOTS;
    const LANE_W = YEAR < 1952 ? 6 : YEAR < 1965 ? 12 : 16;
    const info = {};
    SIDES.forEach(side => (game[side].box || []).forEach((r, i) => {
      const p = playerOf ? playerOf(r.id) : null;
      const name = r.name || (p && p.name) || r.id;
      const pos = String((p && p.pos) || 'SF').toUpperCase().split(/[-\/ ,]/)[0];
      const sn = p && p.season ? Number(p.season) : 0;
      // his jersey number: the one he wears in this league, else the real one he wore that season (js/jersey.js)
      const J = window.JERSEY, gy = +(opts.year || (opts.game && opts.game.year)) || 0;
      const num = p && p.jersey != null ? String(p.jersey) : J ? J.real(p || { id: r.id }, sn || gy || 9999, game[side] && game[side].abbr) : null;
      info[keyOf(side, i)] = { id: r.id, name, pos, num: num != null ? String(num) : '', ht: p && p.ht ? +p.ht : 0, ini: initials(name), last: lastName(name), side, yr: sn ? "'" + String(sn - 1).slice(2) + "-'" + String(sn).slice(2) : '' };
    }));
    // two teammates from different seasons can share a real number: the second shows his initials
    SIDES.forEach(side => { const seen = {}; Object.keys(info).filter(k => info[k].side === side).forEach(k => { const n = info[k].num; if (n && seen[n]) info[k].num = ''; else if (n) seen[n] = 1; }); });
    const start = clamp(opts.start | 0, 0, evs.length);
    const st = {
      cur: start, done: start, ev: null, beats: [], beat: null, bt: 0, evDur: 0, evT: 0, tPrev: start ? evs[start - 1].t : 0,
      on: { home: [], away: [] }, pos: {}, alpha: {}, ball: { x: 47, y: 25, z: 0 }, holder: null, ph: null,
      off: null, set: false, form: null, hs: 0, as: 0, per: 'Q1', clock: '12:00', shownT: 0,
      playing: opts.autoplay !== false, speed: 1, tab: 'box', pnl: null, holdAt: null, ended: false, tags: [], sel: null, mode: null, camY: 0, raf: 0, last: 0, dead: false,
      simT: 0, act: {}, rec: [], tgt: {}, vel: {}, top: {}, replay: null, hl: null, lastReplay: -1e9, crowd: 0, zoom: null, possT: 0, possLen: 24, tf: { home: 0, away: 0, per: '' }
    };
    if (start > 0) { const p = evs[start - 1]; st.hs = p.hs; st.as = p.as; st.per = p.per; st.shownT = p.t; }

    el.innerHTML = `
      <div class="ct-wrap">
        <div class="ct-strip">
          <div class="ct-tm">${logoOf(tl.away, 26)}<b>${esc(tl.away)}</b><i class="ct-bonus" data-s="away" hidden>BONUS</i><span class="ct-pts" data-s="away">0</span></div>
          <div class="ct-clk"><b class="ct-per">Q1</b><span class="ct-time">12:00</span><span class="ct-sc" hidden></span></div>
          <div class="ct-tm ct-tm-h"><span class="ct-pts" data-s="home">0</span><i class="ct-bonus" data-s="home" hidden>BONUS</i><b>${esc(tl.home)}</b>${logoOf(tl.home, 26)}</div>
        </div>
        <div class="ct-stage">
          <svg class="ct-svg" role="img" aria-label="Court view of the game" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="ct-banner" hidden></div>
          <div class="ct-sub" hidden></div>
        </div>
        <div class="ct-card"></div>
        <div class="ct-line"><span class="ct-lt"></span><span class="ct-lx">Tip-off coming up</span></div>
        <div class="ct-ctrl">
          <button type="button" class="btn btn-small ct-play" aria-label="Pause">PAUSE</button>
          ${[1, 2, 4].map(s => `<button type="button" class="btn btn-small ct-spd${s === 1 ? ' on' : ''}" data-speed="${s}">${s}X</button>`).join('')}
          <button type="button" class="btn btn-small ct-skip" aria-label="Skip to the end of the quarter">SKIP QTR</button>
          <button type="button" class="btn btn-small ct-pb" aria-label="Box score and plays">BOX / PLAYS</button>
          <button type="button" class="btn btn-small ct-fs" aria-label="Full screen">FULL SCREEN</button>
          <button type="button" class="btn btn-small ct-cam" hidden aria-label="Camera">TV CAM</button>
          ${window.SFX ? `<button type="button" class="btn btn-small ct-sfx${window.SFX.on ? ' on' : ''}" aria-label="Sound effects">${window.SFX.on ? 'SOUND ON' : 'SOUND OFF'}</button>` : ''}
        </div>
        <div class="ct-floor-list" aria-label="On the floor"></div>
        <div class="ct-pnl" hidden><div class="ct-ptabs"><button type="button" class="ct-ptab on" data-tab="box">BOX SCORE</button><button type="button" class="ct-ptab" data-tab="feed">PLAYS</button><span class="ct-pscore"></span><button type="button" class="ct-pclose" aria-label="Close the box score">CLOSE &#10005;</button></div><div class="ct-pbody"></div></div>
      </div>`;
    const $ = sel => el.querySelector(sel);
    // full screen watch mode: the score, the court, the play, the controls and the five-a-side chips on one screen, no scrolling
    const FSKEY = 'a13-ct-full';
    let full = opts.full != null ? !!opts.full : (() => { try { return localStorage.getItem(FSKEY) !== '0'; } catch (e) { return true; } })();
    const narrow = () => (full ? window.innerWidth < NARROW || window.innerHeight > window.innerWidth * 1.15 : !!(el.clientWidth && el.clientWidth < NARROW));
    const wrapEl = $('.ct-wrap');
    const applyFull = () => {
      wrapEl.classList.toggle('ct-full', full);
      document.body.classList.toggle('ct-full-on', full);
      const fb = $('.ct-fs'); if (fb) fb.textContent = full ? 'EXIT FULL SCREEN' : 'FULL SCREEN';
      fitH();
      pnlShow(!full);   // the box score sits under the court on the page, and opens over it in full screen when asked for
    };
    // the height you can really see (phone browsers with a toolbar: 100vh is taller than the screen, the bottom would be cut off)
    const fitH = () => { const h = full ? Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight) : 0; wrapEl.style.height = h ? h + 'px' : ''; };
    window.addEventListener('resize', fitH);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitH);
    const svg = $('.ct-svg');
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k]));
      if (parent) parent.appendChild(n);
      return n;
    };
    let dots = {}, ballEl = null, shadowEl = null, tagLayer = null;

    // ---------- drawing ----------
    function toScreen(x, y) { return st.mode === 'v' ? [CH - y + M, x + M] : [x + M, y + M]; }
    function build() {
      st.mode = narrow() ? 'v' : 'h';
      const v = st.mode === 'v';
      svg.setAttribute('viewBox', v ? `0 ${st.camY} ${CH + 2 * M} ${V_WIN}` : `0 0 ${CW + 2 * M} ${CH + 2 * M}`);
      svg.classList.toggle('ct-v', v);
      svg.classList.toggle('ct-names', !v && el.clientWidth >= 760);
      svg.innerHTML = '';
      const floor = mk('g', { transform: v ? `translate(${CH + M} ${M}) rotate(90)` : `translate(${M} ${M})` }, svg);
      floor.innerHTML = floorSvg(id, kit.home.paint, kit.away.fill, abbr.home, abbr.away, opts.year || (opts.game && opts.game.year));
      const mid = toScreen(47, 25);
      mk('text', { class: 'ct-mid', x: mid[0], y: mid[1] }, svg).textContent = tl.home;
      const dl = mk('g', { class: 'ct-dots' }, svg);
      shadowEl = mk('ellipse', { class: 'ct-shadow', rx: 0.8, ry: 0.5 }, dl);
      dots = {};
      Object.keys(info).forEach(key => {
        const k = kit[info[key].side];
        const g = mk('g', { class: 'ct-dot', 'data-key': key, opacity: 0 }, dl);
        mk('circle', { class: 'ct-hit', r: R_HIT }, g);
        // a player from above: shoulders in the team's jersey, the head on the side he faces (turned toward the ball each
        // frame), and his initials on his back
        const fig = mk('g', { class: 'ct-fig' }, g);
        mk('ellipse', { class: 'ct-body', cx: -0.1, cy: 0, rx: 1.0, ry: R_DOT, fill: k.fill, stroke: k.ring }, fig);
        mk('circle', { class: 'ct-arm', cx: 1.0, cy: -1.35, r: 0.42, fill: k.ring }, fig);
        mk('circle', { class: 'ct-arm', cx: 1.0, cy: 1.35, r: 0.42, fill: k.ring }, fig);
        mk('circle', { class: 'ct-head', cx: 0, cy: 0, r: 1.12, fill: '#1c1c1e', stroke: k.ring }, g);
        const t = mk('text', { class: 'ct-ini', fill: '#ffffff', x: 0, y: 0.05 }, g);
        t.textContent = info[key].num || info[key].ini;
        const n = mk('text', { class: 'ct-nm', y: R_DOT + 1.6 }, g);
        n.textContent = info[key].last.toUpperCase();
        g.addEventListener('click', () => select(key));
        dots[key] = g;
      });
      ballEl = mk('circle', { class: 'ct-ball', r: 0.85 }, dl);
      tagLayer = mk('g', { class: 'ct-tags' }, svg);
      st.camSnap = true;
      render(0);
    }

    // Where each dot is drawn: its spot, a little life (players shift their weight and the ball handler sways while he
    // dribbles, so nobody stands frozen between plays), then pushed apart so two players never sit on top of each other.
    const seedOf = key => { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0; return (h % 1000) / 159; };
    function displayPos() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()), moving = st.beat && st.beat.move ? st.beat.move : {};
      const out = {}, keys = Object.keys(dots).filter(k => (st.alpha[k] || 0) > 0.01);
      keys.forEach(k => {
        const p = st.pos[k] || [47, 25], h = seedOf(k), still = !moving[k];
        const sp0 = st.vel[k] ? Math.hypot(st.vel[k][0], st.vel[k][1]) : 0, amp = sp0 > 3 ? 0.04 : still ? (st.holder === k ? 0.35 : 0.2) : 0.08, sp = st.holder === k ? 0.0042 : 0.0014;
        out[k] = [p[0] + Math.sin(now * sp + h) * amp, p[1] + Math.cos(now * sp * 0.8 + h * 1.7) * amp];
      });
      // man-to-man: in a half-court possession each defender stays between his man and the basket, sliding as his man
      // moves (eased, so it looks like footwork), unless the play itself is moving him (a closeout, a steal, a block)
      // (not on free throws: the ball is dead and everyone holds his spot on the lane)
      if (st.off && st.on && st.on[st.off] && st.on[other(st.off)] && st.pos && !(st.ev && st.ev.k === 'ft')) {
        const O = st.off, h = hoop(O, st.per), os = ordered(st.on[O]), ds = ordered(st.on[other(O)]);
        const bh = st.holder && sideOf(st.holder) === O ? out[st.holder] : null, ball = bh || lastBall;
        ds.forEach((dk, i) => {
          const mk2 = os[i] || os[0], man = out[mk2], me = out[dk];
          if (!man || !me || moving[dk]) return;
          const [tx, ty] = guardSpot(man, h, ball, !!bh && mk2 === st.holder);
          // a target, not a position: he runs back in transition, then slides in his stance
          st.tgt[dk] = [tx, clamp(ty, 0.5, 49.5)];
          const far = Math.hypot(tx - st.pos[dk][0], ty - st.pos[dk][1]);
          st.top[dk] = far > 14 ? 23 : far > 6 ? 18 : 13;
        });
      }
      const min = R_DOT * 1.9;
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
          const a = out[keys[i]], b = out[keys[j]], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.01;
          if (d >= min) continue;
          const push = (min - d) / 2, ux = dx / d, uy = dy / d;
          a[0] -= ux * push; a[1] -= uy * push; b[0] += ux * push; b[1] += uy * push;
        }
      }
      return out;
    }
    let lastBall = null;
    // what the 3D view needs for one frame (also what a replay plays back)
    function snapshot(DP) {
      const bp = lastBall || [47, 25], players = [];
      Object.keys(info).forEach(key => {
        const a = st.alpha[key] || 0;
        if (a <= 0.01) return;
        const p = DP[key] || st.pos[key] || [47, 25], hold = st.holder === key;
        const tgt = hold ? hoop(sideOf(key), st.per) : bp;
        const A = st.act[key], f = A ? (st.simT - A.t0) / A.d : 2;
        const vv = st.vel[key] || [0, 0];
        players.push({ key, vx: vv[0], vy: vv[1], x: p[0], y: p[1], a, ang: Math.atan2(tgt[1] - p[1], tgt[0] - p[0]), act: f >= 0 && f < 1 ? { k: A.k, f } : null, hold, sel: st.sel === key, def: !!st.off && sideOf(key) !== st.off });
      });
      const tags = [], rings = [];
      st.tags.forEach(tg => { const f = tg.age / tg.ttl; if (tg.ring) rings.push({ x: tg.at[0], y: tg.at[1], f }); else tags.push({ key: tg.key, x: tg.at ? tg.at[0] : 0, y: tg.at ? tg.at[1] : 0, text: tg.text, cls: tg.cls, f }); });
      return {
        t: st.simT, cam: camPref, players, tags, rings, names: true, crowd: st.crowd,
        ball: { x: st.ball.x, y: st.ball.y, h: st.ball.h, held: st.holder, flight: !!st.flight,
          hand: st.flight && st.beat && st.beat.ball && st.beat.ball.hand ? st.beat.ball.to : null, from: st.flight && st.beat && st.beat.ball ? st.beat.ball.from || null : null, p: st.beat && st.beat.dur ? Math.min(1, st.bt / st.beat.dur) : 1 },
        dir: st.off ? (attacksRight(st.off, st.per) ? 1 : -1) : 0,
        zoom: st.zoom && st.simT < st.zoom.until ? st.zoom : null, replay: null
      };
    }
    function render(dt) {
      st.lastDt = dt;
      if (r3) {
        lastBall = ballPos();
        const DP = displayPos(); lastDP = DP;
        st.tags = st.tags.filter(tg => (tg.age += dt) < tg.ttl);
        const S = snapshot(DP);
        if (st.playing && !st.ended) { st.rec.push(S); while (st.rec.length && st.rec[0].t < st.simT - 4500) st.rec.shift(); }
        try { r3.frame(S, dt); } catch (e) { console.warn('[court] 3D frame failed, back to 2D', e); stop3d(true); }
        drawClock();
        return;
      }
      st.ang = st.ang || {};
      lastBall = ballPos();
      const DP = displayPos(); lastDP = DP;
      Object.keys(dots).forEach(key => {
        const a = st.alpha[key] || 0;
        const g = dots[key];
        if (a <= 0.01) { if (g.getAttribute('opacity') !== '0') { g.setAttribute('opacity', 0); g.classList.add('gone'); } return; }
        const p = DP[key] || st.pos[key] || [47, 25];
        const s = toScreen(p[0], p[1]);
        g.setAttribute('transform', `translate(${s[0].toFixed(2)} ${s[1].toFixed(2)})`);
        // face the ball (smoothly, so turns look like turns)
        const fg = g.firstChild && g.firstChild.nextSibling;
        if (fg) {
          const bp = lastBall || [47, 25], sb = toScreen(bp[0], bp[1]);
          let want = Math.atan2(sb[1] - s[1], sb[0] - s[0]) * 180 / Math.PI;
          if (st.holder === key) want = Math.atan2(sb[1] - s[1], sb[0] - s[0]) * 180 / Math.PI;
          const cur = st.ang[key] == null ? want : st.ang[key];
          let d = ((want - cur + 540) % 360) - 180;
          const nxt = cur + d * Math.min(1, (dt || 16) / 140);
          st.ang[key] = nxt;
          fg.setAttribute('transform', `rotate(${nxt.toFixed(1)})`);
        }
        g.setAttribute('opacity', a.toFixed(2));
        g.classList.toggle('sel', st.sel === key);
        g.classList.toggle('gone', a < 0.5);
        g.classList.toggle('ball', st.holder === key);
      });
      const b = ballPos();
      const g0 = toScreen(b[0], b[1]);
      shadowEl.setAttribute('cx', g0[0].toFixed(2)); shadowEl.setAttribute('cy', g0[1].toFixed(2));
      shadowEl.setAttribute('opacity', (0.45 - Math.min(0.3, st.ball.z * 0.03)).toFixed(2));
      ballEl.setAttribute('cx', g0[0].toFixed(2)); ballEl.setAttribute('cy', (g0[1] - st.ball.z * 0.55).toFixed(2));
      ballEl.setAttribute('r', (0.85 + st.ball.z * 0.06).toFixed(2));
      // floating tags
      st.tags = st.tags.filter(tg => (tg.age += dt) < tg.ttl);
      tagLayer.innerHTML = '';
      st.tags.forEach(tg => {
        const p = tg.key ? (DP[tg.key] || st.pos[tg.key] || [47, 25]) : tg.at;
        const s = toScreen(p[0], p[1]);
        const f = tg.age / tg.ttl;
        if (tg.ring) {
          mk('circle', { class: 'ct-ringfx', cx: s[0], cy: s[1], r: (1 + f * 4).toFixed(2), opacity: (1 - f).toFixed(2) }, tagLayer);
          return;
        }
        const lift = tg.cls === 'kind' ? R_DOT + 3.6 : tg.cls === 'play' ? R_DOT + 5.4 : R_DOT + 1.4 + f * 2.5;
        const t = mk('text', { class: 'ct-tag ' + (tg.cls || ''), x: s[0].toFixed(2), y: (s[1] - lift).toFixed(2), opacity: (f < 0.75 ? 1 : (1 - f) * 4).toFixed(2) }, tagLayer);
        t.textContent = tg.text;
      });
      if (st.mode === 'v') {
        const target = clamp(toScreen(b[0], b[1])[1] - V_WIN / 2, 0, CW + 2 * M - V_WIN);
        st.camY = st.camSnap ? target : st.camY + (target - st.camY) * Math.min(1, dt / 420);
        st.camSnap = false;
        svg.setAttribute('viewBox', `0 ${st.camY.toFixed(2)} ${CH + 2 * M} ${V_WIN}`);
      }
      drawClock();
    }

    let lastDP = {};
    function ballPos() {
      if (st.holder && !st.flight) {
        const p = lastDP[st.holder] || st.pos[st.holder] || [47, 25];
        const right = attacksRight(sideOf(st.holder), st.per);
        st.ball.x = p[0] + (right ? HAND[0] : -HAND[0]); st.ball.y = p[1] + HAND[1]; st.ball.z = 0;
      }
      return [st.ball.x, st.ball.y];
    }

    function drawClock() {
      const ev = st.ev;
      let t = st.shownT;
      if (ev && st.done <= ev.i && st.evDur > 0) t = st.tPrev + (ev.t - st.tPrev) * clamp(st.evT / st.evDur, 0, 1);
      const per = ev && st.done <= ev.i ? ev.per : st.per;
      const left = Math.max(0, periodStart(per) + periodLength(per) - t);
      const sec = Math.ceil(left - 1e-6);
      $('.ct-per').textContent = st.ended ? 'FINAL' : per;
      $('.ct-time').textContent = st.ended ? '' : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      // the shot clock (from 1954-55): from the start of the possession; off when the game clock has less on it
      const sc = $('.ct-sc');
      if (sc) {
        const v = Math.max(1, Math.ceil(st.possLen - (t - st.possT) - 1e-6)), show = !st.ended && YEAR >= 1955 && v < left && st.possT <= t;
        sc.hidden = !show;
        if (show) { sc.textContent = Math.min(st.possLen, v); sc.classList.toggle('low', v <= 5); }
      }
    }
    function drawScore() {
      const a = $('.ct-pts[data-s="away"]'), h = $('.ct-pts[data-s="home"]');
      a.textContent = st.as; h.textContent = st.hs;
      a.classList.toggle('lead', st.as > st.hs); h.classList.toggle('lead', st.hs > st.as);
    }
    function drawLine(ev) {
      if (!ev) return;
      $('.ct-lt').innerHTML = `<span class="ct-lc">${esc(ev.per)} ${esc(ev.clock)}</span>${ev.team ? logoOf(ev.team, 20) : ''}`;
      $('.ct-lx').textContent = ev.body || ev.text;
      $('.ct-line').classList.toggle('made', ev.pts > 0);
    }
    // who came in for whom at event j (the lineup before it against the lineup it plays with)
    function subText(j) {
      const prev = j > 0 ? evs[j - 1] : null, cur = evs[j];
      if (!prev || !cur) return '';
      const parts = [];
      SIDES.forEach(side => {
        const ins = cur.on[side].filter(k => prev.on[side].indexOf(k) < 0), outs = prev.on[side].filter(k => cur.on[side].indexOf(k) < 0);
        if (ins.length) parts.push(abbr[side] + ': ' + ins.map(k => info[k].last).join(', ') + ' in for ' + outs.map(k => info[k].last).join(', '));
      });
      return parts.join('   |   ');
    }
    function announceSub(j) {
      const t = subText(j), b = $('.ct-sub');
      if (!t || !b) return;
      b.textContent = 'SUBSTITUTION  ' + t; b.hidden = false;
      clearTimeout(st.subT);
      st.subT = setTimeout(() => { b.hidden = true; }, 5000);
    }
    // the live box score and the play feed, as far as the game has got
    function pnlDraw() {
      const box = $('.ct-pnl'), body = $('.ct-pbody');
      if (!box || box.hidden || !body) return;
      const ps = $('.ct-pscore'); if (ps) ps.textContent = abbr.away + ' ' + st.as + ' - ' + st.hs + ' ' + abbr.home + '   ' + st.per;
      if (st.tab === 'feed') {
        const out = [];
        for (let j = st.done - 1; j >= 0 && out.length < 40; j--) {
          out.push(`<li><small>${esc(evs[j].per)} ${esc(evs[j].clock)}</small>${esc(evs[j].body || evs[j].text)}</li>`);
          const sb = subText(j);
          if (sb) out.push(`<li class="sub"><small>SUB</small>${esc(sb)}</li>`);
        }
        body.innerHTML = out.length ? '<ol class="ct-feed">' + out.join('') + '</ol>' : '<p class="muted">Tip-off coming up.</p>';
        return;
      }
      const L = boxAt(st.done), f1 = v => (Math.round(v * 10) / 10).toFixed(0);
      body.innerHTML = SIDES.slice().reverse().map(side => {
        const keys = Object.keys(info).filter(k => info[k].side === side);
        const T = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
        const rows = keys.map(k => {
          const l = L[k] || {}, on = st.on[side].indexOf(k) >= 0, g = n => l[n] || 0;
          Object.keys(T).forEach(n => { T[n] += g(n); });
          return `<tr class="${on ? 'on' : ''}"><td class="l">${on ? '<i></i>' : ''}${esc(info[k].name)}${info[k].yr ? ' <small>' + esc(info[k].yr) + '</small>' : ''}</td><td>${f1(g('min'))}</td>${game.pbe ? '<td>' + enBar(k) + '</td>' : ''}<td>${g('pts')}</td><td>${g('reb')}</td><td>${g('ast')}</td><td>${g('stl')}</td><td>${g('blk')}</td><td>${g('tov')}</td><td>${g('pf')}</td><td>${g('fgm')}-${g('fga')}</td><td>${g('tpm')}-${g('tpa')}</td><td>${g('ftm')}-${g('fta')}</td><td>${g('pm') > 0 ? '+' : ''}${g('pm')}</td></tr>`;
        }).join('');
        const tot = `<tr class="tot"><td class="l">TEAM</td><td></td>${game.pbe ? '<td></td>' : ''}<td>${T.pts}</td><td>${T.reb}</td><td>${T.ast}</td><td>${T.stl}</td><td>${T.blk}</td><td>${T.tov}</td><td>${T.pf}</td><td>${T.fgm}-${T.fga}</td><td>${T.tpm}-${T.tpa}</td><td>${T.ftm}-${T.fta}</td><td></td></tr>`;
        return `<div class="ct-bxw"><table class="ct-bx"><thead><tr><th class="l">${esc(abbr[side])} ${side === 'home' ? st.hs : st.as}</th><th>MIN</th>${game.pbe ? '<th>ENERGY</th>' : ''}<th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></tr></thead><tbody>${rows}${tot}</tbody></table></div>`;
      }).join('');
    }
    // a full box line for everyone as of the first n plays: minutes and plus-minus from who was on the floor, the rest from who did what
    function boxAt(n) {
      const out = {};
      const row = k => out[k] || (out[k] = { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pm: 0 });
      let prevT = 0;
      for (let i = 0; i < Math.min(n, evs.length); i++) {
        const ev = evs[i], dt = Math.max(0, ev.t - prevT);
        prevT = ev.t;
        if (dt) SIDES.forEach(sd => ev.on[sd].forEach(k => { row(k).min += dt / 60; }));
        const three = ev.shot === 'three';
        if (ev.k === 'make' && ev.a) { const r = row(ev.a); r.fgm++; r.fga++; if (three) { r.tpm++; r.tpa++; } if (ev.b) row(ev.b).ast++; if (ev.c) row(ev.c).pf++; }
        else if (ev.k === 'miss' && ev.a) { const r = row(ev.a); r.fga++; if (three) r.tpa++; if (ev.b) row(ev.b).blk++; }
        else if (ev.k === 'sfoul') { if (ev.b) row(ev.b).pf++; }
        else if (ev.k === 'ft' && ev.a) { const r = row(ev.a); r.ftm += ev.made || 0; r.fta += ev.att || 0; }
        else if ((ev.k === 'oreb' || ev.k === 'dreb') && ev.a) row(ev.a).reb++;
        else if (ev.k === 'tov' && ev.a) { row(ev.a).tov++; if (ev.b && ev.tov === 'steal') row(ev.b).stl++; }
        else if (ev.k === 'pf' && ev.a) row(ev.a).pf++;   // a foul-out line is only the notice, the foul itself was counted
        ev.stats.forEach(([key, stat, v]) => { if (stat === 'pts') row(key).pts += v; else if (stat === 'reb' && (ev.k !== 'oreb' && ev.k !== 'dreb')) row(key).reb += v; });
        if (ev.pts && ev.side) { SIDES.forEach(sd => ev.on[sd].forEach(k => { row(k).pm += sd === ev.side ? ev.pts : -ev.pts; })); }
      }
      return out;
    }
    function pnlShow(open) {
      const box = $('.ct-pnl'); if (!box) return;
      st.pnl = open; box.hidden = !open;
      box.classList.toggle('ct-pnl-over', full);
      pnlDraw();
    }
    function banner(text) {
      const b = $('.ct-banner');
      b.textContent = text; b.hidden = false;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      clearTimeout(st.bannerT);
      st.bannerT = setTimeout(() => { b.hidden = true; }, 2200);
    }
    function chips() {
      const box = $('.ct-floor-list');
      box.innerHTML = ['away', 'home'].map(side => `<div class="ct-row" data-side="${side}">${st.on[side].map(key => {
        const k = kit[side];
        return `<button type="button" class="ct-chip${st.sel === key ? ' on' : ''}" data-key="${key}" style="--cf:${esc(k.fill)};--cr:${esc(k.ring)};--ct:${esc(k.text)}"><i>${esc(info[key].num || info[key].ini)}</i><span>${esc(info[key].last)}</span>${game.pbe ? '<b class="ct-en"><em></em></b>' : ''}</button>`;
      }).join('')}</div>`).join('');
      drawEnergy();
    }
    // energy (watched games: the engine's per-line log, res.pbe): a bar under each name, green when fresh, red when spent
    function energyAt(key, i) {
      const row = game.pbe && game.pbe[Math.max(0, Math.min(i, game.pbe.length - 1))];
      return row ? row[sideOf(key) === 'home' ? 0 : 1][idxOf(key)] : null;
    }
    // a bar for the box score and the player card: fill and color from his energy (40 is spent, 100 fresh)
    function enBar(key) {
      const e = energyAt(key, Math.max(0, st.done - 1));
      if (e == null) return '';
      const f = Math.max(0, Math.min(1, (e - 40) / 60));
      return `<span class="ct-enb" title="Energy ${e}%"><em style="width:${(f * 100).toFixed(0)}%;background:hsl(${Math.round(f * 120)} 75% 45%)"></em></span>`;
    }
    function drawEnergy() {
      if (!game.pbe) return;
      const i = Math.max(0, st.done - 1);
      el.querySelectorAll('.ct-floor-list .ct-chip[data-key]').forEach(b => {
        const e = energyAt(b.getAttribute('data-key'), i), bar = b.querySelector('.ct-en em');
        if (e == null || !bar) return;
        const f = Math.max(0, Math.min(1, (e - 40) / 60));
        bar.style.width = (f * 100).toFixed(0) + '%';
        bar.style.background = 'hsl(' + Math.round(f * 120) + ' 75% 45%)';
        b.title = info[b.getAttribute('data-key')].last + ' | energy ' + e + '%';
      });
    }
    $('.ct-floor-list').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) select(b.getAttribute('data-key')); });

    function select(key) {
      st.sel = st.sel === key ? null : key;
      card(); chips(); render(0);
    }
    function card() {
      const c = $('.ct-card');
      if (!st.sel || !info[st.sel]) { c.classList.add('empty'); c.innerHTML = '<span class="ct-hint">TAP A PLAYER ON THE COURT OR BELOW TO FOLLOW HIM</span>'; return; }
      c.classList.remove('empty');
      const p = info[st.sel];
      const line = linesAt(tl, st.done)[st.sel] || { pts: 0, reb: 0, ast: 0 };
      const onFloor = st.on[p.side].indexOf(st.sel) >= 0;
      c.innerHTML = `<div class="ct-cn">${logoOf(abbr[p.side], 22)}<b>${esc(p.name)}</b><small>${esc(p.pos)}${onFloor ? '' : ' | BENCH'}</small></div>
        <div class="ct-cl"><span><b>${line.pts}</b>PTS</span><span><b>${line.reb}</b>REB</span><span><b>${line.ast}</b>AST</span>${game.pbe ? `<span class="ct-cen">${enBar(st.sel)}ENERGY</span>` : ''}</div><button type="button" class="ct-x" aria-label="Stop following">X</button>`;
      c.querySelector('.ct-x').addEventListener('click', () => select(st.sel));
    }

    // ---------- floor geometry ----------
    function attacksRight(side, per) { return (side === 'home') !== (periodIndex(per || 'Q1') >= 2); }
    function at(side, per, d, y) { return [attacksRight(side, per) ? CW - d : d, y]; }
    function hoop(side, per) { return at(side, per, HOOP, 25); }
    function rank(key) { const r = POSR[info[key].pos]; return r == null ? 2 : r; }
    function ordered(keys) { return keys.slice().sort((p, q) => rank(p) - rank(q) || idxOf(p) - idxOf(q)); }
    function offenseSet(O, per) {
      const out = {};
      ordered(st.on[O]).forEach((key, i) => { const s = SPOTS[i] || SPOTS[4]; out[key] = at(O, per, s[0] + rnd(-1.5, 1.5), s[1] + rnd(-2, 2)); });
      return out;
    }
    // Man-to-man: the man with the ball gets a defender up on him (about 3 feet, toward the basket); everyone else
    // sits between his man and the basket and sags toward the ball, more the farther his man is from it (help side).
    function guardSpot(man, h, ball, onBall) {
      const d = Math.max(0.01, dist(man, h));
      if (onBall || !ball) { const g = Math.min(d * 0.6, 3.2); return [man[0] + (h[0] - man[0]) / d * g, man[1] + (h[1] - man[1]) / d * g]; }
      const g = Math.min(d * 0.5, Math.max(2.5, d * 0.18)), p = [man[0] + (h[0] - man[0]) / d * g, man[1] + (h[1] - man[1]) / d * g];
      const k = clamp(dist(man, ball) / 70, 0.12, 0.42);
      return [p[0] + (ball[0] - p[0]) * k, p[1] + (ball[1] - p[1]) * k];
    }
    function defenseSet(O, per, off, handler) {
      const out = {}, D = other(O), h = hoop(O, per);
      const os = ordered(st.on[O]), ds = ordered(st.on[D]), ball = handler ? off[handler] : null;
      ds.forEach((key, i) => {
        const mk = os[i] || os[0], g = guardSpot(off[mk], h, ball, mk === handler);
        out[key] = [g[0] + rnd(-0.4, 0.4), g[1] + rnd(-0.4, 0.4)];
      });
      return out;
    }
    function matchup(key) {
      const side = sideOf(key);
      const i = ordered(st.on[side]).indexOf(key);
      const ds = ordered(st.on[other(side)]);
      return ds[Math.max(0, i)] || ds[0];
    }
    function shotSpot(type, O, per) {
      const h = hoop(O, per);
      const sgn = attacksRight(O, per) ? -1 : 1;
      const polar = (r, deg) => { const a = deg * Math.PI / 180; return [h[0] + sgn * r * Math.cos(a), h[1] + r * Math.sin(a)]; };
      if (type === 'close') return at(O, per, rnd(3.2, 6), rnd(22, 28));
      if (type === 'post') return at(O, per, rnd(6, 10), pick([rnd(17.5, 20.5), rnd(29.5, 32.5)]));
      if (type === 'mid') return polar(rnd(11, 18), rnd(-75, 75));
      if (Math.random() < 0.3) return at(O, per, rnd(2.5, 7), pick([2.4, 47.6]));
      return polar(rnd(24.6, 26.5), rnd(-62, 62));
    }
    function landing(O, per) { return at(O, per, rnd(3.5, 13), rnd(15, 35)); }
    // the offense shifts a little around its spots (the defense is left to guardSpot, which follows the ball)
    function drift(form, keys, r) { const out = {}; form = form || {}; keys.forEach(k => { if (st.off && sideOf(k) !== st.off) return; if (form[k]) out[k] = [form[k][0] + rnd(-r, r), clamp(form[k][1] + rnd(-r, r), 1, 49)]; }); return out; }
    function huddles() {
      const out = {};
      ['home', 'away'].forEach(side => {
        const cx = side === 'home' ? 36 : 58;
        st.on[side].forEach((key, i) => { const a = i / 5 * Math.PI * 2; out[key] = [cx + Math.cos(a) * 2.6, 45.5 + Math.sin(a) * 1.8]; });
      });
      return out;
    }

    // ---------- planning: an event becomes a few beats ----------
    // beat: { dur (ms at 1x), move: { key: [x, y] }, fade: { key: alpha }, ball: { to: key | [x, y], arc }, hold, fire, at() }
    function act(key, k, d) { if (key) st.act[key] = { k, t0: st.simT, d }; }
    function cheer(side, n) { st.crowd = Math.min(1, (st.crowd || 0) + (side === 'home' ? 0.16 : 0.06) * n); }
    const leftIn = ev => periodStart(ev.per) + periodLength(ev.per) - ev.t;
    const clutchEv = ev => !!ev && periodIndex(ev.per) >= 3 && leftIn(ev) <= 120 && Math.abs(ev.hs - ev.as) <= 5;
    const buzzerEv = ev => { const nx = evs[ev.i + 1]; return leftIn(ev) <= 3 && (!nx || nx.k === 'end' || nx.k === 'final'); };
    // a play worth a replay (3D view, at 1X, not in a watch party, not too often)
    function highlight(kind, p) {
      if (!r3 || st.speed !== 1 || opts.onControl || st.simT - st.lastReplay < 30000) return;
      st.hl = { kind, x: p[0], y: p[1], t: st.simT };
    }
    function tag(key, text, cls, ttl) { st.tags.push({ key, text, cls, age: 0, ttl: ttl || 1300 }); }
    function tagAt(p, text, cls, ttl) { st.tags.push({ at: p, text, cls, age: 0, ttl: ttl || 1300 }); }
    function ring(p) { st.tags.push({ at: p, ring: true, age: 0, ttl: 600 }); }
    // a pass: a chest-pass push from the passer, the catcher's hands out, the ball from one's hands to the other's
    function pass(B, to, extra) {
      const from = st.ph; st.ph = to;
      const dur = 240 + (from && st.pos[from] && st.pos[to] ? dist(st.pos[from], st.pos[to]) * 11 : 120);
      const b = Object.assign({ dur, ball: { to, arc: 1, from: from || null, hand: true } }, extra || {}), at0 = b.at0;
      b.at0 = () => { if (from) act(from, 'pass', 360); act(to, 'catch', b.dur + 160); if (at0) at0(); };
      B.push(b);
    }

    // Puts the ball in the hands of side O in its frontcourt. Returns the handler.
    function setUp(O, per, B) {
      let h = st.ph && sideOf(st.ph) === O && st.on[O].indexOf(st.ph) >= 0 ? st.ph : null;
      const ord = ordered(st.on[O]);
      if (st.off === O && st.set && h && st.form) return h;
      if (!h) {
        // inbound from under the basket the other team attacks
        const inb = ord[3] || ord[ord.length - 1], pg = inb === ord[0] ? ord[1] : ord[0];
        const own = attacksRight(O, per) ? -1.4 : CW + 1.4;
        const mv = {}; mv[inb] = [own, rnd(19, 31)]; mv[pg] = at(O, per, CW - rnd(9, 14), rnd(14, 36));
        B.push({ dur: 650, move: mv, ball: { to: inb, arc: 0.4 }, hold: inb });
        st.ph = inb;
        pass(B, pg);
        h = pg;
      } else if (h !== ord[0] && st.off !== O && Math.random() < 0.6) {
        const mv = {}; mv[ord[0]] = [st.pos[h][0] + (attacksRight(O, per) ? 9 : -9), clamp(st.pos[h][1] + rnd(-8, 8), 4, 46)];
        B.push({ dur: 420, move: mv });
        pass(B, ord[0]);
        h = ord[0];
      }
      const off = offenseSet(O, per);
      off[h] = at(O, per, rnd(25, 29), rnd(19, 31));
      const def = defenseSet(O, per, off, h);
      const far = Math.max.apply(null, Object.keys(off).map(k => dist(st.pos[k] || off[k], off[k])));
      B.push({ dur: clamp(far * 30, 700, 2600), move: Object.assign({}, off, def), arrive: [h], near: 4, wait: 2400 });
      st.off = O; st.set = true; st.form = Object.assign({}, off, def); st.playForm = st.form; st.playFormSide = O;
      return h;
    }
    // A few passes around the perimeter, ending with the ball in `end`'s hands.
    function swing(O, B, end, n) {
      const keys = st.on[O];
      for (let j = 0; j < n; j++) {
        const opts2 = keys.filter(k => k !== st.ph && (j < n - 1 || k !== end || n === 1));
        if (!opts2.length) break;
        const to = pick(opts2);
        if (j) B.push({ dur: rnd(300, 650) });   // the catch: he squares up and looks before the next pass
        pass(B, to, { move: drift(st.form, st.on.home.concat(st.on.away), 1.6) });
      }
      if (st.ph !== end) { if (n) B.push({ dur: rnd(300, 600) }); pass(B, end, { move: drift(st.form, st.on.home.concat(st.on.away), 1.2) }); }
      return end;
    }

    // A fast break: right after a defensive rebound or a steal, quick enough (7 seconds) that the defense is not set.
    // The handler pushes it up the middle, the wings fill the lanes, the defense sprints back. Returns false when it is not one.
    function fastBreak(ev, prev, O, per, B, shooter, spot) {
      if (!prev || ev.shot === 'post' || ev.shot === 'mid' || ev.t - prev.t > 9) return false;
      const turn = (prev.k === 'dreb' && prev.side === O) || (prev.k === 'tov' && prev.tov === 'steal' && prev.side !== O);
      if (!turn || !st.ph || sideOf(st.ph) !== O) return false;
      const hd = st.ph, D = other(O), mv = {};
      const lanes = [[22, 25], [13, 5], [13, 45], [30, 16], [33, 34]];
      ordered(st.on[O]).forEach((k, i) => { const l = lanes[i] || lanes[4]; mv[k] = at(O, per, l[0] + rnd(-2, 2), l[1] + rnd(-2, 2)); });
      mv[hd] = at(O, per, rnd(17, 21), 25 + rnd(-3, 3));
      if (shooter !== hd) mv[shooter] = ev.shot === 'close' ? at(O, per, rnd(9, 13), 25 + rnd(-8, 8)) : spot;
      const back = [[9, 25], [15, 18], [19, 32], [25, 12], [30, 38]];
      ordered(st.on[D]).forEach((k, i) => { const l = back[i] || back[4]; mv[k] = at(O, per, l[0] + rnd(0, 6), l[1] + rnd(-3, 3)); });
      const far = Math.max.apply(null, Object.keys(mv).map(k => dist(st.pos[k] || mv[k], mv[k])));
      B.push({ dur: clamp(far * 34, 900, 2200), pace: 24, move: mv, hold: hd, arrive: [hd], near: 5, wait: 1400, at0: () => { tag(hd, 'FAST BREAK', 'play', 1500); cheer(O, 1); } });
      st.off = O; st.set = false; st.form = Object.assign({}, mv); st.playForm = st.form; st.playFormSide = O;
      // the finish: the handler keeps going all the way to the rim, or hits the man filling the lane in stride
      if (shooter !== hd) pass(B, shooter, { dur: 420, pace: 24, move: { [shooter]: spot } });
      else B.push({ dur: clamp(dist(mv[hd], spot) * 42, 380, 900), pace: 24, move: { [shooter]: spot }, hold: hd, arrive: [hd], near: 1.5, wait: 600 });
      return true;
    }
    // The half-court set that gets this shot, read from the shot and the pass: a pick and roll for a big's basket off
    // a guard's pass, a drive and kick for an assisted three, a post-up, a shooter coming off a screen, else the ball
    // moving around until the shooter goes to work (an isolation when nobody passed it to him).
    function runPlay(ev, O, per, B, shooter, spot) {
      const A = ev.k === 'make' && ev.b && ev.b !== shooter ? ev.b : null, h = hoop(O, per), D = other(O), r = Math.random();
      const toward = (q, f) => [q[0] + (h[0] - q[0]) * f, q[1] + (h[1] - q[1]) * f];
      const spotOf = k => (st.form && st.form[k]) || st.pos[k] || at(O, per, 24, 25);
      const get = k => { if (st.ph !== k) pass(B, k, { dur: 480, move: drift(st.form, st.on.home.concat(st.on.away), 1) }); };
      if (ev.shot === 'post' && r < 0.85) {
        const block = at(O, per, rnd(7.5, 9), spot[1] < 25 ? 18.5 : 31.5), d = matchup(shooter);
        if (st.ph === shooter) { const g = ordered(st.on[O]).find(x => x !== shooter); if (g) pass(B, g, { dur: 450 }); }
        B.push({ dur: 700, move: Object.assign({ [shooter]: block }, d ? { [d]: toward(block, 0.22) } : {}), at0: () => tag(shooter, 'POST UP', 'play', 1500) });
        pass(B, shooter, { dur: 480 });
        B.push({ dur: 850, move: Object.assign({ [shooter]: spot }, d ? { [d]: toward(spot, 0.2) } : {}) });
        return;
      }
      if (A && (ev.shot === 'close' || ev.shot === 'mid') && rank(shooter) >= 2.5 && r < 0.8) {
        get(A);
        const P0 = spotOf(A), side = P0[1] < 25 ? 1 : -1, dA = matchup(A), dS = matchup(shooter);
        const scr = [P0[0] + (h[0] - P0[0]) * 0.1, clamp(P0[1] + side * 2.2, 2, 48)];
        B.push({ dur: 650, move: { [shooter]: scr }, hold: A, at0: () => tag(A, 'PICK & ROLL', 'play', 1500) });
        const drive = [P0[0] + (h[0] - P0[0]) * 0.4, clamp(P0[1] + side * 6, 6, 44)];
        const mv = { [A]: drive, [shooter]: spot };
        if (dA) mv[dA] = [(scr[0] + P0[0]) / 2, scr[1] - side * 1.5];
        if (dS) mv[dS] = [drive[0] + (h[0] - drive[0]) * 0.2, drive[1] - side * 2];
        B.push({ dur: 800, move: mv, hold: A });
        pass(B, shooter, { dur: 420 });
        return;
      }
      if (A && ev.shot === 'three' && r < 0.6) {
        get(A);
        const lane = at(O, per, rnd(9, 13), 25 + rnd(-5, 5)), dA = matchup(A), mv = { [A]: lane, [shooter]: spot };
        if (dA) mv[dA] = [lane[0] + (spotOf(A)[0] - lane[0]) * 0.15, lane[1] + 1.2];
        ordered(st.on[D]).filter(k => k !== dA).sort((p, q) => dist(spotOf(p), lane) - dist(spotOf(q), lane)).slice(0, 2)
          .forEach(k => { const q = spotOf(k); mv[k] = [q[0] + (lane[0] - q[0]) * 0.5, q[1] + (lane[1] - q[1]) * 0.5]; });
        B.push({ dur: 850, move: mv, hold: A, at0: () => tag(A, 'DRIVE & KICK', 'play', 1500) });
        pass(B, shooter, { dur: 460 });
        return;
      }
      if (A && (ev.shot === 'mid' || ev.shot === 'three') && r < 0.75) {
        const big = ordered(st.on[O]).reverse().find(k => k !== shooter && k !== A);
        const low = at(O, per, rnd(4, 7), spot[1] < 25 ? 10 : 40), scr = [(low[0] + spot[0]) / 2, (low[1] + spot[1]) / 2];
        get(A);
        B.push({ dur: 700, move: Object.assign({ [shooter]: low }, big ? { [big]: scr } : {}) });
        const dS = matchup(shooter);
        B.push({ dur: 750, move: Object.assign({ [shooter]: spot }, dS ? { [dS]: [scr[0], scr[1] + 1.4] } : {}), hold: A, at0: () => tag(shooter, 'OFF A SCREEN', 'play', 1400) });
        pass(B, shooter, { dur: 420 });
        return;
      }
      const hub = A || (Math.random() < 0.55 ? shooter : null);
      const n = Math.floor(rnd(0, 2.6));
      if (hub) swing(O, B, hub, n);
      else if (n) swing(O, B, pick(st.on[O].filter(x => x !== shooter)) || shooter, n);
      if (st.ph !== shooter) { pass(B, shooter, { move: Object.assign({ [shooter]: spot }, drift(st.form, st.on[O].filter(x => x !== shooter), 1)), dur: 560 }); return; }
      if (!A && ev.shot !== 'close' && Math.random() < 0.6) {
        const P0 = spotOf(shooter);
        B.push({ dur: 420, move: { [shooter]: [P0[0], clamp(P0[1] + rnd(-3, 3), 3, 47)] }, at0: () => tag(shooter, 'ISOLATION', 'play', 1300) });
      }
      B.push({ dur: clamp(dist(st.pos[shooter] || spot, spot) * 55, 350, 1200), move: { [shooter]: spot } });
    }

    // the shot is up: the two biggest on each side go to the glass (the defenders inside, boxing out), the rest
    // of the offense gets back, the rest of the defense turns to find a body
    function crashBoards(O, per, shooter) {
      const D = other(O), mv = {}, h = hoop(O, per);
      const bigs = side => ordered(st.on[side]).slice(-2);
      bigs(O).filter(k => k !== shooter).forEach((k, i) => { mv[k] = at(O, per, rnd(7, 10), i ? rnd(30, 34) : rnd(16, 20)); });
      bigs(D).forEach((k, i) => { mv[k] = at(O, per, rnd(5, 7), i ? rnd(28, 31) : rnd(19, 22)); });
      ordered(st.on[O]).slice(0, 2).filter(k => k !== shooter && !mv[k]).forEach((k, i) => { mv[k] = at(O, per, rnd(30, 36), i ? 34 : 16); });
      ordered(st.on[D]).slice(0, 3).filter(k => !mv[k]).forEach(k => { const q = st.pos[k] || h; mv[k] = [q[0] + (h[0] - q[0]) * 0.25, q[1] + (h[1] - q[1]) * 0.25]; });
      return mv;
    }

    function planSubs(ev, B) {
      const fade = {}, move = {}, ins = [];
      let any = false;
      SIDES.forEach(side => {
        const now = st.on[side], next = ev.on[side];
        const outs = now.filter(k => next.indexOf(k) < 0), inn = next.filter(k => now.indexOf(k) < 0);
        inn.forEach((k, j) => {
          any = true;
          const repl = outs[j];
          const spot = repl && st.pos[repl] ? st.pos[repl].slice() : [47 + rnd(-6, 6), rnd(8, 42)];
          st.pos[k] = [47 + rnd(-2, 2), 51.5]; st.vel[k] = [0, 0];
          move[k] = spot; fade[k] = 1; ins.push(k);
          if (st.ph === repl) st.ph = k;
        });
        outs.forEach(k => { any = true; move[k] = [47 + rnd(-3, 3), 51.8]; fade[k] = 0; });
      });
      if (!any) return;
      const prevHolder = st.holder;
      st.on = { home: ev.on.home.slice(), away: ev.on.away.slice() };
      if (st.form) ins.forEach(k => { st.form[k] = move[k]; });
      B.push({ dur: 900, move, fade, hold: st.ph, at0: () => {
        chips();
        if (prevHolder && fade[prevHolder] === 0) st.holder = st.ph;
        ins.forEach(k => tag(k, 'IN', 'sub', 1100));
        announceSub(ev.i);
      } });
    }

    function plan(ev, prev) {
      const B = [];
      const per = ev.per;
      st.ph = st.holder;
      planSubs(ev, B);
      const k = ev.k, O = ev.side;
      if (k === 'tip') {
        const mv = {};
        SIDES.forEach(side => {
          const ord = ordered(st.on[side]);
          const jumper = ord[ord.length - 1];
          ord.forEach((key, i) => {
            if (key === jumper) mv[key] = [47 + (attacksRight(side, per) ? -1.1 : 1.1), 25];
            else mv[key] = at(side, per, 47 + rnd(7, 9), [11, 19, 31, 39][i] + rnd(-1, 1));
          });
          st.pos[jumper] = st.pos[jumper] || mv[jumper];
        });
        const jumpers = SIDES.map(side => { const o = ordered(st.on[side]); return o[o.length - 1]; });
        B.push({ dur: 900, move: mv, ball: { to: [47, 25], arc: 0, h1: 6.5 }, hold: null, at0: () => banner('TIP-OFF') });
        B.push({ dur: 650, ball: { to: [47, 25], arc: 8, h1: 9 }, hold: null, at0: () => jumpers.forEach(j => act(j, 'jump', 900)) });
        const pg = ordered(st.on[O])[0];
        B.push({ dur: 450, ball: { to: pg, arc: 2 }, hold: pg, fire: true });
        st.ph = pg; st.off = O; st.set = false; st.form = null;
        return B;
      }
      if (k === 'end' || k === 'final') {
        const ot = evs[evs.length - 1] && periodIndex(per) >= 4;
        const text = k === 'final' ? 'FINAL' + (ot ? (periodIndex(per) > 4 ? '/' + (periodIndex(per) - 3) + 'OT' : '/OT') : '')
          : per === 'Q2' ? 'HALFTIME' : 'END OF ' + per;
        B.push({ dur: k === 'final' ? 2400 : 1900, move: huddles(), ball: { to: [47, 25], arc: 1 }, hold: null, fire: true, at0: () => banner(text) });
        st.ph = null; st.off = null; st.set = false; st.form = null;
        return B;
      }
      if (k === 'make' || k === 'miss' || k === 'sfoul') {
        const shooter = ev.a;
        const putback = prev && prev.k === 'oreb' && prev.a === shooter && ev.shot === 'close' && st.ph === shooter;
        const dunk = k === 'make' && ev.shot === 'close' && /dunk/i.test(ev.body || ev.text || '');
        const spot = dunk ? at(O, per, rnd(2.8, 3.8), 25 + rnd(-1.8, 1.8)) : shotSpot(ev.shot, O, per);
        if (putback) {
          B.push({ dur: 320, move: { [shooter]: spot } });
        } else if (!fastBreak(ev, prev, O, per, B, shooter, spot)) {
          setUp(O, per, B);
          runPlay(ev, O, per, B, shooter, spot);
        }
        const dfd = matchup(shooter);
        const h = hoop(O, per);
        const closeout = dfd ? { [dfd]: [spot[0] + (h[0] - spot[0]) * 0.14, spot[1] + (h[1] - spot[1]) * 0.14] } : {};
        const rim = [h[0] + rnd(-0.2, 0.2), h[1] + rnd(-0.2, 0.2)];
        const long = ev.shot === 'three', near = ev.shot === 'close';
        const arc = dunk ? 0.5 : long ? 9 : near ? 2.8 : ev.shot === 'post' ? 4.5 : 6.5;
        const dur = dunk ? 520 : long ? 860 : near ? 460 : 700;
        const label = dunk ? 'DUNK' : { close: 'AT THE RIM', post: 'POST', mid: 'MID-RANGE', three: '3PT' }[ev.shot];
        // the rise: he gathers and goes up (a dunker toward the rim), his man comes out to contest
        const rise = dunk ? 240 : near ? 180 : 260;
        // a block: the blocker is in the shooter's face before he rises (not running in from the weak side as the ball arrives)
        const blk = k === 'miss' && ev.b ? ev.b : null;
        const meet = blk ? [spot[0] + (h[0] - spot[0]) * 0.12, spot[1] + (h[1] - spot[1]) * 0.12] : null;
        const prep = B[B.length - 1], need = blk ? [shooter, blk] : [shooter];
        if (prep && !prep.ball && prep.move && prep.move[shooter]) { prep.arrive = need; prep.near = 1.5; if (blk) prep.move[blk] = meet; }
        else B.push({ dur: 200, move: Object.assign({ [shooter]: spot }, blk ? { [blk]: meet } : {}), arrive: need, near: 1.5, wait: 1400 });
        const riseMove = Object.assign({}, closeout); if (dunk) riseMove[shooter] = [spot[0] + (h[0] - spot[0]) * 0.35, spot[1] + (h[1] - spot[1]) * 0.35];
        if (blk) riseMove[blk] = meet;
        B.push({ dur: rise, move: riseMove, at0: () => { tag(shooter, label, 'kind', rise + dur + 200); act(shooter, dunk ? 'dunk' : near ? 'layup' : 'shoot', dunk ? rise + dur * 1.6 : near ? rise + dur : rise * 2.6); if (dfd) act(dfd, 'contest', rise + dur); } });
        st.ph = null;
        if (k === 'make') {
          const fouler = ev.c;
          const mv = {};
          if (fouler) mv[fouler] = [spot[0] + (h[0] - spot[0]) * 0.1, spot[1] + 0.8];
          const big = dunk ? 'DUNK' : fouler ? 'AND ONE' : buzzerEv(ev) ? 'AT THE BUZZER' : long && clutchEv(ev) ? 'CLUTCH THREE' : '';
          B.push({ dur, move: mv, ball: { to: rim, arc }, shot: true, dunk, hold: null, fire: true, at0: () => { if (dunk || long || big) st.zoom = { x: h[0], y: h[1], until: st.simT + dur + 1000 }; }, at: () => {
            ring(rim); tag(shooter, '+' + ev.pts, 'pts');
            if (fouler) { tag(fouler, 'FOUL', 'foul'); tagAt(rim, 'AND ONE', 'big', 1500); }
            cheer(O, ev.pts + (dunk ? 3 : 0) + (fouler ? 2 : 0) + (big ? 2 : 0));
            if (dunk && st.speed <= 2 && window.SFX) window.SFX.play('dunk');
            if (big) highlight(big, rim);
          } });
          // a big one: he lets the building know (and a teammate comes over)
          const mate = big ? ordered(st.on[O]).filter(x => x !== shooter).sort((x, y) => dist(st.pos[x] || [0, 0], spot) - dist(st.pos[y] || [0, 0], spot))[0] : null;
          B.push({ dur: dunk ? 420 : 260, ball: { to: at(O, per, HOOP - 1.4, 25 + rnd(-1, 1)), arc: 0, h1: 0.5 }, hold: null,
            at: big ? () => { act(shooter, 'cheer', 1300); if (mate) { act(mate, 'cheer', 1100); st.tgt[mate] = [spot[0] + rnd(-2, 2), spot[1] + rnd(-2, 2)]; st.top[mate] = 16; } } : null });
          st.off = fouler ? O : null; st.set = !!fouler;
        } else if (k === 'sfoul') {
          const fouler = ev.b;
          const mv = {};
          if (fouler && st.pos[shooter]) mv[fouler] = [spot[0] + (h[0] - spot[0]) * 0.08, spot[1] + 0.9];
          B.push({ dur: 240, move: mv });
          B.push({ dur: 420, ball: { to: [spot[0] + (h[0] - spot[0]) * 0.5, spot[1] + (h[1] - spot[1]) * 0.5], arc: 2, h1: 6 }, shot: true, hold: null, fire: true, at: () => { if (fouler) tag(fouler, 'FOUL', 'foul'); } });
          st.off = O; st.set = true;
        } else if (ev.b) {
          // he goes up as the ball leaves the hand, arms all the way up when it gets there; the ball meets his hand
          // (ball.hand: the 3D view puts it in his actual hand), then flies off
          B.push({ dur: 300, ball: { to: blk, arc: 2.2, h1: 10.6, hand: true }, shot: true, hold: null, fire: true, at0: () => { act(blk, 'block', 680); st.zoom = { x: meet[0], y: meet[1], until: st.simT + 1300 }; }, at: () => { tag(blk, 'BLOCK', 'big'); cheer(other(O), 3); highlight('BLOCK', meet); } });
          B.push({ dur: 460, ball: { to: landing(O, per), arc: 2 }, hold: null });
          st.off = null; st.set = false;
        } else {
          B.push({ dur, ball: { to: rim, arc }, shot: true, hold: null, fire: true, move: crashBoards(O, per, shooter), at: () => tag(shooter, 'MISS', 'miss', 900) });
          B.push({ dur: 420, ball: { to: landing(O, per), arc: 3 }, hold: null });
          st.off = null; st.set = false;
        }
        return B;
      }
      if (k === 'oreb' || k === 'dreb') {
        const r = ev.a;
        const crash = {};
        // the rebounder goes where the miss came down
        crash[r] = st.lastBallTo ? st.lastBallTo.slice() : [st.ball.x, st.ball.y];
        B.push({ dur: 260, pace: 25, move: crash, arrive: [r], near: 3, wait: 380 });
        B.push({ dur: 220, ball: { to: r, arc: 0.6, h1: 8.5 }, hold: r, fire: true, at0: () => act(r, 'jump', 640), at: () => tag(r, k === 'oreb' ? 'O-REB' : 'REB', 'reb', 900) });
        st.ph = r; st.off = O; st.set = k === 'oreb'; if (k === 'dreb') st.form = null;
        return B;
      }
      if (k === 'ft') {
        const shooter = ev.a;
        const D = other(O);
        const line = at(O, per, 19, 25);
        const mv = {}; mv[shooter] = line;
        // the lane: the two defensive bigs on the spaces nearest the rim, two offensive players in the next ones, just
        // outside the lane lines of the season; everyone else behind the line, a defender behind the shooter
        const lo = 25 - LANE_W / 2 - 0.9, hi = 25 + LANE_W / 2 + 0.9;
        // three defenders (both spaces nearest the rim and the third space on one side), two offensive players
        const laneD = [[8.5, lo], [8.5, hi], [16, lo]], laneO = [[12.4, hi], [12.4, lo]];
        const restD = [[28, 25 + rnd(-1, 1)], [26, 41]], restO = [[33, 15], [33, 35]];
        const inLane = {};
        // a technical or flagrant shot: nobody on the lane, everyone else back at half court
        let pj = ev.i - 1;
        while (pj >= 0 && (evs[pj].k === 'sub' || evs[pj].k === 'foulout' || (evs[pj].k === 'extra' && evs[pj].ex === 'eject'))) pj--;
        const pe = evs[pj], empty = !!pe && ((pe.k === 'extra' && pe.ex === 'tech') || (pe.k === 'pf' && pe.flag));
        if (empty) {
          ordered(st.on[D]).forEach((key, i) => { mv[key] = at(O, per, 42 + rnd(-1, 1), [6, 15, 25, 35, 44][i] || 25); });
          ordered(st.on[O]).filter(x => x !== shooter).forEach((key, i) => { mv[key] = at(O, per, 46 + rnd(-1, 1), [10, 20, 30, 40][i] || 25); });
        } else ordered(st.on[D]).reverse().forEach((key, i) => { const s = laneD[i] || restD[i - 3] || restD[1]; mv[key] = at(O, per, s[0], s[1]); if (i < 3) inLane[key] = s; });
        if (!empty) ordered(st.on[O]).filter(x => x !== shooter).reverse().forEach((key, i) => { const s = laneO[i] || restO[i - 2] || restO[1]; mv[key] = at(O, per, s[0], s[1]); if (i < 2) inLane[key] = s; });
        // nobody shoots until the lane is filled
        B.push({ dur: 1000, pace: 12, move: mv, ball: { to: shooter, arc: 1.2 }, hold: shooter, arrive: Object.keys(mv), near: 1.5, wait: 3200 });
        // a miss off the last one: the lane steps in for the rebound
        const crash = {}; Object.keys(inLane).forEach(k => { const s = inLane[k]; crash[k] = at(O, per, s[0] - 2.5, s[1] + (s[1] < 25 ? 2.5 : -2.5)); });
        const reb = evs[ev.i + 1] && (evs[ev.i + 1].k === 'oreb' || evs[ev.i + 1].k === 'dreb');
        const lastMade = ev.made > 0 && !(reb && ev.made < ev.att);
        // made ones first when the last one misses, missed ones first otherwise
        const seq = [];
        for (let j = 0; j < ev.att; j++) seq.push(lastMade ? j >= ev.att - ev.made : j < ev.made);
        const h = hoop(O, per);
        let base = O === 'home' ? ev.hs - ev.made : ev.as - ev.made;
        seq.forEach((made, j) => {
          const last = j === seq.length - 1;
          B.push({ dur: 640, ball: { to: [h[0] + rnd(-0.15, 0.15), h[1]], arc: 4.5 }, shot: true, hold: null, fire: last, at0: () => act(shooter, 'ft', 700), at: () => {
            if (made) { base++; if (O === 'home') st.hs = base; else st.as = base; drawScore(); ring(h); tag(shooter, '+1', 'pts', 900); }
            else tag(shooter, 'MISS', 'miss', 800);
          } });
          if (!last) B.push({ dur: 420, ball: { to: shooter, arc: 2 }, hold: shooter });
          else if (made) B.push({ dur: 260, ball: { to: at(O, per, HOOP - 1.4, 25), arc: 0, h1: 0.5 }, hold: null });
          else B.push({ dur: 380, move: crash, ball: { to: landing(O, per), arc: 2.5 }, hold: null });
        });
        st.ph = null; st.off = lastMade || empty ? null : O; st.set = false; st.form = null;
        return B;
      }
      if (k === 'extra') {
        // a timeout: both fives walk to their benches, the ball goes to the official
        if (ev.ex === 'timeout') {
          B.push({ dur: 2400, move: huddles(), ball: { to: [47, 25], arc: 1 }, hold: null, fire: true, at0: () => banner('TIMEOUT ' + (ev.team || '')) });
          st.ph = null; st.off = null; st.set = false; st.form = null;
          return B;
        }
        if (ev.ex === 'tech') { B.push({ dur: 1000, fire: true, at0: () => { if (ev.a) tag(ev.a, 'TECHNICAL', 'big', 1600); } }); return B; }
        if (ev.ex === 'eject') { B.push({ dur: 1200, fire: true, at0: () => { if (ev.a) tag(ev.a, 'EJECTED', 'big', 1700); } }); return B; }
      }
      if (k === 'tov') {
        const tp = ev.a, D = other(O), h = hoop(O, per);
        setUp(O, per, B);
        if (st.ph !== tp && tp) pass(B, tp, { move: drift(st.form, st.on.home.concat(st.on.away), 1.4) });
        // where people will be once the set is run (the plan is made before the beats play)
        const spot = k2 => (st.form && st.form[k2]) || st.pos[k2] || at(O, per, 24, 25);
        const P = spot(tp);
        const mates = st.on[O].filter(x => x !== tp).sort((x, y) => dist(spot(x), P) - dist(spot(y), P));
        const mate = mates[Math.min(mates.length - 1, Math.floor(rnd(0, 2)))] || null, M = mate ? spot(mate) : at(O, per, 20, P[1] < 25 ? 40 : 10);
        const away = attacksRight(D, per) ? 1 : -1;   // the way the other team will run
        const side = y => (y < 25 ? -1.5 : CH + 1.5);  // just over the near sideline
        if (ev.tov === 'steal' && ev.b) {
          const sr = ev.b;
          if (mate && Math.random() < 0.55) {
            // a pass picked off: he jumps the passing lane and the ball arrives in his hands, not his man's
            const pick = [P[0] + (M[0] - P[0]) * 0.55 + rnd(-0.6, 0.6), P[1] + (M[1] - P[1]) * 0.55 + rnd(-0.6, 0.6)];
            B.push({ dur: clamp(220 + dist(P, pick) * 16, 380, 700), pace: 22, move: { [sr]: pick }, ball: { to: sr, arc: 0.7 }, hold: sr, fire: true, at0: () => act(sr, 'jump', 520), at: () => tag(sr, 'STEAL', 'big') });
            B.push({ dur: 750, pace: 22, move: { [sr]: [clamp(pick[0] + away * 12, 3, CW - 3), clamp(pick[1], 6, 44)] }, hold: sr });
          } else {
            // a strip on the drive: his man pokes it loose, the ball skips away and he scoops it up
            const drive = [P[0] + (h[0] - P[0]) * 0.25, P[1] + (h[1] - P[1]) * 0.25];
            B.push({ dur: 650, move: { [tp]: drive, [sr]: [drive[0] + (h[0] - drive[0]) * 0.12, drive[1] + 0.9] }, hold: tp, arrive: [sr], near: 2.2, wait: 700 });
            const loose = [clamp(drive[0] + away * 3 + rnd(-1, 1), 2, CW - 2), clamp(drive[1] + rnd(-2.5, 2.5), 2, 48)];
            B.push({ dur: 300, ball: { to: loose, arc: 0.8, h1: 0.5 }, hold: null, at0: () => act(sr, 'contest', 420) });
            B.push({ dur: 340, pace: 20, move: { [sr]: loose }, ball: { to: sr, arc: 0.4 }, hold: sr, fire: true, at: () => tag(sr, 'STEAL', 'big') });
            B.push({ dur: 750, pace: 22, move: { [sr]: [clamp(loose[0] + away * 12, 3, CW - 3), clamp(loose[1], 6, 44)] }, hold: sr });
          }
          st.ph = sr; st.off = D; st.set = false; st.form = null;
        } else if (ev.tov === 'foul') {
          // a charge: his man beats him to the spot and plants, then he runs into him
          const dfd = matchup(tp);
          const hit = [P[0] + (h[0] - P[0]) * 0.3, P[1] + (h[1] - P[1]) * 0.3];
          if (dfd) B.push({ dur: 380, move: { [dfd]: [hit[0] + (h[0] - hit[0]) * 0.1, hit[1] + 0.4] }, arrive: [dfd], near: 1, wait: 700 });
          B.push({ dur: 560, move: { [tp]: hit }, hold: tp, fire: true, at: () => tag(tp, 'OFFENSIVE FOUL', 'foul', 1400) });
          B.push({ dur: 320, ball: { to: [hit[0], hit[1] + 2], arc: 1 }, hold: null });
          st.ph = null; st.off = D; st.set = false; st.form = null;
        } else {
          const r = Math.random();
          if (mate && r < 0.45) {
            // a bad pass: it sails past his teammate and out
            const out = [clamp(M[0] + (M[0] - P[0]) * 0.6, 1, CW - 1), side(M[1])];
            B.push({ dur: 620, ball: { to: out, arc: 1.4 }, hold: null, fire: true, at0: () => act(mate, 'jump', 520), at: () => tag(tp, 'BAD PASS', 'miss', 1300) });
          } else if (r < 0.75) {
            // traveling: the whistle, and he flips the ball to the official on the sideline
            B.push({ dur: 480, move: { [tp]: [P[0] + (h[0] - P[0]) * 0.15, P[1]] }, hold: tp, fire: true, at: () => tag(tp, 'TRAVELING', 'miss', 1300) });
            B.push({ dur: 480, ball: { to: [P[0], side(P[1])], arc: 1.2, h1: 3 }, hold: null });
          } else {
            // the dribble gets away from him and rolls out
            B.push({ dur: 420, move: { [tp]: [P[0] + (h[0] - P[0]) * 0.15, clamp(P[1] + (P[1] < 25 ? -2.5 : 2.5), 2, 48)] }, hold: tp });
            B.push({ dur: 560, ball: { to: [P[0] + rnd(-3, 3), side(P[1])], arc: 0.4, h1: 0.5 }, hold: null, fire: true, at: () => tag(tp, 'OUT OF BOUNDS', 'miss', 1300) });
          }
          st.ph = null; st.off = D; st.set = false; st.form = null;
        }
        return B;
      }
      if (k === 'pf') {
        const fouler = ev.a, Off = other(O);
        const h = setUp(Off, per, B);
        const p = st.form && st.form[h] ? st.form[h] : [47, 25];
        B.push({ dur: ev.flag ? 700 : 480, move: { [fouler]: [p[0] + rnd(-1, 1), p[1] + rnd(-1, 1)] }, fire: true, at: () => tag(fouler, ev.flag ? 'FLAGRANT ' + ev.flag : 'FOUL', ev.flag ? 'big' : 'foul', ev.flag ? 1600 : 1300) });
        return B;
      }
      if (k === 'foulout' || k === 'inj') {
        B.push({ dur: 1000, fire: true, at0: () => tag(ev.a, k === 'inj' ? 'INJURED' : 'FOULED OUT', 'foul', 1600) });
        return B;
      }
      B.push({ dur: 160, fire: true });
      return B;
    }

    // ---------- running ----------
    // the sound of a play (js/sfx.js), only when the game is being watched play by play, not skipped through
    function sound(ev) {
      const S = window.SFX;
      if (!S || !ev) return;
      if (ev.k === 'make') S.play(ev.pts === 3 ? 'three' : 'swish');
      else if (ev.k === 'miss') S.play('rim');
      else if (ev.k === 'ft') S.play(ev.made ? 'swish' : 'rim');
      else if (ev.k === 'sfoul' || ev.k === 'pf') S.play('whistle');
      else if (ev.k === 'end') S.play('buzzer');
      else if (ev.k === 'final') { S.play('buzzer'); setTimeout(() => S.play('crowd'), 500); }
    }
    function fire(i) {
      if (i < st.done) return;
      const few = i - st.done < 3;
      for (let j = st.done; j <= i && j < evs.length; j++) {
        const ev = evs[j];
        st.done = j + 1;
        st.hs = ev.hs; st.as = ev.as; st.per = ev.per; st.shownT = ev.t; st.tPrev = ev.t;
        countPoss(ev);
        if (typeof opts.onStep === 'function') { try { opts.onStep(j); } catch (e) { console.warn('[court] onStep failed', e); } }
      }
      const ev = evs[Math.min(i, evs.length - 1)];
      if (few) sound(ev);
      drawScore(); drawLine(ev); pnlDraw(); drawEnergy();
      if (st.sel) card();
    }
    // the shot clock starts again on a new possession (and on an offensive rebound: 14 seconds from 2018-19);
    // team fouls count per period, the bonus from the fifth (the fourth in overtime)
    function countPoss(ev) {
      const k = ev.k;
      if (k === 'tip' || k === 'dreb' || k === 'tov' || k === 'end' || k === 'sfoul' || k === 'ft' || (k === 'make' && !ev.c)) { st.possT = ev.t; st.possLen = 24; }
      else if (k === 'oreb') {
        // off the rim: 24 again (14 from 2018-19); a blocked shot that never touched the rim keeps the clock going
        const pm = evs[ev.i - 1], blocked = pm && pm.k === 'miss' && pm.b;
        if (!blocked) { st.possT = ev.t; st.possLen = YEAR >= 2019 ? 14 : 24; }
      } else if (k === 'pf') {
        // a defensive foul: back up to 14 when there was less on it
        const left = st.possLen - (ev.t - st.possT);
        if (left < 14) { st.possT = ev.t; st.possLen = 14; }
      }
      if (st.tf.per !== ev.per) st.tf = { home: 0, away: 0, per: ev.per };
      const fouled = k === 'pf' ? ev.side : k === 'sfoul' || (k === 'make' && ev.c) ? other(ev.side) : k === 'tov' && ev.tov === 'foul' ? ev.side : null;
      if (fouled && st.tf[fouled] != null) st.tf[fouled]++;
      const lim = periodIndex(ev.per) >= 4 ? 4 : 5;
      SIDES.forEach(sd => { const b = el.querySelector('.ct-bonus[data-s="' + sd + '"]'); if (b) b.hidden = st.tf[other(sd)] < lim; });
    }
    function nextEvent() {
      if (st.cur >= evs.length) {
        if (!st.ended) { st.ended = true; drawClock(); if (typeof opts.onEnd === 'function') opts.onEnd(); syncControls(); }
        return false;
      }
      const ev = evs[st.cur];
      const prev = st.cur > 0 ? evs[st.cur - 1] : null;
      st.ev = ev;
      st.tPrev = prev ? prev.t : 0;
      st.beats = plan(ev, prev);
      // plan() leaves who has the ball after the play; during the play the defense still guards the offense and the
      // offense keeps moving, so that state waits for the play's last beat
      const after = { off: st.off, set: st.set, form: st.form };
      const O2 = ev.k === 'make' || ev.k === 'miss' || ev.k === 'sfoul' || ev.k === 'tov' ? ev.side : ev.k === 'pf' ? other(ev.side) : null;
      if (O2 && st.beats.length) {
        st.off = O2; st.set = true; st.form = (st.playFormSide === O2 && st.playForm) || st.form;
        const lb = st.beats[st.beats.length - 1], at1 = lb.at;
        lb.at = () => { if (at1) at1(); st.off = after.off; st.set = after.set; st.form = after.form; };
      }
      if (!st.beats.some(b => b.fire)) st.beats.push({ dur: 100, fire: true });
      st.evDur = st.beats.reduce((s, b) => s + b.dur, 0);
      st.evT = 0;
      st.cur++;
      return true;
    }
    function beginBeat(b) {
      st.beat = b; st.bt = 0;
      // each move is a target: the player runs there at a pace for the distance (a sprint across the floor, a jog
      // to a spot nearby), speeding up and slowing down like a player, so nobody slides or jumps
      Object.keys(b.move || {}).forEach(k => {
        const to = b.move[k], from = st.pos[k] || to, d = Math.hypot(to[0] - from[0], to[1] - from[1]);
        if (!st.pos[k]) st.pos[k] = to.slice();
        st.tgt[k] = to.slice();
        st.top[k] = b.pace || (d > 30 ? 25 : d > 14 ? 22 : d > 5 ? 18 : 14);
      });
      b.a0 = {};
      Object.keys(b.fade || {}).forEach(k => { b.a0[k] = st.alpha[k] || 0; });
      if (b.ball) {
        const held = !!st.holder;
        st.flight = true;
        const p = ballPos();
        b.b0 = [p[0], p[1]];
        if (Array.isArray(b.ball.to)) st.lastBallTo = b.ball.to.slice();
        // how high the ball is (feet): from the hands, a release over the head, or where it was; to hands, the rim or the floor
        const to = b.ball.to;
        b.h0 = held ? (b.shot ? (b.dunk ? 9.4 : 8) : 3.6) : (st.ball.h == null ? 3.6 : st.ball.h);
        b.h1 = b.ball.h1 != null ? b.ball.h1 : typeof to === 'string' ? 3.6
          : Math.abs(to[1] - 25) < 1.6 && (Math.abs(to[0] - HOOP) < 1.6 || Math.abs(to[0] - (CW - HOOP)) < 1.6) ? RIM : 0.5;
      }
      if (b.move && Object.keys(b.move).length >= 4 && st.speed <= 2 && Math.random() < 0.3 && window.SFX && window.SFX.play) window.SFX.play('squeak');
      if (b.at0) b.at0();
    }
    function endBeat(b) {
      Object.keys(b.fade || {}).forEach(k => { st.alpha[k] = b.fade[k]; });
      if (b.ball) {
        const to = typeof b.ball.to === 'string' ? st.pos[b.ball.to] : b.ball.to;
        if (to) { st.ball.x = to[0]; st.ball.y = to[1]; }
        st.ball.z = 0; st.ball.h = b.h1; st.flight = false;
        st.holder = b.hold !== undefined ? b.hold : (typeof b.ball.to === 'string' ? b.ball.to : null);
      } else if (b.hold !== undefined) st.holder = b.hold;
      if (b.at) b.at();
      if (b.fire && st.ev) fire(st.ev.i);
      st.beat = null;
    }
    function stepBeat(b, ms) {
      st.bt += ms;
      const p = clamp(st.bt / b.dur, 0, 1);
      Object.keys(b.fade || {}).forEach(k => { st.alpha[k] = b.a0[k] + (b.fade[k] - b.a0[k]) * p; });
      if (b.ball) {
        const to = typeof b.ball.to === 'string' ? ballHand(b.ball.to) : b.ball.to;
        st.ball.x = b.b0[0] + (to[0] - b.b0[0]) * p;
        st.ball.y = b.b0[1] + (to[1] - b.b0[1]) * p;
        st.ball.z = (b.ball.arc || 0) * 4 * p * (1 - p);
        st.ball.h = b.h0 + (b.h1 - b.h0) * p + (b.ball.arc || 0) * 0.9 * 4 * p * (1 - p);
      }
      return p >= 1;
    }
    // Footwork: each player accelerates toward his target (26 ft/s2), never past his top speed (a sprint is 24 ft/s,
    // a jog 11), eases off as he arrives, and steps around a teammate or opponent in his way.
    const ACC = 36, BRAKE = 36;
    function legs(ms) {
      const dt = ms / 1000, keys = Object.keys(st.tgt).filter(k => (st.alpha[k] || 0) > 0.01 || (st.beat && st.beat.fade && k in st.beat.fade));
      keys.forEach(k => {
        const p = st.pos[k], t = st.tgt[k];
        if (!p || !t) return;
        const v = st.vel[k] || (st.vel[k] = [0, 0]);
        const dx = t[0] - p[0], dy = t[1] - p[1], d = Math.hypot(dx, dy);
        const want = d < 0.08 ? 0 : Math.min(st.top[k] || 15, Math.sqrt(2 * BRAKE * d) * 0.92);
        const wx = d ? dx / d * want : 0, wy = d ? dy / d * want : 0;
        let ax = wx - v[0], ay = wy - v[1];
        const a = Math.hypot(ax, ay), lim = ACC * dt;
        if (a > lim) { ax *= lim / a; ay *= lim / a; }
        v[0] += ax; v[1] += ay;
        p[0] += v[0] * dt; p[1] += v[1] * dt;
        if (d < 0.08 && Math.hypot(v[0], v[1]) < 0.6) { v[0] = 0; v[1] = 0; }
      });
      // personal space: two bodies never share a spot
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = st.pos[keys[i]], b = st.pos[keys[j]];
        if (!a || !b) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.01;
        if (d >= 2.4) continue;
        const push = (2.4 - d) * 0.25, ux = dx / d, uy = dy / d;
        a[0] -= ux * push; a[1] -= uy * push; b[0] += ux * push; b[1] += uy * push;
      }
    }
    // off the ball: in a half-court set an offensive player who has stopped cuts, fades or relocates near his spot
    // every second or two (his man follows on his own, see displayPos)
    function moveOffBall(ms) {
      if (!st.off || !st.set || !st.form || st.flight) return;
      const busy = st.beat && st.beat.move ? st.beat.move : {};
      (st.on[st.off] || []).forEach(k => {
        if (k === st.holder || busy[k] || !st.form[k] || !st.pos[k]) return;
        const v = st.vel[k] || [0, 0];
        if (Math.hypot(v[0], v[1]) > 1.5 || Math.random() > ms / 1400) return;
        // near his spot, but never crowding the ball: inside 13 feet of the handler he gets out of the way (spacing)
        const f = st.form[k], bh = st.holder && sideOf(st.holder) === st.off ? st.pos[st.holder] : null;
        let t = [f[0] + rnd(-3.5, 3.5), f[1] + rnd(-4, 4)];
        if (bh) { const d = dist(t, bh) || 0.01; if (d < 13) t = [bh[0] + (t[0] - bh[0]) / d * 13, bh[1] + (t[1] - bh[1]) / d * 13]; }
        const right = attacksRight(st.off, st.per);
        st.tgt[k] = [clamp(t[0], right ? 49 : 1, right ? CW - 1 : 45), clamp(t[1], 1.5, 48.5)];
        st.top[k] = rnd(12, 19);
      });
    }
    // the beat waits for the players it needs where it needs them (a shooter on his spot), at most `wait` ms
    function arrived(b) {
      return (b.arrive || []).every(k => { const p = st.pos[k], t = st.tgt[k]; return !p || !t || Math.hypot(t[0] - p[0], t[1] - p[1]) < (b.near || 1.2); });
    }
    function ballHand(key) {
      const p = st.pos[key] || [47, 25];
      return [p[0] + (attacksRight(sideOf(key), st.per) ? HAND[0] : -HAND[0]), p[1] + HAND[1]];
    }
    function advance(ms) {
      let guard = 0;
      while (ms > 0 && guard++ < 50) {
        if (!st.beat) {
          if (!st.beats.length && st.holdAt != null && st.cur >= st.holdAt && st.cur < evs.length) return;   // a watch party: wait for the leader
          if (!st.beats.length && !nextEvent()) return;
          if (!st.beats.length) continue;
          beginBeat(st.beats.shift());
        }
        const b = st.beat;
        const left = b.dur - st.bt;
        const use = left > 0 ? Math.min(ms, left) : Math.min(ms, 50);
        st.evT += use; st.simT += use;
        moveOffBall(use);
        for (let r = use; r > 0; r -= 25) legs(Math.min(25, r));
        if (stepBeat(b, use) && (!b.arrive || arrived(b) || st.bt >= b.dur + (b.wait || 1600))) endBeat(b);
        ms -= use;
      }
    }
    function frame(now) {
      st.raf = 0;
      if (st.dead) return;
      if (!el.isConnected || !svg.isConnected) { destroy(); return; }
      const dt = Math.min(100, st.last ? now - st.last : 16);
      st.last = now;
      const S = window.SFX;
      if (st.replay) {
        replayStep(dt);
        if (S && S.ambient) S.ambient(0.2 + st.crowd * 0.6);
        st.raf = requestAnimationFrame(frame);
        return;
      }
      if (st.playing && !st.ended) advance(dt * st.speed);
      st.crowd = Math.max(clutchEv(st.ev) ? 0.45 : 0.06, (st.crowd || 0) - dt / 5000);
      if (S && S.ambient) S.ambient(st.playing && !st.ended ? 0.12 + st.crowd * 0.8 : 0);
      if (st.hl && r3 && st.simT >= st.hl.t + 1100) startReplay();
      render(dt);
      if ((st.playing && !st.ended) || st.tags.length) st.raf = requestAnimationFrame(frame);
      else st.last = 0;
    }
    // a replay: the last few seconds again at half speed from a low camera near the play; a tap ends it
    function startReplay() {
      const h = st.hl; st.hl = null;
      const frames = st.rec.filter(f => f.t >= h.t - 2800 && f.t <= h.t + 900);
      if (frames.length < 20 || !r3) return;
      st.lastReplay = st.simT;
      st.replay = { frames, i: 0, t: frames[0].t, info: { kind: h.kind, x: h.x, y: h.y, a0: (h.x > 47 ? Math.PI : 0) + (Math.random() < 0.5 ? 0.75 : -0.75) } };
      r3.snapCamera();
    }
    function endReplay() { st.replay = null; if (r3) r3.snapCamera(); st.last = 0; }
    function replayStep(dt) {
      const R = st.replay;
      R.t += dt * 0.5;
      while (R.i < R.frames.length - 1 && R.frames[R.i + 1].t <= R.t) R.i++;
      if (R.t > R.frames[R.frames.length - 1].t || !r3) { endReplay(); return; }
      r3.frame(Object.assign({}, R.frames[R.i], { replay: R.info, tags: [], zoom: null, cam: camPref }), dt * 0.5);
    }
    function wake() { if (!st.raf && !st.dead) { st.last = 0; st.raf = requestAnimationFrame(frame); } }

    // Plays every event up to the end of the current period at once; the break itself still shows.
    function skipQuarter() {
      if (st.ended) return;
      let j = st.ev && st.done <= st.ev.i ? st.ev.i : st.cur;
      // already at a quarter break: go on to the end of the next quarter
      if (evs[j] && evs[j].k === 'end' && st.ev && st.ev.i === j) { fire(j); j++; }
      let k = j;
      while (k < evs.length && evs[k].k !== 'end' && evs[k].k !== 'final') k++;
      if (k >= evs.length) k = evs.length - 1;
      jumpTo(k);
    }
    // plays every event before k at once and sets the floor for event k (a skip, or catching up with the leader)
    function jumpTo(k) {
      if (k > 0) fire(k - 1);
      st.beats = []; st.beat = null; st.flight = false; st.replay = null; st.hl = null; st.act = {};
      st.cur = k;
      const ev = evs[k];
      if (ev) {
        st.on = { home: ev.on.home.slice(), away: ev.on.away.slice() };
        Object.keys(info).forEach(key => {
          const on = st.on[info[key].side].indexOf(key) >= 0;
          st.alpha[key] = on ? 1 : 0;
          if (on && !st.pos[key]) st.pos[key] = [47 + rnd(-10, 10), rnd(10, 40)];
        });
        chips();
      }
      st.holder = null; st.ph = null; st.off = null; st.set = false; st.form = null;
      Object.keys(st.pos).forEach(k => { st.tgt[k] = st.pos[k].slice(); st.vel[k] = [0, 0]; });
      st.ball = { x: 47, y: 25, z: 0 };
      st.ev = null;
      wake();
    }

    // ---------- controls ----------
    function syncControls() {
      const b = $('.ct-play');
      if (!b) return;
      b.textContent = st.ended ? 'FINAL' : st.playing ? 'PAUSE' : 'PLAY';
      b.setAttribute('aria-label', st.ended ? 'Game over' : st.playing ? 'Pause' : 'Play');
      b.disabled = st.ended;
      $('.ct-skip').disabled = st.ended;
      el.querySelectorAll('.ct-spd').forEach(x => { x.classList.toggle('on', Number(x.getAttribute('data-speed')) === st.speed); x.disabled = st.ended; });
    }
    // opts.onControl(kind, value): a tap on the controls, so a watch party can do the same on the other phone
    const told = (k, v) => { if (typeof opts.onControl === 'function') { try { opts.onControl(k, v); } catch (e) { /* the page's problem */ } } };
    $('.ct-play').addEventListener('click', () => { st.playing = !st.playing; syncControls(); wake(); told(st.playing ? 'play' : 'pause'); });
    el.querySelectorAll('.ct-spd').forEach(b => b.addEventListener('click', () => { st.speed = Number(b.getAttribute('data-speed')) || 1; syncControls(); told('speed', st.speed); }));
    $('.ct-skip').addEventListener('click', () => { skipQuarter(); told('skip'); });
    $('.ct-pb').addEventListener('click', () => pnlShow(!st.pnl));
    $('.ct-pclose').addEventListener('click', () => pnlShow(false));
    const onKey = e => { if (e.key === 'Escape' && st.pnl && full) { e.preventDefault(); pnlShow(false); } };
    document.addEventListener('keydown', onKey);
    el.querySelectorAll('.ct-ptab').forEach(b => b.addEventListener('click', () => { st.tab = b.getAttribute('data-tab'); el.querySelectorAll('.ct-ptab').forEach(x => x.classList.toggle('on', x === b)); pnlDraw(); }));
    const sfxB = $('.ct-sfx');
    if (sfxB) sfxB.addEventListener('click', () => { window.SFX.set(!window.SFX.on); sfxB.classList.toggle('on', window.SFX.on); sfxB.textContent = window.SFX.on ? 'SOUND ON' : 'SOUND OFF'; });

    // ---------- the 3D view (js/court3d.js): TV camera, a camera behind the play, or the flat 2D court ----------
    const CAMKEY = 'a13-ct-cam', CAMS = ['auto', 'tv', 'end', '2d'], CAMLBL = { auto: 'AUTO CAM', tv: 'TV CAM', end: 'GAME CAM', '2d': '2D VIEW' };
    let camPref = (() => { try { const v = localStorage.getItem(CAMKEY); return CAMS.indexOf(v) >= 0 ? v : 'auto'; } catch (e) { return 'auto'; } })();
    let r3 = null, r3Loading = false;
    const can3d = () => !!(window.COURT3D && window.COURT3D.supported() && opts.three !== false);
    function syncCam() { const b = $('.ct-cam'); if (!b) return; b.hidden = !can3d(); b.textContent = CAMLBL[camPref]; }
    function cfg3() {
      const year = YEAR < 9999 ? YEAR : 0;
      const style = '.ct-apron{fill:#0b0b0d}.ct-plank{fill:#c08a4a}.ct-plank2{fill:#8a5c2a}.ct-seam{stroke:rgba(60,34,10,.45);stroke-width:.07;fill:none}.ct-ln{fill:none;stroke:rgba(255,255,255,.93);stroke-width:.2}.ct-edge{stroke-width:.34}.ct-dash{stroke-dasharray:.8 .6}.ct-paint{opacity:.82}.ct-mid-fill{opacity:.4}.ct-board,.ct-rim{display:none}.ct-end{font-family:Arial,sans-serif;font-weight:700;font-size:2.2px;letter-spacing:.5px;fill:#fff;opacity:.6;text-anchor:middle;dominant-baseline:central}';
      const fl = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${CW + 2 * M} ${CH + 2 * M}" width="2048" height="1147"><style>${style}</style>${floorSvg(id + 'g', kit.home.paint, kit.away.fill, abbr.home, abbr.away, year)}</svg>`;
      const tm = (opts.team || UI.team)(tl.home) || {};
      const src = (UI.logoSrc ? UI.logoSrc(tm) : tm.logo) || tm.logo || '';
      return { info, kit, floorSvg: fl, logoSrc: src, homeColors: tm.colors || [], onBounce: () => { if (st.speed <= 2 && st.playing && window.SFX) window.SFX.play('dribble'); } };
    }
    function start3d() {
      if (r3 || r3Loading || camPref === '2d' || !can3d()) return;
      r3Loading = true;
      // the 3D box (dark, 3D-sized) goes up at once, so the flat court never flashes while three.js loads
      const stage0 = $('.ct-stage');
      if (stage0) stage0.classList.add('ct-3d', 'ct-3d-wait');
      const back2d = () => { const s = $('.ct-stage'); if (s) s.classList.remove('ct-3d', 'ct-3d-wait'); };
      window.COURT3D.load().then(() => {
        r3Loading = false;
        if (st.dead || r3 || camPref === '2d') { if (!r3) back2d(); return; }
        const stage = $('.ct-stage');
        stage.classList.add('ct-3d');
        try { r3 = window.COURT3D.create(stage, cfg3()); }
        catch (e) { console.warn('[court] 3D failed, staying in 2D', e); back2d(); r3 = null; return; }
        r3.resize();
        render(0); wake();
        stage.classList.remove('ct-3d-wait');
      }).catch(e => { r3Loading = false; back2d(); console.warn('[court] 3D not available', e); });
    }
    function stop3d(broken) {
      if (r3) { try { r3.destroy(); } catch (e) { /* gone */ } r3 = null; }
      st.replay = null; st.hl = null; st.rec = [];
      $('.ct-stage').classList.remove('ct-3d');
      if (broken) { camPref = '2d'; syncCam(); }
      build(); wake();
    }
    const camBtn = $('.ct-cam');
    if (camBtn) camBtn.addEventListener('click', () => {
      camPref = CAMS[(CAMS.indexOf(camPref) + 1) % CAMS.length];
      try { localStorage.setItem(CAMKEY, camPref); } catch (e) { /* private mode */ }
      syncCam();
      if (camPref === '2d') stop3d(false);
      else if (!r3) start3d();
      else { r3.snapCamera(); wake(); }
    });
    $('.ct-stage').addEventListener('click', e => {
      if (!r3) return;
      if (st.replay) { endReplay(); wake(); return; }
      const key = r3.pick(e.clientX, e.clientY);
      if (key) select(key);
    });

    function onResize() {
      const want = narrow() ? 'v' : 'h';
      if (want !== st.mode) { build(); wake(); }
    }
    window.addEventListener('resize', onResize);
    $('.ct-fs').addEventListener('click', () => { full = !full; try { localStorage.setItem(FSKEY, full ? '1' : '0'); } catch (e) { /* private mode */ } applyFull(); build(); wake(); });

    function destroy() {
      st.dead = true;
      if (r3) { r3.destroy(); r3 = null; }
      if (window.SFX && window.SFX.ambient) window.SFX.ambient(0);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('ct-full-on');
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      clearTimeout(st.bannerT);
      window.removeEventListener('resize', fitH);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', fitH);
      window.removeEventListener('resize', onResize);
    }

    // ---------- start ----------
    const first = evs[start] || evs[evs.length - 1];
    st.on = { home: first.on.home.slice(), away: first.on.away.slice() };
    st.on.home.concat(st.on.away).forEach(key => { st.alpha[key] = 1; });
    if (start > 0 && evs[start]) {
      // joining a game already under way: the team with the ball sets up near half court
      st.per = evs[start].per;
      const O = SIDES.find(s => s === evs[start].side) || 'home';
      const off = offenseSet(O, st.per);
      st.holder = ordered(st.on[O])[0];
      Object.assign(st.pos, off, defenseSet(O, st.per, off, st.holder));
      st.off = O; st.set = true; st.form = Object.assign({}, st.pos);
      if (evs[start].k === 'pf') { st.off = other(O); }
      drawLine(evs[start - 1]);
    } else {
      // tip-off: both teams near the center circle
      SIDES.forEach(side => ordered(st.on[side]).forEach((key, i) => { st.pos[key] = at(side, 'Q1', 47 + 8 + rnd(0, 3), [11, 19, 25, 31, 39][i]); }));
    }
    if (start >= evs.length) { st.ended = true; st.per = evs[evs.length - 1].per; }
    Object.keys(st.pos).forEach(k => { st.tgt[k] = st.pos[k].slice(); st.vel[k] = [0, 0]; });
    applyFull();  card();
    build();
    syncCam();
    start3d();
    drawScore();
    chips();
    syncControls();
    if (st.ended) drawLine(evs[evs.length - 1]);
    wake();

    return {
      destroy,
      play() { st.playing = true; syncControls(); wake(); },
      pause() { st.playing = false; syncControls(); },
      setSpeed(s) { st.speed = s; syncControls(); },
      skipQuarter,
      exitFull() { if (!full) return; full = false; applyFull(); build(); wake(); },
      seek(i) { i = clamp(i | 0, 0, evs.length - 1); if (st.ended || i <= st.cur) return; jumpTo(i); },   // catch up to event i
      hold(i) { st.holdAt = i == null ? null : i; wake(); },                                              // never run ahead of event i
      state: () => ({ cur: st.cur, done: st.done, playing: st.playing, speed: st.speed, ended: st.ended }),
      done: () => st.done,
      probe: () => ({ t: st.simT, acts: Object.keys(st.act).map(k => [k, st.act[k].k, (st.simT - st.act[k].t0) / st.act[k].d]).filter(a => a[2] >= 0 && a[2] < 1), pos: Object.keys(st.pos).filter(k => (st.alpha[k] || 0) > 0.5).map(k => [k, st.pos[k][0], st.pos[k][1]]) }),   // for tools: where everyone is
      timeline: tl
    };
  };

  // =====================================================================
  // Replay page: #/watch/<gameId>, for a finished game whose play-by-play is still kept
  // =====================================================================
  const P = UI.pages = UI.pages || {};
  P.watch = function (app, id) {
    const g = UI.game ? UI.game(id || '') : null;
    const r = g && g.result;
    if (!g || !r || !available(r)) {
      app.innerHTML = UI.empty(g ? 'NO PLAY-BY-PLAY' : 'GAME NOT FOUND',
        g ? 'Play-by-play is kept for the most recent games only, so this one cannot be watched.' : 'There is no game with the id ' + esc(id) + ' in this season.',
        `<div class="row-btns">${g ? `<a class="btn" href="#/game/${esc(g.id)}">BOX SCORE</a>` : ''}<a class="btn" href="#/season">SEASON</a></div>`);
      return;
    }
    const dayLbl = (g.date && UI.dateLabel ? UI.dateLabel(g.date).toUpperCase() : '') + (g.playoff ? ' | PLAYOFFS GAME ' + (g.gameNum || '') : '');
    app.innerHTML = UI.header('COURT VIEW', esc(UI.teamName(g.away)) + ' at ' + esc(UI.teamName(g.home)) + (dayLbl ? ' | ' + esc(dayLbl) : '')) +
      `<div class="ct-host" id="ctHost"></div>
      <div class="row-btns center"><a class="btn" href="#/game/${esc(g.id)}">BOX SCORE</a><a class="btn" href="#/season">BACK TO SEASON</a></div>`;
    const ctl = COURT.mount(document.getElementById('ctHost'), { game: r, start: 0, autoplay: true });
    if (ctl && UI.extras && typeof UI.extras.onLeave === 'function') UI.extras.onLeave(() => ctl.destroy());
  };
  P.watch.hidden = true;
})(typeof window !== 'undefined' ? window : this);
