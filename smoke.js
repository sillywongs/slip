// Fake-DOM run of the Slip screen. Run: node smoke.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const ui = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function classList() { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), has: c => s.has(c), toString: () => [...s].join(' ') }; }
function boot(saved) {
  const els = {}, mem = Object.assign({}, saved || {}), listeners = {}, lines = {}, timers = [];
  const el = s => els[s] || (els[s] = { innerHTML: '', textContent: '', style: {}, disabled: false, checked: false, classList: classList(), showModal() {}, close() {},
    addEventListener(t, f) { (listeners[s + ':' + t] = listeners[s + ':' + t] || []).push(f); } });
  const board = el('#board');
  board.querySelector = () => ({ getBoundingClientRect: () => ({ width: 55 }) });
  board.querySelectorAll = sel => {
    if (lines[sel]) return lines[sel];
    const m = sel.match(/data-(r|c)="(\d)"/), k = +m[2];
    return (lines[sel] = [0, 1, 2, 3].map(i => ({ style: {}, classList: classList(), dataset: m[1] === 'r' ? { r: String(k), c: String(i) } : { r: String(i), c: String(k) } })));
  };
  const ctx = {
    document: { querySelector: s => /^\.arrow/.test(s) ? (ctx.hintArrows[s] = ctx.hintArrows[s] || { classList: classList() }) : el(s),
      querySelectorAll: sel => {
        if (sel !== '.arrow[data-m]') return [];
        return [...board.innerHTML.matchAll(/data-m="([^"]+)"/g)].map(m => { const b = { dataset: { m: m[1] } }; ctx.arrows[m[1]] = b; return b; });
      }, addEventListener() {} },
    arrows: {}, hintArrows: {}, localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v },
    location: { origin: 'https://example.com', pathname: '/slip/' }, navigator: {}, addEventListener() {},
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout(id) { if (timers[id - 1]) timers[id - 1].f = null; }, console,
    Core: require('./core.js'), Data: require('./data.js')
  };
  vm.createContext(ctx); vm.runInContext(ui, ctx);
  const g = { ctx, els, mem, lines, timers, run: c => vm.runInContext(c, ctx), fire: (s, t, e) => (listeners[s + ':' + t] || []).forEach(f => f(e)) };
  g.move = m => ctx.arrows[m].onclick();
  g.grid = () => g.run('S.grid');
  g.board = () => board.innerHTML;
  g.tilesWithFeedback = () => (board.innerHTML.match(/class="tile (ok|no)"/g) || []).length;
  g.press = (r, c, x, y) => g.fire('#board', 'pointerdown', { target: { closest: () => ({ dataset: { r: String(r), c: String(c) } }) }, clientX: x, clientY: y, pointerId: 1 });
  g.dragTo = (x, y) => g.fire('#board', 'pointermove', { clientX: x, clientY: y });
  g.release = (x, y) => g.fire('#board', 'pointerup', { clientX: x, clientY: y });
  g.runTimers = () => { const t = timers.splice(0); t.forEach(x => x.f && x.f()); };
  g.shownGrid = () => { const rows = []; [...board.innerHTML.matchAll(/data-r="(\d)" data-c="(\d)">(.)</g)].forEach(m => { rows[+m[1] * 4 + +m[2]] = m[3]; }); return rows.join(''); };
  g.setEasy = on => { g.els['#easyToggle'].checked = on; g.els['#easyToggle'].onchange(); };
  g.setGrid = grid => { g.run('S.grid = ' + JSON.stringify(grid) + '; save(); render()'); };
  return g;
}
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const count = (s, re) => (s.match(re) || []).length;

