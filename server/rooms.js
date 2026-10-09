import { randomBytes, randomInt, createHash } from 'node:crypto';
import { newGame, play, chooseBot, eliminate, claimWin, draw } from '../public/engine.js';
export const GRACE_MS=90000, BOT_MS=700;
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const digest=value=>createHash('sha256').update(value).digest('hex');
const codePattern=/^[A-HJ-NP-Z2-9]{6}$/;
export class RoomError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const check=(condition,message,status=400)=>{if(!condition)throw new RoomError(message,status);};
function name(value) { check(typeof value==='string' && value.trim().length>=1 && value.trim().length<=24,'Enter a name between 1 and 24 characters.');return value.trim(); }
function settings(input={}) {
  const opts={variant:'ffa',minutes:10,increment:2,difficulty:'normal',...input};
  check(['ffa','teams'].includes(opts.variant)&&[0,3,5,10,15].includes(opts.minutes)&&[0,2,5].includes(opts.increment)&&['easy','normal','hard'].includes(opts.difficulty),'Unsupported room settings.');
  return {variant:opts.variant,minutes:opts.minutes,increment:opts.increment,difficulty:opts.difficulty,mode:'online',human:0};
}
function member(room,token) { check(typeof token==='string' && token.length===48,'Rejoin this room from your original browser tab.',401);const p=room.seats.find(s=>s?.tokenHash===digest(token));check(p,'Your room seat is no longer available.',401);return p; }
function bump(room) { room.revision++; }
function recordMove(room,move,time) {
  const before=room.state.players.map(p=>p.time);
  play(room.state,move);room.events.push({type:'move',from:move.from,to:move.to,promotion:move.promotion||null,time:before});
  room.lastTick=time;room.nextBotAt=time+BOT_MS;room.drawVotes=[];bump(room);
}
function expirePresence(room,time) {
  for(let i=0;i<4;i++) { const s=room.seats[i];if(!s || s.bot || time-s.lastSeen<=GRACE_MS)continue;
    if(room.status==='lobby')room.seats[i]=null;else{s.bot=true;s.name+=' (computer)';}bump(room);
  }
  if(!room.seats[room.host] || room.seats[room.host].bot) {const next=room.seats.findIndex(s=>s&&!s.bot);if(next>=0)room.host=next;}
}
// Work is demand-driven: any connected client's poll advances clocks and at most one bot.
// Wall-clock elapsed time remains authoritative across cold starts and disconnected tabs.
export function advance(room,time) {
  expirePresence(room,time);
  if(room.status!=='playing' || room.state.result)return;
  const s=room.state,p=s.players[s.turn];
  if(s.options.minutes && !p.zombie) {
    p.time=Math.max(0,p.time-Math.max(0,time-room.lastTick));
    if(p.time===0){room.events.push({type:'eliminate',owner:p.id,reason:'Time out',time:s.players.map(x=>x.time)});eliminate(s,p.id,'Time out');room.nextBotAt=time+BOT_MS;room.drawVotes=[];bump(room);}
  }
  room.lastTick=time;
  if(!s.result && (room.seats[s.turn]?.bot || s.players[s.turn].zombie) && time>=room.nextBotAt) {
    const m=chooseBot(s,s.options.difficulty);if(m)recordMove(room,m,time);
  }
  if(s.result)room.status='finished';
}
function view(room,seat,time) {
  return {code:room.code,revision:room.revision,status:room.status,host:room.host,you:seat.id,serverTime:time,lastTick:room.lastTick,
    seats:room.seats.map(s=>s?{id:s.id,name:s.name,bot:s.bot,connected:!s.bot && time-s.lastSeen<10000}:null),
    options:room.options,state:room.state,events:room.events,drawVotes:room.drawVotes};
}
export class RoomService {
  constructor(store,{now=Date.now,generateCode=()=>Array.from({length:6},()=>ALPHABET[randomInt(ALPHABET.length)]).join('')}={}) {this.store=store;this.now=now;this.generateCode=generateCode;}
  async dispatch(input,identity='local') {
    check(input && typeof input==='object' && !Array.isArray(input),'Invalid request.');
    const action=input.action;
    check(['create','join','poll','seat','start','move','leave','resign','claim','draw'].includes(action),'Unknown room action.');
    const limit=['create','join'].includes(action)?20:600;
    check(await this.store.rate(identity+':'+(['create','join'].includes(action)?'entry':'play'),limit,60),'Too many requests. Try again shortly.',429);
    if(action==='create') {
      const time=this.now(),token=randomBytes(24).toString('hex'),options=settings(input.options),host={id:0,name:name(input.name),bot:false,tokenHash:digest(token),lastSeen:time};
      for(let i=0;i<8;i++) {const room={code:this.generateCode(),version:0,revision:0,status:'lobby',host:0,seats:[host,null,null,null],options,state:null,events:[],drawVotes:[],lastTick:time,nextBotAt:time,requests:[]};
        if(await this.store.create(room))return {...view(room,host,time),token};}
      throw new RoomError('Could not allocate a room code. Try again.',503);
    }
    const code=typeof input.code==='string'?input.code.trim().toUpperCase():'';
    check(codePattern.test(code),'Enter the six-character room code.');
    // Joining retries reuse one generated token so a CAS conflict cannot create ghost seats.
    const joinToken=action==='join'?randomBytes(24).toString('hex'):null;
    for(let attempt=0;attempt<12;attempt++) {
      const room=await this.store.get(code);check(room,'Room not found or expired.',404);const time=this.now(),version=room.version;
      let seat;
      if(action==='join') {
        expirePresence(room,time);check(room.status==='lobby','This game has already started.',409);
        const id=room.seats.findIndex(s=>!s);check(id>=0,'This room already has four players.',409);
        seat={id,name:name(input.name),bot:false,tokenHash:digest(joinToken),lastSeen:time};room.seats[id]=seat;bump(room);
      } else {
        seat=member(room,input.token);seat.lastSeen=time;
        advance(room,time);
        check(!seat.bot || action==='leave','Your disconnected seat has been taken over by a computer.',409);
        const duplicate=typeof input.requestId==='string' && room.requests.includes(seat.tokenHash+':'+input.requestId);
        if(!duplicate && action!=='poll') {
          if(['start','seat','move'].includes(action))check(input.revision===room.revision,'The room changed. Refresh and try again.',409);
          if(action==='seat') {
            check(room.status==='lobby','Seats are locked after the game starts.',409);const id=input.seat;
            check(Number.isInteger(id)&&id>=0&&id<4&&!room.seats[id],'That seat is already occupied.',409);
            room.seats[seat.id]=null;if(room.host===seat.id)room.host=id;seat.id=id;room.seats[id]=seat;bump(room);
          } else if(action==='start') {
            check(room.host===seat.id,'Only the host can start the game.',403);check(room.status==='lobby','Game already started.',409);
            check(room.seats.filter(s=>s&&!s.bot).length>=2,'At least two human players must join. Use Play Computer for solo games.');
            room.seats=room.seats.map((s,id)=>s||{id,name:'Computer',bot:true});room.state=newGame(room.options);room.status='playing';room.lastTick=time;room.nextBotAt=time+BOT_MS;bump(room);
          } else if(action==='leave') {
            if(room.status==='lobby'){room.seats[seat.id]=null;const next=room.seats.findIndex(s=>s&&!s.bot);if(next>=0)room.host=next;}
            else{seat.bot=true;seat.name+=' (computer)';}bump(room);
          } else {
            check(room.status==='playing' && !room.state.result,'No active game.',409);check(room.state.players[seat.id].active,'Your army has been eliminated.',409);
            if(action==='move') {
              check(room.state.turn===seat.id,'Wait for your turn.',403);
              check(Number.isInteger(input.from)&&Number.isInteger(input.to)&&input.from>=0&&input.from<196&&input.to>=0&&input.to<196&&[null,undefined,'q','r','b','n'].includes(input.promotion),'Invalid move.');
              // Do not accept board, clock, castle or en passant metadata from clients.
              try{recordMove(room,{from:input.from,to:input.to,promotion:input.promotion||null},time);}catch{throw new RoomError('That move is not legal.');}
            } else if(action==='resign') {
              room.events.push({type:'eliminate',owner:seat.id,reason:'Resigned',time:room.state.players.map(p=>p.time)});eliminate(room.state,seat.id);room.drawVotes=[];bump(room);
            } else if(action==='claim') {
              check(claimWin(room.state,seat.id),'A win cannot be claimed in this position.');room.events.push({type:'claim',owner:seat.id});bump(room);
            } else if(action==='draw') {
              if(!room.drawVotes.includes(seat.id))room.drawVotes.push(seat.id);
              const voters=room.seats.filter(s=>!s.bot&&room.state.players[s.id].active);
              if(voters.every(s=>room.drawVotes.includes(s.id))){room.events.push({type:'draw',reason:'Draw agreed',time:room.state.players.map(p=>p.time)});draw(room.state);}
              bump(room);
            }
          }
          if(typeof input.requestId==='string' && input.requestId.length<=64)room.requests=[...room.requests,seat.tokenHash+':'+input.requestId].slice(-32);
        }
        if(room.state?.result)room.status='finished';
      }
      room.version=version+1;
      if(await this.store.commit(room,version))return {...view(room,seat,time),...(joinToken?{token:joinToken}:{})};
    }
    throw new RoomError('Room is busy. Try again.',409);
  }
}
