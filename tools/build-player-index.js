// Builds data/player-index.js: every player of every season in Build Any Team's search (name -> each season's team,
// rating and position), so a search finds role players too (Duncan Robinson) without loading all 81 season files.
// The season's own file still loads when a player from it is added. Run it again after ratings or rosters change.
//   node tools/build-player-index.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + '/';
global.window = global; console.warn = () => {};
global.document = undefined;
require(ROOT + 'data/league2012.js');
require(ROOT + 'js/challenge.js');
const C = window.CHALLENGE;
const by = {};
let rows = 0;
C.SEASONS.forEach(s => {
  if (s.ready === false) return;
  if (!C.loaded(s.year)) {
    const f = s.file && ROOT + s.file.replace(/^\//, '').replace(/\?.*$/, '');
    if (!f || !fs.existsSync(f)) { console.log('no file for', s.year, s.file); return; }
    require(f);
  }
  const d = C.seasonData(s.year);
  if (!d) { console.log('no data for', s.year); return; }
  d.players.concat(d.free || []).forEach(p => {
    if (!p || !p.id || !p.name || !p.ovr) return;
    const e = by[p.id] || (by[p.id] = [p.name, []]);
    e[1].push([s.year, p.team || 'FA', p.ovr, String(p.pos || '').split(/[-\/]/)[0]]);
    rows++;
  });
});
const out = '/* Every player of every season for the Build Any Team search: { id: [name, [[season, team, ovr, pos], ...]] }.\n   Built by tools/build-player-index.js. */\nwindow.PLAYER_INDEX = ' + JSON.stringify(by) + ';\n';
fs.writeFileSync(ROOT + 'data/player-index.js', out);
console.log(Object.keys(by).length + ' players, ' + rows + ' seasons, ' + Math.round(out.length / 1024) + ' KB');
