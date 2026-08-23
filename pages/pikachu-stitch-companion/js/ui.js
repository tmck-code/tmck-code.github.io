// ui.js - legend chip construction, refreshUI(), #markAllBtn handler,
// #resetBtn wiring.

import { COLORS, TOTAL, CELL_COUNT, N } from './pattern.js';
import { state, colourAt, isStitched, isMissed, isOmitted, isColourComplete, setStitched, setMissed, setOmitted, colourTotal, totalStitches, logEvent, undoLast, rowOf, colOf, idxOf } from './state.js';
import { draw, drawMiniMap, setConfettiHeatOn, confettiHeatOn } from './render.js';
import { resetProgress, markDirty } from './persistence.js';
import { getRoute, requestRoute, getPlanningColour, setOnRouteReady, invalidateAllRoutes, stitchesPerLength, routeCells, markRoutePrefix, invalidateRoute } from './planner.js';
import { blockOrderList, gotoBlock, blockOf, centreOnCell, blockSize, BLOCK_SIZES, blockAtViewCentre, blockCells } from './blocks.js';
import { stitchesPerHour, estimatedFinish, RAILROADING_SLOWDOWN, LENGTHS_PER_SKEIN, skeinsForLengths } from './insights.js';

/* ---------- legend ---------- */
const legend = document.getElementById('legend');
COLORS.forEach((c,i)=>{
  const idx = i+1;
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.id = 'chip'+idx;
  chip.title = `DMC ${c[0]} · ${c[1]}`;
  chip.setAttribute('aria-pressed','false');
  chip.innerHTML = `<span class="sw" style="background:${c[2]}"></span>
    <span class="n">${c[0]}</span><span class="cnt">0/${c[3]}</span>`;
  chip.addEventListener('click', ()=>{
    state.selected = (state.selected === idx) ? null : idx;
    blockIdx = 0; // reset block-nav position (4.4) on colour change
    centreOnStartPending = state.selected!=null;
    if (state.selected!=null){
      const r = requestRoute(state.selected);
      if (r && r.start!=null){ centreOnStartPending = false; centreOnCell(r.start); }
    }
    refreshUI(); draw();
  });
  legend.appendChild(chip);
});

/* ---------- complete toggle + progress ---------- */
// toolbar "mark all" toggle: marks every cell of the selected colour as
// stitched (or, when the colour is already complete, unmarks them all).
const markAllBtn = document.getElementById('markAllBtn');
markAllBtn.addEventListener('click', ()=>{
  if (state.selected==null) return;
  const v = state.selected;
  const on = !isColourComplete(v);
  const cellsToToggle = [];
  for (let i=0;i<CELL_COUNT;i++){
    if (colourAt(i)===v && !isOmitted(i) && isStitched(i)!==on) cellsToToggle.push(i);
  }
  cellsToToggle.forEach(i=>setStitched(i, on));
  logEvent({kind:'bulk', c:v, cells:cellsToToggle, unmark: !on});
  if (on && isColourComplete(v)) celebrateBulk('Colour finished!');
  refreshUI(); draw();
});
/* ---------- mark block: bulk-mark the block under the view centre ---------- */
// Marks every unstitched cell in the current block — of the selected colour
// when one is selected, otherwise of every colour. If that colour is already
// complete in the block, unmarks it instead (so the button is a toggle).
const markBlockBtn = document.getElementById('markBlockBtn');
function blockTargetCells(){
  const { br, bc } = blockAtViewCentre();
  const v = state.selected;
  return { br, bc, cells: blockCells(br, bc).filter(i => { const c = colourAt(i); return c!==0 && !isOmitted(i) && (v==null || c===v); }) };
}
/**
 * blockRouteVisit(v, br, bc) - route-aware view of the block: the route's
 * *first contiguous visit* to this block (cells the needle reaches before
 * the path leaves the block), plus how many of the block's cells the route
 * only comes back for later. null when no route is planned yet.
 */