// loads the day's puzzle with 16 tiles, 16 arrows, nothing marked
let g = boot();
const p = g.run('puzzle'), C = g.ctx.Core, states = C.pathStates(p.start, p.solution);
assert.strictEqual(g.grid(), p.start);
assert.strictEqual(count(g.board(), /class="tile /g), 16);
assert.strictEqual(count(g.board(), /class="arrow"/g), 16);
assert.strictEqual(g.tilesWithFeedback(), 0, 'no feedback on load');
assert.strictEqual(g.els['#par'].textContent, p.par);
assert.strictEqual(g.els['#undo'].disabled, true);
assert.strictEqual(g.els['#showpath'].style.display, 'none', 'no path button while playing');
assert.strictEqual(g.els['#easyBadge'].style.display, 'none', 'easy mode is off by default');

// a move changes the grid, counts, and enables undo; undo restores it
g.move('r0+');
assert.strictEqual(g.grid(), C.applyMove(p.start, 'r0+'));
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
same(JSON.parse(g.mem['slip:state']).locks, [], 'normal mode never locks');
g.move('c1-');
assert.strictEqual(g.tilesWithFeedback(), 0, 'feedback clears after a move');

// the path cannot be opened mid-game
g.run('openReplay()');
assert.strictEqual(g.run('R'), null, 'replay does not open while the game is live');

// dragging
g.els['#reset'].onclick();
const before = g.grid();
g.press(2, 1, 100, 100); g.release(100, 100);
assert.strictEqual(g.grid(), before, 'a tap does nothing');
g.press(2, 1, 100, 100); g.dragTo(125, 108);
assert(g.lines['.tile[data-r="2"]'].every(t => t.classList.has('line')), 'row 2 is highlighted');
assert(g.els['#board'].classList.has('dragging'), 'board is dimmed while dragging');
assert(g.lines['.tile[data-r="2"]'].every(t => /translateX\(/.test(t.style.transform)), 'the row follows the finger');
g.dragTo(130, 160);
assert(g.lines['.tile[data-r="2"]'].every(t => /translateX\(/.test(t.style.transform)), 'axis stays locked once chosen');
g.release(160, 112);
assert.strictEqual(g.grid(), C.applyMove(before, 'r2+'), 'release past a third of a tile commits one step right');
assert(!g.els['#board'].classList.has('dragging'), 'highlight clears after release');
const mid = g.grid();
g.press(0, 0, 100, 100); g.dragTo(100, 112); g.release(100, 112);
assert.strictEqual(g.grid(), mid, 'a short drag does not move anything');
assert(g.lines['.tile[data-c="0"]'].every(t => t.style.transform === ''), 'the line returns to place');
g.press(1, 3, 100, 100); g.dragTo(103, 70); g.release(101, 60);
assert.strictEqual(g.grid(), C.applyMove(mid, 'c3-'));

// hint
g = boot();
g.els['#hint'].onclick();
assert(g.ctx.hintArrows['.arrow[data-m="' + p.solution[0] + '"]'].classList.has('hint'), 'the hint arrow is highlighted');
assert(/Try /.test(g.els['#msg'].textContent));
assert.strictEqual(g.run('S.hints'), 1);
while (!g.run('S.over')) { g.els['#hint'].onclick(); g.move(g.run('Core.hintMove(S.grid, puzzle.words, puzzle.alts, 10, S.locks)')); }
assert.strictEqual(g.run('S.won'), true);
assert.strictEqual(g.run('S.moves.length'), p.par);
assert(/💡/.test(g.run('shareTextValue')), 'share text mentions hints');
assert(!/🔒/.test(g.run('shareTextValue')), 'no easy tag outside easy mode');

// ---- a win: the shortest path can be watched ----
g = boot();
p.solution.forEach(m => g.move(m));
assert.strictEqual(g.run('S.won'), true);
assert.strictEqual(g.run('S.moves.length'), p.par);
assert(/tile done/.test(g.board()));
assert.strictEqual(JSON.parse(g.mem['slip:stats']).wins, 1);
assert(g.els['#words'].textContent.includes(p.words[0]));
assert.strictEqual(g.els['#showpath'].style.display, '', 'path button appears after a win');
assert.strictEqual(g.els['#dlgPath'].style.display, '', 'and in the result dialog');
const savedWin = g.mem['slip:state'], finalGrid = g.grid();
g.els['#showpath'].onclick();
assert.notStrictEqual(g.run('R'), null, 'replay opened');
assert.strictEqual(g.els['#replay'].style.display, '', 'replay panel is visible');
assert.strictEqual(g.shownGrid(), p.start, 'replay starts from the beginning state');
assert.strictEqual(count(g.board(), /data-m="[^"]+" disabled/g), 16, 'arrows are disabled during replay');
assert(!/tile done/.test(g.board()), 'start grid is not shown as solved');
assert(/shortest path takes /.test(g.els['#replayCap'].textContent));
assert.strictEqual(g.els['#showpath'].style.display, 'none', 'path button hides during replay');
for (let i = 0; i < p.par; i++) {
  g.runTimers();
  assert(g.ctx.hintArrows['.arrow[data-m="' + p.solution[i] + '"]'].classList.has('hint'), 'next arrow is pulsed at step ' + i);
  assert(/Next: /.test(g.els['#replayCap'].textContent));
  g.runTimers();
  assert.strictEqual(g.run('R.k'), i + 1);
  assert.strictEqual(g.shownGrid(), states[i + 1], 'replay shows step ' + (i + 1));
}
assert(/tile done/.test(g.board()), 'the last frame is solved');
assert(/Solved/.test(g.els['#replayCap'].textContent));
g.runTimers();
assert.strictEqual(g.run('R.playing'), false, 'autoplay stops at the end');
assert.strictEqual(g.els['#rPlay'].textContent, 'Replay');
assert.strictEqual(g.els['#rNext'].disabled, true);
assert.strictEqual(g.mem['slip:state'], savedWin, 'replay does not change the saved game');
assert.strictEqual(g.grid(), finalGrid); assert.strictEqual(g.run('S.moves.length'), p.par);
assert.strictEqual(JSON.parse(g.mem['slip:stats']).played, 1, 'replay does not count as a play');
g.els['#rPrev'].onclick();
assert.strictEqual(g.shownGrid(), states[p.par - 1]); assert.strictEqual(g.run('R.playing'), false);
g.els['#rPrev'].onclick();
assert.strictEqual(g.shownGrid(), states[p.par - 2]);
g.els['#rNext'].onclick();
assert.strictEqual(g.shownGrid(), states[p.par - 1]);
for (let i = 0; i < 20; i++) g.els['#rPrev'].onclick();
assert.strictEqual(g.shownGrid(), p.start); assert.strictEqual(g.els['#rPrev'].disabled, true);
g.els['#rPlay'].onclick(); assert.strictEqual(g.run('R.playing'), true);
g.els['#rPlay'].onclick(); assert.strictEqual(g.run('R.playing'), false, 'pause works');
g.els['#rClose'].onclick();
assert.strictEqual(g.run('R'), null);
assert.strictEqual(g.els['#replay'].style.display, 'none');
assert.strictEqual(g.shownGrid(), finalGrid, 'the finished board is shown again');
assert.strictEqual(g.els['#showpath'].style.display, '');
assert.strictEqual(count(g.board(), /data-m="[^"]+" disabled/g), 0);
g.run("doMove('r0+')");
assert.strictEqual(g.run('S.moves.length'), p.par);
g = boot({ 'slip:state': savedWin });
assert.strictEqual(g.run('S.won'), true);
assert.strictEqual(g.els['#showpath'].style.display, '', 'path button is there after a reload too');

// ---- giving up ----
g = boot(); g.els['#giveup'].onclick();
assert.strictEqual(g.run('S.won'), false); assert.strictEqual(g.run('S.over'), true);
assert.strictEqual(JSON.parse(g.mem['slip:stats']).streak, 0);
assert.strictEqual(g.els['#showpath'].style.display, '');
g.els['#dlgPath'].onclick();
assert.strictEqual(g.shownGrid(), p.start, 'replay starts from the beginning state after giving up');
g.els['#rNext'].onclick();
assert.strictEqual(g.shownGrid(), C.applyMove(p.start, p.solution[0]));

// ---- out of checks ends the game ----
g = boot();
g.move('r0+'); g.move('c0+');
g.els['#check'].onclick(); assert.strictEqual(g.run('S.over'), false, 'two checks left, still playing');
g.els['#check'].onclick(); assert.strictEqual(g.run('S.over'), false, 'one check left, still playing');
g.els['#check'].onclick();
assert.strictEqual(g.run('S.over'), true, 'the third check ends the game');
assert.strictEqual(g.run('S.won'), false);
assert.strictEqual(g.els['#checks'].textContent, 0);
assert.strictEqual(g.tilesWithFeedback(), 16, 'the final check is still visible on the board');
assert(/Out of checks/.test(g.els['#msg'].textContent));
assert.strictEqual(g.els['#check'].disabled, true); assert.strictEqual(g.els['#hint'].disabled, true);
assert.strictEqual(JSON.parse(g.mem['slip:stats']).played, 1);
assert.strictEqual(g.els['#showpath'].style.display, '', 'path is available after running out of checks');
g.els['#showpath'].onclick();
assert.strictEqual(g.shownGrid(), p.start);
g.els['#rClose'].onclick();
assert.strictEqual(g.tilesWithFeedback(), 16, 'the final feedback returns after the replay closes');

// ======================= EASY MODE =======================
// A grid a few moves from the end that already has at least one correct row.
let nearK = p.par - 1;
while (nearK > 0 && !C.rowMatches(states[nearK], p.words, p.alts).some(Boolean)) nearK--;
const near = states[nearK], nearCorrect = C.lockableRows(near, p.words, p.alts, []);
assert(nearCorrect.length >= 1, 'test setup: a near-final grid with a correct row');

// the setting is saved and shows a badge
g = boot();
g.setEasy(true);
assert.strictEqual(JSON.parse(g.mem['slip:settings']).easy, true);
assert.strictEqual(g.els['#easyBadge'].style.display, 'block');
g = boot({ 'slip:settings': JSON.stringify({ easy: true }) });
assert.strictEqual(g.run('settings.easy'), true, 'the setting survives a reload');

// with easy mode off, correct rows do not lock
g = boot(); g.setGrid(near); g.els['#check'].onclick();
same(g.run('S.locks'), []);
assert(!/tile locked/.test(g.board()));

// with easy mode on, a Check locks the correct rows
g = boot(); g.setEasy(true); g.setGrid(near);
g.els['#check'].onclick();
same(g.run('S.locks'), nearCorrect, 'the correct rows lock');
same(g.run('S.lockPoints'), [0]);
assert(/Locked row/.test(g.els['#msg'].textContent));
const lockedRow = nearCorrect[0];
assert.strictEqual(count(g.board(), /class="tile locked"/g), 4 * nearCorrect.length, 'locked tiles are drawn as locked');
assert(new RegExp('data-m="r' + lockedRow + '-" disabled').test(g.board()), 'the locked row arrows are disabled');
assert(new RegExp('data-m="r' + lockedRow + '\\+" disabled').test(g.board()));
assert(!new RegExp('data-m="c0-" disabled').test(g.board()), 'column arrows still work');
assert.strictEqual(g.els['#showpath'].style.display, 'none');

// a locked row will not move: not by arrow, not by drag
const lockedGrid = g.grid();
g.run("doMove('r" + lockedRow + "+')");
assert.strictEqual(g.grid(), lockedGrid); assert.strictEqual(g.run('S.moves.length'), 0);
assert(/is locked/.test(g.els['#msg'].textContent));
g.press(lockedRow, 1, 100, 100); g.dragTo(130, 102);
assert(!g.els['#board'].classList.has('dragging'), 'no drag starts along a locked row');
g.release(160, 102);
assert.strictEqual(g.grid(), lockedGrid);

// a column slide skips the locked rows and the locked letters stay put
g.press(lockedRow, 2, 100, 100); g.dragTo(101, 70);   // vertical drag from a locked tile slides its column
assert(g.els['#board'].classList.has('dragging'), 'dragging a locked tile along its column is allowed');
g.release(101, 55);
const after = g.grid(), L = g.run('S.locks');
assert.strictEqual(after, C.applyMoveLocked(lockedGrid, 'c2-', L));
L.forEach(r => assert.strictEqual(C.rows(after)[r], C.rows(lockedGrid)[r], 'locked row ' + r + ' did not change'));
assert.notStrictEqual(after, lockedGrid);

// undo only steps back through moves made after the lock
assert.strictEqual(g.els['#undo'].disabled, false);
g.els['#undo'].onclick();
assert.strictEqual(g.grid(), lockedGrid);
assert.strictEqual(g.els['#undo'].disabled, true, 'moves made before the lock cannot be undone');

// hints respect the locks and following them finishes the game
g.els['#hint'].onclick();
const hm = g.run('Core.hintMove(S.grid, puzzle.words, puzzle.alts, 10, S.locks)');
assert(hm && C.validMoves(g.run('S.locks')).includes(hm), 'the hint never uses a locked row');
while (!g.run('S.over')) { g.move(g.run('Core.hintMove(S.grid, puzzle.words, puzzle.alts, 10, S.locks)')); }
assert.strictEqual(g.run('S.won'), true, 'an easy mode game can be finished');
assert.strictEqual(g.run('S.easyUsed'), true);
assert(/🔒easy/.test(g.run('shareTextValue')), 'the share text marks easy mode');
assert(!/tile locked/.test(g.board()), 'the finished board shows no locks');

// the replay ignores locks and shows the normal shortest path
g.els['#showpath'].onclick();
assert.strictEqual(g.shownGrid(), p.start);
assert(!/tile locked/.test(g.board()));
assert.strictEqual(count(g.board(), /data-m="[^"]+" disabled/g), 16);
g.els['#rClose'].onclick();

// Reset clears the locks but not the used checks
g = boot(); g.setEasy(true); g.setGrid(near); g.els['#check'].onclick();
assert(g.run('S.locks').length >= 1);
g.els['#reset'].onclick();
same(g.run('S.locks'), []); same(g.run('S.lockPoints'), []);
assert.strictEqual(g.grid(), p.start); assert.strictEqual(g.run('S.checks'), 1, 'a Reset does not refund checks');
assert(!/tile locked/.test(g.board()));

// turning easy mode off releases the locks
g = boot(); g.setEasy(true); g.setGrid(near); g.els['#check'].onclick();
assert(g.run('S.locks').length >= 1);
g.setEasy(false);
same(g.run('S.locks'), []);
assert(/Locks released/.test(g.els['#msg'].textContent));
assert.strictEqual(g.els['#easyBadge'].style.display, 'none');
assert(!/tile locked/.test(g.board()));

// three correct rows lock only two
const solvedGrid = states[p.par], threeRows = C.applyMove(solvedGrid, 'r3+');
if (C.rowMatches(threeRows, p.words, p.alts).filter(Boolean).length === 3) {
  g = boot(); g.setEasy(true); g.setGrid(threeRows); g.els['#check'].onclick();
  same(g.run('S.locks'), [0, 1], 'the cap is two rows');
  assert(/Two rows is the most/.test(g.els['#msg'].textContent) || /Locked row/.test(g.els['#msg'].textContent));
  g.els['#check'].onclick();
  same(g.run('S.locks'), [0, 1], 'a later check never adds a third lock');
}

// a second Check locks further correct rows, and earlier locks stay (never more than two in total)
g = boot(); g.setEasy(true);
g.setGrid(near); g.els['#check'].onclick();
same(g.run('S.locks'), nearCorrect.slice(0, 2));
const firstLocks = g.run('S.locks').slice();
assert.strictEqual(firstLocks.length, 1, 'setup: this puzzle has one correct row at first');
g.setGrid(threeRows); g.els['#check'].onclick();
assert.strictEqual(g.run('S.locks').length, 2, 'the second check locks one more row');
assert(g.run('S.locks').includes(firstLocks[0]), 'the earlier lock stays');
same(g.run('S.lockPoints'), [0, 0]);
g.setGrid(threeRows); g.els['#check'].onclick();   // would end the game on the third check; locks stay at two
assert.strictEqual(g.run('S.locks').length, 2);

// saved games: real locks restore, bogus locks are dropped
g = boot(); g.setEasy(true); g.setGrid(near); g.els['#check'].onclick();
const lockedSave = g.mem['slip:state'];
g = boot({ 'slip:state': lockedSave, 'slip:settings': JSON.stringify({ easy: true }) });
same(g.run('S.locks'), nearCorrect, 'locks restore after a reload');
assert(/tile locked/.test(g.board()));
const bogus = Object.assign(JSON.parse(lockedSave), { locks: [3, 2, 1], lockPoints: [0] });
g = boot({ 'slip:state': JSON.stringify(bogus) });
same(g.run('S.locks'), [], 'locks on rows that are not correct are dropped');
const tooMany = Object.assign(JSON.parse(lockedSave), { locks: [0, 1, 2] });
g = boot({ 'slip:state': JSON.stringify(tooMany) });
same(g.run('S.locks'), [], 'more than two locks are dropped');

// saved games from another day or another puzzle, or with tampered letters, are discarded
for (const bad of [{ date: '2020-01-01' }, { id: 'other' }, { grid: 'ZZZZZZZZZZZZZZZZ' }]) {
  const base = { date: g.run('today'), id: p.id, grid: p.start, moves: ['r0+'], checks: 1, hints: 0, feedback: null, locks: [], lockPoints: [], over: false, won: false };
  g = boot({ 'slip:state': JSON.stringify(Object.assign(base, bad)) });
  assert.strictEqual(g.grid(), p.start, 'fresh puzzle for ' + JSON.stringify(bad));
}
console.log('smoke ok');
