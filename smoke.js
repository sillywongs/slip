// Fake-DOM run of the Slip screen. Run: node smoke.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const ui = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);

class FakeEl {
  constructor(env, tag) {
    this.env = env; this.tag = tag; this.children = []; this.parent = null; this.dataset = {}; this.attrs = {}; this.listeners = {};
    this._cls = new Set(); this.textContent = ''; this.disabled = false; this.checked = false; this.onclick = null; this.innerHTML = '';
    this.offsetLeft = 0; this.offsetTop = 0; this.offsetWidth = 56; this.offsetHeight = 56;
    const self = this;
    this.style = new Proxy({}, { set(o, k, v) { if (k === 'transform' && /arrow|lockbtn/.test(self.className)) env.violations.push(self.className + ' transform'); o[k] = v; return true; } });
    this.classList = { add: c => { this._cls.add(c); }, remove: c => { this._cls.delete(c); }, contains: c => this._cls.has(c),
      toggle: c => { this._cls.has(c) ? this._cls.delete(c) : this._cls.add(c); } };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; } }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  closest(sel) { const cls = sel.replace('.', ''); let e = this; while (e) { if (e.classList.contains(cls)) return e; e = e.parent; } return null; }
  showModal() { this.open = true; } close() { this.open = false; }
  animate(kf, opts) {
    if (/arrow|lockbtn/.test(this.className)) this.env.violations.push(this.className + ' animated');
    const rec = { el: this, kf, opts }; this.env.animations.push(rec);
    return { finished: new Promise(res => { rec.resolve = res; }), cancel() {} };
  }
}

function boot(saved) {
  const env = { violations: [], animations: [] }, els = {}, mem = Object.assign({}, saved || {}), timers = [];
  const get = s => els[s] || (els[s] = new FakeEl(env, 'div'));
  const ctx = {
    document: { querySelector: get, createElement: tag => new FakeEl(env, tag), addEventListener() {} },
    localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v },
    location: { origin: 'https://example.com', pathname: '/slip/' }, navigator: {}, addEventListener() {},
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout(id) { if (timers[id - 1]) timers[id - 1].f = null; },
    Promise, console, Core: require('./core.js'), Data: require('./data.js')
  };
  vm.createContext(ctx); vm.runInContext(ui, ctx);
  const g = { ctx, els, mem, env, timers, run: c => vm.runInContext(c, ctx) };
  // Give the tiles real-looking positions: 60px apart, 56px wide.
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const t = g.run(`E.tiles[${r}][${c}]`); t.offsetLeft = c * 60; t.offsetTop = r * 60; }
  const E = g.run('E');
  g.E = E; g.field = E.field;
  g.grid = () => g.run('S.grid');
  g.shown = () => { let s = ''; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += E.tiles[r][c].textContent; return s; };
  g.arrow = m => E.arrows[m]; g.lock = k => E.lockBtns[k];
  g.clones = () => E.field.children.filter(c => c.classList.contains('clone'));
  g.flush = async () => { g.env.animations.splice(0).forEach(a => a.resolve()); for (let i = 0; i < 5; i++) await Promise.resolve(); };
  g.runTimers = () => { const t = timers.splice(0); t.forEach(x => x.f && x.f()); };
  g.press = (r, c, x, y) => (E.field.listeners.pointerdown || []).forEach(f => f({ target: E.tiles[r][c], clientX: x, clientY: y, pointerId: 1 }));
  g.dragTo = (x, y) => (E.field.listeners.pointermove || []).forEach(f => f({ clientX: x, clientY: y }));
  g.release = (x, y) => (E.field.listeners.pointerup || []).forEach(f => f({ clientX: x, clientY: y }));
  g.tilesLocked = () => { let n = 0; E.tiles.forEach(row => row.forEach(t => { if (t.classList.contains('locked')) n++; })); return n; };
  g.tilesFeedback = () => { let n = 0; E.tiles.forEach(row => row.forEach(t => { if (t.classList.contains('ok') || t.classList.contains('no')) n++; })); return n; };
  g.msg = () => els['#msg'] ? els['#msg'].textContent : '';
  return g;
}

