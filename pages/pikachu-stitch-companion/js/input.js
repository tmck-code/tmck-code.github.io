// input.js - pointer/wheel pan-zoom handlers, colour marking gestures, and
// legend drag-to-scroll.

import { stage, view, applyZoom, clampView, draw, fit, cellAtClient, setSymbolsOn, symbolsOn } from './render.js';
import { N } from './pattern.js';
import { state, colourAt, isStitched, isMissed, isOmitted, setStitched, setMissed, setOmitted, hasTieOff, setTieOff, logEvent } from './state.js';
import { markDirty } from './persistence.js';
import { refreshUI, getBlockIdx, setBlockIdx, updatePosReadout } from './ui.js';
import { invalidateRoute, requestRoute, getRoute, routeCells, markRoutePrefix } from './planner.js';
import { blockOf, blockOrderList, blockIsCompleteForColour, gotoBlock } from './blocks.js';

/* ---------- marking mode toggle ---------- */
let markMode = false;
const markToggle = document.getElementById('markToggle');
markToggle.addEventListener('click', ()=>{
  markMode = !markMode;
  if (markMode){ disarmSetStart(); disarmUpToHere(); disarmMissedPaint(); }
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
  if (setStartArmed){ markMode = false; markToggle.classList.remove('on'); markToggle.setAttribute('aria-pressed','false'); disarmUpToHere(); disarmMissedPaint(); }
  setStartBtn.classList.toggle('on', setStartArmed);
  setStartBtn.setAttribute('aria-pressed', String(setStartArmed));
});

/* ---------- "stitched up to here" (armed mode, or shift-click on desktop) ---------- */
let upToHereArmed = false;
const upToHereBtn = document.getElementById('upToHereBtn');
function disarmUpToHere(){
  upToHereArmed = false;
  upToHereBtn.classList.remove('on');
  upToHereBtn.setAttribute('aria-pressed','false');
}
upToHereBtn.addEventListener('click', ()=>{
  if (state.selected==null) return;
  upToHereArmed = !upToHereArmed;
  if (upToHereArmed){
    markMode = false; markToggle.classList.remove('on'); markToggle.setAttribute('aria-pressed','false');
    disarmSetStart(); disarmMissedPaint();
  }
  upToHereBtn.classList.toggle('on', upToHereArmed);
  upToHereBtn.setAttribute('aria-pressed', String(upToHereArmed));
});
/**
 * markUpToCell(i) - mark every route cell from START through cell i (route
 * order) as stitched and move the start to the next route cell. Returns
 * false if i isn't on the selected colour's current route.
 */
function markUpToCell(i){
  const v = state.selected;
  if (v==null) return false;
  const route = getRoute(v);
  if (!route) return false;
  const cells = routeCells(route);
  const k = cells.indexOf(i);
  if (k<0) return false;
  const prevStart = state.startPoints[v];
  const toggled = markRoutePrefix(v, cells, k, setStitched);
  if (toggled.length) logEvent({kind:'bulk', c:v, cells:toggled, unmark:false, prevStart: prevStart==null ? null : prevStart});
  markDirty();
  invalidateRoute(v); requestRoute(v);
  refreshUI(); draw();
  celebrate(toggled.length ? `Marked ${toggled.length} stitch${toggled.length===1?'':'es'} up to here` : 'Already stitched up to here');
  if (toggled.length) checkBlockComplete(toggled, v);
  return true;
}

/* ---------- missed / omit paint mode ---------- */
// The "Missed" sheet (ui.js) owns the range form; this owns the paint
// gesture it hands off to. Armed from #missedPaintBtn, it reuses the
// ordinary marking gesture below but writes the missed/omitted flag chosen
// in #missedAction instead of F_STITCHED — including the drag-to-paint and
// paint-again-to-clear behaviour.
let missedPaintArmed = false;      // false | 'missed' | 'omit'
const missedBtn = document.getElementById('missedBtn');
const missedPaintBtn = document.getElementById('missedPaintBtn');
const missedActionSel = document.getElementById('missedAction');
function disarmMissedPaint(){
  missedPaintArmed = false;
  delete missedBtn.dataset.painting;
  missedBtn.classList.remove('on');
  missedBtn.setAttribute('aria-pressed','false');
}
missedPaintBtn.addEventListener('click', ()=>{
  missedPaintArmed = missedActionSel.value;
  markMode = false; markToggle.classList.remove('on'); markToggle.setAttribute('aria-pressed','false');
  disarmSetStart(); disarmUpToHere();
  missedBtn.dataset.painting = '1';   // ui.js reads this: a tap on #missedBtn
  missedBtn.classList.add('on');      // stops painting instead of reopening
  missedBtn.setAttribute('aria-pressed','true');
  document.getElementById('missedSheet').classList.remove('show');
  celebrate(missedPaintArmed==='missed'
    ? 'Paint the squares you missed · tap Missed again to stop'
    : 'Paint the squares to drop from the design · tap Missed again to stop');
});
// ui.js owns the button's click (it opens the sheet) and hands the stop back
// here as an event, rather than both modules racing listeners on one element
missedBtn.addEventListener('missed:stop', ()=>{
  disarmMissedPaint();
  celebrate('Done painting');
});

