# Slip project notes

Standalone game. Not part of WordTrio.

## Design decisions
- 4×4 grid. Moves: slide a row or column by one with wraparound. 16 moves in total, each undone by its inverse.
- Win: the four rows spell the four target words in any order. Alternative spellings in `alts` also count.
- No marks while playing. Check (3 per puzzle) marks rows that currently spell a target word. Any move clears the marks.
- Puzzles are built from the solved grid by random slides, so they are always solvable. Par is found by a two-ended search and verified again in test.js.
- Puzzle rejected if par is outside 4 to 7, or if the start has a correct row.
- Saved state is keyed by date and puzzle id. A mismatch or changed letters discards it.
- Storage keys: slip:state, slip:stats.

## Open items
- Needs a real phone check for swipe feel.
- 14 puzzles only.
- Alt spellings are hand-listed. No dictionary is available to find them automatically.

## Changelog
2026-10-07  First build: core, 14 puzzles, UI, tests, smoke test, PWA files.
