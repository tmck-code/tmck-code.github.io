// blocks.js - 10x10 block navigation helpers: block field, colour-scoped
// block ordering, and camera framing for a given block.

import { N } from './pattern.js';
import { state, idxOf, rowOf, colOf, colourAt, isStitched, isOmitted, isMissed } from './state.js';
import { view, clampView, draw, stage } from './render.js';
import { getRoute } from './planner.js';

// block size is a setting (must divide N=150): 10 (default), 15, 25, 30, 50
export const BLOCK_SIZES = [10, 15, 25, 30, 50];
export function blockSize(){
  const b = state.settings.blockSize;
  return BLOCK_SIZES.includes(b) ? b : 10;
}
export function blockCount(){ return N / blockSize(); } // blocks per axis

/** blockOf(idx) -> {br, bc} block row/col containing cell idx. */
export function blockOf(idx){
  const B = blockSize();
  return { br: Math.floor(rowOf(idx)/B), bc: Math.floor(colOf(idx)/B) };
}

/** blockCells(br, bc) -> array of cell indices (row-major) in that 10x10 block. */
export function blockCells(br, bc){
  const out = [], B = blockSize();
  const r0 = br*B, c0 = bc*B;
  for(let r=r0; r<r0+B; r++){
    for(let c=c0; c<c0+B; c++) out.push(idxOf(r,c));
  }
  return out;
}

/**
 * blocksForColour(v) -> [{br, bc}, ...] blocks (in row-major scan order,
 * br then bc ascending) that still contain at least one unstitched cell of
 * colour v. Use blockOrderList(v) to get these in navigation order.
 */
export function blocksForColour(v){
  const out = [];
  const nb = blockCount();
  for(let br=0; br<nb; br++){
    for(let bc=0; bc<nb; bc++){
      if(blockCells(br,bc).some(i => colourAt(i)===v && !isStitched(i) && !isOmitted(i))) out.push({br,bc});
    }
  }
  return out;
}

/**
 * blockIsCompleteForColour(br, bc, v) -> true if the block has no
 * unstitched cells of colour v left (i.e. that colour is fully done in
 * this block). Exported for the later block-complete-celebration wave
 * (task 4.6): call this after a stitch toggle to detect completion.
 */
export function blockIsCompleteForColour(br, bc, v){
  return !blockCells(br,bc).some(i => colourAt(i)===v && !isStitched(i) && !isOmitted(i));
}

/** blockHasMissedForColour(br, bc, v) -> true when the block holds at least
 *  one cell of colour v flagged as missed (drives the mini-map highlight). */
export function blockHasMissedForColour(br, bc, v){
  return blockCells(br,bc).some(i => colourAt(i)===v && isMissed(i));
}

/**
 * startCellFor(v) -> cell index the route for colour v starts from (the
 * user-set start point if valid, else the planned route's start), or null
 * when neither is known yet.
 */
const lastKnownStart = new Map(); // colour -> cell; survives route invalidation
export function startCellFor(v){
  const sp = state.startPoints[v];
  if (sp!=null && colourAt(sp)===v && !isStitched(sp) && !isOmitted(sp)){ lastKnownStart.set(v, sp); return sp; }
  const route = getRoute(v);
  if (route && route.start!=null){ lastKnownStart.set(v, route.start); return route.start; }
  // route is being re-planned (e.g. right after a mark) — keep the previous
  // anchor so the block order doesn't jump around between frames
  return lastKnownStart.has(v) ? lastKnownStart.get(v) : null;
}

/**
 * blockOrderList(v, order?) -> blocksForColour(v) in navigation order,
 * anchored at the block containing the colour's start point (startCellFor):
 *  - block-rows are visited outward from the start row (start row first,
 *    then the row below, the row above, two below, two above, …);
 *  - within the start row, blocks are visited nearest-first from the start
 *    block (ties: rightward first);
 *  - 'row-major': every other row is left-to-right;
 *  - 'serpentine' (default): every other row begins at the side nearest
 *    where the previous row ended, so consecutive blocks stay adjacent.
 * With no known start point the anchor is the top-left block (legacy).
 */
export function blockOrderList(v, order = state.settings.blockOrder){
  const blocks = blocksForColour(v); // already row-major by br,bc
  if(!blocks.length) return blocks;
  const start = startCellFor(v);
  const anchor = start!=null ? blockOf(start) : { br: blocks[0].br, bc: blocks[0].bc };
  const byRow = new Map();
  for(const b of blocks){
    if(!byRow.has(b.br)) byRow.set(b.br, []);
    byRow.get(b.br).push(b);
  }
  const rows = [...byRow.keys()].sort((a,b)=>{
    const da = Math.abs(a-anchor.br), db = Math.abs(b-anchor.br);
    return da!==db ? da-db : b-a; // nearer first; tie → the lower row (below) first
  });
  const out = [];
  let lastBc = anchor.bc;
  rows.forEach((br, k)=>{
    let row = byRow.get(br).slice().sort((a,b)=>a.bc-b.bc);
    if(k===0){
      row.sort((a,b)=>{
        const da = Math.abs(a.bc-anchor.bc), db = Math.abs(b.bc-anchor.bc);
        return da!==db ? da-db : b.bc-a.bc;
      });
    } else if(order !== 'row-major'){
      const first = row[0].bc, last = row[row.length-1].bc;
      if(Math.abs(last-lastBc) < Math.abs(first-lastBc)) row.reverse();
    }
    out.push(...row);
    lastBc = row[row.length-1].bc;
  });
  return out;
}

/**
 * gotoBlock(br, bc) - pans/zooms the view so the 10x10 block (br,bc) fills
 * the stage, then clamps and redraws.
 */
export function gotoBlock(br, bc){
  const w = stage.clientWidth, h = stage.clientHeight;
  const B = blockSize();
  const blockPx = B * view.base; // css px spanned by the block at scale 1
  const fit = Math.min(w,h) * 0.96 / blockPx;
  view.scale = fit;
  const s = view.base * view.scale; // effective cell size at the new scale
  // back view mirrors columns (screenX = tx + N*s - c*s), so centre on the
  // mirrored column position — same block, seen from behind
  const colMid = bc*B + B/2;
  const cx = (view.backView ? N - colMid : colMid) * s;
  const cy = (br*B + B/2) * s;
  view.tx = w/2 - cx;
  view.ty = h/2 - cy;
  clampView();
  draw();
}

/**
 * centreOnCell(idx) - pans (keeping the current zoom, but at least 3x so the
 * cell is legible) to put cell idx in the middle of the stage. Honours the
 * back-view mirror like gotoBlock.
 */
export function centreOnCell(idx){
  const w = stage.clientWidth, h = stage.clientHeight;
  view.scale = Math.max(view.scale, 3);
  const s = view.base * view.scale;
  const col = colOf(idx) + 0.5, row = rowOf(idx) + 0.5;
  const cx = (view.backView ? N - col : col) * s;
  view.tx = w/2 - cx;
  view.ty = h/2 - row*s;
  clampView();
  draw();
}

/** blockAtViewCentre() -> {br,bc} of the block under the middle of the stage. */
export function blockAtViewCentre(){
  const s = view.base*view.scale, B = blockSize(), nb = blockCount();
  let gx = (stage.clientWidth/2 - view.tx)/s;
  const gy = (stage.clientHeight/2 - view.ty)/s;
  if (view.backView) gx = N - gx;
  const clampB = (n)=>Math.min(nb-1, Math.max(0, Math.floor(n/B)));
  return { br: clampB(gy), bc: clampB(gx) };
}
