const assert = require('assert');
const fs = require('fs');
const C = require('./core.js'), D = require('./data.js');
const P = D.PUZZLES, LETTERS = 'ABCDEFGHIJKLMNOP', L = (rows, cols) => ({ rows: rows || [], cols: cols || [] });
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };

t('core, index.html and sw.js agree on the version, and the scripts carry it', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.strictEqual(C.VERSION, 'slip-7');
  assert(html.includes("Core.VERSION !== '" + C.VERSION + "'") && html.includes('core.js?v=' + C.VERSION) && html.includes('data.js?v=' + C.VERSION));
  assert(fs.readFileSync('sw.js', 'utf8').includes("'" + C.VERSION + "'"));
});
t('slides wrap round and every move is undone by its inverse', () => {
  assert.strictEqual(C.slideRow(LETTERS, 0, 1), 'DABCEFGHIJKLMNOP');
  assert.strictEqual(C.slideCol(LETTERS, 0, 1), 'MBCDAFGHEJKLINOP');
  for (let k = 0; k < 100; k++) {
    const g = C.shuffle(LETTERS.split(''), k + 1).join('');
    C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyMove(C.applyMove(g, m), C.invert(m)), g));
  }
});
t('the grid can spell the words without that being a win: isSolved only reports it, the game decides', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'];
  assert(C.isSolved('LIONDEALROADBEAR', w) && !C.isSolved('BEARROADDEALLIOM', w));
  assert(C.isSolved('BAREROADLEADLOIN', w, { BEAR: ['BARE'], DEAL: ['LEAD'], LION: ['LOIN'] }));
  const html = fs.readFileSync('index.html', 'utf8');
  const doMove = html.slice(html.indexOf('function doMove'), html.indexOf('function undo'));
  assert(!/finish\(/.test(doMove) && !/isSolved/.test(doMove), 'moving must never end the game');
  const check = html.slice(html.indexOf('function check()'), html.indexOf('function hint()'));
  assert(/right === 4/.test(check) && /finish\(true\)/.test(check), 'Check is where the game is won');
});
t('every puzzle is solvable, has exact par, never starts solved, and its stored path replays', () => {
  assert.strictEqual(new Set(P.map(p => p.id)).size, P.length);
  P.forEach(p => {
    assert.strictEqual(p.start.split('').sort().join(''), p.words.join('').split('').sort().join(''), p.id);
    assert(!C.isSolved(p.start, p.words, p.alts) && !C.rowMatches(p.start, p.words, p.alts).some(Boolean), p.id);
    assert(C.isSolved(C.applyAll(p.start, p.solution), p.words, p.alts), p.id);
    assert.strictEqual(p.solution.length, p.par, p.id);
    assert.strictEqual(C.minMoves(p.start, p.words, 9, p.alts).length, p.par, p.id + ' par is exact');
    assert(p.par >= 3 && p.par <= 7);
  });
});
t('hints: following them from the start solves each puzzle in exactly par moves', () => {
  P.forEach(p => {
    let g = p.start, steps = 0;
    while (!C.isSolved(g, p.words, p.alts)) { g = C.applyMove(g, C.hintMove(g, p.words, p.alts, 10)); steps++; assert(steps <= p.par); }
    assert.strictEqual(steps, p.par);
  });
  assert.strictEqual(C.hintMove(C.applyAll(P[0].start, P[0].solution), P[0].words, P[0].alts), null);
});
t('locks: frozen cells never move, undo is exact, and a puzzle can be solved under locks', () => {
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c1+', L([1])), 'ANCDEFGHIBKLMJOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'r1+', L([], [0])), 'ABCDEHFGIJKLMNOP');
  assert(!C.isValidMove('r2+', L([2])) && C.validMoves(L([0], [0])).length === 12);
  const sets = [L([0]), L([], [1]), L([0], [0]), L([2], [1, 3])];
  sets.forEach(lk => {
    const g = C.shuffle(LETTERS.split(''), 5).join('');
    C.validMoves(lk).forEach(m => {
      const s = C.applyMoveLocked(g, m, lk);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (C.isFrozen(r, c, lk)) assert.strictEqual(s[r * 4 + c], g[r * 4 + c]);
      assert.strictEqual(C.applyMoveLocked(s, C.invert(m), lk), g);
    });
  });
  const rnd = C.mulberry32(3);
  P.forEach(p => sets.forEach(lk => {
    const mv = C.validMoves(lk); let g = C.applyAll(p.start, p.solution);
    for (let i = 0; i < 5; i++) g = C.applyMoveLocked(g, mv[Math.floor(rnd() * mv.length)], lk);
    if (C.isSolved(g, p.words, p.alts)) return;
    const sol = C.minMoves(g, p.words, 8, p.alts, lk);
    assert(sol && sol.length <= 5 && sol.every(m => C.isValidMove(m, lk)), p.id);
  }));
  assert.strictEqual(C.minMoves(P[0].start, P[0].words, 9, P[0].alts, L([0, 1, 2, 3])), null);
});
t('daily puzzle exists for two years; dates and streaks behave', () => {
  for (let i = 0; i < 730; i++) assert(C.pick(P, i).start);
  assert.strictEqual(C.dayIndex(new Date(2026, 9, 7)), 279);
  let s = C.updateStats(null, true, '2026-10-05'); s = C.updateStats(s, true, '2026-10-06'); assert.strictEqual(s.streak, 2);
  s = C.updateStats(s, true, '2026-10-08'); assert.strictEqual(s.streak, 1);
});
t('share text shows moves against par, hints, and whether locks were used', () => {
  assert(C.shareText('2026-10-07', 6, 5, true, '', 2, false).includes('🔓 no locks'));
  assert(C.shareText('2026-10-07', 5, 5, true, '', 0, true).includes('🔒 locks used'));
  assert(C.shareText('2026-10-07', 3, 5, false, '', 0, false).includes('did not solve it'));
});
console.log('\n' + n + ' tests passed');