(async () => {
  let g = boot();
  const p = g.run('puzzle'), C = g.ctx.Core, states = C.pathStates(p.start, p.solution);

  // ---- the board is built once, with the arrows and lock icons where they belong ----
  assert.strictEqual(g.field.children.length, 16, 'sixteen tiles in the field');
  assert.strictEqual(Object.keys(g.E.arrows).length, 16);
  assert.strictEqual(Object.keys(g.E.lockBtns).length, 8);
  assert.strictEqual(g.shown(), p.start);
  assert.strictEqual(g.tilesFeedback(), 0, 'no feedback on load');
  assert.strictEqual(g.tilesLocked(), 0);
  assert(Object.values(g.E.lockBtns).every(b => b.textContent === '🔓'), 'every lock icon starts open');
  assert.strictEqual(g.arrow('r0+').style.gridColumn, '7'); assert.strictEqual(g.arrow('c0-').style.gridRow, '2');
  assert.strictEqual(g.lock('r2').style.gridColumn, '1'); assert.strictEqual(g.lock('c1').style.gridRow, '1');
  const arrowsBefore = Object.values(g.E.arrows).slice();

  // ---- an arrow move: letters change in place, the line animates with copies, arrows never animate ----
  g.arrow('r1+').onclick();
  assert.strictEqual(g.grid(), C.applyMove(p.start, 'r1+'));
  assert.strictEqual(g.shown(), g.grid(), 'tiles show the new letters straight away');
  let clones = g.clones();
  assert.strictEqual(clones.length, 5, 'a full row: three sliding, one leaving, one entering');
  assert.strictEqual(g.env.animations.length, 5);
  for (let c = 0; c < 4; c++) assert.strictEqual(g.E.tiles[1][c].style.visibility, 'hidden', 'the real tiles of the line are hidden while the copies move');
  assert.strictEqual(g.E.tiles[0][0].style.visibility, undefined, 'other tiles are untouched');
  const exit = clones.find(c => c.style.left === '180px' && g.env.animations.find(a => a.el === c).kf[1].transform === 'translate(60px, 0px)');
  assert(exit, 'the last letter leaves by the right edge');
  const enter = clones.find(c => c.style.left === '-60px');
  assert(enter, 'and a copy of it enters from beyond the left edge');
  assert.strictEqual(enter.textContent, exit.textContent, 'the entering copy is the same letter');
  assert.strictEqual(g.env.animations.find(a => a.el === enter).kf[1].transform, 'translate(60px, 0px)', 'it slides one tile in');
  clones.forEach(c => assert.strictEqual(c.parent, g.field, 'copies live inside the clipped field'));
  await g.flush();
  assert.strictEqual(g.clones().length, 0, 'copies are removed when the animation ends');
  for (let c = 0; c < 4; c++) assert.strictEqual(g.E.tiles[1][c].style.visibility, '', 'the real tiles are shown again');
  assert.strictEqual(g.env.violations.length, 0, 'arrows and lock icons are never moved or animated');
  assert(Object.values(g.E.arrows).every((a, i) => a === arrowsBefore[i]), 'the arrow elements are the same objects: nothing was re-created');

  // starting a second move mid-animation finishes the first cleanly
  g.arrow('c2-').onclick(); g.arrow('r3-').onclick();
  assert.strictEqual(g.clones().length, 5, 'only the latest move has copies');
  await g.flush();
  assert.strictEqual(g.clones().length, 0);
  assert.strictEqual(g.shown(), g.grid());
  // column moves go up and down
  g.arrow('c0+').onclick();
  assert(g.env.animations.some(a => /translate\(0px, 60px\)/.test(a.kf[1].transform)), 'a column slide moves vertically');
  await g.flush();

  // ---- undo ----
  g = boot();
  g.arrow('r0+').onclick(); await g.flush();
  g.els['#undo'].onclick();
  assert.strictEqual(g.grid(), p.start); assert.strictEqual(g.shown(), p.start);
  assert.strictEqual(g.clones().length, 5, 'undo animates too');
  await g.flush();

  // ---- dragging ----
  g = boot();
  g.press(2, 1, 100, 100); g.dragTo(105, 102);                  // under the lock distance
  assert(!g.E.board.classList.contains('dragging'), 'a small wobble does not start a drag');
  g.dragTo(125, 104);
  assert(g.E.board.classList.contains('dragging'), 'the board dims while dragging');
  assert(g.E.tiles[2].every(t => t.classList.contains('line')), 'the row lights up');
  assert(g.E.tiles[2].every(t => t.style.transform === 'translate(25px, 0)'), 'the row follows the finger');
  assert(g.E.tiles[1].every(t => !t.classList.contains('line')), 'other rows stay dim');
  let wrap = g.clones();
  assert.strictEqual(wrap.length, 1, 'the wrapping letter shows entering');
  assert.strictEqual(wrap[0].textContent, g.E.tiles[2][3].textContent); assert.strictEqual(wrap[0].style.left, '0px');
  assert.strictEqual(wrap[0].style.transform, 'translate(-35px, 0)', 'it starts one tile outside the field edge');
  g.dragTo(130, 190);                                           // the axis stays locked even if the finger drifts
  assert(g.E.tiles[2].every(t => /translate\(\d+px, 0\)/.test(t.style.transform)));
  g.dragTo(300, 100);                                           // clamped to one tile
  assert(g.E.tiles[2].every(t => t.style.transform === 'translate(60px, 0)'));
  g.dragTo(70, 100);                                            // flipping direction swaps the wrap letter to the other end
  wrap = g.clones();
  assert.strictEqual(wrap.length, 1); assert.strictEqual(wrap[0].textContent, g.E.tiles[2][0].textContent); assert.strictEqual(wrap[0].style.left, '180px');
  g.dragTo(140, 100);
  g.release(140, 100);
  assert.strictEqual(g.grid(), C.applyMove(p.start, 'r2+'), 'release past a third of a tile commits one step');
  assert(g.E.tiles[2].every(t => !t.style.transform && !t.classList.contains('line')), 'the preview is cleared');
  assert(!g.E.board.classList.contains('dragging'));
  assert.strictEqual(g.clones().length, 5, 'the slide finishes from where the finger left it');
  assert(g.env.animations.some(a => a.kf[0].transform === 'translate(40px, 0px)'), 'the animation starts at the dragged offset');
  assert(g.env.animations.every(a => /translate\(40px, 0px\)|translate\(0px, 0px\)/.test(a.kf[0].transform)));
  await g.flush();
  // a short drag springs back
  const mid = g.grid();
  g.press(0, 0, 100, 100); g.dragTo(100, 112); g.release(100, 112);
  assert.strictEqual(g.grid(), mid, 'a short drag does not move anything');
  assert(g.E.tiles.every(row => row.every(t => !t.style.transform)), 'the line returns to place');
  assert(g.env.animations.some(a => a.kf[0].transform === 'translate(0, 12px)' && a.kf[1].transform === 'translate(0, 0)'), 'the spring-back is animated');
  await g.flush();
  // dragging up commits an up move
  g.press(1, 3, 100, 100); g.dragTo(103, 70); g.release(101, 60);
  assert.strictEqual(g.grid(), C.applyMove(mid, 'c3-'));
  await g.flush();
  // a tap does nothing
  const before = g.grid(); g.press(2, 2, 50, 50); g.release(50, 50);
  assert.strictEqual(g.grid(), before);
  assert.strictEqual(g.env.violations.length, 0);

  // ---- locking rows and columns ----
  g = boot();
  g.lock('r2').onclick();
  same(g.run('S.locks'), { rows: [2], cols: [] });
  assert.strictEqual(g.lock('r2').textContent, '🔒'); assert(g.lock('r2').classList.contains('on'));
  assert(/Row 3 locked/.test(g.msg()));
  assert.strictEqual(g.run('S.lockUsed'), true);
  assert.strictEqual(g.tilesLocked(), 4, 'the locked row is drawn as locked');
  assert(g.arrow('r2+').disabled && g.arrow('r2-').disabled, 'the locked row arrows are disabled');
  assert(!g.arrow('r1+').disabled && !g.arrow('c0+').disabled);
  g.lock('c1').onclick();
  same(g.run('S.locks'), { rows: [2], cols: [1] });
  assert.strictEqual(g.tilesLocked(), 7, 'a locked row and column freeze seven cells');
  assert(g.arrow('c1+').disabled && g.arrow('c1-').disabled);
  // a free row beside a locked column slides only its free cells and nothing else moves
  const gridLocked = g.grid();
  g.arrow('r0+').onclick();
  assert.strictEqual(g.grid(), C.applyMoveLocked(gridLocked, 'r0+', { rows: [2], cols: [1] }));
  assert.strictEqual(g.grid()[1], gridLocked[1], 'the locked column letter did not move');
  assert.strictEqual(g.clones().length, 3, 'a line with a frozen cell has no edge wrap: three copies, one per free cell');
  assert(g.env.animations.some(a => /translate\(-180px, 0px\)/.test(a.kf[1].transform)), 'the wrapping letter slides straight to its slot');
  await g.flush();
  // drags along a locked line are refused with a message
  const keep = g.grid();
  g.press(2, 0, 100, 100); g.dragTo(130, 102);
  assert(!g.E.board.classList.contains('dragging')); assert(/Row 3 is locked/.test(g.msg()));
  g.release(160, 102);
  assert.strictEqual(g.grid(), keep);
  g.press(0, 1, 100, 100); g.dragTo(101, 130);
  assert(/Column 2 is locked/.test(g.msg()));
  g.release(101, 160); assert.strictEqual(g.grid(), keep);
  // moves along free lines are still fine, from a frozen tile too
  g.press(2, 3, 100, 100); g.dragTo(101, 70); g.release(101, 50);
  assert.strictEqual(g.grid(), C.applyMoveLocked(keep, 'c3-', { rows: [2], cols: [1] }), 'dragging a frozen tile along its free line works');
  await g.flush();
  // unlocking restores movement and keeps the "locks used" mark
  g.lock('r2').onclick(); g.lock('c1').onclick();
  assert.strictEqual(g.tilesLocked(), 0); assert(!g.arrow('r2+').disabled);
  assert.strictEqual(g.run('S.lockUsed'), true, 'once used, always marked as used');
  assert(Object.values(g.E.lockBtns).every(b => b.textContent === '🔓'));
  // undo steps back under the locks each move was made with, even after the locks change
  g = boot();
  g.lock('r1').onclick();
  const g0 = g.grid();
  g.arrow('c0+').onclick(); await g.flush();
  assert.strictEqual(g.grid(), C.applyMoveLocked(g0, 'c0+', { rows: [1], cols: [] }));
  g.lock('r1').onclick();
  g.els['#undo'].onclick();
  assert.strictEqual(g.grid(), g0, 'undo restores the exact grid after the lock was removed');
  await g.flush();
  // reset clears the locks but not the mark
  g.lock('c2').onclick(); g.arrow('r0+').onclick(); await g.flush();
  g.els['#reset'].onclick();
  same(g.run('S.locks'), { rows: [], cols: [] }); assert.strictEqual(g.grid(), p.start); assert.strictEqual(g.run('S.lockUsed'), true);
  assert.strictEqual(g.tilesLocked(), 0);
  // a hint never suggests a locked line
  g = boot(); g.lock('r0').onclick();
  const lk = g.run('S.locks');
  g.els['#hint'].onclick();
  const hm = g.run('Core.hintMove(S.grid, puzzle.words, puzzle.alts, 10, S.locks)');
  assert(!hm || (C.isValidMove(hm, lk)), 'hint respects locks');
  if (hm) assert(g.arrow(hm).classList.contains('hint'));
  // locks that make the puzzle impossible say so
  g = boot(); g.lock('r0').onclick(); g.lock('r1').onclick(); g.lock('r2').onclick(); g.lock('r3').onclick();
  g.els['#hint'].onclick();
  assert(/lock may be in the way/.test(g.msg()));
  assert(Object.values(g.E.arrows).every(a => a.disabled), 'with every row locked nothing can move');

  // ---- check, hint, replay, give up, out of checks ----
  g = boot();
  g.arrow('r0+').onclick(); await g.flush();
  g.els['#check'].onclick();
  assert.strictEqual(g.tilesFeedback(), 16, 'every tile is marked after a check');
  assert.strictEqual(g.els['#checks'].textContent, 2);
  g.arrow('r0-').onclick();
  assert.strictEqual(g.tilesFeedback(), 0, 'feedback clears after a move');
  await g.flush();

  // a win with no locks: the share text says so, and the path can be replayed
  g = boot();
  p.solution.forEach(m => g.arrow(m).onclick());
  assert.strictEqual(g.run('S.won'), true); assert.strictEqual(g.run('S.moves.length'), p.par);
  g.runTimers();
  assert(/🔓 no locks/.test(g.run('shareTextValue')), 'the share screen shows that no locks were used');
  assert(!/🔒/.test(g.run('shareTextValue')));
  assert(Object.values(g.E.lockBtns).every(b => b.disabled), 'lock icons are disabled after the game');
  assert(Object.values(g.E.arrows).every(a => a.disabled));
  assert.strictEqual(g.els['#showpath'].style.display, '');
  const finalGrid = g.grid(), saved = g.mem['slip:state'];
  g.els['#showpath'].onclick();
  assert.strictEqual(g.shown(), p.start, 'replay starts from the beginning state');
  assert(Object.values(g.E.arrows).every(a => a.disabled) && Object.values(g.E.lockBtns).every(b => b.disabled));
  assert(/shortest path takes /.test(g.els['#replayCap'].textContent));
  for (let i = 0; i < p.par; i++) {
    g.runTimers();
    assert(g.arrow(p.solution[i]).classList.contains('hint'), 'next arrow is flashed at step ' + i);
    g.runTimers();
    assert.strictEqual(g.shown(), states[i + 1], 'replay shows step ' + (i + 1));
    await g.flush();
  }
  assert(g.E.tiles[0][0].classList.contains('done'), 'the last frame is solved');
  assert.strictEqual(g.mem['slip:state'], saved, 'replay never changes the saved game');
  assert.strictEqual(g.env.violations.length, 0);
  g.els['#rClose'].onclick();
  assert.strictEqual(g.shown(), finalGrid);

  // a win that used locks: the share screen says so, even if they were removed again
  g = boot();
  g.lock('c3').onclick(); g.lock('c3').onclick();
  p.solution.forEach(m => g.arrow(m).onclick());
  assert.strictEqual(g.run('S.won'), true);
  g.runTimers();
  assert(/🔒 locks used/.test(g.run('shareTextValue'))); assert(!/no locks/.test(g.run('shareTextValue')));

  // the replay shows no locks even if the game was finished with locks on
  g = boot(); g.lock('r0').onclick();
  g.els['#giveup'].onclick();
  assert.strictEqual(g.run('S.over'), true);
  g.els['#showpath'].onclick();
  assert.strictEqual(g.tilesLocked(), 0, 'replay frames never show locks');
  assert.strictEqual(g.shown(), p.start);
  g.els['#rClose'].onclick();
  assert.strictEqual(g.tilesLocked(), 4, 'the finished game shows its locks again afterwards');

  // give up and out of checks
  g = boot(); g.els['#giveup'].onclick();
  assert.strictEqual(g.run('S.won'), false); assert.strictEqual(JSON.parse(g.mem['slip:stats']).streak, 0);
  g.runTimers(); assert(/did not solve it/.test(g.run('shareTextValue'))); assert(/🔓 no locks/.test(g.run('shareTextValue')));
  g = boot();
  g.arrow('r0+').onclick(); await g.flush();
  g.els['#check'].onclick(); assert.strictEqual(g.run('S.over'), false);
  g.els['#check'].onclick(); assert.strictEqual(g.run('S.over'), false);
  g.els['#check'].onclick();
  assert.strictEqual(g.run('S.over'), true); assert.strictEqual(g.run('S.won'), false);
  assert.strictEqual(g.tilesFeedback(), 16, 'the final check stays on the board');
  assert(/Out of checks/.test(g.msg()));
  assert.strictEqual(g.els['#showpath'].style.display, '');

  // ---- saved games ----
  g = boot(); g.lock('r1').onclick(); g.lock('c2').onclick(); g.arrow('c0+').onclick(); await g.flush();
  const lockedSave = g.mem['slip:state'];
  g = boot({ 'slip:state': lockedSave });
  same(g.run('S.locks'), { rows: [1], cols: [2] }, 'locks come back after a reload');
  assert.strictEqual(g.run('S.lockUsed'), true); assert.strictEqual(g.run('S.moves.length'), 1);
  assert.strictEqual(g.shown(), g.grid()); assert(g.lock('r1').classList.contains('on'));
  g.els['#undo'].onclick();
  assert.strictEqual(g.grid(), p.start, 'undo still works after a reload');
  const mk = patch => JSON.stringify(Object.assign(JSON.parse(lockedSave), patch));
  for (const bad of [{ locks: { rows: [9], cols: [] } }, { locks: { rows: [1, 1], cols: [] } }, { locks: { rows: 'x', cols: [] } },
    { locks: [0, 1] }, { moveLocks: [] }, { moveLocks: [{ rows: [7], cols: [] }] }, { date: '2020-01-01' }, { id: 'other' }, { grid: 'ZZZZZZZZZZZZZZZZ' }]) {
    g = boot({ 'slip:state': mk(bad) });
    assert.strictEqual(g.grid(), p.start, 'a bad save is discarded: ' + JSON.stringify(bad));
    same(g.run('S.locks'), { rows: [], cols: [] });
  }
  // a save from before locks existed still loads
  const old = { date: g.run('today'), id: p.id, grid: C.applyMove(p.start, 'r0+'), moves: ['r0+'], checks: 1, hints: 0, feedback: null, over: false, won: false };
  g = boot({ 'slip:state': JSON.stringify(old) });
  assert.strictEqual(g.grid(), old.grid); same(g.run('S.moveLocks'), [{ rows: [], cols: [] }]); assert.strictEqual(g.run('S.lockUsed'), false);
  g.els['#undo'].onclick(); assert.strictEqual(g.grid(), p.start);
  // an old easy-mode save with locked rows is discarded
  g = boot({ 'slip:state': JSON.stringify(Object.assign({}, old, { locks: [0], lockPoints: [0] })) });
  assert.strictEqual(g.grid(), p.start);
  console.log('smoke ok');
})().catch(e => { console.error(e); process.exit(1); });
