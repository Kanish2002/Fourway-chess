# Fourway Chess

Play four-player chess on a 160-square cross-shaped board. The playing screen takes its cues from Chess.com: a dark navigation rail, sage-and-cream squares, prominent clocks, move history, a wooden frame outside the cross-shaped playing surface, and Chess.com Neo piece silhouettes recolored for the four armies. Neo PNGs are bundled locally; original SVGs remain as a fallback. Fourway is an independent project, not affiliated with Chess.com. See the [asset attribution](public/assets/pieces/neo/ATTRIBUTION.md).

**Play:** https://fourway-chess.vercel.app/

**Source:** https://github.com/Kanish2002/Fourway-chess

## Features

- Play any of four armies against three bots, watch four computers, or pass the device between four local players.
- Create or join an online room with a six-character alphanumeric code: maximum four humans including the host, minimum two humans to start; computers fill unoccupied seats.
- Play Free-for-All or Teams online; choose your color in the lobby to sit opposite your partner.
- Keep your seat on reload in the same tab. Reconnect within 90 seconds; disconnected or departing players are replaced by computers in active games.
- Free-for-all scoring and opposite-side teams: Red + Yellow versus Blue + Green.
- Click or drag pieces, see legal destinations, animate moves, rotate the board and use focus mode.
- Right-drag or Shift-drag to draw arrows; right-click to circle a square. Left-click clears annotations.
- Spacious player clocks above and below the board, increments, captures, check highlights, move history and position review. Legal destinations always appear as dots or capture rings when selecting or dragging a piece.
- Undo, hints, pause, local autosave, saved-game export/import, three palettes and sound settings.
- Classic sounds reference Chess.com's public sound CDN. If playback fails, the app uses synthesized wooden clicks. Wood mode works locally. Browsers may block audio until the first user interaction.

Solo, computer-only and pass-and-play run on your device. Online code rooms use a shared server-authoritative service; public matchmaking, accounts and ratings are not implemented. Bots use heuristic move selection with a small tactical scan; their settings do not represent Elo ratings.

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

The static build writes `dist/`. Vercel uses framework **Other**, build command `npm run build`, output directory `dist`, and `npm ci --ignore-scripts`. No database or secrets are needed for local modes. Hosted online rooms require shared Redis storage (see below). The GitHub CI workflow runs the checks and build on pushes and pull requests. Vercel can deploy pushes automatically once its GitHub integration is connected.

## Movement and king safety

