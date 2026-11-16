// #/finances: the league's money, 2K style. Two views:
//   #/finances            every team for one season: payroll, cap room or how far over, the tax and apron lines,
//                         the tax bill and what each team already owes in the seasons after
//   #/finances/<ABBR>     one team's contracts by season: each player's salary year by year with player, team and
//                         early termination options, rookie deals, two-way deals and the last year marked, dead money,
//                         and the totals against the cap, tax and aprons of each season
// Everything comes from js/cba.js (rules, payroll, capStatus, luxuryTax, salaryYear) on the live league.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const esc = UI.esc;
  const CBA = () => window.CBA;
  const SPAN = 5;   // seasons shown: this one and the four after
  const M = n => (n ? '$' + (n / 1e6).toFixed(1) + 'M' : '-');
  const signed = n => (n >= 0 ? '+' : '-') + '$' + (Math.abs(n) / 1e6).toFixed(1) + 'M';
  const label = y => (y - 1) + '-' + String(y).slice(2);
  let sortKey = 'payroll', sortDir = -1;

  function salaryIn(p, y) {
    const s = p && p.contract && Array.isArray(p.contract.salaries) ? p.contract.salaries.find(x => x.year === y) : null;
    return s ? s.amount : 0;
  }
  function optionIn(p, y) {
    const o = p && p.contract && Array.isArray(p.contract.options) ? p.contract.options.find(x => x && x.year === y) : null;
    return o ? o.type : null;
  }
  const lastYear = p => { const s = p && p.contract && p.contract.salaries; return Array.isArray(s) && s.length ? s[s.length - 1].year : null; };
  const isTwoWay = p => !!(p && p.contract && p.contract.twoWay);

  function noLeague(app) {
    app.innerHTML = UI.empty('NO LEAGUE OPEN', 'Finances need a league. Start one or load a save.', '<a class="btn btn-gold" href="#/new">NEW LEAGUE</a><a class="btn" href="#/saves">SAVES</a>');
  }
  function yearsFrom(y0) { const out = []; for (let i = 0; i < SPAN; i++) out.push(y0 + i); return out; }
  function yearChips(sel, y0, href) {
    return `<div class="ch-chips ch-swipe fin-years" role="group" aria-label="Season">${yearsFrom(y0).map(y => `<a class="ch-chip${y === sel ? ' on' : ''}" href="${href(y)}">${label(y)}</a>`).join('')}</div>`;
  }
  function statusWord(st, two, y) {
    if (y && y < 1985) return ['NO CAP YET', 'fin-over'];   // the real league had no cap before 1984-85 (the game uses a scaled limit)
    if (y && y < 2002 && st.overTax) st = Object.assign({}, st, { overTax: false, overApron: false, overApron2: false });   // no tax before 2001-02
    if (st.overApron2) return ['2ND APRON', 'fin-a2'];
    if (st.overApron) return [two ? '1ST APRON' : 'APRON', 'fin-a1'];
    if (st.overTax) return ['TAX', 'fin-tax'];
    if (st.overCap) return ['OVER CAP', 'fin-over'];
    if (st.belowMinimum) return ['BELOW MIN', 'fin-min'];
    return ['CAP ROOM', 'fin-room'];
  }

  // ---------- every team, one season ----------
  function league(app, g, year) {
    const C = CBA(), y0 = C.salaryYear(g), Y = year || y0, r = C.rules(Y), user = UI.userTeam();
    const rows = UI.teams().map(t => {
      const st = C.capStatus(g, t.abbr, Y);
      if (Y !== y0) st.belowMinimum = false;   // later seasons hold only signed deals, so nearly every team looks short
      const later = yearsFrom(Y + 1).slice(0, 3).map(y => C.payroll(g, t.abbr, y));
      let tax = 0; try { tax = st.overTax ? C.luxuryTax(g, t.abbr, Y) || 0 : 0; } catch (e) { tax = 0; }
      return { t, st, later, tax, payroll: st.payroll, room: r.cap - st.payroll, toTax: r.tax - st.payroll, toApron: r.apron - st.payroll };
    });
    rows.sort((a, b) => ((a[sortKey] || 0) - (b[sortKey] || 0)) * sortDir || a.t.name.localeCompare(b.t.name));
    const th = (k, txt, cls) => `<th class="sortable${sortKey === k ? ' on' : ''}${cls ? ' ' + cls : ''}" data-sort="${k}">${txt}</th>`;
    const lines = `<div class="fin-lines"><span><small>CAP</small><b>${M(r.cap)}</b></span><span><small>TAX</small><b>${M(r.tax)}</b></span>${r.apron ? `<span><small>${r.apron2 ? '1ST APRON' : 'APRON'}</small><b>${M(r.apron)}</b></span>` : ''}${r.apron2 ? `<span><small>2ND APRON</small><b>${M(r.apron2)}</b></span>` : ''}<span><small>MINIMUM</small><b>${M(r.minPayroll)}</b></span>${r.projected ? '<em>Projected</em>' : ''}</div>`;
    app.innerHTML = UI.header('FINANCES', 'Every payroll against the cap, the tax and the aprons. Tap a team for its contracts.') +
      yearChips(Y, y0, y => '#/finances/league/' + y) + lines +
      `<div class="tscroll"><table class="stats fin-table"><thead><tr><th class="l">TEAM</th>${th('payroll', 'PAYROLL')}<th>STATUS</th>${th('room', 'VS CAP')}${th('toTax', 'VS TAX')}${r.apron ? th('toApron', 'VS APRON') : ''}${th('tax', 'TAX BILL', 'hide-sm')}${yearsFrom(Y + 1).slice(0, 3).map(y => `<th class="hide-sm fin-yh"><a href="#/finances/league/${y}">${label(y)}</a></th>`).join('')}</tr></thead><tbody>` +
      rows.map(x => { const [w, c] = statusWord(x.st, !!r.apron2, Y); return `<tr class="${x.t.abbr === user ? 'mine' : ''}"><td class="l"><a href="#/finances/${esc(x.t.abbr)}/${Y}">${UI.logo(x.t.abbr, 22)} ${esc(x.t.name)}</a></td>
        <td><b>${M(x.payroll)}</b></td><td><span class="fin-st ${c}"${x.st.belowMinimum ? ` title="${M(r.minPayroll - x.payroll)} short of the minimum, paid to its players at season end"` : ''}>${w}</span></td>
        <td class="${x.room >= 0 ? 'fin-pos' : ''}">${signed(x.room)}</td><td class="${x.toTax >= 0 ? 'fin-pos' : 'fin-neg'}">${signed(x.toTax)}</td>${r.apron ? `<td class="${x.toApron >= 0 ? 'fin-pos' : 'fin-neg'}">${signed(x.toApron)}</td>` : ''}
        <td class="hide-sm">${x.tax ? M(x.tax) : '-'}</td>${x.later.map(v => `<td class="hide-sm">${M(v)}</td>`).join('')}</tr>`; }).join('') +
      '</tbody></table></div><p class="muted fin-note">VS columns: room left (+) or how far over (-). Later seasons count only the contracts already signed. BELOW MIN: a team under the payroll minimum pays the difference to its players at season end. Tap a season to switch.</p>';
    app.querySelectorAll('[data-sort]').forEach(h => h.addEventListener('click', () => {
      const k = h.getAttribute('data-sort');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'payroll' || k === 'tax' ? -1 : 1; }
      league(app, g, Y);
    }));
  }

  // ---------- one team, its contracts by season ----------
  function team(app, g, abbr, year) {
    const C = CBA(), y0 = C.salaryYear(g), Y = Math.max(y0, year || y0), ys = yearsFrom(Y), t = UI.team(abbr);
    if (!t) { app.innerHTML = UI.empty('TEAM NOT FOUND', 'There is no team with the code ' + esc(abbr) + '.', '<a class="btn" href="#/finances">ALL TEAMS</a>'); return; }
    const players = UI.roster(abbr).filter(p => ys.some(y => salaryIn(p, y)));
    players.sort((a, b) => salaryIn(b, Y) - salaryIn(a, Y) || (b.ovr || 0) - (a.ovr || 0));
    const dead = ((g.teams && g.teams[abbr] && g.teams[abbr].deadMoney) || []).filter(d => d && ys.includes(d.year));
    const deadBy = {}; dead.forEach(d => { const k = d.id || 'x'; (deadBy[k] = deadBy[k] || {})[d.year] = ((deadBy[k] || {})[d.year] || 0) + (d.amount || 0); });
    const TAG = { player: ['PO', 'Player option'], team: ['TO', 'Team option'], eto: ['ETO', 'Early termination option'] };
    const cell = (p, y) => {
      const v = salaryIn(p, y);
      if (!v) return '<td class="fin-empty"></td>';
      const o = optionIn(p, y), last = lastYear(p) === y, tw = isTwoWay(p), rk = p.contract && p.contract.rookie, stash = p.stashedUntil != null && p.stashedUntil > y;
      const tags = (o && TAG[o] ? `<i class="fin-tag fin-${o}" title="${TAG[o][1]}">${TAG[o][0]}</i>` : '') + (tw ? '<i class="fin-tag fin-tw" title="Two-way deal, off the cap">2W</i>' : '') + (stash ? '<i class="fin-tag fin-tw" title="Stashed overseas, off the cap">STASH</i>' : '');
      return `<td class="${last ? 'fin-last' : ''}${rk ? ' fin-rk' : ''}${tw || stash ? ' fin-off' : ''}" title="${esc(p.name)} ${label(y)}${o ? ' | ' + TAG[o][1] : ''}${last ? ' | final year' : ''}">${M(v)}${tags}</td>`;
    };
    const rowsP = players.map(p => `<tr><td class="l"><a href="#/player/${esc(p.id)}">${esc(p.name)}</a> <small>${esc(p.pos || '')}${p.contract && p.contract.rookie ? ' | ROOKIE DEAL' : ''}</small></td><td class="hide-sm">${esc(p.age)}</td><td class="hide-sm ${UI.ovrClass(p.ovr)}"><b>${esc(p.ovr)}</b></td>${ys.map(y => cell(p, y)).join('')}</tr>`).join('');
    const nameOf = id => { const p = id && UI.player(id); return p ? p.name : 'Waived player'; };
    const rowsD = Object.keys(deadBy).map(id => `<tr class="fin-dead"><td class="l">${esc(nameOf(id))} <small>DEAD MONEY</small></td><td class="hide-sm"></td><td class="hide-sm"></td>${ys.map(y => `<td>${deadBy[id][y] ? M(deadBy[id][y]) : ''}</td>`).join('')}</tr>`).join('');
    const tot = ys.map(y => C.payroll(g, abbr, y));
    const line = (name, key) => `<tr class="fin-line"><td class="l">${name}</td><td class="hide-sm"></td><td class="hide-sm"></td>${ys.map(y => { const r = C.rules(y), v = r[key]; return `<td>${v ? M(v) : '-'}</td>`; }).join('')}</tr>`;
    const vs = (name, key) => `<tr class="fin-line"><td class="l">${name}</td><td class="hide-sm"></td><td class="hide-sm"></td>${ys.map((y, i) => { const v = C.rules(y)[key]; if (!v) return '<td>-</td>'; const d = v - tot[i]; return `<td class="${d >= 0 ? 'fin-pos' : 'fin-neg'}">${signed(d)}</td>`; }).join('')}</tr>`;
    const two = !!C.rules(Y).apron2, st = C.capStatus(g, abbr, Y); if (Y !== y0) st.belowMinimum = false; const [w, c] = statusWord(st, two, Y);
    const pick = `<select id="finTeam" aria-label="Team">${UI.teams().slice().sort((a, b) => a.city.localeCompare(b.city)).map(x => `<option value="${esc(x.abbr)}"${x.abbr === abbr ? ' selected' : ''}>${esc(x.city + ' ' + x.name)}</option>`).join('')}</select>`;
    app.innerHTML = UI.header(t.city.toUpperCase() + ' FINANCES', 'Contracts by season. PO player option, TO team option, ETO early termination, 2W two-way; the outlined year is the last of the deal.') +
      `<div class="fin-bar">${pick}<a class="btn" href="#/finances/league/${Y}">ALL TEAMS</a></div>` +
      yearChips(Y, y0, y => '#/finances/' + abbr + '/' + y) +
      `<div class="fin-lines"><span><small>${label(Y)} PAYROLL</small><b>${M(st.payroll)}</b></span><span><small>STATUS</small><b class="fin-st ${c}">${w}</b></span><span><small>${st.space > 0 ? 'CAP ROOM' : 'OVER THE CAP BY'}</small><b>${M(st.space > 0 ? st.space : st.payroll - st.cap)}</b></span>${st.belowMinimum ? `<span><small>BELOW MINIMUM BY</small><b>${M(st.minPayroll - st.payroll)}</b></span><em>Paid to the players at season end</em>` : ''}</div>` +
      `<div class="tscroll"><table class="stats fin-table fin-grid"><thead><tr><th class="l">PLAYER</th><th class="hide-sm">AGE</th><th class="hide-sm">OVR</th>${ys.map(y => `<th class="fin-yh${y === Y ? ' on' : ''}"><a href="#/finances/${esc(abbr)}/${y}">${label(y)}</a></th>`).join('')}</tr></thead><tbody>${rowsP}${rowsD}</tbody>
      <tfoot><tr><td class="l">TOTAL</td><td class="hide-sm"></td><td class="hide-sm"></td>${tot.map(v => `<td>${M(v)}</td>`).join('')}</tr>${line('Cap', 'cap')}${line('Minimum', 'minPayroll')}${vs('vs cap', 'cap')}${vs('vs tax', 'tax')}${vs(two ? 'vs 1st apron' : 'vs apron', 'apron')}${C.rules(Y).apron2 ? vs('vs 2nd apron', 'apron2') : ''}</tfoot></table></div>` +
      '<p class="muted fin-note">Two-way deals and stashed draft picks do not count against the cap. Later seasons count only the contracts already signed, so they fill in as you re-sign and add players.</p>';
    const sel = UI.$('#finTeam', app);
    if (sel) sel.addEventListener('change', () => { location.hash = '#/finances/' + sel.value + '/' + Y; });
  }

  P.finances = function (app, a, b) {
    const g = UI.state.game, C = CBA();
    if (!g || !g.teams || !C || !C.capStatus) { noLeague(app); return; }
    // routes: #/finances, #/finances/league/<year>, #/finances/<ABBR>[/<year>]
    const parts = String(a || '').split('/').concat(b != null ? [String(b)] : []).filter(Boolean);
    if (!parts.length || parts[0] === 'league') { league(app, g, +parts[1] || null); return; }
    team(app, g, parts[0].toUpperCase(), +parts[1] || null);
  };
  P.finances.navLabel = 'Finances';
  P.finances.navDesc = 'Every payroll against the cap, the tax and the aprons, and each team\'s contracts by season.';
})();