function blockRouteVisit(v, br, bc){
  const route = getRoute(v);
  if (!route) return null;
  const inBlock = new Set(blockCells(br, bc));
  const cells = routeCells(route);
  let i0 = cells.findIndex(i => inBlock.has(i));
  if (i0<0) return { cells, i0:-1, j:-1, visit:[], later:0 };
  let j = i0;
  while (j+1 < cells.length && inBlock.has(cells[j+1])) j++;
  const visit = cells.slice(i0, j+1);
  let later = 0;
  for (let k=j+1; k<cells.length; k++) if (inBlock.has(cells[k])) later++;
  return { cells, i0, j, visit, later };
}
markBlockBtn.addEventListener('click', ()=>{
  const { br, bc, cells } = blockTargetCells();
  if (!cells.length) { celebrateBulk('Nothing of this colour in this block'); return; }
  const v = state.selected;
  const allDone = cells.every(isStitched);
  if (allDone){
    // toggle off: unmark the whole block for this colour (geometric)
    cells.forEach(i => setStitched(i, false));
    logEvent({kind:'bulk', c: v ?? 0, cells, unmark: true});
    refreshUI(); draw();
    return;
  }
  // one press = the whole block for this colour. Route-awareness is kept
  // where it helps: if the path currently starts inside this block, START
  // advances to the first route cell *outside* it (where the needle would
  // leave), so the re-plan continues from the stitcher, not a fresh start.
  const rv = v!=null ? blockRouteVisit(v, br, bc) : null;
  const prevStart = v!=null ? state.startPoints[v] : undefined;
  const toggled = cells.filter(i => !isStitched(i));
  toggled.forEach(i => setStitched(i, true));
  const ev = {kind:'bulk', c: v ?? 0, cells: toggled, unmark: false};
  if (rv && rv.i0===0){
    const exit = rv.cells.slice(rv.j+1).find(i => !isStitched(i));
    if (exit!=null){ state.startPoints[v] = exit; ev.prevStart = prevStart==null ? null : prevStart; }
  }
  if (v!=null){ invalidateRoute(v); requestRoute(v); }
  logEvent(ev);
  refreshUI(); draw();
  if (v!=null && isColourComplete(v)) { celebrateBulk('Colour finished!'); return; }
  if (v!=null){
    const list = blockOrderList(v);
    const next = list[Math.min(blockIdx, list.length-1)];
    if (next){ celebrateBulk('Block done! Moving on…'); blockIdx = Math.min(blockIdx, list.length-1); gotoBlock(next.br, next.bc); refreshBlockNav(); }
    else celebrateBulk('Block done!');
  } else celebrateBulk(`Block done · ${toggled.length} stitch${toggled.length===1?'':'es'}`);
});
function refreshMarkBlockBtn(){
  const { cells } = blockTargetCells();
  const v = state.selected;
  const what = v!=null ? `DMC ${COLORS[v-1][0]}` : 'all colours';
  const done = cells.length && cells.every(isStitched);
  const B = blockSize();
  const lbl = done ? `Unmark this ${B}×${B} block (${what})` : `Mark this ${B}×${B} block as stitched (${what})`;
  markBlockBtn.title = lbl; markBlockBtn.setAttribute('aria-label', lbl);
  markBlockBtn.classList.toggle('on', !!done);
  markBlockBtn.setAttribute('aria-pressed', String(!!done));
}

// cheap reuse of input.js's celebration banner for the bulk "mark all" path (4.6)
const celebrateEl = document.getElementById('blockCelebrate');
let celebrateTimer = null;
function celebrateBulk(msg){
  celebrateEl.textContent = msg;
  celebrateEl.classList.add('show');
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(()=>celebrateEl.classList.remove('show'), 1800);
}
export function refreshUI(){
  COLORS.forEach((c,i)=>{
    const idx=i+1, chip=document.getElementById('chip'+idx);
    const done = state.stitchedCount[idx], total = colourTotal(idx), complete = isColourComplete(idx);
    chip.classList.toggle('sel', state.selected===idx);
    chip.classList.toggle('faded', state.selected!=null && state.selected!==idx);
    chip.classList.toggle('done', complete);
    chip.setAttribute('aria-pressed', String(state.selected===idx));
    const omitted = state.omittedCount[idx];
    chip.classList.toggle('adjusted', omitted>0);
    chip.querySelector('.cnt').textContent = `${done}/${total}`;
    chip.setAttribute('aria-label',
      `DMC ${c[0]} ${c[1]}, ${done} of ${total} stitches${omitted?`, ${omitted} omitted`:''}${complete?', complete':''}`);
  });
  if (state.selected!=null){
    const c = COLORS[state.selected-1];
    const complete = isColourComplete(state.selected);
    const lbl = complete
      ? `Unmark all of DMC ${c[0]} · ${c[1]}`
      : `Mark all of DMC ${c[0]} · ${c[1]} as stitched`;
    markAllBtn.disabled = false;
    markAllBtn.classList.toggle('on', complete);
    markAllBtn.setAttribute('aria-pressed', String(complete));
    markAllBtn.setAttribute('aria-label', lbl);
    markAllBtn.title = lbl;
    document.getElementById('chip'+state.selected)
      .scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
  } else {
    markAllBtn.disabled = true;
    markAllBtn.classList.remove('on');
    markAllBtn.setAttribute('aria-pressed','false');
  }
  const doneCount = state.stitchedCount.reduce((s,n)=>s+n,0);
  const total = totalStitches();
  const pct = total>0 ? Math.round(doneCount/total*100) : 100;
  document.getElementById('pctNum').textContent = pct;
  document.getElementById('pctDetail').textContent =
    doneCount.toLocaleString()+' / '+total.toLocaleString()+' stitches'+
    (total!==TOTAL ? ` · ${(TOTAL-total).toLocaleString()} omitted` : '');
  document.getElementById('barFill').style.width = pct+'%';

  markToggle.disabled = state.selected==null;
  undoBtn.disabled = state.journey.length===0;
  readout.hidden = state.selected==null;
  readout.textContent = state.selected==null
    ? ''
    : `DMC ${COLORS[state.selected-1][0]} · ${state.stitchedCount[state.selected]} / ${colourTotal(state.selected)}`;

  setStartBtn.disabled = state.selected==null;
  upToHereBtn.disabled = state.selected==null;
  if (state.selected==null){ upToHereBtn.classList.remove('on'); upToHereBtn.setAttribute('aria-pressed','false'); }
  refreshBlockSizeUI();
  refreshMarkBlockBtn();
  refreshMissedSheet();
  refreshRoutePanel();
  refreshBlockNav();
  drawMiniMap();
}