Reference: [Chess.com four-player chess](https://www.chess.com/terms/4-player-chess) and [official help](https://support.chess.com/en/articles/8614233-4-player-chess-4pc).

Red → Blue → Yellow → Green move clockwise. Pawns advance inward in their army's orientation. Sliding pieces cannot cross removed corners; knights may leap them. Moves must protect the moving army's king. Castling checks the king's original, transit and destination squares; king/rook movement permanently removes the appropriate right. En passant expires when the double-moving pawn's army returns to move.

## Online rooms and deployment

1. In New Game, choose **Online Multiplayer**. Enter your name, choose Free-for-All or Teams and a clock, then **Create Room**.
2. Share the six-character code. Friends open the same deployment URL and choose **Join Room**. The host counts as one of the maximum four players.
3. Click an open color to switch seats before starting. In Teams, Red + Yellow are partners; Blue + Green are partners. Two humans may choose the same team or opposing teams.
4. Only the host can start, after at least two humans join. Empty seats become computers. Four humans can play with no computers.
5. Return to **Room** to copy the code or leave. Leaving an active game hands your army to a bot; **Resign** eliminates your army under the selected variant's rules. Draw agreement requires every active human's vote; computers accept agreement. An ordinary move clears votes.

### Shared storage on Vercel

Connect an **Upstash Redis** database to the existing `fourway-chess` Vercel project and enable it for the relevant Preview and Production environments. It supplies server-only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Existing integration aliases `KV_REST_API_URL` / `KV_REST_API_TOKEN` are also accepted. Redeploy after connecting the database. Use a separate preview database if previews should not share rooms with production. No credentials are placed in the frontend or repository; `.env.example` lists their names.

The static client is still built to `dist/`. `api/rooms.js` is a Node serverless function which imports the shared rules engine and `server/` modules. Redis stores room records with a 24-hour sliding expiry. Atomic Lua compare-and-set commits prevent lost updates and seat overbooking across simultaneous requests or Vercel function instances. Room snapshots exclude membership token hashes. A code lets someone join the lobby; an opaque tab membership token is required to read and act in that room. Move commands include a position revision and request ID; repeat commands are idempotent. Clients cannot submit boards, clocks, castling metadata or bot moves. Entry and gameplay requests are rate-limited server-side.

`npm run dev` provides the same room API with a single-process in-memory store if Redis credentials are absent. Multiple tabs/devices can play against that local server, but its rooms disappear when it restarts. To use Redis locally, run `node --env-file=.env.local scripts/serve.mjs`. **Hosted functions never silently fall back to memory**: missing storage returns a clear 503 while offline modes continue working.

Clients poll once per second and interpolate clocks locally. Online clocks start when the host starts, continue while a player has a dialog open, and are resolved from server wall time. Any connected player's request advances clocks and at most one scheduled computer move. If every tab disconnects, no background worker plays bot moves; state catches up with elapsed clock time on the next request. Hosts can leave; lobby host ownership transfers to a remaining human. Seats lock after start, including after computer takeover. Tab-scoped membership is retained on reload. After 90 seconds without contact, an active player's army becomes computer-controlled; their old token cannot issue moves. Online pause, undo and hints are disabled, and opening/reviewing a position never stops the room clock.

## Rules by variant

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

- There is no rated-game early-resignation abort, chat or rating calculation. Disconnects use this app’s 90-second computer takeover policy.
- The setup supports standard FFA and Teams, rather than Chess.com's many configurable variants.
- For a mate involving several attackers, credit goes to the moving army if it attacks the king, otherwise the first detected active attacking army. Shared mate-credit splitting is not implemented.
- Insufficient material is automatically detected only when the board literally contains kings and empty squares. Grey blockers can create mating cages, so they prevent this automatic draw. Other rare dead positions require draw agreement.
- A claim grants the other active player 20 and ends the game; surviving walking-king bonuses are applied to ordinary elimination endings.
- Pause, undo and hints are casual local features. Clocks begin after the first move, and restored games start paused.
- Existing `fourway-v1` records replay using the current engine rules.

## Verification coverage

`npm run check` passes **76 tests** across the engine, application, sound, room service, room client, and HTTP integration suites. The geometric oracle checks all six piece types for all four colors from every playable origin to every playable target: **614,400 attack comparisons**. Additional regression cases cover blocking, pins, king adjacency, every castling orientation and unsafe path, all promotion choices, en passant including perpendicular pawns, scoring, multi-king checks, discovered mate notation, actual self-stalemate, team timing, walking kings, endgame bonuses, normalized repetition and quiet-move draws.

Seeded tests run 80 bot plies and 120 replayed plies in each variant. The application DOM fixture checks human/bot turn flow, drag/drop, arrows, clocks, timeout automation, setup, settings, review, undo and invalid import handling. Sound tests check event URLs, click signal profiles and fallback playback.

Room regressions cover simultaneous joins, four-seat limits, host/minimum-player requirements, seat switching, both variants, forged tokens, turn ownership, illegal moves, duplicate commands, authoritative clocks, bot advancement, reconnect/expiry/takeover, host transfer, draw agreement, and online promotions in every orientation. Two independent HTTP clients create, join, start and play a synchronized game with two computers.

Rendering regressions verify that selection, drag highlighting and bot-turn updates preserve existing piece nodes, moves replace only changed squares, animations survive subsequent renders, and loaded Neo images stay ready in new pieces and drag ghosts.

The DOM fixture does not render CSS or replace browser visual QA. Browser screenshots and real-device audio playback were not available in the managed build environment. The classic sound CDN returned a challenge to the build environment; actual remote playback remains unverified, with tested local fallback.

## Layout

| File | Responsibility |
| --- | --- |
| `public/engine.js` | Pure rules, scoring, game endings and bots |
| `public/app.js` | Interaction, clocks, dialogs, history and persistence |
| `public/board-view.js` | Stable square/piece DOM updates without reload flicker |
| `public/pieces.js`, `public/assets/pieces/neo/` | Bundled Neo artwork, SVG fallback and icons |
| `public/rooms.js` | Tab membership, room requests and reconnect polling |
| `api/rooms.js`, `server/` | Room endpoint, authoritative game flow and atomic Redis store |
| `public/sounds.js` | Classic audio and local wooden-click fallback |
| `public/style.css` | Desktop, tablet and mobile playing screen |
| `tests/` | Engine, application and audio regression tests |
| `scripts/build.mjs` | Dependency-free static build |
| `scripts/serve.mjs` | Local development server |
