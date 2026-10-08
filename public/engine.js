// Pure, dependency-free four-player chess rules. Coordinates: a14 at top-left.
export const COLORS = ['red', 'blue', 'yellow', 'green'];
export const NAMES = ['Red', 'Blue', 'Yellow', 'Green'];
export const VALUES = { p: 1, n: 3, b: 5, r: 5, q: 9, k: 20 };
export const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
export const valid = (r, c) => r >= 0 && r < 14 && c >= 0 && c < 14 && ((r >= 3 && r <= 10) || (c >= 3 && c <= 10));
export const index = (r, c) => r * 14 + c;
export const coords = i => [Math.floor(i / 14), i % 14];
export const square = i => String.fromCharCode(97 + i % 14) + (14 - Math.floor(i / 14));
export function rotate(r, c, times) { for (let t = 0; t < times; t++) [r, c] = [c, 13 - r]; return [r, c]; }
export const clone = state => structuredClone(state);
export const allies = (s, a, b) => a === b || (s.options.variant === 'teams' && a % 2 === b % 2);
export function newGame(options = {}) {
  const opts = { variant: 'ffa', mode: 'solo', human: 0, difficulty: 'normal', minutes: 10, increment: 2, ...options };
  const s = { version: 2, options: opts, board: Array(196).fill(null), turn: 0, ply: 0, ep: [], quiet: 0, quietMoves: [0,0,0,0],
    players: COLORS.map((color, id) => ({ id, color, active: true, zombie: false, score: 0, status: 'Ready', time: opts.minutes * 60 * 1000, captured: [] })),
    history: [], repetitions: {}, lastMove: null, result: null };
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let p = 0; p < 4; p++) for (let i = 0; i < 8; i++) {
    const [r, c] = rotate(13, i + 3, p), [pr, pc] = rotate(12, i + 3, p);
    s.board[index(r, c)] = { type: back[i], owner: p, moved: false, promoted: false };
    s.board[index(pr, pc)] = { type: 'p', owner: p, moved: false, promoted: false };
  }
  s.repetitions[positionKey(s)] = 1;
  return s;
}
export const live = (s, p) => !!p && (s.players[p.owner].active || (s.players[p.owner].zombie && p.type === 'k'));
export const takingTurn = (s, owner) => s.players[owner].active || s.players[owner].zombie;
function canCapture(s, p, target) { return target && (!live(s, target) || !allies(s, p.owner, target.owner)); }
export function attacks(s, from, target) {
  const p = s.board[from];
  if (!live(s, p)) return false;
  const [r, c] = coords(from), [tr, tc] = coords(target), dr = tr - r, dc = tc - c;
  if (!valid(tr, tc)) return false;
  if (p.type === 'p') { const [fr, fc] = DIRS[p.owner]; return fr ? dr === fr && Math.abs(dc) === 1 : dc === fc && Math.abs(dr) === 1; }
  if (p.type === 'n') return Math.abs(dr) * Math.abs(dc) === 2;
  if (p.type === 'k') return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
  const diagonal = Math.abs(dr) === Math.abs(dc) && dr !== 0, orthogonal = (dr === 0) !== (dc === 0);
  if (!(p.type === 'q' && (diagonal || orthogonal) || p.type === 'r' && orthogonal || p.type === 'b' && diagonal)) return false;
  const sr = Math.sign(dr), sc = Math.sign(dc);
  for (let rr = r + sr, cc = c + sc; rr !== tr || cc !== tc; rr += sr, cc += sc) {
    if (!valid(rr, cc) || s.board[index(rr, cc)]) return false;
  }
  return true;
}
export function attackers(s, target, owner) {
  return s.board.flatMap((p, i) => live(s, p) && !allies(s, p.owner, owner) && attacks(s, i, target) ? [i] : []);
}
export function kingSquare(s, owner) { return s.board.findIndex(p => p?.owner === owner && p.type === 'k'); }
export function inCheck(s, owner) { const king = kingSquare(s, owner); return king < 0 || attackers(s, king, owner).length > 0; }
export function pseudoMoves(s, from, includeCastle = true) {
  const p = s.board[from];
  if (!live(s, p)) return [];
  const [r, c] = coords(from), moves = [];
  const add = (rr, cc, extra = {}) => {
    if (!valid(rr, cc)) return;
    const to = index(rr, cc), t = s.board[to];
    if ((!t || canCapture(s, p, t)) && !(live(s, t) && t.type === 'k')) moves.push({ from, to, ...extra });
  };
  if (p.type === 'p') {
    const [dr, dc] = DIRS[p.owner], rr = r + dr, cc = c + dc;
    if (valid(rr, cc) && !s.board[index(rr, cc)]) {
      add(rr, cc);
      const [localR] = rotate(r, c, (4 - p.owner) % 4);
      if (!p.moved && localR === 12 && valid(r + 2 * dr, c + 2 * dc) && !s.board[index(r + 2 * dr, c + 2 * dc)]) add(r + 2 * dr, c + 2 * dc, { double: true });
    }
    for (const delta of [-1, 1]) {
      const tr = r + dr + (dc ? delta : 0), tc = c + dc + (dr ? delta : 0);
      if (!valid(tr, tc)) continue;
      const to = index(tr, tc), target = s.board[to];
      if (canCapture(s, p, target)) add(tr, tc);
      if (!target) for (const ep of s.ep) {
        const victim = s.board[ep.victim];
        if (ep.target === to && live(s, victim) && victim.type === 'p' && !allies(s, p.owner, victim.owner)) add(tr, tc, { ep: ep.victim });
      }
    }
    const threshold = s.options.variant === 'teams' ? 10 : 7;
    return moves.flatMap(m => {
      const [mr, mc] = coords(m.to), [localR] = rotate(mr, mc, (4 - p.owner) % 4);
      return 13 - localR >= threshold ? (s.options.variant === 'teams' ? ['q', 'r', 'b', 'n'] : ['q']).map(promotion => ({ ...m, promotion })) : [m];
    });
  }
  if (p.type === 'n' || p.type === 'k') {
    for (const [dr, dc] of p.type === 'n' ? KNIGHT : [...ORTHO, ...DIAG]) add(r + dr, c + dc);
    if (p.type === 'k' && includeCastle && !p.moved && !inCheck(s, p.owner)) {
      const [startR, startC] = rotate(13, 7, p.owner);
      if (r === startR && c === startC) for (const edge of [3, 10]) {
        const [rookR, rookC] = rotate(13, edge, p.owner), rookFrom = index(rookR, rookC), rook = s.board[rookFrom];
        if (!rook || rook.owner !== p.owner || rook.type !== 'r' || rook.moved || rook.promoted) continue;
        const dr = Math.sign(rookR - r), dc = Math.sign(rookC - c);
        let clear = true;
        for (let rr = r + dr, cc = c + dc; rr !== rookR || cc !== rookC; rr += dr, cc += dc) if (s.board[index(rr, cc)]) clear = false;
        if (!clear) continue;
        // Occupancy must reflect the king leaving its original square for transit safety.
        const transit = { ...s, board:s.board.slice() }, mid = index(r + dr, c + dc);
        transit.board[mid] = transit.board[from]; transit.board[from] = null;
        if (inCheck(transit, p.owner)) continue;
        add(r + 2 * dr, c + 2 * dc, { castle: { from: rookFrom, to: mid } });
      }
    }
    return moves;
  }
  const dirs = p.type === 'r' ? ORTHO : p.type === 'b' ? DIAG : [...ORTHO, ...DIAG];
  for (const [dr, dc] of dirs) for (let rr = r + dr, cc = c + dc; valid(rr, cc); rr += dr, cc += dc) {
    add(rr, cc);
    if (s.board[index(rr, cc)]) break;
  }
  return moves;
}
export function moveBoard(s, m) {
  const p = s.board[m.from];
  s.board[m.to] = { ...p, moved: true, type: m.promotion || p.type, promoted: !!m.promotion || p.promoted };
  s.board[m.from] = null;
  if (m.ep !== undefined) s.board[m.ep] = null;
  if (m.castle) { s.board[m.castle.to] = { ...s.board[m.castle.from], moved: true }; s.board[m.castle.from] = null; }
}
export function legalMoves(s, from) {
  const p = s.board[from];
  if (!live(s, p) || s.result) return [];
  return pseudoMoves(s, from).filter(m => { const test = { ...s, board:s.board.slice() }; moveBoard(test, m); return !inCheck(test, p.owner); });
}
export function allMoves(s, owner = s.turn) {
  return s.board.flatMap((p, i) => p?.owner === owner && live(s, p) ? legalMoves(s, i) : []);
}
function finish(s, reason, winningTeam = null) {
  if (s.options.variant === 'teams') s.result = { reason, winners: winningTeam === null ? [] : COLORS.map((_, i) => i).filter(i => i % 2 === winningTeam) };
  else {
    const max = Math.max(...s.players.map(p => p.score));
    s.result = { reason, winners: s.players.filter(p => p.score === max).map(p => p.id) };
  }
}
function finishElimination(s) {
  const remaining=s.players.filter(p=>p.active);
  if(remaining.length>1)return false;
  if(remaining.length===1)remaining[0].score+=s.players.filter(p=>p.zombie && kingSquare(s,p.id)>=0).length*20;
  finish(s,'Three players eliminated');return true;
}
function deactivate(s, owner, reason, credit, selfStalemate = false) {
  if (!takingTurn(s, owner)) return;
  if (s.options.variant === 'teams') { s.players[owner].active = false; s.players[owner].status = reason; finish(s, reason, reason === 'Stalemate' ? null : (owner + 1) % 2); return; }
  if (reason === 'Checkmate' && credit !== undefined && credit !== owner && s.players[credit].active) s.players[credit].score += 20;
  if (reason === 'Stalemate') {
    if (selfStalemate && s.players[owner].active) s.players[owner].score += 20;
    else for (const p of s.players) if (p.active && p.id !== owner) p.score += 10;
  }
  s.players[owner].active = false; s.players[owner].zombie = false; s.players[owner].status = selfStalemate ? 'Self-stalemate' : reason;
  s.ep = s.ep.filter(ep => ep.owner !== owner);
}
export function settle(s, mover) {
  if (s.result) return;
  if (s.options.variant === 'ffa') {
    // FFA endings are immediate; team mate/stalemate wait for the threatened player's turn.
    for (let pass = 0; pass < 4; pass++) {
      const endings = s.players.filter(p => takingTurn(s,p.id) && allMoves(s,p.id).length === 0);
      if (!endings.length) break;
      // Snapshot all attackers before any eliminated army stops attacking.
      const decisions = endings.map(p => {
        const checks = attackers(s, kingSquare(s, p.id), p.id);
        const credit = checks.some(i => s.board[i].owner === mover) ? mover : (checks.length ? s.board[checks[0]].owner : undefined);
        return { owner:p.id, reason:checks.length ? 'Checkmate':'Stalemate', credit, self:p.id===mover };
      });
      for (const d of decisions) deactivate(s,d.owner,d.reason,d.credit,d.self);
    }
    if (finishElimination(s)) return;
  }
  for (let attempts = 0; attempts < 4; attempts++) {
    if (takingTurn(s,s.turn) && allMoves(s).length === 0) deactivate(s, s.turn, inCheck(s, s.turn) ? 'Checkmate' : 'Stalemate', mover);
    if (s.result) return;
    if (finishElimination(s)) return;
    if (takingTurn(s,s.turn)) break;
    s.turn = (s.turn + 1) % 4;
  }
  for (const p of s.players) if (p.active) p.status = inCheck(s, p.id) ? 'Check' : p.id === s.turn ? 'To move' : 'Waiting';
  if (s.board.every(p => !p || p.type === 'k')) draw(s, 'Insufficient material');
}
export function positionKey(s) {
  const rights = s.players.map(player => {
    const king = s.board[index(...rotate(13,7,player.id))];
    if (!player.active || !king || king.owner!==player.id || king.type!=='k' || king.moved) return '00';
    return [3,10].map(c=>{const rook=s.board[index(...rotate(13,c,player.id))];return +(!!rook && rook.owner===player.id && rook.type==='r' && !rook.moved && !rook.promoted);}).join('');
  }).join('');
  const board = s.board.map((p,i) => {
    if (!p) return '';
    const [r,c]=coords(i), [localR]=rotate(r,c,(4-p.owner)%4);
    const doubleRight=p.type==='p' && s.players[p.owner].active && localR===12 && !p.moved;
    return p.owner+p.type+(s.players[p.owner].active ? +p.promoted : '')+(doubleRight?'d':'');
  }).join(',');
  const ep = s.ep.filter(e=>s.board.some((p,i)=>p?.type==='p' && s.players[p.owner].active && legalMoves(s,i).some(m=>m.ep===e.victim))).map(e=>e.target+':'+e.victim).sort().join(',');
  return s.turn+'|'+s.players.map(p=>(+p.active)+''+(+!!p.zombie)).join('')+'|'+board+'|'+rights+'|'+ep;
}
export function draw(s, reason = 'Draw agreed') {
  if (s.result) return;
  if (s.options.variant === 'ffa') for (const p of s.players) if (p.active) p.score += 10;
  finish(s, reason);
}
export function play(s, input) {
  if (s.result || s.board[input.from]?.owner !== s.turn) throw new Error('It is not that army’s turn.');
  const m = legalMoves(s, input.from).find(m => m.to === input.to && (m.promotion || null) === (input.promotion || null));
  if (!m) throw new Error('Illegal move.');
  const previousStatus=s.players.map(p=>p.status), wasZombie=!!s.players[s.turn].zombie;
  const owner = s.turn, piece = s.board[m.from], victim = s.board[m.ep ?? m.to];
  const capture = victim ? { ...victim } : null;
  if (live(s, victim) && s.players[owner].active) { s.players[owner].score += victim.promoted ? 1 : VALUES[victim.type]; s.players[owner].captured.push(capture); }
  moveBoard(s, m);
  s.ep = s.ep.filter(ep => ep.victim !== m.from && ep.victim !== m.ep && ep.victim !== m.to);
  if (m.double) s.ep.push({ target: (m.from + m.to) / 2, victim: m.to, owner });
  s.quiet = piece.type === 'p' || capture ? 0 : s.quiet + 1;
  if (piece.type === 'p' || capture) s.quietMoves.fill(0); else if (s.players[owner].active) s.quietMoves[owner]++;
  if (s.options.minutes && s.players[owner].active) s.players[owner].time += s.options.increment * 1000;
  s.ply++;
  s.lastMove = { ...m, owner };
  const checked = s.players.filter(p => p.active && !allies(s, owner, p.id) && attacks(s, m.to, kingSquare(s, p.id)));
  if (s.options.variant === 'ffa' && s.players[owner].active && checked.length >= 2) s.players[owner].score += s.board[m.to].type === 'q' ? (checked.length === 2 ? 1 : 5) : (checked.length === 2 ? 5 : 20);
  const notation = m.castle ? (Math.abs(coords(m.castle.from)[0] - coords(m.from)[0]) + Math.abs(coords(m.castle.from)[1] - coords(m.from)[1]) === 3 ? 'O-O' : 'O-O-O') :
    (piece.type === 'p' ? '' : piece.type.toUpperCase()) + square(m.from) + (capture ? '×' : '–') + square(m.to) + (m.promotion ? '=' + m.promotion.toUpperCase() : '') + (m.ep !== undefined ? ' e.p.' : '');
  s.turn = (s.turn + 1) % 4;
  while (!takingTurn(s,s.turn)) s.turn = (s.turn + 1) % 4;
  s.ep = s.ep.filter(ep => ep.owner !== s.turn);
  settle(s, owner);
  const check = s.players.some(p => takingTurn(s,p.id) && !allies(s,owner,p.id) && attackers(s,kingSquare(s,p.id),p.id).some(i=>s.board[i].owner===owner));
  const mate = s.players.some(p=>p.status==='Checkmate' && previousStatus[p.id]!=='Checkmate' && p.id!==owner);
  s.history.push({ owner, from: m.from, to: m.to, promotion: m.promotion || null, notation: notation + (mate ? '#' : check ? '+' : ''), capture, zombie:wasZombie });
  const key = positionKey(s); s.repetitions[key] = (s.repetitions[key] || 0) + 1;
  if (!s.result && s.repetitions[key] >= 3) draw(s, 'Threefold repetition');
  if (!s.result && s.players.filter(p=>p.active).every(p=>s.quietMoves[p.id]>=50)) draw(s, '50-move rule');
  return s;
}
export function eliminate(s, owner, reason = 'Resigned') {
  if (s.result || !s.players[owner]?.active) return;
  const active=s.players.filter(p=>p.active);
  if (s.options.variant==='ffa' && ['Resigned','Time out'].includes(reason)) {
    s.players[owner].active=false;s.players[owner].status=reason;
    s.players[owner].zombie=true;
    s.ep=s.ep.filter(e=>e.owner!==owner);
  } else deactivate(s, owner, reason);
  if (s.result) return;
  if (finishElimination(s)) return;
  if (s.turn === owner && !takingTurn(s,owner)) {
    do { s.turn = (s.turn + 1) % 4; } while (!takingTurn(s,s.turn));
    s.ep = s.ep.filter(ep => ep.owner !== s.turn);
  }
  settle(s, owner);
}
export function claimWin(s, owner = s.turn) {
  const active = s.players.filter(p => p.active);
  if (s.result || s.options.variant !== 'ffa' || active.length !== 2 || !s.players[owner].active) return false;
  const other = active.find(p => p.id !== owner);
  if (s.players[owner].score <= other.score + 20 || s.players.some(p => p.id !== owner && p.score >= s.players[owner].score)) return false;
  other.score += 20; finish(s, 'Victory claimed'); return true;
}
export function chooseBot(s, difficulty = s.options.difficulty, random = Math.random) {
  const moves = allMoves(s), owner = s.turn;
  if (!moves.length) return null;
  if (s.players[owner].zombie) return moves[Math.floor(random()*moves.length)];
  if (difficulty === 'easy' && random() < 0.55) return moves[Math.floor(random() * moves.length)];
  const ranked = moves.map(m => {
    const next = clone(s), piece = s.board[m.from], victim = s.board[m.ep ?? m.to]; moveBoard(next, m);
    const [r, c] = coords(m.to), [lr] = rotate(r, c, (4 - owner) % 4);
    const attacked = attackers(next, m.to, owner).length > 0;
    let score = (live(s, victim) ? (victim.promoted ? 1 : VALUES[victim.type]) * 12 : 0) + (m.promotion ? 30 : 0) + (m.castle ? 8 : 0);
    score += (13 - Math.abs(r - 6.5) - Math.abs(c - 6.5)) * 0.25;
    if (piece.type === 'p') score += (13 - lr) * 0.6;
    if (['n', 'b'].includes(piece.type) && !piece.moved) score += 3;
    if (piece.type === 'k' && !m.castle) score -= 2;
    if (attacked) score -= (piece.type === 'k' ? 100 : VALUES[m.promotion || piece.type]) * 10;
    for (const p of s.players) if (p.active && !allies(s, owner, p.id) && inCheck(next, p.id)) score += 3;
    score += random() * (difficulty === 'easy' ? 8 : 1.3);
    return { m, score, next };
  }).sort((a, b) => b.score - a.score);
  if (difficulty === 'hard') for (const candidate of ranked.slice(0, 8)) {
    let risk = 0;
    for (const p of s.players) if (p.active && !allies(s, owner, p.id)) {
      for (const reply of allMoves(candidate.next, p.id)) {
        const target = candidate.next.board[reply.ep ?? reply.to];
        if (target?.owner === owner) risk = Math.max(risk, VALUES[target.type] * 2);
      }
      if (inCheck(candidate.next, p.id) && !allMoves(candidate.next, p.id).length) candidate.score += 200;
    }
    candidate.score -= risk;
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].m;
}