document.getElementById('resetBtn').addEventListener('click', resetProgress);

/* ---------- toolbar: markToggle disabled state, undo, readout ---------- */
const markToggle = document.getElementById('markToggle');
const undoBtn = document.getElementById('undoBtn');
const readout = document.getElementById('colourReadout');
const setStartBtn = document.getElementById('setStartBtn');
const upToHereBtn = document.getElementById('upToHereBtn');
undoBtn.addEventListener('click', undoLast);

/* ---------- route summary readout (3.13) ---------- */
// "planning" state is simply "getRoute(selected) is undefined" — planner.js
// caches routes and requestRoute(v) schedules planning via idle callback;
// requestRoute is called only on colour change (chip handler above), never
// from draw(). This single module-load-time setOnRouteReady callback clears
// the transient state by refreshing the panel once planning finishes.
const routeStatus = document.getElementById('routeStatus');

/* ---------- cell position readout (local index) ---------- */
// Shows "col , row" of the cell under the pointer, in the coordinate frame
// matching state.settings.origin ('centre' = centre-relative, standard
// cross-stitch convention; 'page' = 1-based from top-left).
const posReadout = document.getElementById('posReadout');
export function updatePosReadout(i){
  if (i==null || i<0){ posReadout.textContent = ''; return; }
  const r = rowOf(i), c = colOf(i);
  if (state.settings.origin === 'centre'){
    const half = Math.floor(N/2);
    const dc = c-half, dr = r-half;
    const sgn = (n)=> n>0 ? '+'+n : String(n);
    posReadout.textContent = `col ${sgn(dc)}, row ${sgn(dr)}`;
  } else {
    posReadout.textContent = `col ${c+1}, row ${r+1}`;
  }
}
let centreOnStartPending = false; // set by the chip click; consumed once the route is ready
setOnRouteReady((v, route)=>{
  if (state.selected!==v) return;
  if (centreOnStartPending && route && route.start!=null){
    centreOnStartPending = false;
    centreOnCell(route.start);
    blockIdx = 0; // block order is anchored at the start, so restart the walk
  }
  refreshUI();
});

function refreshRoutePanel(){
  const v = state.selected;
  if (v==null){
    routeStatus.textContent = 'select a colour to plan a route';
    routeDetailsBtn.disabled = true;
    routeDetails.classList.remove('show');
    return;
  }
  const route = getRoute(v);
  if (!route){
    // route was invalidated (mark/unmark/undo/bulk/tie-off) — re-plan it so
    // "planning…" is always a transient state, never a dead end
    if (getPlanningColour() !== v) requestRoute(v);
    routeStatus.textContent = 'planning…';
    routeDetailsBtn.disabled = true;
    routeDetails.classList.remove('show');
    return;
  }
  const carries = route.hops.filter(h=>h.kind==='carry').length;
  const tieoffs = route.hops.filter(h=>h.kind==='tieoff').length;
  routeStatus.innerHTML =
    `<span class="rp-item">${route.legs.length}<small>legs</small></span>` +
    `<span class="rp-item">${carries}<small>carries</small></span>` +
    `<span class="rp-item">${tieoffs}<small>tie-offs</small></span>` +
    `<span class="rp-item">${route.lengths.length}<small>lengths</small></span>`;
  routeDetailsBtn.disabled = false;
  renderRouteDetails(route);
}

