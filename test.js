const assert = require('assert');
const C = require('./core.js'), D = require('./data.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const P = D.PUZZLES;

t('slide row right wraps the last letter to the front', () => assert.strictEqual(C.slideRow('ABCDEFGHIJKLMNOP', 0, 1), 'DABCEFGHIJKLMNOP'));
t('slide row left wraps the first letter to the end', () => assert.strictEqual(C.slideRow('ABCDEFGHIJKLMNOP', 1, -1), 'ABCDFGHEIJKLMNOP'));
t('slide column down wraps the bottom letter to the top', () => assert.strictEqual(C.slideCol('ABCDEFGHIJKLMNOP', 0, 1), 'MBCDAFGHEJKLINOP'));
t('slide column up wraps the top letter to the bottom', () => assert.strictEqual(C.slideCol('ABCDEFGHIJKLMNOP', 3, -1), 'ABCHEFGLIJKPMNOD'));
t('there are 16 distinct moves', () => assert.strictEqual(new Set(C.ALL_MOVES).size, 16));
t('every move is undone by its inverse, from any grid', () => {
  const r = C.mulberry32(5);
  for (let k = 0; k < 200; k++) {
    const g = C.shuffle('ABCDEFGHIJKLMNOP'.split(''), k + 1).join('');
    C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyMove(C.applyMove(g, m), C.invert(m)), g, m));
  }
});
t('four slides in one direction return the original grid', () => {
  const g = 'ABCDEFGHIJKLMNOP';
  C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyAll(g, [m, m, m, m]), g, m));
});
t('moves never change the set of letters', () => {
  const g = P[0].start;
  C.ALL_MOVES.forEach(m => assert.strictEqual(C.applyMove(g, m).split('').sort().join(''), g.split('').sort().join('')));
});
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
t('minMoves finds a replayable shortest path for known scrambles', () => {
  const w = ['BEAR', 'ROAD', 'DEAL', 'LION'], solved = 'BEARROADDEALLION';
  const moves = ['r0+', 'c2-', 'r3-'];
  const start = C.applyAll(solved, moves);
  const sol = C.minMoves(start, w, 6);
  assert(sol.length <= 3);
  assert(C.isSolved(C.applyAll(start, sol), w));
  assert.deepStrictEqual(C.minMoves(solved, w), []);
});
t('scramble is deterministic and solvable', () => {
  const w = P[0].words;
  assert.strictEqual(C.scramble(w, 9, 6), C.scramble(w, 9, 6));
  const s = C.scramble(w, 9, 6);
  const sol = C.minMoves(s, w, 8);
  assert(sol && sol.length <= 6);
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
    assert(p.par >= 4 && p.par <= 7, p.id);
  });
});
t('par is exact: no shorter solution exists (checked by a fresh search)', () => {
  P.forEach(p => {
    const sol = C.minMoves(p.start, p.words, 9, p.alts);
    assert.strictEqual(sol.length, p.par, p.id);
  });
});
t('a puzzle exists for every day for two years and the board is the same all day', () => {
  for (let i = 0; i < 730; i++) assert(C.pick(P, i).start);
  assert.strictEqual(C.pick(P, 279).id, C.pick(P, 279).id);
});
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
t('share text shows moves against par', () => {
  const s = C.shareText('2026-10-07', 6, 5, true, 'https://example.com/slip/');
  assert(s.includes('6 moves (par 5)')); assert(s.includes('🟦🟦🟦🟦🟦🟧')); assert(s.endsWith('https://example.com/slip/'));
  assert(C.shareText('2026-10-07', 3, 5, false).includes('gave up'));
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
t('alternative spellings never share letters with another word in a set', () => {
  P.forEach(p => {
    const all = p.words.concat(...Object.values(p.alts));
    assert.strictEqual(new Set(all).size, all.length, p.id);
    Object.entries(p.alts).forEach(([w, list]) => list.forEach(a => assert.strictEqual(a.split('').sort().join(''), w.split('').sort().join(''), p.id + ' ' + a)));
  });
});
console.log('\n' + n + ' tests passed');
