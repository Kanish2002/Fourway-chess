import { COLORS, NAMES, newGame, clone, valid, index, coords, rotate, square, legalMoves, allMoves, play, inCheck, kingSquare, chooseBot, eliminate, draw, claimWin, allies, live } from './engine.js';
import { playSound } from './sounds.js';
import { pieceSvg, icon } from './pieces.js';

const $ = id => document.getElementById(id);
const STORAGE = 'fourway.game.v1', PREFS = 'fourway.preferences.v1';
const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
let state = newGame(), events = [], undoStack = [], selected = null, destinations = [], rotation = 0, review = null, hintMove = null;
let started = false, paused = false, botTimer = null, lastTick = performance.now(), toastTimer;
let prefs = { sound: true, coordinates: true, hints: true, auto: false, animation: true, soundSet: 'classic', theme: 'sage' };
let storageWarned = false, focusIndex = index(12, 7), modalWasPaused = true;
let drag = null, suppressClick = false, animationMove = null, annotations = [], arrowStart = null;

function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function announce(message) { $('announcement').textContent = message; }
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ format: 'fourway-v1', options: state.options, events, started, clocks:state.players.map(p=>p.time) })); localStorage.setItem(PREFS, JSON.stringify(prefs)); }
  catch { if (!storageWarned) { toast('This browser cannot save your game. Use Export to keep a copy.'); storageWarned = true; } }
}
function safeOptions(o) {
  if (!o || !['ffa', 'teams'].includes(o.variant) || !['solo', 'local'].includes(o.mode) || ![0,1,2,3].includes(o.human) || !['easy','normal','hard'].includes(o.difficulty) || ![0,3,5,10,15].includes(o.minutes) || ![0,2,5].includes(o.increment)) throw new Error('Unsupported game settings.');
  return { variant:o.variant, mode:o.mode, human:o.human, difficulty:o.difficulty, minutes:o.minutes, increment:o.increment };
}
function replayEvent(s, e) {
  if (s.result) throw new Error('The record continues after game over.');
  if (e.time) {
    if (!Array.isArray(e.time) || e.time.length !== 4 || e.time.some(t => !Number.isFinite(t) || t < 0 || t > 1e8)) throw new Error('Invalid game clock.');
    s.players.forEach((p, i) => p.time = e.time[i]);
  }
  if (e.type === 'move') {
    if (![e.from,e.to].every(i => Number.isInteger(i) && i >= 0 && i < 196) || ![null,undefined,'q','r','b','n'].includes(e.promotion)) throw new Error('Invalid move record.');
    play(s, e);
  } else if (e.type === 'eliminate' && [0,1,2,3].includes(e.owner) && ['Resigned','Time out'].includes(e.reason)) eliminate(s,e.owner,e.reason);
  else if (e.type === 'draw' && ['Draw agreed'].includes(e.reason)) draw(s,e.reason);
  else if (e.type === 'claim' && [0,1,2,3].includes(e.owner) && claimWin(s,e.owner)) { /* applied */ }
  else throw new Error('Invalid game event.');
}
function loadRecord(record) {
  if (record?.format !== 'fourway-v1' || !Array.isArray(record.events) || record.events.length > 3000) throw new Error('Choose a Fourway JSON game record (up to 3,000 events).');
  const options = safeOptions(record.options), next = newGame(options), stack = [];
  for (let i=0;i<record.events.length;i++) {
    const e = record.events[i];
    if (!e || typeof e !== 'object') throw new Error('Invalid game record.');
    if (e.type === 'move') { stack.push({ state:clone(next), eventLen:i }); if (stack.length > 24) stack.shift(); }
    replayEvent(next,e);
  }
  if (record.clocks) {
    if (!Array.isArray(record.clocks) || record.clocks.length !== 4 || record.clocks.some(t=>!Number.isFinite(t)||t<0||t>1e8)) throw new Error('Invalid saved clocks.');
    next.players.forEach((p,i)=>p.time=record.clocks[i]);
  }
  return { state:next, events:record.events, stack };
}
try {
  const storedPrefs = JSON.parse(localStorage.getItem(PREFS) || 'null');
  if (storedPrefs) for (const k of Object.keys(prefs)) { if (typeof prefs[k] === 'boolean' && typeof storedPrefs[k] === 'boolean') prefs[k] = storedPrefs[k]; }
  if (['classic','wood'].includes(storedPrefs?.soundSet)) prefs.soundSet=storedPrefs.soundSet;
  if (['sage','slate','walnut'].includes(storedPrefs?.theme)) prefs.theme = storedPrefs.theme;
  const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
  if (stored) { const restored = loadRecord(stored); state = restored.state; events = restored.events; undoStack = restored.stack; started = !!stored.started; paused = started && !state.result; rotation = state.options.mode === 'solo' ? state.options.human : 0; }
} catch { toast('The saved game could not be restored. A fresh board is ready.'); }

