import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, valid, index as at, rotate, legalMoves, allMoves, play, attacks, inCheck, kingSquare, settle, eliminate, claimWin, chooseBot, positionKey, draw, live, clone, pseudoMoves, moveBoard } from '../public/engine.js';
const piece=(type,owner,moved=false)=>({type,owner,moved,promoted:false});
function sparse(options={}) {const s=newGame(options);s.board.fill(null);for(let p=0;p<4;p++)s.board[at(...rotate(13,7,p))]=piece('k',p);return s;}
function move(s,from,to,promotion) {return play(s,{from:at(...from),to:at(...to),promotion});}
test('cross board has exactly 160 playable squares and 64 pieces',()=>{
  const s=newGame();assert.equal(s.board.filter(Boolean).length,64);let count=0;for(let r=0;r<14;r++)for(let c=0;c<14;c++)count+=valid(r,c);assert.equal(count,160);
  for(let p=0;p<4;p++){assert.equal(s.board.filter(x=>x?.owner===p).length,16);assert.equal(allMoves(s,p).length,20);assert.equal(inCheck(s,p),false);}
});
test('turns proceed Red, Blue, Yellow, Green and all pawn directions support double moves',()=>{
  const s=newGame();for(let p=0;p<4;p++){assert.equal(s.turn,p);move(s,rotate(12,7,p),rotate(10,7,p));}assert.equal(s.turn,0);assert.equal(s.ply,4);assert.equal(s.history.length,4);assert.equal(s.players[0].time,602000);
});
test('illegal/out-of-turn moves are rejected without changing the position',()=>{
  const s=newGame(), key=positionKey(s);assert.throws(()=>move(s,[13,3],[10,3]),/Illegal/);assert.throws(()=>move(s,rotate(12,3,1),rotate(11,3,1)),/turn/);assert.equal(positionKey(s),key);
});
test('rays do not cross removed corners and knights can leap pieces',()=>{
  const s=sparse();s.board[at(2,3)]=piece('r',0);assert(!legalMoves(s,at(2,3)).some(m=>m.to===at(2,11))); // missing corner
  s.board[at(0,3)]=piece('b',0);assert(!attacks(s,at(0,3),at(3,0))); // both endpoints valid, but ray crosses a missing corner
  const initial=newGame();assert.equal(legalMoves(initial,at(13,4)).length,2);
});
test('pinned pieces cannot uncover a rook attack on their king',()=>{
  const s=sparse();s.board[at(12,7)]=piece('r',0);s.board[at(10,7)]=piece('r',1);
  assert(!legalMoves(s,at(12,7)).some(m=>m.to===at(12,8)));assert(legalMoves(s,at(12,7)).some(m=>m.to===at(10,7)));
});
test('kings are checked but never captured, and cannot move into attacked squares',()=>{
  const s=sparse();s.board[at(11,7)]=piece('r',1);assert(inCheck(s,0));assert(!legalMoves(s,at(11,7)).some(m=>m.to===kingSquare(s,0)));
  assert(!legalMoves(s,kingSquare(s,0)).some(m=>m.to===at(12,7)));
});
test('both castles work for all four orientations',()=>{
  for(let p=0;p<4;p++)for(const edge of [3,10]){
    const s=sparse();s.turn=p;const from=at(...rotate(13,7,p)),rf=at(...rotate(13,edge,p));s.board[rf]=piece('r',p);
    const castle=legalMoves(s,from).find(m=>m.castle);assert(castle,`castle ${p}, ${edge}`);play(s,castle);assert.equal(s.board[castle.to].type,'k');assert.equal(s.board[castle.castle.to].type,'r');assert.equal(s.board[rf],null);
  }
});
test('castling is disallowed after king/rook moved or through check',()=>{
  const s=sparse();s.board[at(13,10)]=piece('r',0);s.board[at(10,8)]=piece('r',1);assert(!legalMoves(s,kingSquare(s,0)).some(m=>m.castle));
  s.board[at(10,8)]=null;s.board[at(13,10)].moved=true;assert(!legalMoves(s,kingSquare(s,0)).some(m=>m.castle));s.board[at(13,10)].moved=false;s.board[kingSquare(s,0)].moved=true;assert(!legalMoves(s,kingSquare(s,0)).some(m=>m.castle));
});
test('FFA pawn promotion is automatic queen on own eighth rank for every army',()=>{
  for(let p=0;p<4;p++){
    const s=sparse();s.turn=p;s.board[at(...rotate(7,5,p))]=piece('p',p,true);
    const moves=legalMoves(s,at(...rotate(7,5,p))).filter(m=>m.to===at(...rotate(6,5,p)));assert.equal(moves.length,1);assert.equal(moves[0].promotion,'q');play(s,moves[0]);assert.equal(s.board[moves[0].to].promoted,true);
  }
});
test('teams promotion allows all four pieces on own eleventh rank',()=>{
  const s=sparse({variant:'teams'});s.board[at(4,5)]=piece('p',0,true);const moves=legalMoves(s,at(4,5)).filter(m=>m.to===at(3,5));assert.deepEqual(moves.map(m=>m.promotion),['q','r','b','n']);play(s,moves[3]);assert.equal(s.board[at(3,5)].type,'n');
});
test('captures score bishop 5, original queen 9, promoted queen 1, dead pieces 0',()=>{
  for(const [type,promoted,dead,points] of [['b',false,false,5],['q',false,false,9],['q',true,false,1],['q',false,true,0]]){
    const s=sparse();s.board[at(8,5)]=piece('r',0);s.board[at(8,7)]={...piece(type,1),promoted};if(dead)s.players[1].active=false;move(s,[8,5],[8,7]);assert.equal(s.players[0].score,points);
  }
});
test('en passant removes the double-moved pawn and scores the capture',()=>{
  const s=sparse();s.board[at(12,5)]=piece('p',0);s.board[at(10,4)]=piece('p',2,true);
  move(s,[12,5],[10,5]);s.turn=2;const ep=legalMoves(s,at(10,4)).find(m=>m.ep!==undefined);assert(ep);play(s,ep);assert.equal(s.board[at(10,5)],null);assert.equal(s.board[at(11,5)].owner,2);assert.equal(s.players[2].score,1);
});
test('en passant eligibility expires when the double-moving army returns to move',()=>{
  const s=newGame();move(s,[12,5],[10,5]);assert(s.ep.some(e=>e.owner===0));for(let p=1;p<4;p++)move(s,rotate(12,7,p),rotate(11,7,p));assert(!s.ep.some(e=>e.owner===0));
});
test('en passant cannot expose own king to a rook',()=>{
  const s=sparse();s.board[kingSquare(s,0)]=null;s.board[at(8,3)]=piece('k',0,true);s.board[at(8,5)]=piece('p',0,true);s.board[at(8,6)]=piece('p',2,true);s.board[at(8,10)]=piece('r',1);s.ep=[{target:at(7,6),victim:at(8,6),owner:2}];assert(!legalMoves(s,at(8,5)).some(m=>m.ep!==undefined));
});
test('FFA mate is immediate, awards 20 and leaves inactive blockers',()=>{
  const s=sparse();s.board[at(12,7)]=piece('q',1);s.board[at(12,3)]=piece('r',1);s.turn=2;assert.equal(allMoves(s,0).length,0);settle(s,1);assert.equal(s.players[0].active,false);assert.equal(s.players[0].status,'Checkmate');assert.equal(s.players[1].score,20);assert(s.board[at(13,7)]);
});
test('teams mate is only resolved on the mated army’s turn',()=>{
  const s=sparse({variant:'teams'});s.board[at(12,7)]=piece('q',1);s.board[at(12,3)]=piece('r',1);s.turn=2;settle(s,1);assert.equal(s.result,null);s.turn=0;settle(s,1);assert.deepEqual(s.result.winners,[1,3]);
});
test('teams cannot capture or be checked by teammates',()=>{
  const s=sparse({variant:'teams'});s.board[at(8,5)]=piece('r',0);s.board[at(8,7)]=piece('q',2);assert(!legalMoves(s,at(8,5)).some(m=>m.to===at(8,7)));s.board[at(12,7)]=piece('r',2);assert.equal(inCheck(s,0),false);
});
test('FFA resignation and timeout leave a walking king; final king bonuses affect placement',()=>{
  const s=newGame();s.players[0].score=100;eliminate(s,0);assert.equal(s.turn,0);assert(s.players[0].zombie);assert(live(s,s.board[kingSquare(s,0)]));assert(!live(s,s.board[at(12,7)]));
  eliminate(s,1,'Time out');assert(s.players[1].zombie);eliminate(s,2);assert.deepEqual(s.result.winners,[0]);assert.equal(s.players[3].score,60);
});
test('team timeout loses for the whole team',()=>{const s=newGame({variant:'teams'});eliminate(s,0,'Time out');assert.deepEqual(s.result.winners,[1,3]);});
test('claim victory requires over 20 point lead and respects eliminated high scorers',()=>{
  const s=newGame();s.players[2].active=false;s.players[3].active=false;s.players[0].score=21;assert.equal(claimWin(s),true);assert.deepEqual(s.result.winners,[0]);assert.equal(s.players[1].score,20);
  const t=newGame();t.players[2].active=false;t.players[3].active=false;t.players[0].score=20;assert.equal(claimWin(t),false);t.players[0].score=21;t.players[2].score=30;assert.equal(claimWin(t),false);
});
test('threefold repetitions ignore knight move-history flags',()=>{
  const s=newGame({minutes:0});for(let cycle=0;cycle<2;cycle++){
    for(let p=0;p<4;p++)move(s,rotate(13,4,p),rotate(11,5,p));
    for(let p=0;p<4;p++)move(s,rotate(11,5,p),rotate(13,4,p));
  }
  assert.equal(s.result.reason,'Threefold repetition');assert(s.players.every(p=>p.score===10));
});
test('draw awards active armies only; team draws have no winners',()=>{const s=newGame();s.players[0].active=false;draw(s);assert.equal(s.players[0].score,0);assert.equal(s.players[1].score,10);const t=newGame({variant:'teams'});draw(t);assert.deepEqual(t.result.winners,[]);});
test('bots play only legal moves through 80 plies without corrupting state',()=>{
  const s=newGame({minutes:0});let seed=42;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<80&&!s.result;i++){const m=chooseBot(s,'normal',rng);assert(m);play(s,m);for(const p of s.players)if(p.active)assert(kingSquare(s,p.id)>=0);assert.equal(s.board.filter(Boolean).some(p=>!Number.isInteger(p.owner)),false);}
});
test('hard bot returns a legal opening move',()=>{const s=newGame();const m=chooseBot(s,'hard',()=>.5);assert(allMoves(s).some(x=>x.from===m.from&&x.to===m.to));});

