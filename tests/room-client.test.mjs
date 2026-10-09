import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient } from '../public/rooms.js';

test('room client persists membership only in tab storage, restores it, and submits revisioned commands',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},requests=[],updates=[];
  const request=async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});return {ok:true,json:async()=>({code:'ABC234',revision:requests.length,status:'lobby',...(body.action==='create'?{token:'a'.repeat(48)}:{})})};};
  const c=new RoomClient({request,storage,onUpdate:r=>updates.push(r)});await c.enter('create',{name:'Host'});assert.equal(requests[0].url,'/api/rooms');assert.equal(JSON.parse(values.get('fourway.room.v1')).token,'a'.repeat(48));
  await c.call('start');assert.equal(requests[1].body.token,'a'.repeat(48));assert.equal(requests[1].body.revision,1);assert(requests[1].body.requestId);clearTimeout(c.timer);
  const restored=new RoomClient({request,storage});await restored.restore();assert.equal(requests[2].body.action,'poll');assert.equal(restored.session.code,'ABC234');clearTimeout(restored.timer);
  await c.leave();assert.equal(requests[3].body.action,'leave');assert.equal(c.session,null);assert.equal(values.has('fourway.room.v1'),false);restored.detach();
});
test('failed requests preserve membership for reconnect and prevent concurrent submissions',async()=>{
  let resolve;const c=new RoomClient({request:()=>new Promise(r=>resolve=r)});c.session={code:'ABC234',token:'b'.repeat(48)};
  const first=c.call('poll');await assert.rejects(c.call('move'),/Waiting/);resolve({ok:false,status:503,json:async()=>({error:'Temporarily unavailable'})});await assert.rejects(first,/unavailable/);assert.equal(c.session.code,'ABC234');assert.equal(c.pending,false);c.detach();
});
test('detaching a room ignores late in-flight snapshots',async()=>{
  let resolve,updates=0;const c=new RoomClient({onUpdate:()=>updates++,request:()=>new Promise(r=>resolve=r)});
  const pending=c.call('poll');c.detach();resolve({ok:true,json:async()=>({code:'ABC234',revision:10})});assert.equal(await pending,null);assert.equal(updates,0);assert.equal(c.snapshot,null);
});
