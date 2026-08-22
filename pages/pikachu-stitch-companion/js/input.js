// input.js - pointer/wheel pan-zoom handlers, colour marking gestures, and
// legend drag-to-scroll.

import { stage, view, applyZoom, clampView, draw, fit, cellAtClient, setSymbolsOn, symbolsOn } from './render.js';
import { N } from './pattern.js';
import { state, colourAt, isStitched, setStitched, hasTieOff, setTieOff, logEvent } from './state.js';
import { markDirty } from './persistence.js';
import { refreshUI, getBlockIdx, setBlockIdx, updatePosReadout } from './ui.js';
import { invalidateRoute, requestRoute } from './planner.js';
import { blockOf, blockOrderList, blockIsCompleteForColour, gotoBlock } from './blocks.js';

/* ---------- marking mode toggle ---------- */
let markMode = false;
const markToggle = document.getElementById('markToggle');
markToggle.addEventListener('click', ()=>{
  markMode = !markMode;
  if (markMode) disarmSetStart();
  markToggle.classList.toggle('on', markMode);
  markToggle.setAttribute('aria-pressed', String(markMode));
});

/* ---------- set-start mode (3.11) ---------- */
let setStartArmed = false;
const setStartBtn = document.getElementById('setStartBtn');
function disarmSetStart(){
  setStartArmed = false;
  setStartBtn.classList.remove('on');
  setStartBtn.setAttribute('aria-pressed','false');
}
setStartBtn.addEventListener('click', ()=>{
  if (state.selected==null) return;
  setStartArmed = !setStartArmed;
  if (setStartArmed){ markMode = false; markToggle.classList.remove('on'); markToggle.setAttribute('aria-pressed','false'); }
  setStartBtn.classList.toggle('on', setStartArmed);
  setStartBtn.setAttribute('aria-pressed', String(setStartArmed));
});

/* ---------- flip (front/back view) + symbol overlay toggles ---------- */
const flipBtn = document.getElementById('flipBtn');
const viewLabel = document.getElementById('viewLabel');
flipBtn.addEventListener('click', ()=>{
  view.backView = !view.backView;
  // keep the same cells in view: the grid is mirrored about its own centre,
  // so the pan offset mirrors about the stage width
  view.tx = stage.clientWidth - view.tx - N*view.base*view.scale;
  clampView();
  flipBtn.classList.toggle('on', view.backView);
  flipBtn.setAttribute('aria-pressed', String(view.backView));
  viewLabel.textContent = view.backView ? 'Back' : 'Front';
  const lbl = view.backView ? 'Flip to front view' : 'Flip to back view';
  flipBtn.setAttribute('aria-label', lbl);
  flipBtn.title = lbl;
  draw();
});

const symbolsBtn = document.getElementById('symbolsBtn');
symbolsBtn.addEventListener('click', ()=>{
  setSymbolsOn(!symbolsOn);
  symbolsBtn.classList.toggle('on', symbolsOn);
  symbolsBtn.setAttribute('aria-pressed', String(symbolsOn));
  draw();
});

/* ---------- marking gesture state ---------- */
let gesture = null; // {startCell, dir, touched:Set, longPressTimer, moved}
const LONG_PRESS_MS = 500;
const MOVE_THRESH = 8;

function beginGesture(e){
  const i = cellAtClient(e.clientX, e.clientY);
  if (i<0 || colourAt(i)!==state.selected) return;
  const dir = !isStitched(i); // mark unless already stitched
  gesture = {
    startX:e.clientX, startY:e.clientY,
    startCell:i, dir, touched:new Set(), moved:false,
  };
  toggleCell(i, dir);
  gesture.longPressTimer = setTimeout(()=>{
    if (!gesture || gesture.moved) return;
    fireTieOff(gesture.startCell);
  }, LONG_PRESS_MS);
}
function toggleCell(i, dir){
  if (gesture.touched.has(i)) return;
  gesture.touched.add(i);
  setStitched(i, dir);
}
function fireTieOff(i){
  const on = !hasTieOff(i);
  setTieOff(i, on);
  logEvent({kind:'tieoff', c:colourAt(i), tieOff:i, on});
  // setTieOff already invalidates the colour's cached route internally.
  refreshUI(); draw();
}
function commitGesture(){
  if (!gesture) return;
  clearTimeout(gesture.longPressTimer);
  const touched = [...gesture.touched];
  const dir = gesture.dir;
  if (touched.length){
    logEvent({ kind: dir ? 'mark' : 'unmark', c: state.selected, cells: touched });
  }
  gesture = null;
  markDirty(); refreshUI(); draw();
  if (dir && touched.length) checkBlockComplete(touched, state.selected);
}

