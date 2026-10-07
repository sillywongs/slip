(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EPOCH = Date.UTC(2026, 0, 1);

  // ---- dates and randomness ----
  function dateKey(d) {
    d = d || new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function dayIndex(d) {
    d = d || new Date();
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000);
  }
  function prevKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return dateKey(new Date(y, m - 1, d - 1));
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, seed) {
    const r = mulberry32(seed), a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (list, idx) => list[((idx % list.length) + list.length) % list.length];

  // ---- the grid ----
  // A state is a 16 character string, row by row. A move is a 3 character string:
  //   kind 'r' (row) or 'c' (column), index 0-3, direction '+' (right/down) or '-' (left/up).
  const ALL_MOVES = [];
  ['r', 'c'].forEach(k => [0, 1, 2, 3].forEach(i => ['+', '-'].forEach(d => ALL_MOVES.push(k + i + d))));

  const rows = state => [0, 1, 2, 3].map(r => state.slice(r * 4, r * 4 + 4));

  function slideRow(state, r, d) {
    const row = state.slice(r * 4, r * 4 + 4);
    const n = d > 0 ? row[3] + row.slice(0, 3) : row.slice(1) + row[0];
    return state.slice(0, r * 4) + n + state.slice(r * 4 + 4);
  }
  function slideCol(state, c, d) {
    const col = [0, 1, 2, 3].map(r => state[r * 4 + c]);
    const n = d > 0 ? [col[3], col[0], col[1], col[2]] : [col[1], col[2], col[3], col[0]];
    const a = state.split('');
    n.forEach((ch, r) => { a[r * 4 + c] = ch; });
    return a.join('');
  }
  function applyMove(state, m) {
    const i = +m[1], d = m[2] === '+' ? 1 : -1;
    return m[0] === 'r' ? slideRow(state, i, d) : slideCol(state, i, d);
  }
  const invert = m => m[0] + m[1] + (m[2] === '+' ? '-' : '+');
  const applyAll = (state, moves) => moves.reduce(applyMove, state);
  const describeMove = m => m[0] === 'r'
    ? 'row ' + (+m[1] + 1) + ' ' + (m[2] === '+' ? 'right' : 'left')
    : 'column ' + (+m[1] + 1) + ' ' + (m[2] === '+' ? 'down' : 'up');
  // Every grid along a list of moves: the start, then the grid after each move.
  function pathStates(start, moves) {
    const out = [start];
    moves.forEach(m => out.push(applyMove(out[out.length - 1], m)));
    return out;
  }

  // ---- locked rows (easy mode) ----
  // A locked row never moves. Its row arrows do nothing, and a column slide cycles only the unlocked rows.
  // At most MAX_LOCKS rows can lock. With two or more free rows every arrangement of the free letters can
  // still be reached, so the puzzle stays solvable. With one free row only its four rotations would exist.
  const MAX_LOCKS = 2;
  const freeRows = locks => [0, 1, 2, 3].filter(r => !(locks || []).includes(r));
  const validMoves = locks => ALL_MOVES.filter(m => m[0] === 'c' ? freeRows(locks).length >= 2 : !(locks || []).includes(+m[1]));
  function applyMoveLocked(state, m, locks) {
    const L = locks || [];
    if (!L.length) return applyMove(state, m);
    const i = +m[1];
    if (m[0] === 'r') return L.includes(i) ? state : applyMove(state, m);
    const U = freeRows(L);
    if (U.length < 2) return state;
    const col = U.map(r => state[r * 4 + i]);
    const n = m[2] === '+' ? [col[col.length - 1]].concat(col.slice(0, -1)) : col.slice(1).concat(col[0]);
    const a = state.split('');
    U.forEach((r, k) => { a[r * 4 + i] = n[k]; });
    return a.join('');
  }

  // ---- winning ----
  // 'alts' maps a target word to other spellings of the same letters that also count (BEAR -> BARE).
  // Without it, a player who builds a real word we did not list would be marked wrong.
  const spellings = (word, alts) => [word].concat((alts && alts[word]) || []);
  // For each row, the target word it spells (each target used once), or null.
  function matchedWords(state, words, alts) {
    const left = words.slice();
    return rows(state).map(r => {
      const i = left.findIndex(w => spellings(w, alts).includes(r));
      return i < 0 ? null : left.splice(i, 1)[0];
    });
  }
  const rowMatches = (state, words, alts) => matchedWords(state, words, alts).map(Boolean);
  const isSolved = (state, words, alts) => rowMatches(state, words, alts).every(Boolean);
  // The rows that would lock after a Check: correct rows that are not locked yet, up to the cap.
  function lockableRows(state, words, alts, locks) {
    const L = locks || [], m = rowMatches(state, words, alts), out = [];
    for (let r = 0; r < 4; r++) if (m[r] && !L.includes(r) && L.length + out.length < MAX_LOCKS) out.push(r);
    return out;
  }

  // ---- solving (puzzle maker, tests, hints and the shortest-path replay) ----
  function permutations(a) {
    return a.length < 2 ? [a] : a.flatMap((x, i) => permutations(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x, ...p]));
  }
  // Shortest list of moves that solves the grid, respecting any locked rows. Searches from both ends at once.
  function minMoves(start, words, limit, alts, locks) {
    limit = limit || 10;
    const L = locks || [], free = freeRows(L), moves = validMoves(L);
    const apply = (s, m) => applyMoveLocked(s, m, L);
    const matched = matchedWords(start, words, alts), remaining = words.slice();
    for (const r of L) {
      if (!matched[r]) return null;
      remaining.splice(remaining.indexOf(matched[r]), 1);
    }
    const startRows = rows(start);
    const variants = remaining.reduce((acc, w) => acc.flatMap(a => spellings(w, alts).map(s => a.concat(s))), [[]]);
    const goals = Array.from(new Set(variants.flatMap(v => permutations(v).map(p => {
      const out = startRows.slice();
      free.forEach((r, k) => { out[r] = p[k]; });
      return out.join('');
    }))));
    if (goals.includes(start)) return [];
    const A = new Map([[start, { d: 0 }]]);
    const B = new Map(goals.map(g => [g, { d: 0 }]));
    let fa = [start], fb = goals.slice(), depth = 0;
    const build = t => {
      const a = []; let s = t;
      while (A.get(s).from !== undefined) { const r = A.get(s); a.push(r.move); s = r.from; }
      a.reverse();
      s = t;
      while (B.get(s).to !== undefined) { const r = B.get(s); a.push(r.move); s = r.to; }
      return a;
    };
    while (depth < limit && fa.length && fb.length) {
      let best = null;
      const next = [];
      if (fa.length <= fb.length) {
        for (const s of fa) for (const m of moves) {
          const t = apply(s, m);
          if (A.has(t)) continue;
          A.set(t, { from: s, move: m, d: A.get(s).d + 1 });
          next.push(t);
          if (B.has(t)) { const total = A.get(t).d + B.get(t).d; if (!best || total < best.total) best = { t, total }; }
        }
        fa = next;
      } else {
        for (const s of fb) for (const m of moves) {
          const t = apply(s, m);
          if (B.has(t)) continue;
          B.set(t, { to: s, move: invert(m), d: B.get(s).d + 1 });
          next.push(t);
          if (A.has(t)) { const total = A.get(t).d + B.get(t).d; if (!best || total < best.total) best = { t, total }; }
        }
        fb = next;
      }
      depth++;
      if (best) return build(best.t);
    }
    return null;
  }
  // The first move of a shortest solution from this grid, or null if the grid is solved or too far away.
  function hintMove(state, words, alts, limit, locks) {
    const sol = minMoves(state, words, limit || 10, alts, locks);
    return sol && sol.length ? sol[0] : null;
  }

  // Start from the solved grid and slide it about. Every slide can be undone, so the result is always solvable.
  function scramble(words, seed, n) {
    const r = mulberry32(seed);
    let state = shuffle(words, seed * 7 + 1).join(''), last = null;
    for (let i = 0; i < n; i++) {
      let m;
      do { m = ALL_MOVES[Math.floor(r() * ALL_MOVES.length)]; } while (last && m === invert(last));
      state = applyMove(state, m); last = m;
    }
    return state;
  }

  // ---- stats and sharing ----
  function updateStats(stats, won, key) {
    const s = Object.assign({ played: 0, wins: 0, streak: 0, best: 0, last: null, lastWon: false }, stats);
    if (s.last === key) return s;
    s.played++;
    if (won) {
      s.streak = (s.last && prevKey(key) === s.last && s.lastWon) ? s.streak + 1 : 1;
      s.wins++; s.best = Math.max(s.best, s.streak);
    } else s.streak = 0;
    s.last = key; s.lastWon = won;
    return s;
  }
  function shareText(key, moves, par, won, url, hints, easy) {
    const bar = Array.from({ length: moves }, (_, i) => (i < par ? '🟦' : '🟧')).join('');
    const head = 'Slip ' + key + (won ? ' ' + moves + ' moves (par ' + par + ')' : ' did not solve it') + (hints ? ' 💡' + hints : '') + (easy ? ' 🔒easy' : '');
    return head + '\n' + (won ? bar + '\n' : '') + (url || '');
  }

  return { ALL_MOVES, MAX_LOCKS, dateKey, dayIndex, prevKey, mulberry32, shuffle, pick, rows, slideRow, slideCol, applyMove, applyAll,
    invert, describeMove, pathStates, freeRows, validMoves, applyMoveLocked, matchedWords, isSolved, rowMatches, lockableRows,
    permutations, minMoves, hintMove, scramble, updateStats, shareText };
});
