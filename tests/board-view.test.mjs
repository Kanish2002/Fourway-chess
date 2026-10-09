import test from 'node:test';
import assert from 'node:assert/strict';
import { patchBoard } from '../public/board-view.js';
import { pieceSvg, markPieceLoaded, markPieceFailed } from '../public/pieces.js';

function cell(square,key,content='piece',className='cell light') {
  return {square,key,content,className,label:'Square '+square,pressed:false,tabIndex:-1,markup:'<button>'+content+'</button>'};
}
function fixture(cells) {
  return {children:cells.map(c=>({className:c.className,dataset:{contentKey:c.key},writes:0,
    attributes:{'data-square':String(c.square),'aria-label':c.label,'aria-pressed':'false',tabindex:'-1',title:c.label},
    child:{html:c.content},getAttribute(name){return this.attributes[name];},setAttribute(name,value){this.attributes[name]=value;},
    set innerHTML(html){this.writes++;this.child={html};}}))};
}
test('selection, legal dots, drag highlighting and bot-turn updates preserve piece nodes',()=>{
  const cells=[cell(0,'red-pawn'),cell(1,'empty',''),cell(2,'blue-knight')],root=fixture(cells);
  const original=root.children.map(n=>n.child);
  for(const className of ['cell light selected','cell light selected drag-source','cell light last','cell light own-piece']) {
    const next=cells.map(c=>({...c}));next[0].className=className;next[0].pressed=true;next[1].className='cell dark legal';
    patchBoard(root,next);assert.deepEqual(root.children.map(n=>n.writes),[0,0,0]);root.children.forEach((n,i)=>assert.equal(n.child,original[i]));
  }
  assert.equal(root.children[0].getAttribute('aria-pressed'),'true');
});
test('moving a piece updates only origin and destination; subsequent renders retain its animation',()=>{
  const cells=[cell(0,'red-pawn'),cell(1,'empty',''),cell(2,'blue-knight')],root=fixture(cells),knight=root.children[2].child;
  const moved=[cell(0,'empty',''),cell(1,'red-pawn','<span class="piece moving">Neo</span>'),cells[2]];
  patchBoard(root,moved);assert.deepEqual(root.children.map(n=>n.writes),[1,1,0]);assert.equal(root.children[2].child,knight);
  const moving=root.children[1].child;patchBoard(root,[moved[0],{...moved[1],content:'<span class="piece">Neo</span>'},moved[2]]);
  assert.equal(root.children[1].child,moving);assert.match(moving.html,/moving/);assert.deepEqual(root.children.map(n=>n.writes),[1,1,0]);
});
test('capture, promotion, elimination, coordinates and rotation update changed content',()=>{
  const cells=[cell(0,'red-pawn')],root=fixture(cells);
  for(const key of ['blue-rook','blue-queen-promoted','dead-queen','dead-queen:coordinates-off','rotated-square'])patchBoard(root,[cell(0,key)]);
  assert.equal(root.children[0].writes,5);
  patchBoard(root,[{...cell(0,'rotated-square'),square:195,tabIndex:0}]);assert.equal(root.children[0].getAttribute('data-square'),'195');assert.equal(root.children[0].getAttribute('tabindex'),'0');assert.equal(root.children[0].writes,5);
});
test('the initial board renders all cells once',()=>{
  const root={children:[],innerHTML:''},cells=[cell(0,'red'),cell(1,'blue')];patchBoard(root,cells);assert.equal(root.innerHTML,cells.map(c=>c.markup).join(''));
});
test('loaded Neo artwork is immediately ready in every new piece, including the drag ghost',()=>{
  markPieceFailed('n');assert(!pieceSvg('n').includes('neo-ready'));
  markPieceLoaded('n');for(let i=0;i<5;i++)assert.match(pieceSvg('n'),/class="neo-piece neo-ready" data-piece-type="n"/);
  assert(!pieceSvg('b').includes('neo-ready'),'readiness is specific to each asset');
  markPieceFailed('n');assert(!pieceSvg('n').includes('neo-ready'),'failed asset can display the SVG fallback');
  markPieceLoaded('unknown');assert(!pieceSvg('unknown').includes('neo-ready'));
});
