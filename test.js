const assert = require('assert');
const C = require('./core.js'), D = require('./data.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const P = D.PUZZLES;
const LETTERS = 'ABCDEFGHIJKLMNOP';
const L = (rows, cols) => ({ rows: rows || [], cols: cols || [] });

// ---------- the grid ----------
t('slide row right wraps the last letter to the front', () => assert.strictEqual(C.slideRow(LETTERS, 0, 1), 'DABCEFGHIJKLMNOP'));
t('slide row left wraps the first letter to the end', () => assert.strictEqual(C.slideRow(LETTERS, 1, -1), 'ABCDFGHEIJKLMNOP'));
t('slide column down wraps the bottom letter to the top', () => assert.strictEqual(C.slideCol(LETTERS, 0, 1), 'MBCDAFGHEJKLINOP'));
t('slide column up wraps the top letter to the bottom', () => assert.strictEqual(C.slideCol(LETTERS, 3, -1), 'ABCHEFGLIJKPMNOD'));
t('there are 16 distinct moves', () => assert.strictEqual(new Set(C.ALL_MOVES).size, 16));
t('every move is undone by its inverse, from any grid', () => {
  for (let k = 0; k < 200; k++) {
    const g = C.shuffle(LETTERS.split(''), k + 1).join('');
    C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyMove(C.applyMove(g, m), C.invert(m)), g, m));
  }
});
t('four slides in one direction return the original grid', () => C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyAll(LETTERS, [m, m, m, m]), LETTERS, m)));
t('moves never change the set of letters', () => {
  const g = P[0].start;
  C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyMove(g, m).split('').sort().join(''), g.split('').sort().join('')));
});
t('describeMove reads naturally', () => {
  assert.strictEqual(C.describeMove('r0+'), 'row 1 right');
  assert.strictEqual(C.describeMove('r3-'), 'row 4 left');
  assert.strictEqual(C.describeMove('c1+'), 'column 2 down');
  assert.strictEqual(C.describeMove('c2-'), 'column 3 up');
});
t('pathStates lists the start and the grid after every move', () => {
  const moves = ['r0+', 'c1-', 'r3+'], s = C.pathStates(LETTERS, moves);
  assert.strictEqual(s.length, 4); assert.strictEqual(s[0], LETTERS);
  moves.forEach((m, i) => assert.strictEqual(s[i + 1], C.applyMove(s[i], m)));
  assert.deepStrictEqual(C.pathStates(LETTERS, []), [LETTERS]);
});
t('every puzzle path has par + 1 grids, begins at the start, ends solved, and each step is one move', () => {
  P.forEach(p => {
    const s = C.pathStates(p.start, p.solution);
    assert.strictEqual(s.length, p.par + 1, p.id);
    assert.strictEqual(s[0], p.start);
    assert(C.isSolved(s[s.length - 1], p.words, p.alts), p.id);
    for (let i = 0; i < p.par; i++) assert(!C.isSolved(s[i], p.words, p.alts), p.id + ' solved early at step ' + i);
    s.slice(1).forEach((g, i) => assert(C.ALL_MOVES.some(m => C.applyMove(s[i], m) === g), p.id + ' step ' + i));
  });
});

// ---------- winning ----------
t('isSolved accepts the words in any row order and nothing else', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'];
  assert(C.isSolved('BEARROADDEALLION', w));
  assert(C.isSolved('LIONDEALROADBEAR', w));
  assert(!C.isSolved('BEARROADDEALLIOM', w));
  assert(!C.isSolved('EARBROADDEALLION', w));
});
t('rowMatches marks rows that spell a target word, each word once', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'];
  assert.deepStrictEqual(C.rowMatches('BEARXXXXDEALLION', w), [true, false, true, true]);
  assert.deepStrictEqual(C.rowMatches('BEARBEARBEARBEAR', w), [true, false, false, false]);
});
t('alternative spellings count: BARE for BEAR, LEAD for DEAL', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'], alts = { BEAR: ['BARE'], DEAL: ['LEAD'], LION: ['LOIN'] };
  assert(!C.isSolved('BAREROADLEADLOIN', w));
  assert(C.isSolved('BAREROADLEADLOIN', w, alts));
  assert(!C.isSolved('BARELEADROADLOIN', w, { BEAR: ['BARE'] }));
  assert.deepStrictEqual(C.rowMatches('BAREROADLEADLION', w, alts), [true, true, true, true]);
  assert.deepStrictEqual(C.rowMatches('BAREBEARLEADLION', w, alts), [true, false, true, true]);
  assert.deepStrictEqual(C.rowMatches('BAREBAREXXXXLION', w, alts), [true, false, false, true]);
});

