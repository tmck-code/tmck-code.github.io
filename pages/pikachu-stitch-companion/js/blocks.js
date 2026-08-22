// blocks.js - 10x10 block navigation helpers: block field, colour-scoped
// block ordering, and camera framing for a given block.

import { N } from './pattern.js';
import { state, idxOf, rowOf, colOf, colourAt, isStitched } from './state.js';
import { view, clampView, draw, stage } from './render.js';

export const BLOCK_SIZE = 10;
export const BLOCKS = N / BLOCK_SIZE; // 15 blocks per axis (150/10)

/** blockOf(idx) -> {br, bc} block row/col containing cell idx. */
export function blockOf(idx){
  return { br: Math.floor(rowOf(idx)/BLOCK_SIZE), bc: Math.floor(colOf(idx)/BLOCK_SIZE) };
}

/** blockCells(br, bc) -> array of cell indices (row-major) in that 10x10 block. */
export function blockCells(br, bc){
  const out = [];
  const r0 = br*BLOCK_SIZE, c0 = bc*BLOCK_SIZE;
  for(let r=r0; r<r0+BLOCK_SIZE; r++){
    for(let c=c0; c<c0+BLOCK_SIZE; c++) out.push(idxOf(r,c));
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
  for(let br=0; br<BLOCKS; br++){
    for(let bc=0; bc<BLOCKS; bc++){
      if(blockCells(br,bc).some(i => colourAt(i)===v && !isStitched(i))) out.push({br,bc});
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
  return !blockCells(br,bc).some(i => colourAt(i)===v && !isStitched(i));
}

/**
 * blockOrderList(v) -> blocksForColour(v) reordered per
 * state.settings.blockOrder:
 *  - 'row-major': left-to-right, top-to-bottom throughout (bc ascending
 *    every row).
 *  - 'serpentine' (default): left-to-right on even block-rows, right-to-
 *    left on odd block-rows (boustrophedon), so consecutive blocks are
 *    always adjacent.
 */
export function blockOrderList(v, order = state.settings.blockOrder){
  const blocks = blocksForColour(v); // already row-major by br,bc
  if(order === 'row-major') return blocks;
  const byRow = new Map();
  for(const b of blocks){
    if(!byRow.has(b.br)) byRow.set(b.br, []);
    byRow.get(b.br).push(b);
  }
  const out = [];
  for(const br of [...byRow.keys()].sort((a,b)=>a-b)){
    const row = byRow.get(br);
    if(br % 2 === 1) row.reverse();
    out.push(...row);
  }
  return out;
}

/**
 * gotoBlock(br, bc) - pans/zooms the view so the 10x10 block (br,bc) fills
 * the stage, then clamps and redraws.
 */
export function gotoBlock(br, bc){
  const w = stage.clientWidth, h = stage.clientHeight;
  const blockPx = BLOCK_SIZE * view.base; // css px spanned by the block at scale 1
  const fit = Math.min(w,h) * 0.96 / blockPx;
  view.scale = fit;
  const s = view.base * view.scale; // effective cell size at the new scale
  // back view mirrors columns (screenX = tx + N*s - c*s), so centre on the
  // mirrored column position — same block, seen from behind
  const colMid = bc*BLOCK_SIZE + BLOCK_SIZE/2;
  const cx = (view.backView ? N - colMid : colMid) * s;
  const cy = (br*BLOCK_SIZE + BLOCK_SIZE/2) * s;
  view.tx = w/2 - cx;
  view.ty = h/2 - cy;
  clampView();
  draw();
}