/* ---------- flip (front/back view) + symbol overlay toggles ---------- */
const flipBtn = document.getElementById('flipBtn');
const viewLabel = document.getElementById('viewLabel');
// desktop = fine pointer + hover (mouse/trackpad); phones/tablets are coarse
export const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * flipView(pivotCol?) - toggle front/back, mirroring the pan offset about a
 * column's screen x so the same cells stay in view: pivotCol if given, else
 * the long-press-pinned view.pivotCol, else the stage centre. For a column
 * centre at screen X, front: X = tx+(c+.5)s and back: X = tx+N*s-(c+.5)s,
 * so preserving X gives tx' = 2X - tx - N*s.
 */
function flipView(pivotCol){
  const gs = N*view.base*view.scale, cs = view.base*view.scale;
  const col = pivotCol!=null ? pivotCol : view.pivotCol;
  let X = stage.clientWidth/2;
  if (col!=null){
    const off = (col+0.5)*cs;
    X = view.backView ? view.tx + gs - off : view.tx + off;
  }
  view.backView = !view.backView;
  view.tx = 2*X - view.tx - gs;
  clampView();
  flipBtn.classList.toggle('on', view.backView);
  flipBtn.setAttribute('aria-pressed', String(view.backView));
  viewLabel.textContent = view.backView ? 'Back' : 'Front';
  const lbl = (view.backView ? 'Flip to front view' : 'Flip to back view') + (isDesktop ? ' (F)' : '');
  flipBtn.setAttribute('aria-label', lbl);
  flipBtn.title = lbl;
  draw();
}
flipBtn.addEventListener('click', ()=>flipView());