const humanTurn = () => state.players[state.turn].active && (state.options.mode === 'local' || state.turn === state.options.human);
const interactive = () => !state.result && review === null && !paused && humanTurn() && !document.querySelector('dialog[open]');
function sound(kind='move') { if(prefs.sound)playSound(kind,prefs.soundSet); }
function displayState() {
  if (review === null) return state;
  const position = newGame(state.options); let moves = 0;
  for (const e of events) { if (moves >= review || position.result) break; replayEvent(position,e); if (e.type === 'move') moves++; }
  return position;
}
function pieceHtml(p, s = state) { return `<span class="piece ${live(s,p) ? COLORS[p.owner] : 'dead'}">${pieceSvg(p.type)}</span>`; }
function renderBoard() {
  const s = displayState(), checkedKings = new Set(s.players.filter(p=>(p.active||p.zombie) && inCheck(s,p.id)).map(p=>kingSquare(s,p.id)));
  let html = '';
  for (let r=0;r<14;r++) for (let c=0;c<14;c++) {
    const [br,bc] = rotate(r,c,rotation), i=index(br,bc);
    if (!valid(br,bc)) { html+='<div class="cell empty" aria-hidden="true"></div>'; continue; }
    const p=s.board[i], legal=destinations.some(m=>m.to===i), last=s.lastMove && [s.lastMove.from,s.lastMove.to].includes(i);
    let classes = `cell ${(br+bc)%2 ? 'dark' : 'light'}`;
    if (p && live(s,p) && p.owner===s.turn && interactive()) classes+=' own-piece';
    if(drag?.moved && i===drag.from)classes+=' drag-source';
    if (last) classes+=' last'; if (i===selected) classes+=' selected'; if (checkedKings.has(i)) classes+=' check';
    if (prefs.hints && legal) classes+=' legal'+(p || destinations.some(m=>m.to===i && m.ep!==undefined) ? ' capture' : '');
    if (hintMove && [hintMove.from,hintMove.to].includes(i)) classes+=' hinted';
    const label=`${square(i)}${p ? ', '+NAMES[p.owner]+' '+pieceNames[p.type]+(!live(s,p) ? ', inactive' : '') : ', empty'}${legal ? ', legal destination' : ''}`;
    let coordinates='';
    if (prefs.coordinates) {
      if (c===0 || !valid(...rotate(r,c-1,rotation))) coordinates+=`<span class="coordinate rank">${14-br}</span>`;
      if (r===13 || !valid(...rotate(r+1,c,rotation))) coordinates+=`<span class="coordinate file">${String.fromCharCode(97+bc)}</span>`;
    }
    let piece=p ? pieceHtml(p,s) : '';
    if(p && animationMove?.to===i && prefs.animation){const [fr,fc]=rotate(...coords(animationMove.from),(4-rotation)%4),[tr,tc]=rotate(br,bc,(4-rotation)%4);piece=piece.replace('class="piece ',`style="--move-x:${(fc-tc)*105.26}%;--move-y:${(fr-tr)*105.26}%" class="piece moving `);}
    html+=`<button class="${classes}" data-square="${i}" aria-label="${label}" aria-pressed="${selected===i}" tabindex="${i===focusIndex ? 0 : -1}" title="${label}">${piece}${p?.promoted ? '<span class="promoted-mark" title="Promoted pawn">•</span>' : ''}${coordinates}</button>`;
  }
  $('board').innerHTML=html;
  animationMove=null;
  const corners=[['corner-nw',2],['corner-ne',3],['corner-sw',1],['corner-se',0]];
  for(const [id,base] of corners){
    const owner=(base+rotation)%4,p=s.players[owner],you=s.options.mode==='solo' && owner===s.options.human,current=owner===s.turn&&!s.result;
    $(id).innerHTML=`<div class="corner-player ${p.color}${!p.active&&!p.zombie?' eliminated':''}${p.zombie?' zombie':''}"><div class="corner-heading"><span class="corner-avatar">${pieceHtml({type:'k',owner},s)}</span><div><strong>${NAMES[owner]}${you?' · You':''}</strong><small>${p.zombie?'Dead king walking':!p.active?p.status:you?'You':s.options.mode==='solo'?'Computer':'Local player'}</small></div></div><div class="corner-clock${current?' current':''}" id="corner-clock-${owner}"><span class="icon">${icon('history')}</span><span id="corner-time-${owner}">${p.zombie?'—':timeText(p.time)}</span></div><div class="corner-points">${s.options.variant==='ffa'?p.score+' points':owner%2?'Blue + Green':'Red + Yellow'}</div></div>`;
  }
  renderAnnotations();
  renderOverlay();
}
function renderOverlay() {
  const overlay=$('board-result');
  if (review!==null || (!state.result && !paused)) { overlay.hidden=true; return; }
  overlay.hidden=false;
  if (state.result) {
    const winner=state.result.winners.map(i=>NAMES[i]).join(' + '), title=state.result.winners.length ? `${winner} ${state.result.winners.length===1 ? 'wins' : state.options.variant==='teams' ? 'win' : 'tie'}!` : 'A well-played draw.';
    overlay.innerHTML=`<div class="result-card"><span class="icon">${icon('crown')}</span><h2>${title}</h2><p>${state.result.reason}</p>${state.options.variant==='ffa' ? '<div class="result-scores">'+state.players.map(p=>`<span class="${p.color}">${NAMES[p.id]} <b>${p.score}</b></span>`).join('')+'</div>' : ''}<div class="result-actions"><button class="button button-primary" data-action="new">Play again</button><button class="button button-quiet" data-action="review">Review</button></div></div>`;
  } else overlay.innerHTML=`<div class="result-card"><span class="icon">${icon('pause')}</span><h2>Take your time.</h2><p>Your game is paused. The board will be right here.</p><button class="button button-primary" data-action="resume">Resume game <span>→</span></button></div>`;
}
function timeText(time) { if (!state.options.minutes) return '∞'; const secs=Math.max(0,Math.ceil(time/1000)); return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`; }
function renderPlayers() {
  const shown=displayState();
  $('players').innerHTML=shown.players.map(p=> {
    const you=state.options.mode==='solo' && p.id===state.options.human, bot=state.options.mode==='solo' && !you;
    const current=p.id===shown.turn && !shown.result, teammate=state.options.variant==='teams' ? ` · ${NAMES[(p.id+2)%4]}’s ally` : '';
    const subtitle=p.zombie?'Dead king walking':!p.active ? p.status : current ? (paused ? 'Paused' : bot ? 'Thinking…' : started ? 'Your move' : 'Ready to begin') : p.status==='Check' ? 'In check' : bot ? 'Computer'+teammate : 'Local player'+teammate;
    return `<div class="player-card ${p.color}${current?' current':''}${!p.active&&!p.zombie?' eliminated':''}${p.zombie?' zombie':''}${p.status==='Check'?' checked':''}"><div class="player-avatar"><span class="icon">${icon(bot?'bot':'person')}</span></div><div class="player-details"><div class="player-name">${NAMES[p.id]}${you?'<span class="you-tag">YOU</span>':''}</div><div class="player-subtitle">${subtitle}</div>${p.captured.length?'<div class="captured-pieces">'+p.captured.slice(-10).map(c=>pieceHtml(c)).join('')+'</div>':''}</div><div class="player-numbers"><div class="clock${p.time<30000 && state.options.minutes?' low':''}" id="clock-${p.id}">${p.zombie?'—':timeText(p.time)}</div><div class="score">${state.options.variant==='ffa'?`<b>${p.score}</b> points`:p.id%2?'Blue + Green':'Red + Yellow'}</div></div></div>`;
  }).join('');
}
function renderHistory() {
  if (!state.history.length) { $('history').innerHTML='<div class="history-empty"><span class="icon">'+icon('pawn')+'</span><strong>The opening is yours.</strong><p>Make your first move.<br>The rest will follow.</p></div>'; return; }
  const rounds=[]; let round=0,prev=-1;
  state.history.forEach((m,i)=>{if(m.owner<=prev)round++; (rounds[round]||=Array(4).fill(null))[m.owner]={m,i}; prev=m.owner;});
  $('history').innerHTML=rounds.map((row,i)=>`<div class="history-row"><span>${i+1}.</span>${row.map(e=>e?`<button class="move-entry ${COLORS[e.m.owner]}${review===e.i+1?' reviewing':''}" data-review="${e.i+1}" title="${NAMES[e.m.owner]}: ${e.m.notation}">${e.m.notation.replace(/[a-n]\d+[–×]/, e.m.capture?'×':'')}</button>`:'<span>—</span>').join('')}</div>`).join('');
  if(review===null) $('history').scrollTop=$('history').scrollHeight;
}
function render() {
  document.body.dataset.theme=prefs.theme;
  $('variant-label').textContent=state.options.variant==='teams'?'Teams · 2 vs 2':'Free-for-all';
  $('mode-label').textContent=state.options.mode==='solo'?'VS BOTS':'PASS & PLAY';
  $('time-control').textContent=state.options.minutes?`${state.options.minutes} min${state.options.increment?' + '+state.options.increment+' sec':''}`:'Untimed';
  $('round-label').textContent='ROUND '+(Math.floor(state.ply/4)+1);
  $('board-status').innerHTML=review!==null?'Reviewing move '+review:state.result?'Game complete':paused?'Game paused':`<span class="player-dot ${COLORS[state.turn]}"></span>${NAMES[state.turn]} ${inCheck(state,state.turn)?'is in check':'to move'}`;
  $('help-line').textContent=review!==null?'Review mode. Return to live position to keep playing.':state.options.mode==='solo'?`You are ${NAMES[state.options.human]}. ${inCheck(state,state.options.human)&&state.players[state.options.human].active?'Your king is in check.':'Drag a piece or click to move.'}`:'Pass & play. Each player controls the army whose turn it is.';
  $('review-label').textContent=review===null?'Live position':`Move ${review} / ${state.history.length}`;
  $('pause').innerHTML=`<span class="icon">${icon(paused?'play':'pause')}</span>`; $('pause').title=paused?'Resume game':'Pause game'; $('pause').setAttribute('aria-label',$('pause').title);
  $('sound').innerHTML=`<span class="icon">${icon(prefs.sound?'sound':'mute')}</span>`; $('sound').setAttribute('aria-pressed',String(prefs.sound));
  $('undo').disabled=!undoStack.length || review!==null;
  $('hint').disabled=!interactive(); $('pause').disabled=!!state.result || review!==null;
  $('resign').disabled=!!state.result || review!==null || !state.players[state.options.mode==='solo'?state.options.human:state.turn].active;
  $('draw').disabled=!!state.result || review!==null || state.options.mode==='solo'; $('draw').title=state.options.mode==='solo'?'Draw by agreement is available in pass & play':'Agree to a draw with all players';
  $('review-first').disabled=!state.history.length; $('review-prev').disabled=!state.history.length || review===0;
  $('review-next').disabled=review===null || review>=state.history.length; $('review-live').disabled=review===null;
  const test=clone(state); $('claim').hidden=!claimWin(test,state.options.mode==='solo'?state.options.human:state.turn);
  $('strategy-tip').textContent=state.options.variant==='teams'?'Your partner sits across the board. Coordinate attacks, block checks for each other, and protect both kings.':'Your next opponent sits to your left. Develop your pieces, protect your king, and watch all three fronts.';
  renderBoard();renderPlayers();renderHistory();scheduleBot();
}
function tick() {
  const now=performance.now(), delta=Math.max(0,now-lastTick);lastTick=now;
  if(!started || paused || state.result || !state.options.minutes) return;
  const p=state.players[state.turn];if(p.zombie)return;p.time=Math.max(0,p.time-delta);
  if($('clock-'+p.id)) { $('clock-'+p.id).textContent=timeText(p.time);$('clock-'+p.id).classList.toggle('low',p.time<30000); }
  if($('corner-time-'+p.id))$('corner-time-'+p.id).textContent=timeText(p.time);
  if(p.time===0) { events.push({type:'eliminate',owner:p.id,reason:'Time out',time:state.players.map(p=>p.time)});eliminate(state,p.id,'Time out');selected=null;destinations=[];save();render();toast(`${NAMES[p.id]} ran out of time.`); }
}
function scheduleBot() {
  clearTimeout(botTimer);
  if((state.options.mode!=='solo' && !state.players[state.turn].zombie) || humanTurn() || paused || review!==null || state.result || document.querySelector('dialog[open]'))return;
  botTimer=setTimeout(()=>{tick();if(paused||review!==null||state.result||humanTurn())return;const move=chooseBot(state);if(move)makeMove(move);},state.options.difficulty==='hard'?850:600);
}
function makeMove(move) {
  tick();if(state.result || state.board[move.from]?.owner!==state.turn)return;
  undoStack.push({state:clone(state),eventLen:events.length});if(undoStack.length>100)undoStack.shift();
  events.push({type:'move',from:move.from,to:move.to,promotion:move.promotion||null,time:state.players.map(p=>p.time)});
  const capture=!!state.board[move.to]||move.ep!==undefined;animationMove={...move};annotations=[];play(state,move);started=true;lastTick=performance.now();selected=null;destinations=[];hintMove=null;
  if(prefs.auto&&state.options.mode==='local')rotation=state.turn;
  sound(state.result?'end':state.history.at(-1).notation.includes('+')||state.history.at(-1).notation.includes('#')?'check':state.lastMove.castle?'castle':capture?'capture':'move');save();render();announce(`${NAMES[state.lastMove.owner]} played ${state.history.at(-1).notation}. ${state.result?'Game over.':NAMES[state.turn]+' to move.'}`);
}
function selectSquare(i) {
  if(!interactive()) {if(review!==null)toast('Return to the live position to play.');else if(!humanTurn())toast('Wait for your turn.');return;}
  const moves=destinations.filter(m=>m.to===i);
  if(moves.length) {
    if(moves.length>1) {
      openDialog('promotion-dialog'); $('promotion-options').innerHTML=moves.map(m=>`<button data-promotion="${m.promotion}" aria-label="Promote to ${pieceNames[m.promotion]}">${pieceHtml({type:m.promotion,owner:state.turn})}</button>`).join('');
      $('promotion-options').onclick=e=>{const b=e.target.closest('[data-promotion]');if(!b)return;const move=moves.find(m=>m.promotion===b.dataset.promotion);$('promotion-dialog').close();makeMove(move);};
    } else makeMove(moves[0]);return;
  }
  if(i===selected) {selected=null;destinations=[];} else if(state.board[i]?.owner===state.turn && live(state,state.board[i])) {selected=i;destinations=legalMoves(state,i);if(!destinations.length)toast(inCheck(state,state.turn)?'Your king is in check. Choose a move that protects it.':'That piece has no legal moves.');} else {selected=null;destinations=[];}
  hintMove=null;focusIndex=i;renderBoard();
}
$('board').addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}annotations=[];renderAnnotations();const b=e.target.closest('[data-square]');if(b)selectSquare(Number(b.dataset.square));});
$('board').addEventListener('keydown',e=>{
  const deltas={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}; if(!deltas[e.key])return;e.preventDefault();
  const b=e.target.closest('[data-square]');if(!b)return;const [r,c]=coords(Number(b.dataset.square)),[vr,vc]=rotate(r,c,(4-rotation)%4),[dr,dc]=deltas[e.key];
  for(let k=1;k<14;k++){const nr=vr+dr*k,nc=vc+dc*k;if(nr<0||nr>13||nc<0||nc>13)break;const [br,bc]=rotate(nr,nc,rotation);if(valid(br,bc)){focusIndex=index(br,bc);const next=$('board').querySelector(`[data-square="${focusIndex}"]`);b.tabIndex=-1;next.tabIndex=0;next.focus();break;}}
});
function setPause(value) {tick();paused=value;lastTick=performance.now();selected=null;destinations=[];save();render();}
function openDialog(id) {tick();modalWasPaused=paused;paused=true;clearTimeout(botTimer);$(id).showModal();}
document.querySelectorAll('dialog').forEach(d=>{
  d.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>d.close()));
  d.addEventListener('close',()=>{paused=modalWasPaused;lastTick=performance.now();render();});
  d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});
});
function setup() {
  const f=$('setup-form');f.elements.mode.value=state.options.mode;f.elements.variant.value=state.options.variant;f.elements.clock.value=`${state.options.minutes},${state.options.increment}`;f.elements.human.value=state.options.human;f.elements.difficulty.value=state.options.difficulty;updateSoloSettings();openDialog('setup-dialog');
}
function updateSoloSettings(){document.querySelectorAll('.solo-setting').forEach(l=>l.style.display=$('setup-form').elements.mode.value==='solo'?'':'none');}
$('setup-form').addEventListener('change',updateSoloSettings);
function startGame(options) {clearTimeout(botTimer);state=newGame(options);events=[];undoStack=[];selected=null;destinations=[];hintMove=null;review=null;started=false;paused=false;annotations=[];rotation=state.options.mode==='solo'?state.options.human:0;focusIndex=index(...rotate(12,7,rotation));$('history').innerHTML='<div class="history-empty"><span class="icon">'+icon('pawn')+'</span><strong>The opening is yours.</strong><p>Make your first move.<br>The rest will follow.</p></div>';lastTick=performance.now();save();render();sound('start');setTab('game');}
$('setup-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target),[minutes,increment]=f.get('clock').split(',').map(Number);$('setup-dialog').close();startGame({mode:f.get('mode'),variant:f.get('variant'),human:Number(f.get('human')),difficulty:f.get('difficulty'),minutes,increment});toast('New game ready. Red moves first.');});
for(const id of ['new-game','top-new','custom-game'])$(id).onclick=setup;
$('pause').onclick=()=>setPause(!paused);
$('rotate').onclick=()=>{rotation=(rotation+1)%4;renderBoard();toast('Board rotated.');};
$('sound').onclick=()=>{prefs.sound=!prefs.sound;save();render();};
$('undo').onclick=()=>{
  tick();clearTimeout(botTimer);if(!undoStack.length)return;
  let snapshot=undoStack.pop();
  if(state.options.mode==='solo')while(snapshot.state.turn!==state.options.human && undoStack.length)snapshot=undoStack.pop();
  state=snapshot.state;events=events.slice(0,snapshot.eventLen);selected=null;destinations=[];hintMove=null;review=null;started=events.length>0;lastTick=performance.now();
  if(!state.history.length)$('history').innerHTML='<div class="history-empty"><strong>The opening is yours.</strong><p>Make your first move.</p></div>';
  save();render();toast('Move taken back.');
};
$('hint').onclick=()=>{if(!interactive())return;hintMove=chooseBot(state,'hard');if(hintMove){selected=hintMove.from;destinations=legalMoves(state,selected);renderBoard();toast(`Try ${pieceNames[state.board[hintMove.from].type]} from ${square(hintMove.from)} to ${square(hintMove.to)}.`);}};
let reviewWasPaused=false;
function setReview(n){if(review===null){tick();reviewWasPaused=paused;paused=true;}review=Math.max(0,Math.min(n,state.history.length));selected=null;destinations=[];hintMove=null;render();}
function livePosition(){review=null;paused=reviewWasPaused;lastTick=performance.now();render();}
$('review-first').onclick=()=>setReview(0);$('review-prev').onclick=()=>setReview((review??state.history.length)-1);$('review-next').onclick=()=>setReview((review??state.history.length)+1);$('review-live').onclick=livePosition;
$('history').onclick=e=>{const b=e.target.closest('[data-review]');if(b)setReview(Number(b.dataset.review));};
$('nav-history').onclick=()=>{setTab('game');$('history-section').scrollIntoView({behavior:'smooth',block:'center'});};
$('board-result').onclick=e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='resume')setPause(false);if(action==='new')setup();if(action==='review')setReview(state.history.length);};
function confirm(title,message,callback,label){$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-action').textContent=label;$('confirm-action').onclick=()=>{$('confirm-dialog').close();callback();};openDialog('confirm-dialog');}
$('resign').onclick=()=>{const owner=state.options.mode==='solo'?state.options.human:state.turn;confirm(`Resign ${NAMES[owner]}?`,state.options.variant==='teams'?'Resigning ends the match and the opposing team wins.':'Your pieces become inactive. Your king continues moving automatically until it is eliminated. The last remaining player receives 20 points for each other king still alive.',()=>{tick();events.push({type:'eliminate',owner,reason:'Resigned',time:state.players.map(p=>p.time)});eliminate(state,owner);selected=null;destinations=[];save();render();},'Resign');};
$('draw').onclick=()=>confirm('Agree to a draw?','In pass & play, all players must agree. Each active army receives 10 points in free-for-all; teams share a draw.',()=>{events.push({type:'draw',reason:'Draw agreed',time:state.players.map(p=>p.time)});draw(state);save();render();},'All players agree');
$('claim').onclick=()=>{const owner=state.options.mode==='solo'?state.options.human:state.turn;if(claimWin(state,owner)){events.push({type:'claim',owner});save();render();}};
$('export').onclick=()=>{tick();const blob=new Blob([JSON.stringify({format:'fourway-v1',createdAt:new Date().toISOString(),options:state.options,events,clocks:state.players.map(p=>p.time)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fourway-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Game record exported. Import it to replay or continue.');};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw new Error('Game records must be smaller than 2 MB.');const record=JSON.parse(await file.text()),loaded=loadRecord(record);state=loaded.state;events=loaded.events;undoStack=loaded.stack;started=events.length>0;selected=null;destinations=[];hintMove=null;review=null;rotation=state.options.mode==='solo'?state.options.human:0;$('setup-dialog').close();paused=started&&!state.result;save();render();toast('Game imported. Resume whenever you’re ready.');}catch(err){toast(err.message);}e.target.value='';};
const rules={
ffa:`<div class="rule-body"><h3>Play for points.</h3><p>Each army plays for itself. Red starts, then Blue, Yellow, and Green. The highest total score wins when only one active army remains—even an eliminated player can win on points.</p><div class="score-table"><div>Pawn / promoted piece <b>+1</b></div><div>Knight <b>+3</b></div><div>Bishop / Rook <b>+5</b></div><div>Original queen <b>+9</b></div><div>Checkmate <b>+20</b></div><div>Stalemate <b>+10 each</b></div><div>Self-stalemate <b>+20</b></div></div><p>Each other active player earns 10 points when an army is stalemated. If your own move stalemates your king, you receive 20 points instead. Checkmating an army eliminates it immediately; the attacking army earns 20 points. Dead pieces stay on the board as capturable blockers and score zero.</p><h3>A pawn can change everything.</h3><p>On its own eighth rank (the middle of the board), a pawn automatically becomes a queen. That promoted queen still gives only one point when captured.</p><h3>Keep an eye on all three kings.</h3><p>A moved piece that checks two kings earns +5, or +1 if it is a queen. Checking three earns +20, or +5 with a queen. With two active players left, a leader ahead by more than 20 points can claim a win if nobody else already leads.</p><h3>Dead king walking.</h3><p>After resignation or timeout, your pieces become grey blockers, while your king moves randomly on its turns. A remaining player can checkmate it for 20 points, or stalemate it for 10 points each. When only one active player remains, they receive 20 points for each other king still alive and the game ends.</p></div>`,
teams:`<div class="rule-body"><h3>Across the board. On your side.</h3><p>Red + Yellow form one team. Blue + Green form the other. You can’t capture or check your partner’s pieces. Your partner can block an attack on your king.</p><h3>Protect both kings.</h3><p>Checkmating either opposing king wins the match. Mate is resolved on that player’s turn, giving their partner a chance to help first. A resignation or timeout loses the match for the whole team. A stalemate draws the match.</p><h3>Choose your promotion.</h3><p>Pawns promote on their own eleventh rank. Choose a queen, rook, bishop, or knight. Team games are decided by checkmate, not points.</p><h3>Find a rhythm together.</h3><p>Turns remain Red → Blue → Yellow → Green. In solo mode your teammate is a bot. In pass & play, use the rotate button or enable automatic rotation in Settings.</p></div>`,
basics:`<div class="rule-body"><h3>Your pieces already know what to do.</h3><p>Kings, queens, rooks, bishops, and knights move as in ordinary chess. Each army’s pawns move toward the opposite edge, one square forward, with an optional two-square first move. Pawns capture one square diagonally forward.</p><h3>A bigger board, the same king safety.</h3><p>The 14 × 14 board has four removed 3 × 3 corners, leaving 160 squares. Pieces can’t move through missing corners, leap over other pieces (except knights), or make moves that leave their king attacked by an active enemy.</p><h3>Special moves included.</h3><p>Castle by moving the king two squares toward an unmoved rook, when the path is clear and the king is not in check and does not cross or land on an attacked square. En passant is available after a pawn’s two-square move until that pawn’s army’s next turn.</p><h3>A game worth keeping.</h3><p>Clocks start with the first move. Only the moving army’s clock runs; increment is added after a move. Pause, undo, hints, replay, and export are available. Games save locally; reloading pauses a saved game. Exported records can be imported from New game.</p><h3>Draws.</h3><p>Threefold repetition, 50 complete turns per active army without a pawn move or capture, and kings-only positions trigger a draw. Active free-for-all armies receive 10 points; the highest score decides the result.</p><h3>A local table.</h3><p>Solo bots and four-person pass & play are supported. There is no remote matchmaking or online room service in this version.</p></div>`
};
function renderRules(kind){$('rules-content').innerHTML=rules[kind];document.querySelectorAll('[data-rule]').forEach(b=>b.classList.toggle('selected',b.dataset.rule===kind));}
function showRules(){renderRules(state.options.variant);openDialog('rules-dialog');}
$('nav-rules').onclick=()=>setTab('guide');$('full-rules').onclick=showRules;$('quick-rules').onclick=showRules;document.querySelectorAll('[data-rule]').forEach(b=>b.onclick=()=>renderRules(b.dataset.rule));
$('nav-settings').onclick=()=>{for(const key of ['sound','coordinates','hints','auto','animation'])$('pref-'+key).checked=prefs[key];$('pref-theme').value=prefs.theme;$('pref-soundSet').value=prefs.soundSet;openDialog('prefs-dialog');};
for(const key of ['sound','coordinates','hints','auto','animation'])$('pref-'+key).onchange=e=>{prefs[key]=e.target.checked;save();render();};
$('pref-soundSet').onchange=e=>{prefs.soundSet=e.target.value;save();sound('move');};
$('board-settings').onclick=()=>$('nav-settings').onclick();
$('pref-theme').onchange=e=>{prefs.theme=e.target.value;save();render();};
function setTab(tab){
  for(const name of ['game','new','guide']){$('panel-'+name).hidden=name!==tab;$('tab-'+name).classList.toggle('selected',name===tab);$('tab-'+name).setAttribute('aria-selected',String(name===tab));$('tab-'+name).tabIndex=name===tab?0:-1;}
}
const tabs=['game','new','guide'];
for(const tab of tabs){$('tab-'+tab).onclick=()=>setTab(tab);$('tab-'+tab).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?2:(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:2))%3;setTab(tabs[next]);$('tab-'+tabs[next]).focus();});}
$('nav-import').onclick=()=>$('import').click();
$('nav-play').onclick=()=>{setTab('new');document.querySelector('.game-panel').scrollIntoView({behavior:'smooth',block:'start'});};
for(const [id,opts] of [['quick-solo',{mode:'solo',variant:'ffa'}],['quick-local',{mode:'local',variant:'ffa'}],['quick-teams',{mode:'solo',variant:'teams'}]])$(id).onclick=()=>{startGame({...state.options,...opts});setTab('game');};
$('fullscreen').onclick=()=>{document.body.classList.toggle('focus-mode');$('fullscreen').setAttribute('aria-pressed',String(document.body.classList.contains('focus-mode')));};
function viewPoint(i){const [r,c]=rotate(...coords(i),(4-rotation)%4);return [c+.5,r+.5];}
function renderAnnotations(){
  $('annotation-shapes').innerHTML=annotations.map(a=>{const [x,y]=viewPoint(a.from),[tx,ty]=viewPoint(a.to);if(a.from===a.to)return `<circle cx="${x}" cy="${y}" r=".43"/>`;const length=Math.hypot(tx-x,ty-y),endX=tx-(tx-x)*.24/length,endY=ty-(ty-y)*.24/length;return `<line x1="${x}" y1="${y}" x2="${endX}" y2="${endY}"/>`;}).join('');
}
function squareAtPointer(e){const rect=$('board').getBoundingClientRect(),c=Math.floor((e.clientX-rect.left)/rect.width*14),r=Math.floor((e.clientY-rect.top)/rect.height*14);if(r<0||c<0||r>13||c>13)return null;const [br,bc]=rotate(r,c,rotation);return valid(br,bc)?index(br,bc):null;}
$('board').addEventListener('contextmenu',e=>e.preventDefault());
$('board').addEventListener('pointerdown',e=>{
  const cell=e.target.closest('[data-square]');if(!cell)return;const from=Number(cell.dataset.square);
  if(e.button===2||e.shiftKey){e.preventDefault();arrowStart=from;return;}
  if(e.button!==0||!interactive()||state.board[from]?.owner!==state.turn||!live(state,state.board[from]))return;
  drag={from,startX:e.clientX,startY:e.clientY,moved:false,pointer:e.pointerId};
});
document.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  if(!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6)return;
  e.preventDefault();
  if(!drag.moved){drag.moved=true;selected=drag.from;destinations=legalMoves(state,drag.from);annotations=[];renderBoard();$('drag-piece').innerHTML=pieceHtml(state.board[drag.from]);$('drag-piece').hidden=false;}
  const rect=$('board').getBoundingClientRect();$('drag-piece').style.left=(e.clientX-rect.left)+'px';$('drag-piece').style.top=(e.clientY-rect.top)+'px';
  $('board').querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
  const to=squareAtPointer(e);if(to!==null)$('board').querySelector(`[data-square="${to}"]`)?.classList.add('drop-target');
});
document.addEventListener('pointerup',e=>{
  if(arrowStart!==null){const to=squareAtPointer(e);if(to!==null){const existing=annotations.findIndex(a=>a.from===arrowStart&&a.to===to);if(existing>=0)annotations.splice(existing,1);else annotations.push({from:arrowStart,to});renderAnnotations();}arrowStart=null;if(e.button===0)suppressClick=true;return;}
  if(!drag||e.pointerId!==drag.pointer)return;
  const gesture=drag;drag=null;$('drag-piece').hidden=true;
  if(!gesture.moved)return;
  suppressClick=true;const to=squareAtPointer(e);
  if(to!==null && destinations.some(m=>m.to===to)){selectSquare(to);}else{selected=null;destinations=[];renderBoard();if(to!==gesture.from){sound('illegal');toast('That move is not legal.');}}
});
document.addEventListener('pointercancel',()=>{drag=null;arrowStart=null;$('drag-piece').hidden=true;renderBoard();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){annotations=[];selected=null;destinations=[];renderBoard();}});
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
window.addEventListener('pagehide',()=>{tick();save();});
document.addEventListener('visibilitychange',()=>{tick();if(!document.hidden){render();save();}});
setInterval(tick,200);setInterval(()=>{if(started&&!state.result)save();},5000);
render();
