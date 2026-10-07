const assert = require('assert');
const C = require('./core.js'), D = require('./data.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const P = D.PUZZLES;
const LETTERS = 'ABCDEFGHIJKLMNOP';

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
t('matchedWords names the target each row spells', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'], alts = { BEAR: ['BARE'] };
  assert.deepStrictEqual(C.matchedWords('BAREXXXXDEALLION', w, alts), ['BEAR', null, 'DEAL', 'LION']);
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

// ---------- easy mode: locked rows ----------
const LOCK_SETS = [[], [0], [1], [2], [3], [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
t('locked rows: with no locks, applyMoveLocked is the same as applyMove', () => {
  for (let k = 0; k < 50; k++) {
    const g = C.shuffle(LETTERS.split(''), k + 1).join('');
    C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyMoveLocked(g, m, []), C.applyMove(g, m)));
  }
});
t('locked rows: a column slide skips the locked row and cycles the others', () => {
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c1+', [1]), 'ANCDEFGHIBKLMJOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c1-', [1]), 'AJCDEFGHINKLMBOP');
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'c0+', [0, 2]), 'ABCDMFGHIJKLENOP');
});
t('locked rows: with rows 0 and 2 locked, a column slide swaps the two free cells', () => {
  const s = C.applyMoveLocked(LETTERS, 'c1+', [0, 2]);
  assert.strictEqual(s[1], 'B'); assert.strictEqual(s[9], 'J');           // locked rows keep their cells
  assert.strictEqual(s[5], 'N'); assert.strictEqual(s[13], 'F');          // free rows 1 and 3 swap
});
t('locked rows: a row slide on a locked row does nothing and is not a valid move', () => {
  assert.strictEqual(C.applyMoveLocked(LETTERS, 'r1+', [1]), LETTERS);
  assert(!C.validMoves([1]).includes('r1+') && !C.validMoves([1]).includes('r1-'));
  assert(C.validMoves([1]).includes('r2+'));
});
t('locked rows: valid move counts are 16, 14 and 12', () => {
  assert.strictEqual(C.validMoves([]).length, 16);
  assert.strictEqual(C.validMoves([2]).length, 14);
  assert.strictEqual(C.validMoves([0, 3]).length, 12);
});
t('locked rows: a locked row never changes, and no move changes the letters, from any grid', () => {
  LOCK_SETS.forEach(locks => {
    for (let k = 0; k < 30; k++) {
      const g = C.shuffle(LETTERS.split(''), k + 7).join('');
      C.validMoves(locks).forEach(m => {
        const s = C.applyMoveLocked(g, m, locks);
        locks.forEach(r => assert.strictEqual(C.rows(s)[r], C.rows(g)[r], 'locks ' + locks + ' move ' + m));
        assert.strictEqual(s.split('').sort().join(''), g.split('').sort().join(''));
      });
    }
  });
});
t('locked rows: every valid move is undone by its inverse', () => {
  LOCK_SETS.forEach(locks => {
    const g = C.shuffle(LETTERS.split(''), 3).join('');
    C.validMoves(locks).forEach(m => assert.strictEqual(C.applyMoveLocked(C.applyMoveLocked(g, m, locks), C.invert(m), locks), g, 'locks ' + locks + ' ' + m));
  });
});
t('locked rows: a column returns after as many slides as it has free rows', () => {
  [[[], 4], [[1], 3], [[0, 2], 2]].forEach(([locks, k]) => {
    let s = LETTERS; for (let i = 0; i < k; i++) s = C.applyMoveLocked(s, 'c2+', locks);
    assert.strictEqual(s, LETTERS, 'locks ' + locks);
    let u = LETTERS; for (let i = 0; i < k - 1; i++) u = C.applyMoveLocked(u, 'c2+', locks);
    assert.notStrictEqual(u, LETTERS);
  });
});
t('lockableRows: correct rows lock, up to two, and never twice', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'];
  assert.deepStrictEqual(C.lockableRows('XXXXXXXXXXXXXXXX', w, {}, []), []);
  assert.deepStrictEqual(C.lockableRows('BEARXXXXDEALXXXX', w, {}, []), [0, 2]);
  assert.deepStrictEqual(C.lockableRows('BEARROADDEALXXXX', w, {}, []), [0, 1]);        // three correct, only two lock
  assert.deepStrictEqual(C.lockableRows('BEARROADDEALXXXX', w, {}, [0]), [1]);          // one already locked
  assert.deepStrictEqual(C.lockableRows('BEARROADDEALXXXX', w, {}, [0, 1]), []);        // cap reached
  assert.strictEqual(C.MAX_LOCKS, 2);
});
t('locked rows: with two locks every arrangement of the other eight letters can be reached', () => {
  // Eight distinct labelled cells in two free rows. A full search over all of them must reach all 8! arrangements.
  [[0, 1], [1, 3], [2, 3]].forEach(locks => {
    const free = C.freeRows(locks), start = 'ABCDEFGHIJKLMNOP';
    const seen = new Set([start]); let frontier = [start];
    while (frontier.length) {
      const next = [];
      for (const s of frontier) for (const m of C.validMoves(locks)) {
        const u = C.applyMoveLocked(s, m, locks);
        if (!seen.has(u)) { seen.add(u); next.push(u); }
      }
      frontier = next;
    }
    assert.strictEqual(seen.size, 40320, 'locks ' + locks);
  });
});
t('locked rows: three locks would leave only four arrangements, which is why the cap is two', () => {
  const locks = [0, 1, 2], start = 'ABCDEFGHIJKLMNOP', seen = new Set([start]); let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (const m of C.validMoves(locks)) {
      const u = C.applyMoveLocked(s, m, locks);
      if (!seen.has(u)) { seen.add(u); next.push(u); }
    }
    frontier = next;
  }
  assert.strictEqual(seen.size, 4);
});
t('locked rows: a puzzle with locked correct rows can always be finished, and the solution never touches a locked row', () => {
  const rnd = C.mulberry32(11);
  P.forEach(p => {
    const solved = C.applyAll(p.start, p.solution);
    LOCK_SETS.filter(l => l.length > 0 && l.length <= 2).forEach(locks => {
      let g = solved;
      for (let i = 0; i < 6; i++) { const mv = C.validMoves(locks); g = C.applyMoveLocked(g, mv[Math.floor(rnd() * mv.length)], locks); }
      locks.forEach(r => assert(C.rowMatches(g, p.words, p.alts)[r], p.id + ' locked row must still be correct'));
      if (C.isSolved(g, p.words, p.alts)) return;
      const sol = C.minMoves(g, p.words, 8, p.alts, locks);
      assert(sol, p.id + ' locks ' + locks + ' no solution');
      assert(sol.length <= 6, p.id + ' locks ' + locks);
      sol.forEach(m => assert(C.validMoves(locks).includes(m), 'solution used a locked move ' + m));
      let h = g; sol.forEach(m => { h = C.applyMoveLocked(h, m, locks); });
      assert(C.isSolved(h, p.words, p.alts), p.id + ' locks ' + locks);
    });
  });
});
t('locked rows: minMoves refuses a lock on a row that is not a hidden word', () => {
  const p = P[0];
  assert.strictEqual(C.minMoves(p.start, p.words, 8, p.alts, [0]), null);
});
t('locked rows: hints respect locks, and following them solves the puzzle', () => {
  const p = P[13], states = C.pathStates(p.start, p.solution), g0 = states[p.par - 1];
  const locks = C.lockableRows(g0, p.words, p.alts, []);
  assert(locks.length >= 1);
  let g = g0, steps = 0;
  while (!C.isSolved(g, p.words, p.alts)) {
    const m = C.hintMove(g, p.words, p.alts, 10, locks);
    assert(m && C.validMoves(locks).includes(m));
    g = C.applyMoveLocked(g, m, locks); steps++;
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
t('share text shows moves against par, hints used, and easy mode', () => {
  const s = C.shareText('2026-10-07', 6, 5, true, 'https://example.com/slip/', 2, true);
  assert(s.includes('6 moves (par 5)')); assert(s.includes('💡2')); assert(s.includes('🔒easy'));
  assert(s.includes('🟦🟦🟦🟦🟦🟧')); assert(s.endsWith('https://example.com/slip/'));
  const plain = C.shareText('2026-10-07', 5, 5, true, '', 0, false);
  assert(!plain.includes('💡') && !plain.includes('🔒'));
  assert(C.shareText('2026-10-07', 3, 5, false).includes('did not solve it'));
});
console.log('\n' + n + ' tests passed');
