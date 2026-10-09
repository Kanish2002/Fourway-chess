import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { roomHandler } from '../server/http.js';
import { RoomService } from '../server/rooms.js';
import { MemoryStore } from '../server/store.js';
import { index as at, rotate } from '../public/engine.js';

test('two independent HTTP clients create, join, start, play, and synchronize one game',async t=>{
  let now=100000;const server=createServer(roomHandler(new RoomService(new MemoryStore(()=>now),{now:()=>now})));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  async function send(body){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();}
  const host=await send({action:'create',name:'Host',options:{minutes:0,variant:'teams'}}),guest=await send({action:'join',name:'Guest',code:host.code});
  let current=await send({action:'poll',code:host.code,token:host.token});assert.equal(current.seats[1].name,'Guest');
  current=await send({action:'start',code:host.code,token:host.token,revision:current.revision});assert.equal(current.status,'playing');
  current=await send({action:'move',code:host.code,token:host.token,revision:current.revision,from:at(12,7),to:at(10,7)});
  const remote=await send({action:'poll',code:host.code,token:guest.token});assert.deepEqual(remote.state,current.state);assert.equal(remote.you,1);
  await send({action:'move',code:host.code,token:guest.token,revision:remote.revision,from:at(...rotate(12,7,1)),to:at(...rotate(10,7,1))});
  now+=1000;current=await send({action:'poll',code:host.code,token:host.token});assert.equal(current.state.ply,3);now+=1000;current=await send({action:'poll',code:host.code,token:guest.token});assert.equal(current.state.ply,4);assert.equal(current.state.turn,0);
  for(const [options,status] of [[{method:'GET'},405],[{method:'POST',body:'{bad'},400],[{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'},403],[{method:'POST',body:'x'.repeat(9000)},413]]){const r=await fetch(base,options);assert.equal(r.status,status);}
});
test('hosted endpoint reports missing shared storage instead of silently using ephemeral process memory',async()=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
  await roomHandler(null)({method:'POST',headers:{},body:{}},res);assert.equal(res.statusCode,503);assert.match(res.body.error,/Redis/);assert.equal(res.headers['Cache-Control'],'no-store');
});
