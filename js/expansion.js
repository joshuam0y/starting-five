// League expansion: 30 to 32 teams (window.EXPANSION). The Seattle SuperSonics come back and Las Vegas
// gets a new team, the Neon. js/future.js decides when; the commissioner page can also do it right away.
//
//   EXPANSION.addTeams(state, opts) -> { ok, year, teams, picks, pending, reason }
//     opts.year: the first season the new teams play (default: the next season). In the offseason after
//     the draft (phases resign, freeAgency, training) the teams join right away: realignment, coaches,
//     draft picks and the expansion draft. Earlier (the season, the lottery or the draft itself) the
//     expansion is stored as pending and happens right after that summer's draft (EXPANSION.applyPending,
//     called from js/league.js). Calling it again does nothing.
//   EXPANSION.applyPending(state): runs a pending expansion when its summer has come (safe to call any time).
//   EXPANSION.isExpanded(state), EXPANSION.TEAMS, EXPANSION.ALIGN.
//
// Rules, modeled on the 1995 and 2004 expansions:
//   - Realignment to 16 and 16: Seattle joins the Northwest, Las Vegas the Pacific, Phoenix moves to the
//     Southwest and Memphis to the East (Southeast).
//   - Expansion draft: every team protects its 8 most valuable players under contract for the new season
//     (this summer's draft picks, two-way and overseas players are exempt), loses at most one player, and
//     the new teams alternate picks until each has 14.
//   - Their first draft: neither new team can pick higher than fifth (like the Bobcats, who could not win
//     the 2004 lottery), see js/draft.js lottery. They own all their picks from that draft on.
(function (root) {
  'use strict';
  var W = root || {};
  function mod(n) { return W[n] || null; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var TEAMS = [
    { abbr: 'SEA', city: 'Seattle', name: 'SuperSonics', conf: 'West', div: 'Northwest', colors: ['#00653A', '#FFC200'] },
    { abbr: 'LVG', city: 'Las Vegas', name: 'Neon', conf: 'West', div: 'Pacific', colors: ['#E4187B', '#16161D'] }
  ];
  var ALIGN = { PHX: { conf: 'West', div: 'Southwest' }, MEM: { conf: 'East', div: 'Southeast' } };
  // Real expansions for leagues that start before they happened (js/league.js runs them after that summer's draft).
  // 2004: the Charlotte Bobcats, and the league goes to six divisions (New Orleans moves to the West).
  var HISTORIC = {
    hornetsheat: {
      after: 1988, year: 1989,
      teams: [{ abbr: 'NOH', city: 'Charlotte', name: 'Hornets', conf: 'East', div: 'Atlantic', colors: ['#00778B', '#5A2D81'] }, { abbr: 'MIA', city: 'Miami', name: 'Heat', conf: 'West', div: 'Midwest', colors: ['#98002E', '#F9A01B'] }],
      align: {},
      headline: 'The Charlotte Hornets and Miami Heat join the NBA',
      body: 'Two expansion teams start play in 1988-89 and the league goes to 25 teams. Each took players in the expansion draft.',
      tx: 'The NBA expands to 25 teams: the Charlotte Hornets and the Miami Heat join for 1988-89.'
    },
    wolvesmagic: {
      after: 1989, year: 1990,
      teams: [{ abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves', conf: 'West', div: 'Midwest', colors: ['#236192', '#00843D'] }, { abbr: 'ORL', city: 'Orlando', name: 'Magic', conf: 'East', div: 'Central', colors: ['#0077C0', '#111111'] }],
      align: {},
      headline: 'The Minnesota Timberwolves and Orlando Magic join the NBA',
      body: 'Two more expansion teams start play in 1989-90 and the league goes to 27 teams.',
      tx: 'The NBA expands to 27 teams: the Minnesota Timberwolves and the Orlando Magic join for 1989-90.'
    },
    raptorsgrizzlies: {
      after: 1995, year: 1996,
      teams: [{ abbr: 'TOR', city: 'Toronto', name: 'Raptors', conf: 'East', div: 'Central', colors: ['#CE1141', '#000000'] }, { abbr: 'MEM', city: 'Vancouver', name: 'Grizzlies', conf: 'West', div: 'Midwest', colors: ['#00B2A9', '#E43C40'] }],
      align: {},
      headline: 'The Toronto Raptors and Vancouver Grizzlies join the NBA',
      body: 'The NBA goes to Canada: two expansion teams start play in 1995-96 and the league goes to 29 teams.',
      tx: 'The NBA expands to 29 teams: the Toronto Raptors and the Vancouver Grizzlies join for 1995-96.'
    },
    bobcats: {
      after: 2004, year: 2005,
      teams: [{ abbr: 'CHA', city: 'Charlotte', name: 'Bobcats', conf: 'East', div: 'Southeast', colors: ['#F26532', '#0C2340'] }],
      align: { BOS: ['East', 'Atlantic'], BKN: ['East', 'Atlantic'], NYK: ['East', 'Atlantic'], PHI: ['East', 'Atlantic'], TOR: ['East', 'Atlantic'],
        CHI: ['East', 'Central'], CLE: ['East', 'Central'], DET: ['East', 'Central'], IND: ['East', 'Central'], MIL: ['East', 'Central'],
        ATL: ['East', 'Southeast'], MIA: ['East', 'Southeast'], ORL: ['East', 'Southeast'], WAS: ['East', 'Southeast'],
        DEN: ['West', 'Northwest'], MIN: ['West', 'Northwest'], POR: ['West', 'Northwest'], SEA: ['West', 'Northwest'], OKC: ['West', 'Northwest'], UTA: ['West', 'Northwest'],
        GSW: ['West', 'Pacific'], LAC: ['West', 'Pacific'], LAL: ['West', 'Pacific'], PHX: ['West', 'Pacific'], SAC: ['West', 'Pacific'],
        DAL: ['West', 'Southwest'], HOU: ['West', 'Southwest'], MEM: ['West', 'Southwest'], NOH: ['West', 'Southwest'], SAS: ['West', 'Southwest'] },
      headline: 'The Charlotte Bobcats join the NBA',
      body: 'Charlotte gets a team back for the 2004-05 season and the league splits into six divisions; New Orleans moves to the West. The Bobcats took 14 players in the expansion draft.',
      tx: 'The NBA expands to 30 teams: the Charlotte Bobcats join for 2004-05.'
    }
  };
  var PROTECTN = 8, ROSTERN = 14, PROTECT = PROTECTN, ROSTER = ROSTERN, CAP_PICK = 5;
  var OFFSEASON_AFTER_DRAFT = { resign: 1, freeAgency: 1, training: 1 };

  function isExpanded(state) { return !!(state && state.teams && TEAMS.every(function (t) { return state.teams[t.abbr]; })); }
  function addTx(state, text, ids) {
    (state.transactions = state.transactions || []).push({ year: state.year, day: state.day || 0, type: 'expansion', text: text, ids: ids || [] });
  }
  function addNews(state, headline, body, ids) {
    state.news = state.news || [];
    state.news.unshift({ year: state.year, day: state.day || 0, headline: headline, body: body || '', ids: ids || [] });
    if (state.news.length > 300) state.news.length = 300;
  }
  function fullName(state, abbr) { var t = state.teams[abbr]; return t ? t.city + ' ' + t.name : abbr; }
  function salaryIn(p, year) {
    var c = p.contract, s = c && Array.isArray(c.salaries) ? c.salaries.filter(function (x) { return x.year === year; })[0] : null;
    return s ? s.amount : 0;
  }
  function capOf(year) {
    var C = mod('CBA');
    try { var r = C && C.rules ? C.rules(year) : null; if (r && r.cap) return r.cap; } catch (e) { /* default */ }
    return 58044000 * Math.pow(1.045, Math.max(0, year - 2013));
  }
  // How much a team wants to keep (or take) a player: overall, youth, and a bad contract counts against him
  function value(p, year) {
    var age = p.age || 27, sal = salaryIn(p, year) / capOf(year);
    var youth = clamp(26 - age, -6, 5) * 0.9;
    var deal = sal > 0.12 && p.ovr < 78 ? -(sal - 0.12) * 40 : 0;
    return (p.ovr || 60) + youth + deal;
  }
  // The team that can lose him: his team when he is under contract for the new season, or the team that
  // holds his free agent rights this summer (free agents could be taken in the real expansion drafts too)
  function ownerOf(state, p, Y) {
    if (!p || p.retired || p.stashedUntil) return null;
    if (p.draft && +p.draft.year === Y - 1) return null;              // this summer's draft picks are exempt
    var c = p.contract;
    if (state.teams[p.team]) return c && !c.twoWay && Array.isArray(c.salaries) && c.salaries.some(function (s) { return s.year >= Y; }) ? p.team : null;
    var rt = p.team === 'FA' && state.fa && state.fa.year === Y && state.fa.rights ? state.fa.rights[p.id] : null;
    return rt && !rt.renounced && !rt.letGo && state.teams[rt.team] ? rt.team : null;
  }

  function makeTeam(t0, Y) {
    var t = JSON.parse(JSON.stringify(t0));
    t.logo = null; t.logoNoRef = false; t.expansion = Y;
    t.picks = []; t.direction = 'rebuild'; t.strategy = { pace: 50, three: 50, defense: 'man', crash: 50 };
    t.rotation = null; t.budget = { coaching: 50, facilities: 50, health: 50, scouting: 50 };
    t.finances = { revenue: 0, expenses: 0, ticketPrice: 50 };
    t.coach = null;
    return t;
  }

  // opt (the old leagues, js/expansion.js applyMoves): protect, roster (players each new team takes) and perTeam (most a team can lose)
  function expansionDraft(state, Y, rng, NEW, opt) {
    NEW = NEW || TEAMS; opt = opt || {};
    var PROTECT = opt.protect || PROTECTN, ROSTER = opt.roster || ROSTERN, PER = opt.perTeam || 1;
    var news = [], picks = [], byTeam = {}, protectedBy = {};
    Object.keys(state.teams).forEach(function (a) { if (NEW.every(function (t) { return t.abbr !== a; })) byTeam[a] = []; });
    var owner = {};
    Object.keys(state.players).forEach(function (id) {
      var p = state.players[id], a = ownerOf(state, p, Y);
      if (a && byTeam[a]) { byTeam[a].push(p); owner[id] = a; }
    });
    var pool = [];
    Object.keys(byTeam).forEach(function (a) {
      var list = byTeam[a].sort(function (x, y) { return value(y, Y) - value(x, Y); });
      protectedBy[a] = list.slice(0, PROTECT);
      list.slice(PROTECT).forEach(function (p) { pool.push(p); });
    });
    var order = NEW.map(function (t) { return t.abbr; }), lost = {};
    if (order.length === 2 && rng() < 0.5) order.reverse();
    for (var round = 0; round < ROSTER; round++) {
      order.forEach(function (abbr) {
        var cand = pool.filter(function (p) { return (lost[owner[p.id]] || 0) < PER; });
        if (!cand.length) return;
        // a little need: no more than five of one position group
        var have = picks.filter(function (x) { return x.to === abbr; }).map(function (x) { return x.p; });
        var groupOf = function (p) { var s = String(p.pos || 'SF').split(/[-\/]/)[0]; return s === 'PG' || s === 'SG' ? 'G' : s === 'C' ? 'C' : 'F'; };
        cand.sort(function (x, y) {
          var nx = have.filter(function (h) { return groupOf(h) === groupOf(x); }).length >= 5 ? 6 : 0;
          var ny = have.filter(function (h) { return groupOf(h) === groupOf(y); }).length >= 5 ? 6 : 0;
          return (value(y, Y) - ny) - (value(x, Y) - nx);
        });
        var p = cand[0], from = owner[p.id];
        lost[from] = (lost[from] || 0) + 1;
        pool.splice(pool.indexOf(p), 1);
        if (state.teams[from] && Array.isArray(state.teams[from].rotation)) state.teams[from].rotation = state.teams[from].rotation.filter(function (id) { return id !== p.id; });
        if (p.team === 'FA') {
          // a free agent: his rights (Bird rights too) move to the new team
          state.fa.rights[p.id].team = abbr;
          state.events = (state.events || []).filter(function (e) { return !(e && e.type === 'contractDecision' && e.playerId === p.id); });
        } else { p.lastTeam = from; p.team = abbr; p.yearsWithTeam = 0; }
        if (p.mood != null) p.mood = Math.max(40, p.mood - 5);
        picks.push({ p: p, from: from, to: abbr, n: picks.length + 1 });
        addTx(state, fullName(state, abbr) + ' select ' + p.name + ' from ' + fullName(state, from) + (p.team === 'FA' ? ' (free agent rights)' : '') + ' in the expansion draft.', [p.id]);
        if (from === state.userTeam) news.push(p);
      });
    }
    if (state.userTeam && protectedBy[state.userTeam]) {
      var mine = protectedBy[state.userTeam];
      addTx(state, fullName(state, state.userTeam) + ' protect ' + mine.map(function (p) { return p.name; }).join(', ') + ' in the expansion draft.', mine.map(function (p) { return p.id; }));
    }
    news.forEach(function (p) {
      var to = picks.filter(function (x) { return x.p === p; })[0].to;
      addNews(state, fullName(state, to) + ' take ' + p.name + ' in the expansion draft',
        'Your front office protected ' + PROTECT + ' players. ' + p.name + ' was left unprotected and ' + (p.team === 'FA' ? 'his free agent rights go to the ' : 'joins the ') + fullName(state, to) + '.', [p.id]);
      var FA = mod('FA');
      if (FA && FA.userLog) { try { FA.userLog(state, 'Lost ' + p.name + ' to the ' + fullName(state, to) + ' in the expansion draft', [p.id]); } catch (e) { /* log only */ } }
    });
    return picks;
  }

  function seeded(state, salt) {
    var s = 0, str = String((state && state.rngSeed) || 7) + ':' + salt;
    for (var i = 0; i < str.length; i++) s = (Math.imul(31, s) + str.charCodeAt(i)) | 0;
    return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // A real expansion from HISTORIC (key), in the summer before its first season
  function applyHistoric(state, key) {
    var H = HISTORIC[key];
    if (!H || !state || !state.teams || H.teams.every(function (t) { return state.teams[t.abbr]; })) return null;
    var Y = H.year;
    H.teams.forEach(function (t0) { state.teams[t0.abbr] = makeTeam(t0, Y); });
    Object.keys(H.align).forEach(function (a) { var t = state.teams[a]; if (t) { t.conf = H.align[a][0]; t.div = H.align[a][1]; } });
    var C = mod('COACH');
    if (C && C.init) { try { C.init(state); } catch (e) { /* coaches are cosmetic */ } }
    var D = mod('DRAFT');
    if (D && D.ensurePicks) D.ensurePicks(state, 7, Y);
    var picks = expansionDraft(state, Y, seeded(state, key + Y), H.teams);
    state.historic = state.historic || {};
    state.historic[key] = Y;
    state.expansion = state.expansion || {};
    state.expansion.capDraft = Y; state.expansion.capPick = CAP_PICK; state.expansion.capTeams = H.teams.map(function (t) { return t.abbr; });
    addNews(state, H.headline, H.body, []);
    addTx(state, H.tx, []);
    return picks;
  }

  // The real changes for season Y (data/historic-moves.js): teams that move or rename, realignment, teams that fold
  // (their players become free agents) and teams that join (they build from an expansion draft). Runs in the summer
  // before Y for an Association that opened earlier. Returns the number of changes, or 0.
  function applyMoves(state, Y) {
    var M = root && root.HISTORIC_MOVES && root.HISTORIC_MOVES[Y];
    if (!M || !state || !state.teams) return 0;
    state.historic = state.historic || {};
    if (state.historic['m' + Y]) return 0;
    state.historic['m' + Y] = Y;
    var n = 0, label = (Y - 1) + '-' + String(Y).slice(2);
    Object.keys(M.rename || {}).forEach(function (a) {
      var t = state.teams[a], r = M.rename[a];
      if (!t) return;
      t.city = r.city; t.name = r.name; if (r.colors && r.colors.length) t.colors = r.colors.slice();
      addTx(state, 'The ' + r.from + ' become the ' + (r.city + ' ' + r.name).trim() + '.', []); n++;
    });
    Object.keys(M.align || {}).forEach(function (a) { var t = state.teams[a]; if (t) { t.conf = M.align[a][0]; t.div = M.align[a][1]; } });
    // folds: players to the free agents, picks gone, the coach out of work
    (M.fold || []).forEach(function (a) {
      var t = state.teams[a];
      if (!t) return;
      if (a === state.userTeam) { addNews(state, 'The league keeps your franchise alive', 'The ' + fullName(state, a) + ' were due to fold for ' + label + ', but stay in the league.', []); return; }
      var name = fullName(state, a);
      Object.keys(state.players).forEach(function (id) {
        var p = state.players[id];
        if (p.team !== a) return;
        p.lastTeam = a; p.team = 'FA'; p.contract = { salaries: [], option: null, options: [], rookie: false, twoWay: false, signedYear: null }; p.yearsWithTeam = 0;
        if (state.fa && state.fa.rights) delete state.fa.rights[id];
        state.events = (state.events || []).filter(function (e) { return !(e && e.playerId === id); });
      });
      if (state.fa && state.fa.rights) Object.keys(state.fa.rights).forEach(function (id) { var x = state.fa.rights[id]; if (x && x.team === a) delete state.fa.rights[id]; });
      Object.keys(state.teams).forEach(function (b) { state.teams[b].picks = (state.teams[b].picks || []).filter(function (pk) { return pk.original !== a; }); });
      Object.keys(state.coaches || {}).forEach(function (id) { var c = state.coaches[id]; if (c && c.team === a) c.team = null; });
      delete state.teams[a];
      addTx(state, 'The ' + name + ' fold. Their players are free agents.', []); n++;
    });
    var NEW = (M.add || []).filter(function (t0) { return !state.teams[t0.abbr]; });
    if (NEW.length) {
      NEW.forEach(function (t0) { state.teams[t0.abbr] = makeTeam(t0, Y); });
      var C = mod('COACH');
      if (C && C.init) { try { C.init(state); } catch (e) { /* coaches are cosmetic */ } }
      var D = mod('DRAFT');
      if (D && D.ensurePicks) D.ensurePicks(state, 7, Y);
      var have = Object.keys(state.teams).length - NEW.length;
      var roster = Y < 1960 ? 8 : Y < 1970 ? 9 : 11;
      expansionDraft(state, Y, seeded(state, 'moves' + Y), NEW, { protect: Y < 1960 ? 5 : 6, roster: roster, perTeam: Math.max(1, Math.ceil(roster * NEW.length / Math.max(1, have))) });
      state.expansion = state.expansion || {};
      state.expansion.capDraft = Y; state.expansion.capPick = CAP_PICK; state.expansion.capTeams = NEW.map(function (t) { return t.abbr; });
      n += NEW.length;
    }
    if (n) { addNews(state, M.headline, M.body, []); addTx(state, M.tx, []); }
    return n || 1;
  }

  // The expansion itself (the new teams' first season is Y)
  function apply(state, Y) {
    TEAMS.forEach(function (t0) { state.teams[t0.abbr] = makeTeam(t0, Y); });
    Object.keys(ALIGN).forEach(function (a) { var t = state.teams[a]; if (t) { t.conf = ALIGN[a].conf; t.div = ALIGN[a].div; } });
    var C = mod('COACH');
    if (C && C.init) { try { C.init(state); } catch (e) { /* coaches are cosmetic */ } }
    var D = mod('DRAFT');
    if (D && D.ensurePicks) D.ensurePicks(state, 7, Y);
    var picks = expansionDraft(state, Y, seeded(state, 'expansion' + Y));
    state.expansion = state.expansion || {};
    state.expansion.year = Y; state.expansion.pending = null;
    state.expansion.teams = TEAMS.map(function (t) { return t.abbr; });
    state.expansion.capDraft = Y;      // their first draft (the summer of season Y): no pick above CAP_PICK
    state.expansion.capPick = CAP_PICK; state.expansion.capTeams = TEAMS.map(function (t) { return t.abbr; });
    state.expansion.draft = picks.map(function (x) { return { id: x.p.id, from: x.from, to: x.to, n: x.n }; });
    var label = (Y - 1) + '-' + String(Y).slice(2);
    addNews(state, 'The NBA expands to 32 teams',
      'The Seattle SuperSonics return and the Las Vegas Neon join the league for the ' + label + ' season. Memphis moves to the East and Phoenix to the Southwest. ' +
      'Each new team took ' + ROSTER + ' players in the expansion draft.', []);
    addTx(state, 'The NBA expands to 32 teams: Seattle SuperSonics and Las Vegas Neon join for ' + label + '.', []);
    return picks;
  }

  function addTeams(state, opts) {
    opts = opts || {};
    if (!state || !state.teams) return { ok: false, reason: 'No league' };
    if (isExpanded(state)) return { ok: true, already: true, year: state.expansion && state.expansion.year, teams: TEAMS.map(function (t) { return t.abbr; }) };
    var Y = opts.year != null ? +opts.year : state.year + 1;
    if (!(Y > state.year)) Y = state.year + 1;
    state.expansion = state.expansion || {};
    // before this summer's draft is done the new teams wait: they join right after it
    if (!OFFSEASON_AFTER_DRAFT[state.phase] || Y > state.year + 1) {
      state.expansion.pending = Y;
      return { ok: true, pending: Y, year: Y };
    }
    var picks = apply(state, Y);
    return { ok: true, year: Y, teams: TEAMS.map(function (t) { return t.abbr; }), picks: picks.length };
  }
  function applyPending(state) {
    var Y = state && state.expansion && state.expansion.pending;
    if (!Y || isExpanded(state)) return false;
    if (!OFFSEASON_AFTER_DRAFT[state.phase] || Y !== state.year + 1) return false;
    apply(state, Y);
    return true;
  }

  // ---------- Expansion mode: the user's own new team from opening night ----------
  // customTeam(state, { abbr, city, name, colors, conf }) adds the team to a league that was just built, makes it the
  // user's, and opens the expansion draft (state.expansionDraft): every other team protects its PROTECTN most valuable
  // players and can lose at most one; the user makes ROSTERN picks (draftPick, draftAuto), then draftFinish rebuilds
  // the season's schedule with the new team in it (LEAGUE.restartSeason). Their first draft is capped like 2004's.
  function customTeam(state, t0) {
    if (!state || !state.teams || !t0 || !t0.abbr) return { ok: false, reason: 'No team' };
    var abbr = String(t0.abbr).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (abbr.length !== 3) return { ok: false, reason: 'The short name needs three letters.' };
    if (state.teams[abbr] || abbr === 'FA' || abbr === 'DRAFT') return { ok: false, reason: abbr + ' is already taken. Pick another short name.' };
    var Y = state.year, conf = t0.conf === 'East' ? 'East' : 'West';
    var divs = {};
    Object.keys(state.teams).forEach(function (a) { var t = state.teams[a]; if (t.conf === conf) divs[t.div] = (divs[t.div] || 0) + 1; });
    var div = Object.keys(divs).sort(function (x, y) { return divs[x] - divs[y] || (x < y ? -1 : 1); })[0] || conf;
    var colors = (t0.colors || []).filter(function (c) { return /^#[0-9a-fA-F]{6}$/.test(c); });
    var t = makeTeam({ abbr: abbr, city: String(t0.city || 'New').slice(0, 24), name: String(t0.name || 'Expansion').slice(0, 24), conf: conf, div: div, colors: colors.length ? colors.slice(0, 2) : ['#d4af37', '#111111'] }, Y);
    t.custom = true;
    state.teams[abbr] = t;
    var C = mod('COACH'); if (C && C.init) { try { C.init(state); } catch (e) { /* coaches are cosmetic */ } }
    var D = mod('DRAFT'); if (D && D.ensurePicks) { try { D.ensurePicks(state, 7, Y); } catch (e) { /* picks come with the next draft */ } }
    state.userTeam = abbr;
    // the pool: what every other team leaves unprotected
    var owner = {}, byTeam = {}, pool = [], prot = {};
    Object.keys(state.teams).forEach(function (a) { if (a !== abbr) byTeam[a] = []; });
    Object.keys(state.players).forEach(function (id) { var p = state.players[id], a = ownerOf(state, p, Y); if (a && byTeam[a]) { byTeam[a].push(p); owner[id] = a; } });
    Object.keys(byTeam).forEach(function (a) {
      var list = byTeam[a].sort(function (x, y) { return value(y, Y) - value(x, Y); });
      prot[a] = list.slice(0, PROTECTN).map(function (p) { return p.id; });
      list.slice(PROTECTN).forEach(function (p) { pool.push(p.id); });
    });
    state.expansionDraft = { team: abbr, year: Y, need: ROSTERN, picks: [], pool: pool, owner: owner, protect: PROTECTN };
    state.expansion = state.expansion || {};
    state.expansion.capDraft = Y; state.expansion.capPick = CAP_PICK; state.expansion.capTeams = [abbr];
    return { ok: true, abbr: abbr, pool: pool.length };
  }
  // the players the user can still take: unprotected, and from a team that has not lost one yet
  function draftPool(state) {
    var d = state && state.expansionDraft; if (!d) return [];
    var lost = {}; d.picks.forEach(function (x) { lost[x.from] = 1; });
    return d.pool.filter(function (id) { var p = state.players[id]; return p && p.team === d.owner[id] && !lost[d.owner[id]]; })
      .map(function (id) { return state.players[id]; });
  }
  function draftPick(state, id) {
    var d = state && state.expansionDraft; if (!d) return { ok: false, reason: 'No expansion draft' };
    if (d.picks.length >= d.need) return { ok: false, reason: 'Your roster is full.' };
    var p = state.players[id];
    if (!p || !draftPool(state).some(function (q) { return q.id === id; })) return { ok: false, reason: 'That player is not available.' };
    var from = d.owner[id];
    if (state.teams[from] && Array.isArray(state.teams[from].rotation)) state.teams[from].rotation = state.teams[from].rotation.filter(function (x) { return x !== id; });
    p.lastTeam = from; p.team = d.team; p.yearsWithTeam = 0;
    if (p.mood != null) p.mood = Math.max(40, p.mood - 5);
    d.picks.push({ id: id, from: from, n: d.picks.length + 1 });
    addTx(state, fullName(state, d.team) + ' select ' + p.name + ' from ' + fullName(state, from) + ' in the expansion draft.', [id]);
    return { ok: true, left: d.need - d.picks.length };
  }
  // the rest picked for the user: the best value left, no more than five of one position group
  function draftAuto(state) {
    var d = state && state.expansionDraft; if (!d) return 0;
    var n = 0, groupOf = function (p) { var g = String(p.pos || 'SF').split(/[-\/]/)[0]; return g === 'PG' || g === 'SG' ? 'G' : g === 'C' ? 'C' : 'F'; };
    while (d.picks.length < d.need) {
      var have = d.picks.map(function (x) { return state.players[x.id]; }).filter(Boolean);
      var cand = draftPool(state).sort(function (x, y) {
        var nx = have.filter(function (h) { return groupOf(h) === groupOf(x); }).length >= 5 ? 6 : 0, ny = have.filter(function (h) { return groupOf(h) === groupOf(y); }).length >= 5 ? 6 : 0;
        return (value(y, d.year) - ny) - (value(x, d.year) - nx);
      });
      if (!cand.length || !draftPick(state, cand[0].id).ok) break;
      n++;
    }
    return n;
  }
  function draftFinish(state) {
    var d = state && state.expansionDraft; if (!d) return { ok: false };
    if (d.picks.length < d.need) draftAuto(state);
    var name = fullName(state, d.team), label = (d.year - 1) + '-' + String(d.year).slice(2);
    state.expansion.draft = d.picks.map(function (x) { return { id: x.id, from: x.from, to: d.team, n: x.n }; });
    delete state.expansionDraft;
    var L = mod('LEAGUE'); if (L && L.restartSeason) L.restartSeason(state);
    addNews(state, 'The ' + name + ' join the league', 'The ' + name + ' play their first season in ' + label + ' after taking ' + d.picks.length + ' players in the expansion draft.', []);
    addTx(state, 'The ' + name + ' join the league for ' + label + '.', []);
    return { ok: true };
  }

  var EXPANSION = { customTeam: customTeam, draftPool: draftPool, draftPick: draftPick, draftAuto: draftAuto, draftFinish: draftFinish, addTeams: addTeams, applyPending: applyPending, applyHistoric: applyHistoric, applyMoves: applyMoves, HISTORIC: HISTORIC, isExpanded: isExpanded, TEAMS: TEAMS, ALIGN: ALIGN, PROTECT: PROTECT, ROSTER: ROSTER, CAP_PICK: CAP_PICK };
  if (root) root.EXPANSION = EXPANSION;
  if (typeof module !== 'undefined' && module.exports) module.exports = EXPANSION;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