/* ---------- route details: carry audit (6.7) + anchor suggestions (6.5) ---------- */
const routeDetailsBtn = document.getElementById('routeDetailsBtn');
const routeDetails = document.getElementById('routeDetails');
const carryAuditEl = document.getElementById('carryAudit');
const anchorListEl = document.getElementById('anchorList');
routeDetailsBtn.addEventListener('click', ()=>{
  const shown = routeDetails.classList.toggle('show');
  routeDetailsBtn.setAttribute('aria-pressed', String(shown));
});

// Cap on rendered anchor-suggestion rows: some colours have 200+ confetti
// clusters and building that many DOM nodes every route refresh is wasted
// work on a phone when only the head of the route is usually of interest.
const ANCHOR_LIST_CAP = 50;

function renderRouteDetails(route){
  // carry audit (6.7): hops that exceed maxCarry or trip the dark-carry
  // guard, each with distance + reason and a tap-to-jump action.
  const flagged = route.hops.filter(h => h.dist > state.settings.maxCarry || h.dark);
  if (!flagged.length){
    carryAuditEl.innerHTML = '<li class="rd-empty">Route is clean — no over-length or dark carries.</li>';
  } else {
    carryAuditEl.innerHTML = '';
    flagged.forEach((h,i)=>{
      const reasons = [];
      if (h.dist > state.settings.maxCarry) reasons.push('exceeds max carry ('+h.dist+' > '+state.settings.maxCarry+')');
      if (h.dark) reasons.push('dark thread over bare fabric');
      const li = document.createElement('li');
      li.className = 'hop-flag';
      li.innerHTML = `<span>${reasons.join(', ')}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = 'Jump';
      btn.addEventListener('click', ()=>{
        const b = blockOf(h.from);
        gotoBlock(b.br, b.bc);
      });
      li.appendChild(btn);
      carryAuditEl.appendChild(li);
    });
  }
  // per-cluster anchor suggestions (6.5)
  anchorListEl.innerHTML = '';
  const legs = route.legs.slice(0, ANCHOR_LIST_CAP);
  legs.forEach((leg, i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>Leg ${i+1} (${leg.size} cell${leg.size===1?'':'s'})</span><span>${leg.anchor || '—'}</span>`;
    anchorListEl.appendChild(li);
  });
  if (route.legs.length > ANCHOR_LIST_CAP){
    const li = document.createElement('li');
    li.className = 'rd-empty';
    li.textContent = `+${route.legs.length - ANCHOR_LIST_CAP} more legs not shown`;
    anchorListEl.appendChild(li);
  }
}

/* ---------- block navigation (4.4) ---------- */
const prevBlockBtn = document.getElementById('prevBlock');
const nextBlockBtn = document.getElementById('nextBlock');
const blockLabel = document.getElementById('blockLabel');
let blockIdx = 0;
export function getBlockIdx(){ return blockIdx; }
export function setBlockIdx(i){ blockIdx = i; refreshBlockNav(); }
function refreshBlockNav(){
  const v = state.selected;
  if (v==null){
    prevBlockBtn.disabled = true; nextBlockBtn.disabled = true;
    blockLabel.textContent = '';
    return;
  }
  const list = blockOrderList(v);
  if (blockIdx >= list.length) blockIdx = Math.max(0, list.length-1);
  prevBlockBtn.disabled = list.length===0 || blockIdx<=0;
  nextBlockBtn.disabled = list.length===0 || blockIdx>=list.length-1;
  blockLabel.textContent = list.length ? `Block ${blockIdx+1} / ${list.length}` : 'no blocks left';
}
prevBlockBtn.addEventListener('click', ()=>{
  const v = state.selected; if (v==null) return;
  const list = blockOrderList(v);
  if (blockIdx<=0) return;
  blockIdx--; const b=list[blockIdx]; if (b) gotoBlock(b.br,b.bc);
  refreshBlockNav();
});
nextBlockBtn.addEventListener('click', ()=>{
  const v = state.selected; if (v==null) return;
  const list = blockOrderList(v);
  if (blockIdx>=list.length-1) return;
  blockIdx++; const b=list[blockIdx]; if (b) gotoBlock(b.br,b.bc);
  refreshBlockNav();
});

/* ---------- block size (toolbar cycle + settings select) ---------- */
const blockSizeBtn = document.getElementById('blockSizeBtn');
const setBlockSize = document.getElementById('setBlockSize');
function refreshBlockSizeUI(){
  const B = blockSize();
  blockSizeBtn.textContent = `${B}×${B}`;
  const lbl = `Block size ${B}×${B} (tap to cycle)`;
  blockSizeBtn.title = lbl; blockSizeBtn.setAttribute('aria-label', lbl);
  setBlockSize.value = String(B);
}
/** applyBlockSize(sz) - change the navigation block size, keeping the block
 *  under the view centre as the current block and re-framing it. */
export function applyBlockSize(sz){
  if (!BLOCK_SIZES.includes(sz) || sz===blockSize()) { refreshBlockSizeUI(); return; }
  state.settings.blockSize = sz;
  markDirty();
  refreshBlockSizeUI();
  const cur = blockAtViewCentre();
  if (state.selected!=null){
    const list = blockOrderList(state.selected);
    const ni = list.findIndex(b=>b.br===cur.br && b.bc===cur.bc);
    blockIdx = ni>=0 ? ni : 0;
    const b = list[blockIdx] || cur;
    gotoBlock(b.br, b.bc);
  } else {
    gotoBlock(cur.br, cur.bc);
  }
  refreshUI(); draw();
}
blockSizeBtn.addEventListener('click', ()=>{
  const i = BLOCK_SIZES.indexOf(blockSize());
  applyBlockSize(BLOCK_SIZES[(i+1) % BLOCK_SIZES.length]);
});
setBlockSize.addEventListener('change', ()=> applyBlockSize(+setBlockSize.value));

/* ---------- confetti heatmap toggle (6.4) - view toggle, not persisted ---------- */
const heatmapBtn = document.getElementById('heatmapBtn');
heatmapBtn.addEventListener('click', ()=>{
  setConfettiHeatOn(!confettiHeatOn);
  heatmapBtn.classList.toggle('on', confettiHeatOn);
  heatmapBtn.setAttribute('aria-pressed', String(confettiHeatOn));
  draw();
});

/* ---------- settings sheet (6.2) ---------- */
// Keys that feed the route/cost calculators: changing any of these
// invalidates every cached route and, if a colour is selected, requests a
// fresh one (6.3). The remaining settings (railroading, topLegDirection,
// blockOrder) only affect drawing/labels or blockOrderList, so they just
// redraw + refresh.
// initialised lazily (fillSettingsForm) — state.js imports this module, so
// `state` is not safe to read at module-evaluation time
let prevBlockOrder = null;
const ROUTE_AFFECTING_KEYS = new Set([
  'maxCarry', 'threadLength', 'fabricCount', 'strands',
  'origin', 'darkCarryGuard', 'confettiFirst', 'backfillFirst',
]);

function applySettingChange(key){
  markDirty();
  if (key==='blockOrder' && state.selected!=null){
    // keep the block currently in view, but re-index it into the new order so
    // prev/next walk the newly chosen sequence from here
    const oldList = blockOrderList(state.selected, prevBlockOrder || state.settings.blockOrder);
    const cur = oldList[blockIdx];
    const newList = blockOrderList(state.selected);
    const ni = cur ? newList.findIndex(b=>b.br===cur.br && b.bc===cur.bc) : -1;
    blockIdx = ni>=0 ? ni : 0;
    const b = newList[blockIdx]; if (b) gotoBlock(b.br, b.bc);
  }
  prevBlockOrder = state.settings.blockOrder;
  if (ROUTE_AFFECTING_KEYS.has(key)){
    invalidateAllRoutes();
    if (state.selected!=null) requestRoute(state.selected);
  }
  refreshUI();
  draw();
}

const settingsSheet = document.getElementById('settingsSheet');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const setFabricCount = document.getElementById('setFabricCount');
const setStrands = document.getElementById('setStrands');
const setMaxCarry = document.getElementById('setMaxCarry');
const setThreadLength = document.getElementById('setThreadLength');
const setRailroading = document.getElementById('setRailroading');
const setDarkCarryGuard = document.getElementById('setDarkCarryGuard');
const setConfettiFirst = document.getElementById('setConfettiFirst');
const setBackfillFirst = document.getElementById('setBackfillFirst');
const setTopLegDirection = document.getElementById('setTopLegDirection');
const setBlockOrder = document.getElementById('setBlockOrder');
const setOrigin = document.getElementById('setOrigin');
const conservativeCarryBtn = document.getElementById('conservativeCarryBtn');

function fillSettingsForm(){
  const s = state.settings;
  prevBlockOrder = s.blockOrder; // settings may have been loaded from storage after module init
  setFabricCount.value = s.fabricCount;
  setStrands.value = s.strands;
  setMaxCarry.value = s.maxCarry;
  setThreadLength.value = s.threadLength;
  setRailroading.checked = s.railroading;
  setDarkCarryGuard.checked = s.darkCarryGuard;
  setConfettiFirst.checked = s.confettiFirst;
  setBackfillFirst.checked = s.backfillFirst;
  setTopLegDirection.value = s.topLegDirection;
  setBlockOrder.value = s.blockOrder;
  setOrigin.value = s.origin;
  refreshBlockSizeUI();
}
settingsBtn.addEventListener('click', ()=>{ fillSettingsForm(); settingsSheet.classList.add('show'); });
closeSettingsBtn.addEventListener('click', ()=> settingsSheet.classList.remove('show'));

setFabricCount.addEventListener('change', ()=>{ state.settings.fabricCount = Math.max(1, +setFabricCount.value||14); applySettingChange('fabricCount'); });
setStrands.addEventListener('change', ()=>{ state.settings.strands = Math.max(1, +setStrands.value||2); applySettingChange('strands'); });
setMaxCarry.addEventListener('change', ()=>{ state.settings.maxCarry = Math.max(1, +setMaxCarry.value||5); applySettingChange('maxCarry'); });
setThreadLength.addEventListener('change', ()=>{ state.settings.threadLength = Math.max(1, +setThreadLength.value||18); applySettingChange('threadLength'); });
setRailroading.addEventListener('change', ()=>{ state.settings.railroading = setRailroading.checked; applySettingChange('railroading'); });
setDarkCarryGuard.addEventListener('change', ()=>{ state.settings.darkCarryGuard = setDarkCarryGuard.checked; applySettingChange('darkCarryGuard'); });
setConfettiFirst.addEventListener('change', ()=>{ state.settings.confettiFirst = setConfettiFirst.checked; applySettingChange('confettiFirst'); });
setBackfillFirst.addEventListener('change', ()=>{ state.settings.backfillFirst = setBackfillFirst.checked; applySettingChange('backfillFirst'); });
setTopLegDirection.addEventListener('change', ()=>{ state.settings.topLegDirection = setTopLegDirection.value; applySettingChange('topLegDirection'); });
setBlockOrder.addEventListener('change', ()=>{ state.settings.blockOrder = setBlockOrder.value; applySettingChange('blockOrder'); });
setOrigin.addEventListener('change', ()=>{ state.settings.origin = setOrigin.value; applySettingChange('origin'); });
conservativeCarryBtn.addEventListener('click', ()=>{
  state.settings.maxCarry = 3;
  setMaxCarry.value = 3;
  applySettingChange('maxCarry');
});

/* ---------- stats panel (6.9) ---------- */
const statsSheet = document.getElementById('statsSheet');
const statsBtn = document.getElementById('statsBtn');
const closeStatsBtn = document.getElementById('closeStatsBtn');
const statsBody = document.getElementById('statsBody');

function fmtPct(done, total){ return total>0 ? Math.round(done/total*100)+'%' : '—'; }

function refreshStatsPanel(){
  const doneCount = state.stitchedCount.reduce((s,n)=>s+n,0);
  const designTotal = totalStitches();
  const remaining = designTotal - doneCount;
  const rate = stitchesPerHour(state.journey); // null when not enough data
  const finish = estimatedFinish(remaining, rate, state.settings.railroading);
  const perLength = stitchesPerLength();

  let html = '';
  html += `<div class="stat-group"><h3>Overall</h3>`;
  html += `<div class="stat-row"><span>Stitched</span><span>${doneCount.toLocaleString()} / ${designTotal.toLocaleString()} (${fmtPct(doneCount,designTotal)})</span></div>`;
  if (designTotal !== TOTAL){
    html += `<div class="stat-row"><span>Omitted from design</span><span>${(TOTAL-designTotal).toLocaleString()} of ${TOTAL.toLocaleString()}</span></div>`;
  }
  const missedTotal = countFlagged(isMissed, null);
  if (missedTotal) html += `<div class="stat-row"><span>Missed (to backfill)</span><span>${missedTotal.toLocaleString()}</span></div>`;
  html += `<div class="stat-row"><span>Rate</span><span>${rate!=null ? Math.round(rate)+' stitches/hr (estimate)' : 'not enough data'}</span></div>`;
  html += `<div class="stat-row"><span>Est. finish</span><span>${finish ? finish.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})+' (estimate)' : 'unavailable'}</span></div>`;
  html += `</div>`;

  html += `<div class="stat-group"><h3>Per colour</h3>`;
  COLORS.forEach((c,i)=>{
    const v = i+1;
    const total = colourTotal(v);
    const done = state.stitchedCount[v];
    const rem = total - done;
    const lengthsRemaining = Math.ceil(rem / perLength);
    const skeins = skeinsForLengths(lengthsRemaining);
    html += `<div class="stat-row"><span>DMC ${c[0]} · ${c[1]}</span>` +
      `<span>${done}/${total} (${fmtPct(done,total)})<small>${lengthsRemaining} length${lengthsRemaining===1?'':'s'} left · ${skeins.toFixed(1)} skeins (est.)` +
      `${state.omittedCount[v] ? ` · ${state.omittedCount[v]} omitted` : ''}</small></span></div>`;
  });
  html += `</div>`;
  statsBody.innerHTML = html;
}
statsBtn.addEventListener('click', ()=>{ refreshStatsPanel(); statsSheet.classList.add('show'); });
closeStatsBtn.addEventListener('click', ()=> statsSheet.classList.remove('show'));


/* ---------- missed / omitted stitches (backfill vs excise) ---------- */
// Two corrections for work you skipped by accident:
//   backfill - flag the cells missed; they stay in the design and the
//              planner routes to them first (planner.orderClusters).
//   omit     - excise the cells; they leave routes, counts and totals.
// Selection is either a row/column range (the "I missed two whole rows"
// case) or painted on the grid (input.js owns that gesture and reads
// #missedAction for the action to apply).

const missedSheet = document.getElementById('missedSheet');
const missedBtn = document.getElementById('missedBtn');
const closeMissedBtn = document.getElementById('closeMissedBtn');
const missedAction = document.getElementById('missedAction');
const missedScope = document.getElementById('missedScope');
const missedRow0 = document.getElementById('missedRow0');
const missedRow1 = document.getElementById('missedRow1');
const missedCol0 = document.getElementById('missedCol0');
const missedCol1 = document.getElementById('missedCol1');
const missedPreview = document.getElementById('missedPreview');
const missedApplyBtn = document.getElementById('missedApplyBtn');
const missedSummary = document.getElementById('missedSummary');
const missedRestoreBtn = document.getElementById('missedRestoreBtn');

/** countFlagged(pred, v) - cells matching a flag predicate, for colour v
 *  (or every colour when v is null). */
function countFlagged(pred, v){
  let n = 0;
  for (let i=0;i<CELL_COUNT;i++){
    if (!pred(i)) continue;
    const c = colourAt(i);
    if (c!==0 && (v==null || c===v)) n++;
  }
  return n;
}

// Row/column numbers are entered in the same frame the position readout
// uses (settings.origin): centre-relative offsets, or 1-based from the
// top-left. toGrid/fromGrid convert between that and raw 0..149 indices.
function toGrid(n){ return state.settings.origin==='centre' ? n + Math.floor(N/2) : n - 1; }
function fromGrid(g){ return state.settings.origin==='centre' ? g - Math.floor(N/2) : g + 1; }
function frameLabel(){ return state.settings.origin==='centre' ? 'centre-relative' : '1-based from top-left'; }

/** rangeCells() - {cells, r0, r1, c0, c1} for the form's current range, or
 *  null when the row range is empty/invalid. Column bounds are optional. */
function rangeCells(){
  const raw = [missedRow0.value, missedRow1.value];
  if (raw[0]==='' && raw[1]==='') return null;
  const a = raw[0]==='' ? raw[1] : raw[0];
  const b = raw[1]==='' ? raw[0] : raw[1];
  let r0 = toGrid(Math.round(+a)), r1 = toGrid(Math.round(+b));
  if (!Number.isFinite(r0) || !Number.isFinite(r1)) return null;
  if (r0 > r1) [r0, r1] = [r1, r0];
  r0 = Math.max(0, r0); r1 = Math.min(N-1, r1);
  if (r1 < r0) return null;
  let c0 = missedCol0.value==='' ? 0 : toGrid(Math.round(+missedCol0.value));
  let c1 = missedCol1.value==='' ? N-1 : toGrid(Math.round(+missedCol1.value));
  if (c0 > c1) [c0, c1] = [c1, c0];
  c0 = Math.max(0, c0); c1 = Math.min(N-1, c1);
  if (c1 < c0) return null;
  const v = missedScope.value==='colour' ? state.selected : null;
  const cells = [];
  for (let r=r0; r<=r1; r++){
    for (let c=c0; c<=c1; c++){
      const i = idxOf(r,c);
      const cv = colourAt(i);
      if (cv===0) continue;
      if (v!=null && cv!==v) continue;
      cells.push(i);
    }
  }
  return { cells, r0, r1, c0, c1 };
}

/**
 * applyAdjustment(cells, action) - flag cells as missed or omitted, logging
 * a per-cell snapshot of their previous state so undo restores it exactly.
 */
function applyAdjustment(cells, action){
  const changed = [], prev = [];
  for (const i of cells){
    const wasM = isMissed(i), wasO = isOmitted(i), wasS = isStitched(i);
    if (action==='missed' ? wasM : wasO) continue;   // already in that state
    changed.push(i);
    prev.push({m: wasM, o: wasO, s: wasS});
    if (action==='missed') setMissed(i, true); else setOmitted(i, true);
  }
  if (!changed.length) return 0;
  const colours = new Set(changed.map(colourAt));
  logEvent({kind: action, c: colours.size===1 ? [...colours][0] : 0, cells: changed, prev});
  colours.forEach(v => { invalidateRoute(v); });
  if (state.selected!=null) requestRoute(state.selected);
  markDirty();
  refreshUI(); draw();
  return changed.length;
}

function refreshMissedSheet(){
  if (!missedSheet.classList.contains('show')) return;
  missedScope.disabled = false;
  if (state.selected==null && missedScope.value==='colour') missedScope.value = 'all';
  const range = rangeCells();
  const action = missedAction.value;
  if (!range){
    missedPreview.textContent = `Enter a row range (${frameLabel()}). Column bounds are optional — leave them blank for whole rows.`;
    missedApplyBtn.disabled = true;
  } else {
    const already = range.cells.filter(i => action==='missed' ? isMissed(i) : isOmitted(i)).length;
    const n = range.cells.length - already;
    const rows = range.r0===range.r1 ? `row ${fromGrid(range.r0)}` : `rows ${fromGrid(range.r0)}–${fromGrid(range.r1)}`;
    const scope = missedScope.value==='colour' && state.selected!=null
      ? `DMC ${COLORS[state.selected-1][0]}` : 'all colours';
    missedPreview.textContent = n
      ? `${n} stitch${n===1?'':'es'} in ${rows} (${scope}) will be ${action==='missed' ? 'flagged to backfill' : 'dropped from the design'}.`
      : `Nothing left to change in ${rows} (${scope}).`;
    missedApplyBtn.disabled = n===0;
    missedApplyBtn.textContent = action==='missed'
      ? `Flag ${n||''} as missed`.replace('  ',' ')
      : `Omit ${n||''} from the design`.replace('  ',' ');
  }
  const m = countFlagged(isMissed, null), o = countFlagged(isOmitted, null);
  missedSummary.innerHTML = (m||o)
    ? `<div class="stat-row"><span>Flagged to backfill</span><span>${m}</span></div>` +
      `<div class="stat-row"><span>Omitted from design</span><span>${o}</span></div>`
    : '<div class="sheet-note">No adjustments yet.</div>';
  missedRestoreBtn.disabled = !(m||o);
}

missedBtn.addEventListener('click', ()=>{
  // while a paint stroke mode is armed (input.js), the button is a stop
  if (missedBtn.dataset.painting==='1'){
    missedBtn.dispatchEvent(new CustomEvent('missed:stop'));
    return;
  }
  if (state.selected==null) missedScope.value = 'all';
  missedSheet.classList.add('show');
  refreshMissedSheet();
});
closeMissedBtn.addEventListener('click', ()=> missedSheet.classList.remove('show'));
[missedAction, missedScope].forEach(el => el.addEventListener('change', refreshMissedSheet));
[missedRow0, missedRow1, missedCol0, missedCol1].forEach(el => el.addEventListener('input', refreshMissedSheet));

missedApplyBtn.addEventListener('click', ()=>{
  const range = rangeCells();
  if (!range) return;
  const action = missedAction.value;
  const n = applyAdjustment(range.cells, action);
  missedSheet.classList.remove('show');
  celebrateBulk(n
    ? (action==='missed' ? `${n} flagged to backfill — route re-planned` : `${n} dropped from the design`)
    : 'Nothing to change');
});

missedRestoreBtn.addEventListener('click', ()=>{
  if (!confirm('Clear every missed/omitted flag and restore the full design?')) return;
  const cells = [], prev = [];
  for (let i=0;i<CELL_COUNT;i++){
    if (!isMissed(i) && !isOmitted(i)) continue;
    cells.push(i);
    prev.push({m: isMissed(i), o: isOmitted(i), s: false});
    setMissed(i, false); setOmitted(i, false);
  }
  if (cells.length) logEvent({kind:'missed', c:0, cells, prev});
  invalidateAllRoutes();
  if (state.selected!=null) requestRoute(state.selected);
  markDirty();
  refreshUI(); draw();
  celebrateBulk(`Restored ${cells.length} stitch${cells.length===1?'':'es'}`);
});
