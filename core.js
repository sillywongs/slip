(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // index.html checks this so a mix of old and new files is reported instead of leaving a blank board.
  const VERSION = 'slip-7';
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

  // ---- locked rows and columns ----
  // Locks are { rows: [...], cols: [...] }. A cell is frozen if its row or its column is locked.
  // A locked line cannot be slid. Sliding a free line cycles only that line's frozen-free cells,
  // so a locked column's letters stay put while a free row slides past them.
  const NO_LOCKS = Object.freeze({ rows: Object.freeze([]), cols: Object.freeze([]) });
  const freeRows = locks => [0, 1, 2, 3].filter(r => !((locks && locks.rows) || []).includes(r));
  const freeCols = locks => [0, 1, 2, 3].filter(c => !((locks && locks.cols) || []).includes(c));
  const isFrozen = (r, c, locks) => !!locks && ((locks.rows || []).includes(r) || (locks.cols || []).includes(c));
  const hasLocks = locks => !!locks && ((locks.rows || []).length + (locks.cols || []).length) > 0;
  const cloneLocks = locks => ({ rows: ((locks && locks.rows) || []).slice().sort((a, b) => a - b), cols: ((locks && locks.cols) || []).slice().sort((a, b) => a - b) });
  // The slots a slide of this line moves: the line's cells that are not frozen.
  function lineSlots(m, locks) {
    const i = +m[1];
    if (m[0] === 'r') return (locks && (locks.rows || []).includes(i)) ? [] : freeCols(locks);
    return (locks && (locks.cols || []).includes(i)) ? [] : freeRows(locks);
  }
  // A move is valid if its line is not locked and at least two cells can move.
  const isValidMove = (m, locks) => lineSlots(m, locks).length >= 2;
  const validMoves = locks => ALL_MOVES.filter(m => isValidMove(m, locks));
  function applyMoveLocked(state, m, locks) {
    if (!hasLocks(locks)) return applyMove(state, m);
    const slots = lineSlots(m, locks);
    if (slots.length < 2) return state;
    const i = +m[1], idx = s => (m[0] === 'r' ? i * 4 + s : s * 4 + i);
    const cells = slots.map(s => state[idx(s)]);
    const n = m[2] === '+' ? [cells[cells.length - 1]].concat(cells.slice(0, -1)) : cells.slice(1).concat(cells[0]);
    const a = state.split('');
    slots.forEach((s, k) => { a[idx(s)] = n[k]; });
    return a.join('');
  }

  // ---- winning ----
  // 'alts' maps a target word to other spellings of the same letters that also count (BEAR -> BARE).
  // The grid can spell the words without the game ending: the player must press Check to submit it.
  const spellings = (word, alts) => [word].concat((alts && alts[word]) || []);
  function matchedWords(state, words, alts) {
    const left = words.slice();
    return rows(state).map(r => {
      const i = left.findIndex(w => spellings(w, alts).includes(r));
      return i < 0 ? null : left.splice(i, 1)[0];
    });
  }
  const rowMatches = (state, words, alts) => matchedWords(state, words, alts).map(Boolean);
  const isSolved = (state, words, alts) => rowMatches(state, words, alts).every(Boolean);

  // ---- solving (puzzle maker, tests, hints and the shortest-path replay) ----
  function permutations(a) {
    return a.length < 2 ? [a] : a.flatMap((x, i) => permutations(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x, ...p]));
  }
  // Every grid that counts as solved and keeps the frozen cells as they are now.
  function goalStates(start, words, alts, locks) {
    const variants = words.reduce((acc, w) => acc.flatMap(a => spellings(w, alts).map(s => a.concat(s))), [[]]);
    const out = new Set();
    variants.forEach(v => permutations(v).forEach(p => {
      const g = p.join('');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (isFrozen(r, c, locks) && g[r * 4 + c] !== start[r * 4 + c]) return;
      out.add(g);
    }));
    return Array.from(out);
  }
  // Shortest list of moves that solves the grid, respecting locked lines. Searches from both ends at once.
  // Returns null if there is no route within the limit (or the locks make a solution impossible).
  function minMoves(start, words, limit, alts, locks) {
    limit = limit || 10;
    const L = locks || NO_LOCKS, moves = validMoves(L);
    const apply = (s, m) => applyMoveLocked(s, m, L);
    const goals = goalStates(start, words, alts, L);
    if (!goals.length) return null;
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
  // The first move of a shortest solution from this grid, or null if the grid is solved or no route is found.
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
  // usedLocks: true if any row or column was locked during the game.
  function shareText(key, moves, par, won, url, hints, usedLocks) {
    const bar = Array.from({ length: moves }, (_, i) => (i < par ? '🟦' : '🟧')).join('');
    const head = 'Slip ' + key + (won ? ' ' + moves + ' moves (par ' + par + ')' : ' did not solve it') +
      (hints ? ' 💡' + hints : '') + (usedLocks ? ' 🔒 locks used' : ' 🔓 no locks');
    return head + '\n' + (won ? bar + '\n' : '') + (url || '');
  }

  return { VERSION, ALL_MOVES, NO_LOCKS, dateKey, dayIndex, prevKey, mulberry32, shuffle, pick, rows, slideRow, slideCol, applyMove, applyAll,
    invert, describeMove, pathStates, freeRows, freeCols, isFrozen, hasLocks, cloneLocks, lineSlots, isValidMove, validMoves,
    applyMoveLocked, matchedWords, isSolved, rowMatches, permutations, goalStates, minMoves, hintMove, scramble, updateStats, shareText };
});
