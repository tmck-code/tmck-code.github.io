// state.js - mutable app state (selection, stitch flags, journey log,
// settings, start points) and the pure helpers that operate on it.

import { N, COLORS, TOTAL, CELL_COUNT, cells, F_STITCHED, F_TIEOFF, F_MISSED, F_OMITTED } from './pattern.js';
import { markDirty } from './persistence.js';
import { refreshUI } from './ui.js';
import { draw } from './render.js';
import { invalidateRoute, invalidateAllRoutes } from './planner.js';

export const DEFAULT_SETTINGS = {
  fabricCount:14, strands:2, maxCarry:5, threadLength:18,
  railroading:false, topLegDirection:'/', blockOrder:'serpentine',
  origin:'centre', darkCarryGuard:true, confettiFirst:false,
  blockSize:10, backfillFirst:true,
};

/* --- state --- */
export const state = {
  selected: null,                 // null = show all; else 1..23
  stitchFlags: new Uint8Array(CELL_COUNT),
  stitchedCount: new Int32Array(COLORS.length+1),
  omittedCount: new Int32Array(COLORS.length+1), // cells excised from the design, per colour
  journey: [],                    // stitching event log
  dirty: false,
  settings: Object.assign({}, DEFAULT_SETTINGS),
  startPoints: {},                // {colourIdx: cellIdx}
};

export function idxOf(r,c){ return r*N+c; }
export function rowOf(i){ return Math.floor(i/N); }
export function colOf(i){ return i%N; }
export function colourAt(i){ return cells[rowOf(i)][colOf(i)]; }
export function isStitched(i){ return (state.stitchFlags[i] & F_STITCHED) !== 0; }
export function hasTieOff(i){ return (state.stitchFlags[i] & F_TIEOFF) !== 0; }
export function isMissed(i){ return (state.stitchFlags[i] & F_MISSED) !== 0; }
export function isOmitted(i){ return (state.stitchFlags[i] & F_OMITTED) !== 0; }

/** colourTotal(v) - stitches of colour v still in the design (pattern count
 *  less the cells omitted from it). */
export function colourTotal(v){ return COLORS[v-1][3] - state.omittedCount[v]; }
/** totalStitches() - whole-design stitch total, less every omitted cell. */
export function totalStitches(){
  let omitted = 0;
  for (let v=1; v<state.omittedCount.length; v++) omitted += state.omittedCount[v];
  return TOTAL - omitted;
}
export function isColourComplete(v){ return state.stitchedCount[v] === colourTotal(v); }
export function setStitched(i, on){
  const v = colourAt(i);
  if (v===0) return;
  if (on && isOmitted(i)) return;   // omitted cells are not part of the design
  const was = isStitched(i);
  if (was === !!on) return;
  if (on) { state.stitchFlags[i] |= F_STITCHED; state.stitchedCount[v]++; state.stitchFlags[i] &= ~F_MISSED; }
  else    { state.stitchFlags[i] &= ~F_STITCHED; state.stitchedCount[v]--; }
  invalidateRoute(v);
  markDirty();
}

/**
 * setMissed(i, on) - flag a cell as skipped-by-accident. A missed cell is by
 * definition not stitched (that's the correction being recorded), and never
 * omitted, so setting it clears both.
 */
export function setMissed(i, on){
  const v = colourAt(i);
  if (v===0) return;
  if (on){
    if (isOmitted(i)) setOmitted(i, false);
    if (isStitched(i)) setStitched(i, false);
    if (isMissed(i)) return;
    state.stitchFlags[i] |= F_MISSED;
  } else {
    if (!isMissed(i)) return;
    state.stitchFlags[i] &= ~F_MISSED;
  }
  invalidateRoute(v);
  markDirty();
}

/**
 * setOmitted(i, on) - excise a cell from (or restore it to) the design.
 * Omitting drops any stitched/missed state: the cell stops counting toward
 * the colour's total and disappears from routes and block navigation.
 */
export function setOmitted(i, on){
  const v = colourAt(i);
  if (v===0) return;
  const was = isOmitted(i);
  if (was === !!on) return;
  if (on){
    if (isStitched(i)) setStitched(i, false);
    state.stitchFlags[i] &= ~F_MISSED;
    state.stitchFlags[i] |= F_OMITTED;
    state.omittedCount[v]++;
  } else {
    state.stitchFlags[i] &= ~F_OMITTED;
    state.omittedCount[v]--;
  }
  invalidateRoute(v);
  markDirty();
}
export function setTieOff(i, on){
  const has = hasTieOff(i);
  if (has === !!on) return;
  if (on) state.stitchFlags[i] |= F_TIEOFF;
  else    state.stitchFlags[i] &= ~F_TIEOFF;
  invalidateRoute(colourAt(i));
  markDirty();
}

export function logEvent(ev){
  state.journey.push(Object.assign({t: Date.now()}, ev));
  compactLog();
  markDirty();
}
export function compactLog(){
  if (state.journey.length <= 5000) return;
  const folded = state.journey.splice(0, 1000);
  state.journey.unshift({kind:'compacted', t: folded[folded.length-1].t, c:0, n:folded.length});
}
export function undoLast(){
  const ev = state.journey[state.journey.length-1];
  if (!ev || ev.kind==='compacted') return;
  state.journey.pop();
  if (ev.kind==='mark'){
    (ev.cells||[]).forEach(i=>setStitched(i,false));
  } else if (ev.kind==='unmark'){
    (ev.cells||[]).forEach(i=>setStitched(i,true));
  } else if (ev.kind==='tieoff'){
    // undo to the inverse of the logged direction (older events lack `on`
    // and were always placements, so default to removing)
    if (ev.tieOff!=null) setTieOff(ev.tieOff, ev.on===undefined ? false : !ev.on);
  } else if (ev.kind==='missed' || ev.kind==='omit'){
    // restore each cell's pre-adjustment state exactly (prev[] is a parallel
    // array of {m,o,s} snapshots taken before the adjustment was applied)
    const cells = ev.cells||[], prev = ev.prev||[];
    cells.forEach((i,k)=>{
      const p = prev[k] || {};
      setMissed(i, false); setOmitted(i, false);
      if (p.o) setOmitted(i, true);
      else if (p.m) setMissed(i, true);
      else if (p.s) setStitched(i, true);
    });
    if (ev.c) invalidateRoute(ev.c); else invalidateAllRoutes();
  } else if (ev.kind==='bulk'){
    // bulk marks stitched cells on; undo restores the opposite state
    (ev.cells||[]).forEach(i=>setStitched(i, !!ev.unmark));
    // "up to here" / route-aware block marks advance the colour's start point;
    // put it back so the re-plan resumes from where it was before
    if ('prevStart' in ev){
      if (ev.prevStart==null) delete state.startPoints[ev.c];
      else state.startPoints[ev.c] = ev.prevStart;
      invalidateRoute(ev.c);
    }
  }
  markDirty();
  refreshUI(); draw();
}
