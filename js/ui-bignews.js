// Big moments in The Association get a pop-up instead of only a news line: your player out for weeks, your player asking
// for a trade, a milestone or award for your team, your title, and a rule change for the league (the real ones when an old
// league reaches them: the shot clock in 1954-55, the three-point line in 1979-80, and so on; the future ones from js/future.js).
// UI.bigNews() looks at the news after every screen change. The first time a save is opened everything already there counts
// as seen, so nothing old pops up. At most three pop-ups at a time; the rest stay in the news feed. state.bigSeen remembers.
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  // real NBA rule changes, by the season they started (season-ending year)
  const RULES = {
    1955: ['THE SHOT CLOCK ARRIVES', 'Teams now have 24 seconds to shoot, and a team foul limit sends the other side to the line. Scoring is about to jump.'],
    1965: ['A WIDER LANE', 'The free-throw lane widens from 12 to 16 feet to keep big men from camping under the basket.'],
    1977: ['THE ABA MERGER', 'Four ABA teams join the league, and their players enter a dispersal draft.'],
    1980: ['THE THREE-POINT LINE', 'Shots from beyond 23 feet 9 inches now count for three points.'],
    1985: ['THE SALARY CAP AND THE LOTTERY', 'Teams now play under a salary cap, and a lottery decides the top of the draft.'],
    1995: ['THE ARC MOVES IN', 'The three-point line comes in to 22 feet all the way around, for three seasons.'],
    1998: ['THE ARC MOVES BACK', 'The three-point line goes back to 23 feet 9 inches.'],
    2002: ['ZONE DEFENSE IS LEGAL', 'Teams can now play zone, with a new defensive three-second rule.'],
    2005: ['NO MORE HAND-CHECKING', 'Defenders can no longer hand-check on the perimeter. Guards get room to attack.'],
    2006: ['A DRAFT AGE LIMIT', 'Players must be 19 and a year out of high school to enter the draft.']
  };
  const keyOf = n => (n.year || 0) + '|' + (n.day || 0) + '|' + (n.headline || '');

  function picks(st) {
    const user = st.userTeam, mine = id => { const p = st.players && st.players[id]; return p && p.team === user; };
    const teamName = (UI.teamName && UI.teamName(user)) || user;
    const out = [];
    (st.news || []).slice(0, 80).forEach(n => {
      if (!n || !n.headline) return;
      const h = n.headline, ids = n.ids || [];
      if (n.type === 'injury' && ids.some(mine) && /Out For Season|Sidelined/i.test(h)) out.push(['INJURY', n]);
      else if (/requests a trade/i.test(h) && ids.some(mine)) out.push(['TRADE REQUEST', n]);
      else if (n.type === 'milestone' && ids.some(mine) && /HISTORIC|career/i.test(h + ' ' + (n.body || ''))) out.push(['MILESTONE', n]);
      else if (n.type === 'award' && ids.some(mine) && !/All-Star Starters|All-NBA Teams/i.test(h)) out.push(['AWARD', n]);
      else if (n.type === 'playoffs' && /^CHAMPIONS!/.test(h) && h.indexOf(teamName) >= 0) out.push(['CHAMPIONS', n]);
      else if (n.tag === 'rosterFix') out.push(['YOUR ROSTER', n]);
      else if (n.tag === 'league') out.push(['RULE CHANGE', n]);
    });
    const R = RULES[st.year];
    if (R && (st.startYear || 0) < st.year) out.push(['RULE CHANGE', { year: st.year, day: -1, headline: R[0], body: R[1] }]);
    return out;
  }

  let busy = false;
  UI.bigNews = async function () {
    const st = UI.state && UI.state.game;
    if (busy || !st || !st.userTeam || !Array.isArray(st.news)) return;
    if (document.body.classList.contains('no-assoc-nav')) return;   // never over the Daily, the menu or the other modes
    const modal = document.getElementById('eventModal');
    if (!modal || !modal.hidden || (UI.pendingEvents && UI.pendingEvents())) return;
    const all = picks(st);
    if (!Array.isArray(st.bigSeen)) { st.bigSeen = all.map(x => keyOf(x[1])); return; }   // an older save: nothing old pops up
    const seen = new Set(st.bigSeen), fresh = all.filter(x => !seen.has(keyOf(x[1])));
    if (!fresh.length) return;
    fresh.forEach(x => st.bigSeen.push(keyOf(x[1])));
    if (st.bigSeen.length > 400) st.bigSeen = st.bigSeen.slice(-300);
    busy = true;
    try {
      for (const [kind, n] of fresh.slice(0, 3)) {
        await UI.choose({ title: kind, text: '', html: `<p class="bn-head">${UI.esc(n.headline)}</p>${n.body ? `<p class="ev-text">${UI.esc(n.body)}</p>` : ''}`,
          buttons: [{ value: 'ok', label: 'GOT IT', gold: true }] });
      }
    } finally { busy = false; }
  };
  window.addEventListener('hashchange', () => setTimeout(() => { try { UI.bigNews(); } catch (e) { /* never block a page */ } }, 400));
})();
