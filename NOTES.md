# Slip project notes

Standalone game. Not part of WordTrio.

## Design decisions
- 4×4 grid. Moves: slide a row or column by one with wraparound. 16 moves in total, each undone by its inverse.
- Win: the four rows spell the four target words in any order. Alternative spellings in `alts` also count.
- No marks while playing. Check (3 per puzzle) marks rows that currently spell a target word. Any move clears the marks. The third check ends the game as a loss if the grid is not solved.
- Hint: first move of a shortest solution from the current grid (search limit 10), respecting locks.
- Puzzles are built from the solved grid by random slides (4, 5, 6 or 7 slides in rotation), so they are always solvable. Par is found by a two-ended search and verified again in test.js. Par range 3 to 7. A start with a correct row is rejected.
- Saved state is keyed by date and puzzle id. Storage keys: slip:state, slip:stats.

## Locks (player tool, replaced easy mode)
- Player taps a lock icon beside a row (left) or column (top). Locks = { rows: [], cols: [] }, any lines, any time, unlockable.
- A cell is frozen if its row or column is locked. A free line slides only its unfrozen cells (Core.lineSlots). A move needs at least two free cells (Core.isValidMove).
- Each move stores the locks it was made with (S.moveLocks). Undo applies the inverse under that snapshot, so undo is exact even after locks change.
- Reset clears locks. S.lockUsed turns true on the first lock and never turns off. The share text says "🔓 no locks" or "🔒 locks used".
- Locks can make a puzzle unsolvable (player's choice). Core.minMoves goal set keeps the frozen cells' letters (Core.goalStates) and returns null when no goal fits; Hint then says a lock may be in the way.
- Load validation: locks must be { rows, cols } of unique ints 0-3; moveLocks must match moves in length. A save with the old easy-mode array of locks is discarded. A save with no lock fields loads with none.
- The old easy mode (auto-lock correct rows after Check, cap of two) was removed.

## Board and animation (rewritten to fix jank)
- The board is a fixed 7×7 grid built once by buildBoard(): row 1 column lock icons, row 2 up arrows, rows 3–6 tiles, row 7 down arrows, column 1 row lock icons, column 2 left arrows, column 7 right arrows. The tiles sit in .field, a clipped 4×4 grid.
- paint() updates text, classes and disabled flags in place. Nothing is re-created, so arrows and icons cannot move.
- animateMove() hides the line's real tiles and animates temporary copies (.tile.clone, inside the clipped field) with element.animate (transform only). Full line: three copies shift, the wrapping letter has an exiting copy and an entering copy. Line with frozen cells: the wrapping letter slides straight to its slot. finishAnim() completes any animation in progress before a new one.
- Drag: preview moves the real tiles by transform, plus one wrap copy entering from the far edge. On release past 35% of a tile the move is committed with an animation that starts at the dragged offset. Otherwise the tiles spring back.
- Hint and replay highlights flash arrow colour (no scale).
- Layout: --cell is min(12vw, 58px), gap 4px, so 7 cells and 6 gaps fit a 360px phone.

## Shortest path replay
Available once S.over. Uses puzzle.solution via Core.pathStates. paint(grid, true) draws replay frames with no locks and everything disabled, and never writes to S or storage.

## Open items
- Animation feel, drag, replay timing and the small-screen layout need a real phone check.
- 14 puzzles only.
- Alt spellings are hand-listed. No dictionary is available to find them automatically.

## Changelog
2026-10-07  First build: core, 14 puzzles, UI, tests, smoke test, PWA files.
2026-10-07  Controls: drag with axis lock and highlight, slide animation, Hint, easier par mix (3 to 7).
2026-10-07  End of game: Show shortest path replay. Third failed check ends the game.
2026-10-07  Easy mode (auto-lock correct rows) added, then replaced.
2026-10-07  Rewrite: board built once with copies animated by the Web Animations API inside a clipped field; arrows never move. Player-controlled row and column locks with icons; share text shows locks used or not.