// ---------- solving, hints, puzzles ----------
t('minMoves finds a replayable shortest path for known scrambles', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'], solved = 'BEARROADDEALLION';
  const start = C.applyAll(solved, ['r0+', 'c2-', 'r3-']);
  const sol = C.minMoves(start, w, 6);
  assert(sol.length <= 3);
  assert(C.isSolved(C.applyAll(start, sol), w));
  assert.deepStrictEqual(C.minMoves(solved, w), []);
});
t('scramble is deterministic and solvable', () => {
  const w = P[0].words;
  assert.strictEqual(C.scramble(w, 9, 6), C.scramble(w, 9, 6));
  const sol = C.minMoves(C.scramble(w, 9, 6), w, 8);
  assert(sol && sol.length <= 6);
});
t('hintMove: following the hints from the start reaches a solved grid in exactly par moves', () => {
  P.forEach(p => {
    let g = p.start, steps = 0;
    while (!C.isSolved(g, p.words, p.alts)) {
      const m = C.hintMove(g, p.words, p.alts, 10);
      assert(m, p.id + ' hint missing at step ' + steps);
      g = C.applyMove(g, m); steps++;
      assert(steps <= p.par, p.id + ' hints took too long');
    }
    assert.strictEqual(steps, p.par, p.id);
  });
});
t('hintMove: returns null for a solved grid and for a grid that is too far away', () => {
  const p = P[0];
  assert.strictEqual(C.hintMove(C.applyAll(p.start, p.solution), p.words, p.alts), null);
  assert.strictEqual(C.hintMove(p.start, p.words, p.alts, 1), null);
});
t('every puzzle has four distinct uppercase 4-letter words and unique ids', () => {
  assert.strictEqual(new Set(P.map(p => p.id)).size, P.length);
  P.forEach(p => {
    assert.strictEqual(p.words.length, 4, p.id);
    assert.strictEqual(new Set(p.words).size, 4, p.id);
    p.words.forEach(w => assert(/^[A-Z]{4}$/.test(w), p.id + ' ' + w));
  });
});
t('every puzzle uses exactly its words\' letters and does not start solved or with a correct row', () => {
  P.forEach(p => {
    assert.strictEqual(p.start.length, 16, p.id);
    assert.strictEqual(p.start.split('').sort().join(''), p.words.join('').split('').sort().join(''), p.id);
    assert(!C.isSolved(p.start, p.words, p.alts), p.id);
    assert(!C.rowMatches(p.start, p.words, p.alts).some(Boolean), p.id + ' starts with a correct row');
  });
});
t('every stored solution replays to a solved grid and its length is par', () => {
  P.forEach(p => {
    assert(C.isSolved(C.applyAll(p.start, p.solution), p.words, p.alts), p.id);
    assert.strictEqual(p.solution.length, p.par, p.id);
    assert(p.par >= 3 && p.par <= 7, p.id);
  });
});
t('par is exact: no shorter solution exists (checked by a fresh search)', () => {
  P.forEach(p => assert.strictEqual(C.minMoves(p.start, p.words, 9, p.alts).length, p.par, p.id));
});
t('the puzzle mix spans easy to hard', () => {
  const pars = P.map(p => p.par);
  assert(Math.min(...pars) <= 4); assert(Math.max(...pars) >= 6);
});
t('alternative spellings are anagrams of their target and never repeat a word in a set', () => {
  P.forEach(p => {
    const all = p.words.concat(...Object.values(p.alts));
    assert.strictEqual(new Set(all).size, all.length, p.id);
    Object.entries(p.alts).forEach(([w, list]) => list.forEach(a => assert.strictEqual(a.split('').sort().join(''), w.split('').sort().join(''), p.id + ' ' + a)));
  });
});
t('a puzzle exists for every day for two years', () => { for (let i = 0; i < 730; i++) assert(C.pick(P, i).start); });

