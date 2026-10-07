// Fake-DOM run of the Slip screen. Run: node smoke.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const ui = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(saved, date) {
  const els = {}, mem = Object.assign({}, saved || {}), listeners = {};
  const el = s => els[s] || (els[s] = { innerHTML: '', textContent: '', style: {}, disabled: false, showModal() {}, close() {},
    addEventListener(t, f) { (listeners[s + ':' + t] = listeners[s + ':' + t] || []).push(f); } });
  const ctx = {
    document: { querySelector: el, querySelectorAll: sel => {
      if (sel !== '.arrow[data-m]') return [];
      return [...els['#board'].innerHTML.matchAll(/data-m="([^"]+)"/g)].map(m => { const b = { dataset: { m: m[1] } }; ctx.arrows[m[1]] = b; return b; });
    }, addEventListener() {} },
    arrows: {}, localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v },
    location: { origin: 'https://example.com', pathname: '/slip/' }, navigator: {}, addEventListener() {}, setTimeout: () => 0,
    Core: require('./core.js'), Data: require('./data.js'), console
  };
  vm.createContext(ctx); vm.runInContext(ui, ctx);
  const g = { ctx, els, mem, run: c => vm.runInContext(c, ctx), fire: (s, t, e) => (listeners[s + ':' + t] || []).forEach(f => f(e)) };
  g.move = m => ctx.arrows[m].onclick();
  g.grid = () => g.run('S.grid');
  g.tilesWithFeedback = () => (els['#board'].innerHTML.match(/class="tile (ok|no)"/g) || []).length;
  return g;
}
const count = (s, re) => (s.match(re) || []).length;

// loads the day's puzzle with 16 tiles, 16 arrows, nothing marked
let g = boot();
const p = g.run('puzzle');
assert.strictEqual(g.grid(), p.start);
assert.strictEqual(count(g.els['#board'].innerHTML, /class="tile /g), 16);
assert.strictEqual(count(g.els['#board'].innerHTML, /class="arrow"/g), 16);
assert.strictEqual(g.tilesWithFeedback(), 0, 'no feedback on load');
assert.strictEqual(g.els['#par'].textContent, p.par);
assert.strictEqual(g.els['#undo'].disabled, true);

// a move changes the grid, counts, and enables undo; undo restores it
g.move('r0+');
assert.strictEqual(g.grid(), g.ctx.Core.applyMove(p.start, 'r0+'));
assert.strictEqual(g.els['#moves'].textContent, 1);
assert.strictEqual(g.els['#undo'].disabled, false);
g.els['#undo'].onclick();
assert.strictEqual(g.grid(), p.start);
assert.strictEqual(g.els['#moves'].textContent, 0);

// no feedback until Check; Check shows rows and uses a check; a move clears it
g.move('c1+');
assert.strictEqual(g.tilesWithFeedback(), 0);
g.els['#check'].onclick();
assert.strictEqual(g.tilesWithFeedback(), 16, 'every tile is marked after a check');
assert.strictEqual(g.els['#checks'].textContent, 2);
g.move('c1-');
assert.strictEqual(g.tilesWithFeedback(), 0, 'feedback clears after a move');

// swipes: horizontal slides the row, vertical slides the column, short swipes do nothing
g.els['#reset'].onclick();
const before = g.grid();
g.fire('#board', 'pointerdown', { target: { closest: () => ({ dataset: { r: '2', c: '1' } }) }, clientX: 100, clientY: 100 });
g.fire('#board', 'pointerup', { clientX: 105, clientY: 102 });
assert.strictEqual(g.grid(), before, 'tiny swipe is ignored');
g.fire('#board', 'pointerdown', { target: { closest: () => ({ dataset: { r: '2', c: '1' } }) }, clientX: 100, clientY: 100 });
g.fire('#board', 'pointerup', { clientX: 160, clientY: 105 });
assert.strictEqual(g.grid(), g.ctx.Core.applyMove(before, 'r2+'), 'swipe right slides row 2 right');
g.fire('#board', 'pointerdown', { target: { closest: () => ({ dataset: { r: '0', c: '3' } }) }, clientX: 100, clientY: 100 });
g.fire('#board', 'pointerup', { clientX: 104, clientY: 40 });
assert.strictEqual(g.grid(), g.ctx.Core.applyMove(g.ctx.Core.applyMove(before, 'r2+'), 'c3-'), 'swipe up slides column 3 up');

// playing the stored solution wins, saves stats, and marks all tiles done
g = boot();
p.solution.forEach(m => g.move(m));
assert.strictEqual(g.run('S.won'), true);
assert.strictEqual(g.run('S.moves.length'), p.par);
assert(/tile done/.test(g.els['#board'].innerHTML));
assert.strictEqual(JSON.parse(g.mem['slip:stats']).wins, 1);
assert(g.els['#words'].textContent.includes(p.words[0]));
const savedWin = g.mem['slip:state'];

// moves after winning are ignored, and reloading restores the finished game
g.run("doMove('r0+')");
assert.strictEqual(g.run('S.moves.length'), p.par);
g = boot({ 'slip:state': savedWin });
assert.strictEqual(g.run('S.won'), true);

// giving up counts as a loss and reveals the words
g = boot(); g.els['#giveup'].onclick();
assert.strictEqual(g.run('S.won'), false); assert.strictEqual(g.run('S.over'), true);
assert.strictEqual(JSON.parse(g.mem['slip:stats']).streak, 0);

// saved games from another day or another puzzle, or with tampered letters, are discarded
for (const bad of [{ date: '2020-01-01' }, { id: 'other' }, { grid: 'ZZZZZZZZZZZZZZZZ' }]) {
  const base = JSON.parse(JSON.stringify({ date: g.run('today'), id: p.id, grid: p.start, moves: ['r0+'], checks: 1, feedback: null, over: false, won: false }));
  g = boot({ 'slip:state': JSON.stringify(Object.assign(base, bad)) });
  assert.strictEqual(g.grid(), p.start, 'fresh puzzle for ' + JSON.stringify(bad));
}
console.log('smoke ok');
