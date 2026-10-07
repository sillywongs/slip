# Slip

A daily word puzzle. Slide the rows and columns of a 4×4 letter grid until the four rows spell four hidden words, in any order, then press **Check**. Plain HTML, CSS and JavaScript: no build step, no server.

## Upload these files together

`index.html`, `core.js`, `data.js`, `sw.js`, `manifest.webmanifest`, and the four `.png` icons must all be in the same folder, from the same version. If they are not, Slip says so in red on screen. Script addresses carry a version (`core.js?v=slip-7`), so a browser cannot pair an old cached `core.js` with a new page. After uploading to GitHub Pages, wait a couple of minutes and reload.

## How to play

- **Drag** a tile along its row or column, or **tap an arrow**. Letters that slide off one edge come back on the other.
- **You must press Check to win.** Moving never ends the game and the game never tells you the rows are right. Press Check when you think they are. If they are, you win. If not, the right rows are marked and you use one of three checks. The third unsuccessful check ends the game.
- **Hint** shows the first move of a shortest solution, and says nothing if the grid is already right.
- Par is the fewest moves possible. Undo and Reset are free. Give up reveals the words.

## Locking rows and columns

A 🔓 icon sits beside every row (left) and above every column (top). Tap to lock (🔒), tap again to unlock. A locked line cannot be slid, and its letters stay put while you slide the lines that cross it. Locking a wrong line can make the puzzle impossible until you unlock it. Undo restores the exact grid even if locks changed. Your result and share text say **🔓 no locks** or **🔒 locks used**.

## Shortest path replay

When a game ends (win, give up, or out of checks), **Show shortest path** replays the shortest solution from the start, one animated move at a time, with Pause, Back and Next. It never changes your saved game.

## Add puzzles

Add a set of four 4-letter words to `WORD_SETS` in `make-puzzles.js`, add any anagram words to `ALTS`, then run `node make-puzzles.js` and `node test.js`. Every puzzle is built by sliding the solved grid, so it is always solvable.

## Commands

```text
node test.js              # core logic tests
python3 browser-test.py   # real-browser checks (optional; needs Playwright)
node make-puzzles.js      # rebuild data.js
```

## Publish on GitHub Pages

Create a public repository, upload every file to its top level, then Settings → Pages → Deploy from a branch → `main` / root.

## Notes

- The board is built once and updated in place. Slides are animated with temporary tile copies inside a clipped field, so the arrows and icons never move.
- 14 puzzles, repeating every 14 days. Progress is stored in the browser and does not sync.
