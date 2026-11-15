// Jersey numbers (window.JERSEY): a real player wears his real number for that season and team (data/numbers.js,
// Basketball-Reference rosters); everyone else gets one when he joins a team: his old number if it is free there,
// else a common one. Never a teammate's number, never one the team has retired.
//   JERSEY.real(p, year, abbr)   the real number he wore (or null)
//   JERSEY.assign(state)         numbers for everyone on a team who needs one; counts the seasons he wore each one
//   JERSEY.longest(p, abbr)      the number he wore longest for that team (the one a team retires)
(function (root) {
  'use strict';
  function data() {
    if (typeof window !== 'undefined' && window.NUMBERS) return window.NUMBERS;
    if (root && root.NUMBERS) return root.NUMBERS;
    if (typeof require === 'function') { try { return require('../data/numbers.js'); } catch (e) { /* none */ } }
    return null;
  }
  const baseId = p => String((p && (p.base || p.id)) || '').split('@')[0];
  // NUMBERS[id] = [[year, abbr, number], ...] oldest first (a row when he changed team or number)
  function real(p, year, abbr) {
    const D = data(), rows = D && D[baseId(p)];
    if (!rows || !rows.length) return null;
    let best = null, any = null;
    for (const r of rows) {
      if (r[0] > (year || 9999)) break;
      any = r[2];
      if (!abbr || r[1] === abbr) best = r[2];
    }
    return best != null ? best : any;
  }
  // the real number for exactly this team and season (or the last one he wore for this team before it)
  function realHere(p, year, abbr) {
    const D = data(), rows = D && D[baseId(p)];
    if (!rows) return null;
    let n = null;
    for (const r of rows) { if (r[0] > year) break; if (r[1] === abbr) n = r[2]; else n = null; }
    return n;
  }
  // the numbers players really wore most (a generated player looks like one of them)
  const COMMON = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '17', '20', '21', '22', '23', '24', '25', '30', '31', '32', '33', '34', '35', '40', '41', '42', '44', '45', '50', '55'];
  function seedRand(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
  function retiredSet(state, abbr) {
    const book = state.history && state.history.retiredJerseys, out = new Set();
    ((book && book[abbr]) || []).forEach(x => { if (x.number != null && x.number !== '') out.add(String(x.number)); });
    return out;
  }
  function assign(state) {
    if (!state || !state.players || !state.teams) return 0;
    const year = +state.year || 2013, byTeam = {};
    Object.keys(state.players).forEach(id => { const p = state.players[id]; if (p && !p.retired && state.teams[p.team]) (byTeam[p.team] = byTeam[p.team] || []).push(p); });
    let n = 0;
    Object.keys(byTeam).forEach(abbr => {
      const ps = byTeam[abbr], used = new Set(), off = retiredSet(state, abbr);
      // keepers first: someone who already wears a number for this team keeps it
      // (a new season: a player who really changed numbers that year takes his new one)
      ps.forEach(p => { if (p.jerseyTeam === abbr && p.jerseyYear !== year) { const r = realHere(p, year, abbr); if (r != null && String(r) !== String(p.jersey)) p.jerseyTeam = null; } });
      ps.forEach(p => { if (p.jersey != null && p.jerseyTeam === abbr && !used.has(String(p.jersey)) && !off.has(String(p.jersey))) used.add(String(p.jersey)); else if (p.jerseyTeam === abbr) p.jerseyTeam = null; });
      // players with a real number choose first; the rest stay off numbers a teammate really wore
      const need = ps.filter(p => p.jerseyTeam !== abbr), realOf = new Map(need.map(p => [p, real(p, year, abbr)]));
      const reserved = new Set(need.map(p => realOf.get(p)).filter(v => v != null).map(String));
      need.sort((a, b) => (realOf.get(b) != null) - (realOf.get(a) != null) || (b.ovr || 0) - (a.ovr || 0)).forEach(p => {
        const free = v => v != null && v !== '' && !used.has(String(v)) && !off.has(String(v)) && (!reserved.has(String(v)) || String(v) === String(realOf.get(p)));
        const r = realOf.get(p), rnd = seedRand(baseId(p) + abbr);
        let num = free(r) ? r : free(p.jersey) ? p.jersey : null;
        for (let k = 0; num == null && k < 60; k++) { const c = COMMON[Math.floor(rnd() * COMMON.length)]; if (free(c)) num = c; }
        for (let k = 0; num == null && k < 100; k++) if (free(String(k))) num = String(k);
        for (let k = 0; num == null && k < 100; k++) if (!used.has(String(k)) && !off.has(String(k))) num = String(k);
        p.jersey = String(num); p.jerseyTeam = abbr; used.add(p.jersey); n++;
      });
      ps.forEach(p => { p.jerseyYear = year; });
      // the seasons each player wore each number for this team (a team retires the one he wore longest)
      ps.forEach(p => {
        p.worn = p.worn || {};
        const w = p.worn[abbr] = p.worn[abbr] || {};
        if (w._y !== year) { w._y = year; w[p.jersey] = (w[p.jersey] || 0) + 1; }
      });
    });
    return n;
  }
  function longest(p, abbr) {
    const w = p && p.worn && p.worn[abbr];
    if (w) { const k = Object.keys(w).filter(x => x !== '_y').sort((a, b) => w[b] - w[a])[0]; if (k != null) return k; }
    return p && p.jersey != null && p.jerseyTeam === abbr ? p.jersey : null;
  }
  const JERSEY = { real, assign, longest };
  root.JERSEY = JERSEY;
  if (typeof module !== 'undefined' && module.exports) module.exports = JERSEY;
})(typeof window !== 'undefined' ? window : this);
