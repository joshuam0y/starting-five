// Builds data/numbers.js (window.NUMBERS) from tools/number-cache.json (tools/fetch-numbers.py): for each player
// (Basketball-Reference id), a row [season-ending year, team, number] whenever his team or number changed.
// Teams are in the Association's abbreviations (the Minneapolis Lakers are LAL, the Seattle SuperSonics OKC).
//   node tools/build-numbers.js
const fs = require('fs'), path = require('path');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'number-cache.json'), 'utf8'));
const AB = { NJN: 'BKN', BRK: 'BKN', NYN: 'BKN', NYA: 'BKN', NJA: 'BKN', CHH: 'NOH', CHO: 'CHA', NOP: 'NOH', NOK: 'NOH', VAN: 'MEM', WSB: 'WAS', BUF: 'LAC', SDC: 'LAC',
  NOJ: 'UTA', KCK: 'SAC', PHW: 'GSW', SFW: 'GSW', MNL: 'LAL', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', SYR: 'PHI', FTW: 'DET', MLH: 'ATL', STL: 'ATL',
  TRI: 'ATL', CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', SDR: 'HOU', SEA: 'OKC', PHO: 'PHX' };
const ab = a => AB[a] || a;
const rows = {};
Object.keys(cache).map(Number).sort((a, b) => a - b).forEach(Y => {
  const season = cache[Y];
  Object.keys(season).forEach(T => {
    if (T === '_teams') return;
    Object.keys(season[T]).forEach(id => {
      const n = season[T][id], list = rows[id] || (rows[id] = []), last = list[list.length - 1];
      if (!last || last[1] !== ab(T) || last[2] !== n) list.push([Y, ab(T), n]);
    });
  });
});
const out = '/* Real jersey numbers, built by tools/build-numbers.js from Basketball-Reference team rosters (tools/number-cache.json).\n' +
  '   NUMBERS[id] = [[season-ending year, team, number], ...]: a row whenever his team or number changed. */\n' +
  '(function (g) { g.NUMBERS = ' + JSON.stringify(rows) + ";\n  if (typeof module !== 'undefined' && module.exports) module.exports = g.NUMBERS;\n})(typeof window !== 'undefined' ? window : this);\n";
fs.writeFileSync(path.join(__dirname, '..', 'data/numbers.js'), out);
console.log(Object.keys(rows).length, 'players,', Object.keys(cache).length, 'seasons,', Math.round(out.length / 1024), 'KB');
