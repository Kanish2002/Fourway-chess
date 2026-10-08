import test from 'node:test';
import assert from 'node:assert/strict';
import {woodSamples,playSound,CLASSIC_ROOT,SOUND_FILES} from '../public/sounds.js';
test('wooden sounds are bounded non-silent clicks with distinct event profiles',()=>{
  const profiles=new Set();for(const kind of Object.keys(SOUND_FILES)){const samples=woodSamples(kind,24000);assert(samples.length>=2000);assert(samples.some(v=>Math.abs(v)>.1));assert(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.8));const tail=samples.slice(-100);assert(tail.every(v=>Math.abs(v)<.02),'click should decay');profiles.add(samples.length+':'+samples.slice(0,100).join(','));}assert.equal(profiles.size,7);
});
test('classic sound events use their correct Chess.com CDN files',()=>{
  const original=globalThis.Audio,played=[];globalThis.Audio=class{constructor(url){this.url=url;}play(){played.push(this.url);return Promise.resolve();}};
  try{for(const kind of Object.keys(SOUND_FILES))playSound(kind,'classic');assert.deepEqual(played,Object.values(SOUND_FILES).map(file=>CLASSIC_ROOT+file+'.mp3'));}finally{globalThis.Audio=original;}
});
test('a blocked classic sound falls back to a local audio buffer',async()=>{
  const originalAudio=globalThis.Audio,originalWindow=globalThis.window;let buffers=0,starts=0;
  globalThis.Audio=class{play(){return Promise.reject(new Error('blocked'));}};
  globalThis.window={AudioContext:class{constructor(){this.sampleRate=24000;this.destination={};}resume(){}createBuffer(){buffers++;return{copyToChannel(){}};}createBufferSource(){return{connect(){},start(){starts++;}};}createGain(){return{gain:{value:1},connect(){}};}}};
  try{playSound('unknown','classic');await Promise.resolve();assert.equal(buffers,1);assert.equal(starts,1);}finally{globalThis.Audio=originalAudio;globalThis.window=originalWindow;}
});
