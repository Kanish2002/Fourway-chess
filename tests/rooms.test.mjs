import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService, GRACE_MS, BOT_MS } from '../server/rooms.js';
import { MemoryStore, RedisStore, productionStore, ROOM_TTL } from '../server/store.js';
import { newGame, index as at, rotate, legalMoves, positionKey } from '../public/engine.js';
function fixture(){let time=1000000;const store=new MemoryStore(()=>time),service=new RoomService(store,{now:()=>time});return {store,service,tick:n=>time+=n,now:()=>time};}
const create=(f,options={})=>f.service.dispatch({action:'create',name:'Host',options},'host');
const join=(f,r,name='Friend')=>f.service.dispatch({action:'join',code:r.code,name},name);
const call=(f,r,action,data={})=>f.service.dispatch({action,code:r.code,token:r.token,revision:r.revision,...data},r.token);
const poll=(f,r)=>call(f,r,'poll');
async function started(f,options={},count=2){const host=await create(f,options),members=[host];for(let i=1;i<count;i++)members.push(await join(f,host,'Friend'+i));const current=await poll(f,host);const room=await call(f,{...current,token:host.token},'start');return {room,host:{...room,token:host.token},members};}

test('room generates six-character codes and snapshots never leak membership credentials',async()=>{
  const f=fixture(),r=await create(f);assert.match(r.code,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(r.token.length,48);assert.equal(r.seats.filter(Boolean).length,1);assert.equal(r.status,'lobby');
  const snap=await poll(f,r);assert(!('token' in snap));assert(!JSON.stringify(snap).includes('tokenHash'));assert(!JSON.stringify(snap).includes(r.token));
});
test('only host can start, and rooms require at least two humans',async()=>{
  const f=fixture(),host=await create(f);await assert.rejects(call(f,host,'start'),/At least two/);
  const friend=await join(f,host);await assert.rejects(call(f,friend,'start'),e=>e.status===403);
  const h={...await poll(f,host),token:host.token},s=await call(f,h,'start');assert.equal(s.status,'playing');assert.deepEqual(s.seats.map(x=>x.bot),[false,false,true,true]);
  await assert.rejects(join(f,host,'Late player'),/already started/);
});
test('four seats include host and simultaneous joiners cannot overfill the room',async()=>{
  const f=fixture(),host=await create(f);const joins=await Promise.allSettled(Array.from({length:6},(_,i)=>join(f,host,'P'+i)));
  assert.equal(joins.filter(r=>r.status==='fulfilled').length,3);assert(joins.filter(r=>r.status==='rejected').every(r=>r.reason.status===409));
  const full={...await poll(f,host),token:host.token};assert.equal(new Set(full.seats.map(s=>s.id)).size,4);const s=await call(f,full,'start');assert(s.seats.every(p=>!p.bot));
});
test('teams players can choose an open opposite seat before start',async()=>{
  const f=fixture(),host=await create(f,{variant:'teams'}),friend=await join(f,host);
  const moved={...await call(f,friend,'seat',{seat:2}),token:friend.token};assert.equal(moved.you,2);
  await assert.rejects(call(f,moved,'seat',{seat:0}),/occupied/);
  const s=await call(f,{...await poll(f,host),token:host.token},'start');assert.equal(s.options.variant,'teams');assert.deepEqual(s.seats.map(p=>p.bot),[false,true,false,true]);
  await assert.rejects(call(f,{...s,token:host.token},'seat',{seat:1}),/locked/);
});
test('server rejects forged membership, out-of-turn moves, illegal movement, and clock metadata',async()=>{
  const f=fixture(),{host,members}=await started(f);
  await assert.rejects(call(f,{...host,token:'0'.repeat(48)},'poll'),e=>e.status===401);
  const friend={...await poll(f,members[1]),token:members[1].token};await assert.rejects(call(f,friend,'move',{from:at(7,1),to:at(7,3)}),e=>e.status===403);
  await assert.rejects(call(f,host,'move',{from:at(12,7),to:at(8,7)}),/not legal/);
  const s=await call(f,host,'move',{from:at(12,7),to:at(10,7),time:[9e7,9e7,9e7,9e7],castle:{from:1,to:2},state:newGame()});
  assert.equal(s.state.ply,1);assert.equal(s.state.players[0].time,602000);assert.equal(s.state.board[at(10,7)].owner,0);assert.equal(s.state.turn,1);
});
test('simultaneous moves commit once, stale revisions reject, and duplicate commands are idempotent',async()=>{
  const f=fixture(),{host}=await started(f);const move={from:at(12,7),to:at(10,7),requestId:'same-command'};
  const results=await Promise.all([call(f,host,'move',move),call(f,host,'move',move)]);assert(results.every(r=>r.state.ply===1));
  const latest=await poll(f,host);assert.equal(latest.state.ply,1);assert.equal(latest.events.length,1);
  await assert.rejects(call(f,host,'move',{from:at(12,6),to:at(11,6)}),/room changed/);
});
test('bots are advanced by any client poll once per delay and stay synchronized',async()=>{
  const f=fixture(),{host,members}=await started(f,{minutes:0});let s=await call(f,host,'move',{from:at(12,7),to:at(10,7)});
  const friend={...await poll(f,members[1]),token:members[1].token};s=await call(f,friend,'move',{from:at(...rotate(12,7,1)),to:at(...rotate(10,7,1))});assert.equal(s.state.turn,2);
  f.tick(BOT_MS);const replies=await Promise.all([poll(f,host),poll(f,members[1])]);assert(replies.every(r=>r.state.ply===3));
  f.tick(BOT_MS);s=await poll(f,host);assert.equal(s.state.turn,0);assert.equal(s.state.ply,4);
  const other=await poll(f,members[1]);assert.equal(positionKey(other.state),positionKey(s.state));assert.deepEqual(other.events,s.events);
});
test('online clocks start on host start, continue without browser ticks, and timeout on server',async()=>{
  const f=fixture(),{host}=await started(f,{minutes:3,variant:'teams'});f.tick(5000);let s=await poll(f,host);assert.equal(s.state.players[0].time,175000);
  f.tick(175000);s=await poll(f,host);assert.equal(s.status,'finished');assert.deepEqual(s.state.result.winners,[1,3]);assert.equal(s.events[0].reason,'Time out');
});
test('reconnect preserves membership before grace expires; inactive humans become bots after grace',async()=>{
  const f=fixture(),{host,members}=await started(f,{minutes:0});f.tick(50000);let s=await poll(f,members[1]);assert.equal(s.you,1);assert.equal(s.seats[1].bot,false);
  f.tick(50000);s=await poll(f,host);assert.equal(s.seats[1].bot,false);f.tick(41000);s=await poll(f,host);assert.equal(s.seats[1].bot,true);
  await assert.rejects(poll(f,members[1]),/taken over/);
});
test('lobby departure and absent host transfer ownership; active departure preserves army via bot',async()=>{
  const f=fixture(),host=await create(f),friend=await join(f,host);await call(f,host,'leave');let s=await poll(f,friend);assert.equal(s.host,1);assert.equal(s.seats[0],null);
  const third=await join(f,friend,'Third');s=await call(f,{...await poll(f,friend),token:friend.token},'start');assert.equal(s.seats.filter(p=>!p.bot).length,2);
  await call(f,{...s,token:third.token},'leave');s=await poll(f,friend);assert.equal(s.seats[0].bot,true);assert.equal(s.state.players[0].active,true);
  const g=fixture(),a=await create(g),b=await join(g,a);g.tick(GRACE_MS+1);const room=await poll(g,b);assert.equal(room.host,1);assert.equal(room.seats[0],null);
});
test('draw requires every active human vote and team resignation ends the game',async()=>{
  const f=fixture(),{host,members}=await started(f,{variant:'teams',minutes:0});let s=await call(f,host,'draw');assert.equal(s.status,'playing');assert.deepEqual(s.drawVotes,[0]);
  s=await call(f,{...await poll(f,members[1]),token:members[1].token},'draw');assert.equal(s.status,'finished');assert.deepEqual(s.state.result.winners,[]);
  const g=fixture(),r=await started(g,{variant:'teams'});s=await call(g,r.host,'resign');assert.equal(s.status,'finished');assert.deepEqual(s.state.result.winners,[1,3]);
});
test('online API preserves automatic FFA queen and all four team promotion choices in every direction',async()=>{
  for(const variant of ['ffa','teams'])for(let owner=0;owner<4;owner++)for(const promotion of variant==='teams'?['q','r','b','n']:['q']){
    const f=fixture(),{host,members}=await started(f,{variant,minutes:0},4);const room=await f.store.get(host.code);
    room.state.board=room.state.board.map(p=>p?.type==='k'?p:null);room.state.turn=owner;
    const row=variant==='teams'?4:7,from=at(...rotate(row,5,owner)),to=at(...rotate(row-1,5,owner));room.state.board[from]={type:'p',owner,moved:true,promoted:false};
    await f.store.commit({...room,version:room.version+1},room.version);
    const seat=owner===0?host:members[owner],current={...await poll(f,seat),token:seat.token};
    if(variant==='teams')await assert.rejects(call(f,current,'move',{from,to}),/not legal/);
    const result=await call(f,current,'move',{from,to,promotion});assert.equal(result.state.board[to].type,promotion);assert.equal(result.state.board[to].promoted,true);
  }
});
test('rooms expire after 24 hours; invalid settings and excessive entry attempts reject',async()=>{
  const f=fixture(),r=await create(f);f.tick(ROOM_TTL*1000+1);await assert.rejects(poll(f,r),e=>e.status===404);
  await assert.rejects(create(f,{minutes:-10}),/Unsupported/);await assert.rejects(f.service.dispatch({action:'create',name:'a'.repeat(25)}),/name/);
  for(let i=0;i<20;i++)try{await f.service.dispatch({action:'join',code:'ABC234',name:'Player'},'spammer');}catch{}
  await assert.rejects(f.service.dispatch({action:'join',code:'ABC234',name:'Player'},'spammer'),e=>e.status===429);
});
test('room code collision retries without overwriting another room',async()=>{
  const f=fixture();let i=0;const s=new RoomService(f.store,{generateCode:()=>i++<2?'ABC234':'BCD345'});const a=await s.dispatch({action:'create',name:'A'}),b=await s.dispatch({action:'create',name:'B'});assert.equal(a.code,'ABC234');assert.equal(b.code,'BCD345');assert.equal((await f.store.get(a.code)).seats[0].name,'A');
});
test('Redis adapter uses expiring NX creation, atomic version CAS, and private server credentials',async()=>{
  const sent=[],store=new RedisStore('https://example.test','secret',async(url,opts)=>{sent.push({url,opts,args:JSON.parse(opts.body)});return {ok:true,json:async()=>({result:sent.length===1?'OK':1})};});
  const room={code:'ABC234',version:0};assert(await store.create(room));assert(await store.commit({...room,version:1},0));assert.equal(sent[0].args[0],'SET');assert(sent[0].args.includes('NX'));assert(sent[0].args.includes(ROOM_TTL));assert.equal(sent[1].args[0],'EVAL');assert.equal(sent[1].args[4],0);assert.equal(sent[0].opts.headers.Authorization,'Bearer secret');assert.equal(productionStore({}),null);
});
