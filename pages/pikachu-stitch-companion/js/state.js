// state.js - mutable app state (selection, stitch flags, journey log,
// settings, start points) and the pure helpers that operate on it.

import { N, COLORS, CELL_COUNT, cells, F_STITCHED, F_TIEOFF } from './pattern.js';
import { markDirty } from './persistence.js';
import { refreshUI } from './ui.js';
import { draw } from './render.js';
import { invalidateRoute } from './planner.js';

export const DEFAULT_SETTINGS = {
  fabricCount:14, strands:2, maxCarry:5, threadLength:18,
  railroading:false, topLegDirection:'/', blockOrder:'serpentine',
  origin:'centre', darkCarryGuard:true, confettiFirst:false,
  blockSize:10,
};

/* --- state --- */
export const state = {
  selected: null,                 // null = show all; else 1..23
  stitchFlags: new Uint8Array(CELL_COUNT),
  stitchedCount: new Int32Array(COLORS.length+1),
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
export function isColourComplete(v){ return state.stitchedCount[v] === COLORS[v-1][3]; }

export function setStitched(i, on){
  const v = colourAt(i);
  if (v===0) return;
  const was = isStitched(i);
  if (was === !!on) return;
  if (on) { state.stitchFlags[i] |= F_STITCHED; state.stitchedCount[v]++; }
  else    { state.stitchFlags[i] &= ~F_STITCHED; state.stitchedCount[v]--; }
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
  } else if (ev.kind==='bulk'){
    // bulk marks stitched cells on; undo restores the opposite state
    (ev.cells||[]).forEach(i=>setStitched(i, !!ev.unmark));
  }
  markDirty();
  refreshUI(); draw();
}
