# Slip notes

- Winning needs Check. doMove never ends the game; check() wins when all four rows match; the third unsuccessful check ends it. Hint on a finished grid says "No move to suggest from here." and costs nothing.
- Locks: { rows, cols }. A cell is frozen if its row or column is locked. Each move stores the locks it was made with (S.moveLocks) so Undo is exact. S.lockUsed never turns off.
- Startup safety: core.js VERSION is checked by index.html; script URLs carry ?v=slip-7; a window error handler shows any startup failure on screen. Bump the version in core.js, index.html (guard and both script URLs) and sw.js together. test.js checks they agree.
- Layout: --cell min(12vw, 58px). Verified in headless Chromium at 320, 360, 390 and 412 px wide: 16 visible tiles, no sideways scroll, every button visible on a 600px-high screen.
- Storage keys: slip:state, slip:stats. Saves from older builds load or are discarded safely.
- Open: check feel on a real phone. 14 puzzles only.