// ---------- locking rows and columns ----------
const LOCK_SETS = [L(), L([0]), L([3]), L([], [1]), L([], [2]), L([0], [0]), L([1, 2]), L([], [0, 3]), L([2], [1, 3]), L([0, 3], [2])];
t('locks: with no locks, applyMoveLocked is the same as applyMove', () => {
  for (let k = 0; k < 50; k++) {
    const g = C.shuffle(LETTERS.split(''), k + 1).join('');
    C.ALL_MOVES.forEach(m => { assert.strictEqual(C.applyMoveLocked(g, m, L()), C.applyMove(g, m)); assert.strictEqual(C.applyMoveLocked(g, m, null), C.applyMove(g, m)); });
  }
});
t('locks: a locked row is skipped by column slides', () => {
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c1+', L([1])), 'ANCDEFGHIBKLMJOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c1-', L([1])), 'AJCDEFGHINKLMBOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c0+', L([0, 2])), 'ABCDMFGHIJKLENOP');
});
t('locks: a locked column is skipped by row slides', () => {
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'r1+', L([], [0])), 'ABCDEHFGIJKLMNOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'r1-', L([], [0])), 'ABCDEGHFIJKLMNOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'r2+', L([], [1, 2])), 'ABCDEFGHLJKIMNOP');
});
t('locks: a row and a column locked together freeze their whole lines', () => {
  const lk = L([0], [0]);
  const s = C.applyMoveLocked(LETTERS, 'r1+', lk);        // row 1 free, column 0 frozen: cells F,G,H cycle
  assert.strictEqual(s, 'ABCDEHFGIJKLMNOP');
  const u = C.applyMoveLocked(LETTERS, 'c1+', lk);        // column 1 free, row 0 frozen: cells F,J,N cycle
  assert.strictEqual(u, 'ABCDENGHIFKLMJOP');
});
t('locks: a locked line, or a line with fewer than two free cells, is not a valid move', () => {
  assert(!C.isValidMove('r2+', L([2])) && !C.isValidMove('r2-', L([2])));
  assert(!C.isValidMove('c1+', L([], [1])));
  assert(C.isValidMove('r0+', L([2])));
  assert(!C.isValidMove('r0+', L([], [0, 1, 2])));         // only one free cell in the row
  assert(C.isValidMove('r0+', L([], [0, 1])));
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'r2+', L([2])), LETTERS);
});
t('locks: valid move counts', () => {
  assert.strictEqual(C.validMoves(L()).length, 16);
  assert.strictEqual(C.validMoves(L([2])).length, 14);
  assert.strictEqual(C.validMoves(L([0], [0])).length, 12);
  assert.strictEqual(C.validMoves(L([0, 1, 2, 3])).length, 0);
});
t('locks: frozen cells never change and the letters are preserved, from any grid', () => {
  LOCK_SETS.forEach(lk => {
    for (let k = 0; k < 30; k++) {
      const g = C.shuffle(LETTERS.split(''), k + 7).join('');
      C.validMoves(lk).forEach(m => {
        const s = C.applyMoveLocked(g, m, lk);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (C.isFrozen(r, c, lk)) assert.strictEqual(s[r * 4 + c], g[r * 4 + c], JSON.stringify(lk) + ' ' + m);
        assert.strictEqual(s.split('').sort().join(''), g.split('').sort().join(''));
      });
    }
  });
});
t('locks: every valid move is undone by its inverse under the same locks', () => {
  LOCK_SETS.forEach(lk => {
    const g = C.shuffle(LETTERS.split(''), 3).join('');
    C.validMoves(lk).forEach(m => assert.strictEqual(C.applyMoveLocked(C.applyMoveLocked(g, m, lk), C.invert(m), lk), g, JSON.stringify(lk) + ' ' + m));
  });
});
t('locks: a line returns after as many slides as it has free cells', () => {
  [['c2+', L(), 4], ['c2+', L([1]), 3], ['c2+', L([0, 2]), 2], ['r1+', L([], [0]), 3], ['r1+', L([], [0, 3]), 2]].forEach(([m, lk, k]) => {
    let s = LETTERS; for (let i = 0; i < k; i++) s = C.applyMoveLocked(s, m, lk);
    assert.strictEqual(s, LETTERS, m + JSON.stringify(lk));
    let u = LETTERS; for (let i = 0; i < k - 1; i++) u = C.applyMoveLocked(u, m, lk);
    assert.notStrictEqual(u, LETTERS);
  });
});
t('locks: cloneLocks copies and sorts, and hasLocks / isFrozen agree', () => {
  const a = L([2, 0], [3]), b = C.cloneLocks(a);
  assert.deepStrictEqual(b, { rows: [0, 2], cols: [3] }); b.rows.push(1); assert.deepStrictEqual(a.rows, [2, 0]);
  assert(C.hasLocks(a) && !C.hasLocks(L()) && !C.hasLocks(null) && !C.hasLocks(C.NO_LOCKS));
  assert(C.isFrozen(2, 1, a) && C.isFrozen(1, 3, a) && !C.isFrozen(1, 1, a));
});
t('locks: goalStates keep the frozen letters, and there are none when a locked cell cannot be right', () => {
  const p = P[0], solved = C.applyAll(p.start, p.solution);
  const open = C.goalStates(solved, p.words, p.alts, L());
  assert(open.length >= 24 && open.includes(solved));
  const locked = C.goalStates(solved, p.words, p.alts, L([0], [1]));
  assert(locked.length >= 1 && locked.length < open.length);
  locked.forEach(g => { assert.strictEqual(g.slice(0, 4), solved.slice(0, 4)); for (let r = 0; r < 4; r++) assert.strictEqual(g[r * 4 + 1], solved[r * 4 + 1]); });
  assert.deepStrictEqual(C.goalStates(p.start, p.words, p.alts, L([0, 1, 2, 3])), []);
});
t('locks: a puzzle scrambled under any locks can be solved under those locks, never using a locked line', () => {
  const rnd = C.mulberry32(11);
  P.forEach(p => {
    const solved = C.applyAll(p.start, p.solution);
    LOCK_SETS.filter(lk => C.hasLocks(lk)).forEach(lk => {
      const mv = C.validMoves(lk);
      if (!mv.length) return;
      let g = solved;
      for (let i = 0; i < 5; i++) g = C.applyMoveLocked(g, mv[Math.floor(rnd() * mv.length)], lk);
      if (C.isSolved(g, p.words, p.alts)) return;
      const sol = C.minMoves(g, p.words, 8, p.alts, lk);
      assert(sol, p.id + ' ' + JSON.stringify(lk) + ' no solution');
      assert(sol.length <= 5, p.id + ' ' + JSON.stringify(lk));
      sol.forEach(m => assert(C.isValidMove(m, lk), 'solution used a locked move ' + m));
      let h = g; sol.forEach(m => { h = C.applyMoveLocked(h, m, lk); });
      assert(C.isSolved(h, p.words, p.alts), p.id + ' ' + JSON.stringify(lk));
    });
  });
});
t('locks: minMoves says there is no route when the locks make a solution impossible', () => {
  const p = P[0];
  assert.strictEqual(C.minMoves(p.start, p.words, 9, p.alts, L([0, 1, 2, 3])), null);
  assert.strictEqual(C.minMoves(p.start, p.words, 9, p.alts, L([0], [])), null);       // row 0 is not a hidden word
});
t('locks: hints respect locks, and following them finishes the puzzle', () => {
  const p = P[13], states = C.pathStates(p.start, p.solution), g0 = states[p.par - 1];
  const lk = L([C.rowMatches(g0, p.words, p.alts).indexOf(true)]);
  let g = g0, steps = 0;
  while (!C.isSolved(g, p.words, p.alts)) {
    const m = C.hintMove(g, p.words, p.alts, 10, lk);
    assert(m && C.isValidMove(m, lk));
    g = C.applyMoveLocked(g, m, lk); steps++;
    assert(steps < 10);
  }
});

