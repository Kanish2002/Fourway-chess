// Interaction smoke test using a minimal DOM fixture; this does not replace visual browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RoomService } from '../server/rooms.js';
import { MemoryStore } from '../server/store.js';
import { index as at } from '../public/engine.js';

test('application supports local moves, bots, review, settings, computer-only play and the online lobby/game flow',async()=>{
  const nodes=new Map(),timers=new Map(),storage=new Map();let tid=0,now=0;const intervals=[];
  class Element {
    constructor(id=''){this.id=id;this.innerHTML='';this.textContent='';this.hidden=false;this.disabled=false;this.dataset={};this.style={};this.checked=false;this.listeners={};this.children=new Map();this.className='';this.open=false;this.scrollHeight=100;this.scrollTop=0;this.tabIndex=-1;
      const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,v)=>v===undefined?(classes.has(c)?classes.delete(c):classes.add(c)):(v?classes.add(c):classes.delete(c)),contains:c=>classes.has(c)};
    }
    addEventListener(name,cb){(this.listeners[name]||=[]).push(cb);}
    dispatch(name,event={}){for(const fn of this.listeners[name]||[])fn({target:this,...event});}
    querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
    querySelectorAll(){return [];}
    setAttribute(key,value){this[key]=value;}
    getAttribute(key){return this[key];}
    getBoundingClientRect(){return {left:0,top:0,right:700,bottom:700,width:700,height:700};}
    closest(selector){return selector==='[data-square]'&&this.dataset.square!==undefined?this:null;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close');}
    focus(){}scrollIntoView(){}click(){this.onclick?.({target:this});this.dispatch('click');}
  }
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],new Element(m[1]));
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
  const dialogs=['setup','rules','prefs','confirm','promotion','room'].map(id=>get(id+'-dialog'));
  const docListeners={};const document={dispatch(name,event={}){for(const fn of docListeners[name]||[])fn({preventDefault(){},...event});},getElementById:get,body:new Element(),hidden:false,querySelector:s=>s==='dialog[open]'?dialogs.find(d=>d.open)||null:get(s),querySelectorAll:s=>s==='dialog'?dialogs:[],addEventListener(name,fn){(docListeners[name]||=[]).push(fn);},createElement:()=>new Element()};
  get('setup-form').elements=Object.fromEntries(Object.entries({mode:'solo',variant:'ffa',clock:'10,2',human:'0',difficulty:'normal'}).map(([k,value])=>[k,{value}]));
  storage.set('fourway.preferences.v1',JSON.stringify({sound:false}));
  const roomService=new RoomService(new MemoryStore(()=>now),{now:()=>now});
  const original={fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage,document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,setInterval:globalThis.setInterval,FormData:globalThis.FormData,performance:globalThis.performance};
  Object.assign(globalThis,{fetch:async(url,options)=>{try{const result=await roomService.dispatch(JSON.parse(options.body),'app-client');return{ok:true,json:async()=>result};}catch(error){return{ok:false,status:error.status||500,json:async()=>({error:error.message})};}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},document,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:(fn,delay)=>{const id=++tid;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),performance:{now:()=>now},setInterval:(fn,delay)=>{intervals.push({fn,delay});return 0;},FormData:class{constructor(form){this.form=form;}get(key){return this.form.elements[key].value;}}});
  try{
    await import('../public/app.js');
    assert.equal((get('board').innerHTML.match(/data-square=/g)||[]).length,160);
    assert.match(get('corner-se').innerHTML,/Red/);assert.match(get('corner-nw').innerHTML,/Yellow/);assert.match(get('players').innerHTML,/Red/);assert.match(get('players').innerHTML,/YOU/);
    assert.match(get('board-status').innerHTML,/Red to move/);
    const clickSquare=i=>{const cell=new Element();cell.dataset.square=String(i);get('board').dispatch('click',{target:cell});};
    clickSquare(at(12,7));assert.match(get('board').innerHTML,/cell [^"]+ selected/);assert.match(get('board').innerHTML,/legal destination/);
    clickSquare(at(10,7));assert.match(get('board-status').innerHTML,/Blue to move/);
    assert.equal(JSON.parse(storage.get('fourway.game.v1')).events.length,1);
    now=2000;intervals.find(t=>t.delay===200).fn();assert.equal(get('clock-1').textContent,'9:58');
    for(let i=0;i<3;i++){const bot=[...timers.entries()].find(([,t])=>t.delay===600);assert(bot,'bot was scheduled');timers.delete(bot[0]);bot[1].fn();}
    assert.match(get('board-status').innerHTML,/Red to move/);assert.equal(JSON.parse(storage.get('fourway.game.v1')).events.length,4);
    get('review-first').click();assert.match(get('review-label').textContent,/Move 0/);assert.match(get('board-status').innerHTML,/Reviewing/);
    const before=storage.get('fourway.game.v1');clickSquare(at(12,6));assert.equal(storage.get('fourway.game.v1'),before,'review mode cannot change moves');
    get('review-live').click();assert.equal(get('review-label').textContent,'Live position');
    get('pause').click();assert.equal(get('board-result').hidden,false);assert.match(get('board-result').innerHTML,/Resume game/);
    get('pause').click();assert.equal(get('board-result').hidden,true);
    get('undo').click();assert.equal(JSON.parse(storage.get('fourway.game.v1')).events.length,0);assert.match(get('history').innerHTML,/The opening is yours/);assert.match(get('board-status').innerHTML,/Red to move/);
    get('nav-settings').click();assert(get('prefs-dialog').open);get('pref-theme').onchange({target:{value:'walnut'}});assert.equal(document.body.dataset.theme,'walnut');get('prefs-dialog').close();
    get('new-game').click();assert(get('setup-dialog').open);get('setup-form').elements.mode.value='local';get('setup-form').elements.variant.value='teams';get('setup-form').dispatch('submit',{preventDefault(){}});
    assert.equal(get('mode-label').textContent,'PASS & PLAY');assert.equal(get('variant-label').textContent,'Teams · 2 vs 2');assert.equal(get('draw').disabled,false);
    const cell=new Element();cell.dataset.square=String(at(12,7));
    get('board').dispatch('pointerdown',{target:cell,button:0,pointerId:1,clientX:375,clientY:625});
    document.dispatch('pointermove',{pointerId:1,clientX:375,clientY:525});assert.equal(get('drag-piece').hidden,false);
    document.dispatch('pointerup',{button:0,pointerId:1,clientX:375,clientY:525});assert.equal(get('drag-piece').hidden,true);
    // A browser dispatches click after pointerup; it must not accidentally re-select or move.
    clickSquare(at(10,7));assert.match(get('board-status').innerHTML,/Blue to move/);assert.equal(JSON.parse(storage.get('fourway.game.v1')).events.length,1);assert(![...timers.values()].some(t=>t.delay===600),'local mode never schedules a bot');
    get('board').dispatch('pointerdown',{target:cell,button:2,clientX:375,clientY:625,preventDefault(){}});document.dispatch('pointerup',{button:2,clientX:375,clientY:525});assert.match(get('annotation-shapes').innerHTML,/<line/);
    clickSquare(at(7,7));assert.equal(get('annotation-shapes').innerHTML,'');
    get('tab-new').click();assert.equal(get('panel-game').hidden,true);assert.equal(get('panel-new').hidden,false);
    get('quick-local').click();assert.equal(get('panel-game').hidden,false);assert.equal(get('variant-label').textContent,'Free-for-all');
    get('fullscreen').click();assert(document.body.classList.contains('focus-mode'));get('fullscreen').click();assert(!document.body.classList.contains('focus-mode'));
    get('nav-settings').click();get('pref-animation').onchange({target:{checked:false}});assert.equal(JSON.parse(storage.get('fourway.preferences.v1')).animation,false);get('prefs-dialog').close();
    get('nav-rules').click();assert.equal(get('panel-guide').hidden,false);get('full-rules').click();assert(get('rules-dialog').open);assert.match(get('rules-content').innerHTML,/Dead king walking/);get('rules-dialog').close();
    // A local player's timeout must schedule their walking king, then return control to humans.
    setBoardLocal();
    function setBoardLocal(){get('quick-local').click();clickSquare(at(12,7));clickSquare(at(10,7));}
    now+=601000;intervals.find(t=>t.delay===200).fn();assert.match(get('players').innerHTML,/Dead king walking/);assert.equal(JSON.parse(storage.get('fourway.game.v1')).events.at(-1).reason,'Time out');
    const walking=[...timers.entries()].find(([,t])=>t.delay===600);assert(walking,'walking king moves automatically even in local mode');timers.delete(walking[0]);walking[1].fn();assert.match(get('board-status').innerHTML,/Yellow to move/);assert(![...timers.values()].some(t=>t.delay===600));
    get('import').onchange({target:{files:[{size:5,text:async()=>'{bad'}],value:'x'}});await Promise.resolve();await Promise.resolve();assert.match(get('toast').textContent,/JSON|Unexpected|property/);
    get('quick-watch').click();assert.equal(get('mode-label').textContent,'ALL COMPUTERS');assert(get('resign').disabled);
    for(let i=0;i<4;i++){const bot=[...timers.entries()].find(([,t])=>t.delay===600);assert(bot);timers.delete(bot[0]);bot[1].fn();}
    assert.equal(JSON.parse(storage.get('fourway.game.v1')).events.length,4);get('pause').click();assert(get('board-result').hidden===false);get('pause').click();
    const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
    get('room-name').value='Host';get('room-clock').value='0,0';get('room-variant').value='teams';get('room-difficulty').value='normal';
    get('quick-online').click();get('create-room-form').dispatch('submit',{preventDefault(){}});await flush();
    assert.equal(get('mode-label').textContent,'ONLINE');assert.equal(get('room-lobby').hidden,false);assert.equal(get('room-start').disabled,true);assert.match(get('room-invite').textContent,/^[A-HJ-NP-Z2-9]{6}$/);
    const roomCode=get('room-invite').textContent,friend=await roomService.dispatch({action:'join',code:roomCode,name:'Friend'});
    const sync=async()=>{const poll=[...timers.entries()].find(([,t])=>t.delay===1000);assert(poll);timers.delete(poll[0]);await poll[1].fn();await flush();};
    await sync();assert.equal(get('room-start').disabled,false);assert.match(get('room-start').textContent,/2 Players.*2 Computers/);
    get('room-start').click();await flush();assert.equal(get('room-dialog').open,false);assert.equal(get('pause').disabled,true);assert.equal(get('undo').disabled,true);assert.equal(get('hint').disabled,true);
    assert(![...timers.values()].some(t=>t.delay===600),'online bots never run on the client');
    clickSquare(at(12,7));clickSquare(at(10,7));await flush();assert.match(get('board-status').innerHTML,/Blue to move/);
    const serverRoom=await roomService.store.get(roomCode);assert.equal(serverRoom.state.ply,1);assert.equal(serverRoom.events[0].to,at(10,7));
    clickSquare(at(7,1));clickSquare(at(7,3));await flush();assert.equal((await roomService.store.get(roomCode)).state.ply,1,'host cannot play blue army');
    get('room-manage').click();get('room-leave').click();await flush();assert.equal(get('mode-label').textContent,'VS BOTS');assert.equal((await roomService.store.get(roomCode)).seats[0].bot,true);


  } finally {Object.assign(globalThis,original);}
});