// desktop: F flips about the column under the mouse cursor (no pinning
// needed); falls back to the pinned column / centre when the cursor isn't
// over the grid
let lastMouse = null;
if (isDesktop){
  flipBtn.title = 'Flip to back view (F)';
  flipBtn.setAttribute('aria-label', 'Flip to back view (F)');
  stage.addEventListener('pointermove', e=>{ if (e.pointerType==='mouse') lastMouse = {x:e.clientX, y:e.clientY}; });
  stage.addEventListener('pointerleave', ()=>{ lastMouse = null; });
  window.addEventListener('keydown', e=>{
    if (e.key!=='f' && e.key!=='F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName==='INPUT' || t.tagName==='SELECT' || t.tagName==='TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    const i = lastMouse ? cellAtClient(lastMouse.x, lastMouse.y) : -1;
    flipView(i>=0 ? i % N : undefined);
  });
}

const symbolsBtn = document.getElementById('symbolsBtn');
symbolsBtn.addEventListener('click', ()=>{
  setSymbolsOn(!symbolsOn);
  symbolsBtn.classList.toggle('on', symbolsOn);
  symbolsBtn.setAttribute('aria-pressed', String(symbolsOn));
  draw();
});

/* ---------- device-specific hint copy ---------- */
{
  const hint = document.querySelector('header .hint');
  const zoomHint = document.getElementById('zoomHint');
  if (isDesktop){
    if (hint) hint.innerHTML = 'click a colour to isolate it<br>scroll to zoom';
    if (zoomHint) zoomHint.textContent = 'drag to pan · double-click to zoom · F flips · shift-click a cell = stitched up to here';
  } else {
    if (hint) hint.innerHTML = 'tap a colour to isolate it<br>pinch to zoom';
    if (zoomHint) zoomHint.textContent = 'drag to pan · double-tap to zoom · hold a column to pin it for flipping';
  }
}

/* ---------- marking gesture state ---------- */
let gesture = null; // {startCell, dir, touched:Set, longPressTimer, moved}
const LONG_PRESS_MS = 500;
const MOVE_THRESH = 8;

function beginGesture(e){
  const i = cellAtClient(e.clientX, e.clientY);
  if (i<0) return;
  const flag = missedPaintArmed;
  // paint mode works on any colour when none is isolated; ordinary marking
  // stays scoped to the selected colour as before
  if (flag){ if (colourAt(i)===0 || (state.selected!=null && colourAt(i)!==state.selected)) return; }
  else if (colourAt(i)!==state.selected) return;
  const isOn = flag==='missed' ? isMissed : flag==='omit' ? isOmitted : isStitched;
  const dir = !isOn(i);   // paint unless the cell is already in that state
  gesture = {
    startX:e.clientX, startY:e.clientY,
    startCell:i, dir, flag, touched:new Set(), prev:[], moved:false,
  };
  toggleCell(i, dir);
  if (flag) return;       // long-press tie-off is a stitching gesture only
  gesture.longPressTimer = setTimeout(()=>{
    if (!gesture || gesture.moved) return;
    fireTieOff(gesture.startCell);
  }, LONG_PRESS_MS);
}
function toggleCell(i, dir){
  if (gesture.touched.has(i)) return;
  gesture.touched.add(i);
  if (gesture.flag){
    gesture.prev.push({m: isMissed(i), o: isOmitted(i), s: isStitched(i)});
    if (gesture.flag==='missed') setMissed(i, dir); else setOmitted(i, dir);
    return;
  }
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
  const flag = gesture.flag;
  const prev = gesture.prev;
  gesture = null;
  if (touched.length && flag){
    // one journey entry per paint stroke, carrying the per-cell snapshots
    // undoLast needs to put the cells back exactly as they were
    const colours = new Set(touched.map(colourAt));
    logEvent({ kind: flag==='missed' ? 'missed' : 'omit', c: colours.size===1 ? [...colours][0] : 0, cells: touched, prev });
    colours.forEach(v => invalidateRoute(v));
    if (state.selected!=null) requestRoute(state.selected);
    markDirty(); refreshUI(); draw();
    return;
  }
  if (touched.length){
    logEvent({ kind: dir ? 'mark' : 'unmark', c: state.selected, cells: touched });
  }
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
  const flag = gesture.flag;
  [...gesture.touched].reverse().forEach(i=>{
    if (flag==='missed') setMissed(i, !gesture.dir);
    else if (flag==='omit') setOmitted(i, !gesture.dir);
    else setStitched(i, !gesture.dir);
  });
  gesture = null;
  refreshUI(); draw();
}

/* ---------- pan / zoom (pointer events) ---------- */
const pts=new Map();
let lastDist=0,lastMid=null,lastTap=0;
let pivotTimer=null, pivotDown=null; // long-press-to-pin-pivot-column state
stage.addEventListener('pointerdown',e=>{
  // only the canvas takes pan/zoom/marking gestures — other stage children
  // (#miniMap, #blockCelebrate, …) keep their own pointer/click behaviour
  if (e.target && e.target.id !== 'cv') return;
  try { stage.setPointerCapture(e.pointerId); } catch(_) {}
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pts.size===1) updatePosReadout(cellAtClient(e.clientX, e.clientY));
  if(pts.size===2){
    if (gesture) abortGesture();
    pivotDown = null; clearTimeout(pivotTimer);
    const [a,b]=[...pts.values()];
    lastDist=Math.hypot(a.x-b.x,a.y-b.y);
    lastMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  } else if (pts.size===1){
    if ((upToHereArmed || (e.shiftKey && isDesktop)) && state.selected!=null){
      const i = cellAtClient(e.clientX, e.clientY);
      if (i>=0 && colourAt(i)===state.selected){
        if (!markUpToCell(i)) celebrate('That cell is not on the current route');
        disarmUpToHere();
      }
    } else if (setStartArmed && state.selected!=null){
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
    } else if (missedPaintArmed){
      beginGesture(e);
    } else if (markMode && state.selected!=null){
      beginGesture(e);
    } else {
      const now=Date.now();
      if(now-lastTap<300){ zoomAt(e.clientX,e.clientY, view.scale<4?2:0.25); }
      lastTap=now;
      // long-press (no drag) pins the column under the finger as the flip
      // pivot; long-pressing the pinned column again unpins it
      clearTimeout(pivotTimer);
      pivotDown = {x:e.clientX, y:e.clientY};
      pivotTimer = setTimeout(()=>{
        if (!pivotDown) return;
        const i = cellAtClient(pivotDown.x, pivotDown.y);
        pivotDown = null;
        if (i<0) return;
        const col = i % N;
        view.pivotCol = (view.pivotCol===col) ? null : col;
        draw();
      }, LONG_PRESS_MS);
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
      const paintable = i>=0 && (gesture.flag
        ? colourAt(i)!==0 && (state.selected==null || colourAt(i)===state.selected)
        : colourAt(i)===state.selected);
      if (paintable) toggleCell(i, gesture.dir);
      return; // suppress the pan branch while a marking gesture is active
    }
    if (pivotDown && Math.hypot(e.clientX-pivotDown.x, e.clientY-pivotDown.y)>MOVE_THRESH){
      pivotDown = null; clearTimeout(pivotTimer);
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
  pivotDown = null; clearTimeout(pivotTimer);
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