// ---------- dates, stats, sharing ----------
t('dates: dayIndex and prevKey', () => {
  assert.strictEqual(C.dayIndex(new Date(2026, 0, 1)), 0);
  assert.strictEqual(C.dayIndex(new Date(2026, 9, 7)), 279);
  assert.strictEqual(C.prevKey('2026-03-01'), '2026-02-28');
  assert.strictEqual(C.prevKey('2026-01-01'), '2025-12-31');
});
t('stats: streak grows on consecutive days and resets on a gap or a loss', () => {
  let s = C.updateStats(null, true, '2026-10-05');
  s = C.updateStats(s, true, '2026-10-06'); assert.strictEqual(s.streak, 2);
  s = C.updateStats(s, true, '2026-10-06'); assert.strictEqual(s.played, 2);
  s = C.updateStats(s, true, '2026-10-08'); assert.strictEqual(s.streak, 1); assert.strictEqual(s.best, 2);
  s = C.updateStats(s, false, '2026-10-09'); assert.strictEqual(s.streak, 0);
});
t('share text shows moves against par, hints used, and whether locks were used', () => {
  const none = C.shareText('2026-10-07', 6, 5, true, 'https://example.com/slip/', 2, false);
  assert(none.includes('6 moves (par 5)')); assert(none.includes('💡2')); assert(none.includes('🔓 no locks')); assert(!none.includes('🔒'));
  assert(none.includes('🟦🟦🟦🟦🟦🟧')); assert(none.endsWith('https://example.com/slip/'));
  const used = C.shareText('2026-10-07', 5, 5, true, '', 0, true);
  assert(used.includes('🔒 locks used')); assert(!used.includes('no locks')); assert(!used.includes('💡'));
  const lost = C.shareText('2026-10-07', 3, 5, false, '', 0, false);
  assert(lost.includes('did not solve it') && lost.includes('🔓 no locks'));
});
console.log('\n' + n + ' tests passed');