/* ---------- block-complete celebration + auto-advance (4.6) ---------- */
const celebrateEl = document.getElementById('blockCelebrate');
let celebrateTimer = null;
function checkBlockComplete(touchedCells, v){
  if (v==null) return;
  const seen = new Set();
  for (const i of touchedCells){
    const {br,bc} = blockOf(i);
    const key = br+','+bc;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!blockIsCompleteForColour(br,bc,v)) continue;
    // the just-completed block has already dropped out of the recomputed
    // list, so the correct next block sits at the *same* index
    const list = blockOrderList(v);
    const idx = getBlockIdx();
    const next = list[idx];
    if (next){
      celebrate('Block done! Moving on…');
      setBlockIdx(idx);
      gotoBlock(next.br, next.bc);
    } else {
      celebrate(list.length ? 'Block done!' : 'Colour finished!');
    }
    return; // one celebration per gesture is enough
  }
}
function celebrate(msg){
  celebrateEl.textContent = msg;
  celebrateEl.classList.add('show');
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(()=>celebrateEl.classList.remove('show'), 1800);
}
function abortGesture(){
  if (!gesture) return;
  clearTimeout(gesture.longPressTimer);
  // revert cells already toggled by this gesture, in reverse order
  [...gesture.touched].reverse().forEach(i=>setStitched(i, !gesture.dir));
  gesture = null;
  refreshUI(); draw();
}

/* ---------- pan / zoom (pointer events) ---------- */
const pts=new Map();
let lastDist=0,lastMid=null,lastTap=0;
stage.addEventListener('pointerdown',e=>{
  // only the canvas takes pan/zoom/marking gestures — other stage children
  // (#miniMap, #blockCelebrate, …) keep their own pointer/click behaviour
  if (e.target && e.target.id !== 'cv') return;
  try { stage.setPointerCapture(e.pointerId); } catch(_) {}
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pts.size===1) updatePosReadout(cellAtClient(e.clientX, e.clientY));
  if(pts.size===2){
    if (gesture) abortGesture();
    const [a,b]=[...pts.values()];
    lastDist=Math.hypot(a.x-b.x,a.y-b.y);
    lastMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  } else if (pts.size===1){
    if (setStartArmed && state.selected!=null){
      const i = cellAtClient(e.clientX, e.clientY);
      if (i>=0 && colourAt(i)===state.selected){
        state.startPoints[state.selected] = i;
        markDirty();
        invalidateRoute(state.selected);
        requestRoute(state.selected);
        disarmSetStart();
        setBlockIdx(0); // block order is anchored at the start point, so restart the walk
        refreshUI(); draw();
      }
    } else if (markMode && state.selected!=null){
      beginGesture(e);
    } else {
      const now=Date.now();
      if(now-lastTap<300){ zoomAt(e.clientX,e.clientY, view.scale<4?2:0.25); }
      lastTap=now;
    }
  }
});
stage.addEventListener('pointermove',e=>{
  // cell position readout (hover on mouse, drag/tap on touch)
  if (pts.size<=1) updatePosReadout(cellAtClient(e.clientX, e.clientY));
  if(!pts.has(e.pointerId))return;
  const prev=pts.get(e.pointerId);
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pts.size===1){
    if (gesture){
      const dx=e.clientX-gesture.startX, dy=e.clientY-gesture.startY;
      if (!gesture.moved && Math.hypot(dx,dy)>MOVE_THRESH){
        gesture.moved = true;
        clearTimeout(gesture.longPressTimer);
      }
      const i = cellAtClient(e.clientX, e.clientY);
      if (i>=0 && colourAt(i)===state.selected) toggleCell(i, gesture.dir);
      return; // suppress the pan branch while a marking gesture is active
    }
    view.tx+=e.clientX-prev.x; view.ty+=e.clientY-prev.y;
    clampView(); draw();
  } else if(pts.size===2){
    const [a,b]=[...pts.values()];
    const dist=Math.hypot(a.x-b.x,a.y-b.y);
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    if(lastDist>0){
      const f=dist/lastDist;
      applyZoom(mid.x,mid.y,f);
      view.tx+=mid.x-lastMid.x; view.ty+=mid.y-lastMid.y;
      clampView(); draw();
    }
    lastDist=dist; lastMid=mid;
  }
});
function endPt(e){
  pts.delete(e.pointerId);
  lastDist=0;
  if (gesture) commitGesture();
}
stage.addEventListener('pointerup',endPt);
stage.addEventListener('pointercancel',endPt);
stage.addEventListener('wheel',e=>{
  e.preventDefault();
  applyZoom(e.clientX,e.clientY, Math.exp(-e.deltaY*0.0018));
  clampView(); draw();
},{passive:false});
function zoomAt(cx,cy,f){ applyZoom(cx,cy,f); clampView(); draw(); }

stage.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
window.addEventListener('resize',fit);

/* legend drag-to-scroll (mouse) */
const legend = document.getElementById('legend');
let lgDown=false,lgX=0,lgScroll=0,lgMoved=false;
legend.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='mouse')return;
  lgDown=true;lgMoved=false;lgX=e.clientX;lgScroll=legend.scrollLeft;
});
legend.addEventListener('pointermove',e=>{
  if(!lgDown)return;
  const dx=e.clientX-lgX;
  if(Math.abs(dx)>4){lgMoved=true;legend.classList.add('dragging');}
  legend.scrollLeft=lgScroll-dx;
});
['pointerup','pointerleave'].forEach(ev=>legend.addEventListener(ev,()=>{
  lgDown=false;
  setTimeout(()=>legend.classList.remove('dragging'),0);
}));