// Independent geometric oracle: walk rays from each square; compare every target.
test('every piece attacks the expected squares from all 160 origins in all four orientations',()=>{
  const cells=[];for(let r=0;r<14;r++)for(let c=0;c<14;c++)if(valid(r,c))cells.push([r,c]);
  const directions={r:[[1,0],[-1,0],[0,1],[0,-1]],b:[[1,1],[1,-1],[-1,1],[-1,-1]]};
  const forward=[[-1,0],[0,1],[1,0],[0,-1]];
  for(let owner=0;owner<4;owner++)for(const type of ['p','n','b','r','q','k'])for(const [r,c] of cells){
    const s=sparse();s.board.fill(null);const origin=at(r,c);s.board[origin]=piece(type,owner,true);const expected=new Set();
    if(['r','b','q'].includes(type))for(const [dr,dc] of type==='q'?[...directions.r,...directions.b]:directions[type])for(let step=1;step<14;step++){const rr=r+dr*step,cc=c+dc*step;if(!valid(rr,cc))break;expected.add(at(rr,cc));}
    else for(const [rr,cc] of cells){const dx=rr-r,dy=cc-c;if(type==='k'&&Math.max(Math.abs(dx),Math.abs(dy))===1||type==='n'&&[Math.abs(dx),Math.abs(dy)].sort().join(',')==='1,2'||type==='p'&&(forward[owner][0] ? dx===forward[owner][0]&&Math.abs(dy)===1 : dy===forward[owner][1]&&Math.abs(dx)===1))expected.add(at(rr,cc));}
    for(const [rr,cc] of cells)assert.equal(attacks(s,origin,at(rr,cc)),expected.has(at(rr,cc)),`${owner} ${type} ${r},${c} -> ${rr},${cc}`);
  }
});
test('sliding attacks stop at both live pieces and grey blockers',()=>{
  for(const dead of [false,true]){const s=sparse();s.board[at(7,3)]=piece('r',0);s.board[at(7,6)]=piece('b',1);s.players[1].active=!dead;assert(attacks(s,at(7,3),at(7,6)));assert(!attacks(s,at(7,3),at(7,7)));assert(legalMoves(s,at(7,3)).some(m=>m.to===at(7,6)));}
});
test('pawns block, capture diagonally, and cannot double from a later rank in any orientation',()=>{
  for(let p=0;p<4;p++){
    const s=sparse();const from=at(...rotate(12,5,p));s.board[from]=piece('p',p);s.board[at(...rotate(11,5,p))]=piece('p',(p+1)%4);s.board[at(...rotate(11,6,p))]=piece('p',(p+1)%4);
    const moves=legalMoves(s,from);assert(!moves.some(m=>m.double));assert(!moves.some(m=>m.to===at(...rotate(11,5,p))));assert(moves.some(m=>m.to===at(...rotate(11,6,p))));
    s.board[from]=null;const later=at(...rotate(10,5,p));s.board[later]=piece('p',p,false);assert(!legalMoves(s,later).some(m=>m.double));
  }
});
test('castling rejects blocked paths, start check, transit check, landing check and promoted rooks for every army',()=>{
  for(let p=0;p<4;p++)for(const blocker of [7,8,9,'piece','promoted']){
    const s=sparse();const king=kingSquare(s,p),rook=at(...rotate(13,10,p));s.board[rook]=piece('r',p);
    if(blocker==='piece')s.board[at(...rotate(13,8,p))]=piece('n',p);
    else if(blocker==='promoted')s.board[rook].promoted=true;
    else s.board[at(...rotate(10,blocker,p))]=piece('r',(p+1)%4);
    assert(!legalMoves(s,king).some(m=>m.castle),`army ${p}, blocker ${blocker}`);
  }
});
test('a castled king and rook retain their moved status and cannot castle again',()=>{
  const s=sparse();s.board[at(13,10)]=piece('r',0);const m=legalMoves(s,kingSquare(s,0)).find(m=>m.castle);play(s,m);assert(s.board[m.to].moved);assert(s.board[m.castle.to].moved);
});
test('team underpromotions work for every army and each of the four choices',()=>{
  for(let p=0;p<4;p++)for(const type of ['q','r','b','n']){const s=sparse({variant:'teams'});s.turn=p;const from=at(...rotate(4,5,p)),to=at(...rotate(3,5,p));s.board[from]=piece('p',p,true);play(s,{from,to,promotion:type});assert.equal(s.board[to].type,type);assert(s.board[to].promoted);}
});
test('en passant captures work in all orientations including perpendicular opposing pawns',()=>{
  for(let p=0;p<4;p++)for(const perpendicular of [false,true]){
    const s=sparse();s.turn=p;const double=at(...rotate(12,5,p)),victim=at(...rotate(10,5,p));s.board[double]=piece('p',p);
    const owner=(p+(perpendicular?1:2))%4,from=at(...rotate(perpendicular?12:10,4,p));s.board[from]=piece('p',owner,true);
    play(s,{from:double,to:victim});s.turn=owner;const m=legalMoves(s,from).find(m=>m.ep===victim);assert(m,`army ${p}, perpendicular ${perpendicular}`);play(s,m);assert.equal(s.board[victim],null);assert.equal(s.players[owner].score,1);
  }
});
test('en passant cannot capture a teammate or a grey pawn',()=>{
  for(const kind of ['ally','dead']){const s=sparse({variant:kind==='ally'?'teams':'ffa'});s.board[at(8,5)]=piece('p',0,true);s.board[at(8,6)]=piece('p',2,true);s.ep=[{target:at(7,6),victim:at(8,6),owner:2}];if(kind==='dead')s.players[2].active=false;assert(!legalMoves(s,at(8,5)).some(m=>m.ep!==undefined));}
});
test('double and triple king checks award the correct queen and non-queen bonuses',()=>{
  for(const type of ['q','r'])for(const count of [2,3]){
    const s=sparse();for(let p=1;p<4;p++)s.board[kingSquare(s,p)]=null;
    s.board[at(7,3)]=piece('k',1,true);s.board[at(7,10)]=piece('k',2,true);s.board[count===3?at(3,7):at(3,10)]=piece('k',3,true);
    s.board[at(8,7)]=piece(type,0,true);play(s,{from:at(8,7),to:at(7,7)});assert.equal(s.players[0].score,type==='q'?(count===2?1:5):(count===2?5:20));assert.match(s.history.at(-1).notation,/\+$/);
  }
});
test('opponent stalemate awards ten points to each other active army',()=>{
  const s=sparse();s.board[at(11,6)]=piece('q',1,true);s.board[at(11,8)]=piece('r',1,true); // neither attacks red king, but all escape squares are covered
  assert(!inCheck(s,0));assert.equal(allMoves(s,0).length,0);settle(s,1);assert.equal(s.players[0].status,'Stalemate');assert.deepEqual(s.players.map(p=>p.score),[0,10,10,10]);
});
test('self stalemate awards twenty points to the player who caused it',()=>{
  const s=sparse();s.board[at(11,6)]=piece('q',1,true);s.board[at(11,8)]=piece('r',1,true);settle(s,0);assert.equal(s.players[0].status,'Self-stalemate');assert.deepEqual(s.players.map(p=>p.score),[20,0,0,0]);
});
test('team stalemate waits for the affected player’s turn and then draws',()=>{
  const s=sparse({variant:'teams'});s.board[at(11,6)]=piece('q',1,true);s.board[at(11,8)]=piece('r',1,true);s.turn=2;settle(s,1);assert.equal(s.result,null);s.turn=0;settle(s,1);assert.deepEqual(s.result.winners,[]);assert.equal(s.result.reason,'Stalemate');
});
test('walking kings move legally at random, earn no points or increment, and cannot move their dead army',()=>{
  const s=newGame();eliminate(s,0);const before=s.players[0].time;assert.equal(legalMoves(s,at(12,7)).length,0);const m=chooseBot(s,'hard',()=>0);assert.equal(s.board[m.from].type,'k');play(s,m);assert.equal(s.players[0].time,before);assert.equal(s.players[0].score,0);assert.equal(s.history.at(-1).zombie,true);assert.equal(s.turn,1);
});
test('checkmating a walking king awards twenty points without reviving the army',()=>{
  const s=sparse();s.players[0].active=false;s.players[0].zombie=true;s.board[at(12,7)]=piece('q',1);s.board[at(12,3)]=piece('r',1);settle(s,1);assert.equal(s.players[0].zombie,false);assert.equal(s.players[1].score,20);
});
test('king adjacency is forbidden against all three enemies, but allies do not check one another',()=>{
  for(let enemy=1;enemy<4;enemy++){const s=sparse();s.board[kingSquare(s,enemy)]=null;s.board[at(11,7)]=piece('k',enemy,true);assert(!legalMoves(s,kingSquare(s,0)).some(m=>m.to===at(12,7)));}
  const s=sparse({variant:'teams'});s.board[kingSquare(s,2)]=null;s.board[at(11,7)]=piece('k',2,true);assert(legalMoves(s,kingSquare(s,0)).some(m=>m.to===at(12,7)));
});
test('repetition keys retain actual castling rights but ignore irrelevant rook flags',()=>{
  const s=newGame();const key=positionKey(s);s.board[at(13,10)].moved=true;assert.notEqual(positionKey(s),key);s.board[at(13,7)].moved=true;const noCastle=positionKey(s);s.board[at(13,3)].moved=true;assert.equal(positionKey(s),noCastle);
});
test('repetition ignores unusable en passant rights and distinguishes a usable capture',()=>{
  const s=sparse();s.board[at(10,5)]=piece('p',0,true);const noEp=positionKey(s);s.ep=[{owner:0,victim:at(10,5),target:at(11,5)}];assert.equal(positionKey(s),noEp);s.board[at(10,4)]=piece('p',2,true);const ep=positionKey(s);s.ep=[];assert.notEqual(positionKey(s),ep);
});
test('50-move draw requires fifty quiet moves from every remaining army',()=>{
  const s=newGame({minutes:0});s.quietMoves=[49,50,50,49];move(s,[13,4],[11,5]);assert.equal(s.result,null);s.quietMoves=[50,49,50,50];move(s,rotate(13,4,1),rotate(11,5,1));assert.equal(s.result.reason,'50-move rule');assert(s.players.every(p=>p.score===10));
});
test('pawn moves and captures reset every army’s quiet counter',()=>{
  const s=newGame();s.quietMoves.fill(49);move(s,[12,7],[11,7]);assert.deepEqual(s.quietMoves,[0,0,0,0]);const t=sparse();t.board[at(8,5)]=piece('r',0);t.board[at(8,7)]=piece('n',1);t.quietMoves.fill(49);move(t,[8,5],[8,7]);assert.deepEqual(t.quietMoves,[0,0,0,0]);
});
test('dead blockers prevent a premature kings-only insufficient-material draw',()=>{
  const s=sparse();s.players[2].active=false;s.board[at(8,7)]=piece('b',2);settle(s,0);assert.equal(s.result,null);s.board[at(8,7)]=null;settle(s,0);assert.equal(s.result.reason,'Insufficient material');
});
test('seeded complete gameplay is replayable and preserves king safety in both variants',()=>{
  for(const variant of ['ffa','teams']){
    const s=newGame({variant,minutes:0}),replay=newGame(s.options);let seed=873;
    for(let ply=0;ply<120&&!s.result;ply++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const moves=allMoves(s),m=moves[seed%moves.length];assert(m);const owner=s.turn;play(s,m);play(replay,m);assert(!inCheck(s,owner)||!s.players[owner].active);assert.equal(positionKey(s),positionKey(replay));assert.deepEqual(s.players.map(p=>p.score),replay.players.map(p=>p.score));assert.equal(s.board.filter(Boolean).length<=64,true);}
  }
});

test('a legal pawn move can self-stalemate an army and award its own twenty points',()=>{
  const s=sparse();s.board[at(11,6)]=piece('q',1,true);s.board[at(10,8)]=piece('r',1,true);s.board[at(10,6)]=piece('b',1,true);s.board[at(12,8)]=piece('p',0,true);assert(!inCheck(s,0));play(s,{from:at(12,8),to:at(11,8)});assert.equal(s.players[0].status,'Self-stalemate');assert.equal(s.players[0].score,20);assert.equal(s.players[1].score,0);
});
test('discovered checks and discovered checkmates receive correct move notation',()=>{
  const s=sparse();s.turn=1;s.board[at(12,7)]=piece('q',1);s.board[at(12,3)]=piece('r',1);s.board[at(12,5)]=piece('n',1);assert(inCheck(s,0));play(s,{from:at(12,5),to:at(10,4)});assert.equal(s.players[0].status,'Checkmate');assert.match(s.history.at(-1).notation,/#$/);
});
