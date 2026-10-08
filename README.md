# Fourway Chess

Play four-player chess on a 160-square cross-shaped board. The playing screen takes its cues from Chess.com: a dark navigation rail, sage-and-cream squares, prominent clocks, move history and large colored Staunton-style pieces. Fourway is an independent project with original SVG artwork.

**Play:** https://fourway-chess.vercel.app/

**Source:** https://github.com/Kanish2002/Fourway-chess

## Features

- Play any of four armies against three bots, or pass the device between four local players.
- Free-for-all scoring and opposite-side teams: Red + Yellow versus Blue + Green.
- Click or drag pieces, see legal destinations, animate moves, rotate the board and use focus mode.
- Right-drag or Shift-drag to draw arrows; right-click to circle a square. Left-click clears annotations.
- Corner clocks, increments, captures, check highlights, move history and position review.
- Undo, hints, pause, local autosave, saved-game export/import, three palettes and sound settings.
- Classic sounds reference Chess.com's public sound CDN. If playback fails, the app uses synthesized wooden clicks. Wood mode works locally. Browsers may block audio until the first user interaction.

Games run entirely on your device. Remote rooms, accounts, ratings and online matchmaking are not implemented. Bots use heuristic move selection with a small tactical scan; their settings do not represent Elo ratings.

## Run and verify

Node.js 22 or newer; no runtime dependencies.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. To verify and build:

```sh
npm run check
npm run build
```

The static build writes `dist/`. Vercel uses framework **Other**, build command `npm run build`, output directory `dist`, and `npm ci --ignore-scripts`. No database, secrets or environment variables are required. The GitHub CI workflow runs the checks and build on pushes and pull requests. Vercel can deploy pushes automatically once its GitHub integration is connected.

## Rules implemented

Reference: [Chess.com four-player chess](https://www.chess.com/terms/4-player-chess) and [official help](https://support.chess.com/en/articles/8614233-4-player-chess-4pc).

Red → Blue → Yellow → Green move clockwise. Pawns advance inward in their army's orientation. Sliding pieces cannot cross removed corners; knights may leap them. Moves must protect the moving army's king. Castling checks the king's original, transit and destination squares; king/rook movement permanently removes the appropriate right. En passant expires when the double-moving pawn's army returns to move.

### Free-for-all

| Event | Points |
| --- | ---: |
| Pawn or promoted queen captured | 1 |
| Knight captured | 3 |
| Bishop or rook captured | 5 |
| Original queen captured | 9 |
| Checkmate | 20 |
| Self-stalemate | 20 to that player |
| Opponent stalemate | 10 to each other active player |
| Two / three kings checked by the moved queen | 1 / 5 |
| Two / three kings checked by another moved piece | 5 / 20 |

Pawns automatically promote to queens on their own eighth rank. Mate and stalemate resolve immediately. Eliminated pieces stay as capturable grey blockers worth zero points. Resignation and timeout leave a randomly moving live king; other pieces are inactive. Walking kings earn no score or increment. The last active player receives 20 for every other surviving live king, then final scores determine the winner. An eliminated player can still win on points.

Threefold repetition compares legal positions, including actual castling and usable en passant rights. The quiet-move draw requires 50 moves per remaining active army without a pawn move or capture. Draws award 10 to each active player. A clear leader can claim victory with two active players remaining, granting the opponent 20.

### Teams

Opposite armies are partners. Teammates cannot capture or attack each other, and cannot jump over each other's pieces. Pawns promote on their own eleventh rank, with queen, rook, bishop and knight choices. Mate or stalemate waits until the affected player's turn, allowing a partner to intervene first. Mate, resignation or timeout loses the team; stalemate draws.

### Scope and remaining differences

- There is no rated-game early-resignation abort, network disconnect timer, chat or rating calculation.
- The setup supports standard FFA and Teams, rather than Chess.com's many configurable variants.
- For a mate involving several attackers, credit goes to the moving army if it attacks the king, otherwise the first detected active attacking army. Shared mate-credit splitting is not implemented.
- Insufficient material is automatically detected only when the board literally contains kings and empty squares. Grey blockers can create mating cages, so they prevent this automatic draw. Other rare dead positions require draw agreement.
- A claim grants the other active player 20 and ends the game; surviving walking-king bonuses are applied to ordinary elimination endings.
- Pause, undo and hints are casual local features. Clocks begin after the first move, and restored games start paused.
- Existing `fourway-v1` records replay using the current engine rules.

## Verification coverage

`npm run check` passes **51 tests**. The geometric oracle checks all six piece types for all four colors from every playable origin to every playable target: **614,400 attack comparisons**. Additional regression cases cover blocking, pins, king adjacency, every castling orientation and unsafe path, all promotion choices, en passant including perpendicular pawns, scoring, multi-king checks, discovered mate notation, actual self-stalemate, team timing, walking kings, endgame bonuses, normalized repetition and quiet-move draws.

Seeded tests run 80 bot plies and 120 replayed plies in each variant. The application DOM fixture checks human/bot turn flow, drag/drop, arrows, clocks, timeout automation, setup, settings, review, undo and invalid import handling. Sound tests check event URLs, click signal profiles and fallback playback.

The DOM fixture does not render CSS or replace browser visual QA. Browser screenshots and real-device audio playback were not available in the managed build environment. The classic sound CDN returned a challenge to the build environment; actual remote playback remains unverified, with tested local fallback.

## Layout

| File | Responsibility |
| --- | --- |
| `public/engine.js` | Pure rules, scoring, game endings and bots |
| `public/app.js` | Interaction, clocks, dialogs, history and persistence |
| `public/pieces.js` | Original colored SVG pieces and icons |
| `public/sounds.js` | Classic audio and local wooden-click fallback |
| `public/style.css` | Desktop, tablet and mobile playing screen |
| `tests/` | Engine, application and audio regression tests |
| `scripts/build.mjs` | Dependency-free static build |
| `scripts/serve.mjs` | Local development server |
