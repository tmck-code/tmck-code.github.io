// ui.js - legend chip construction, refreshUI(), #markAllBtn handler,
// #resetBtn wiring.

import { COLORS, TOTAL, CELL_COUNT, N } from './pattern.js';
import { state, colourAt, isStitched, isColourComplete, setStitched, logEvent, undoLast, rowOf, colOf } from './state.js';
import { draw, drawMiniMap, setConfettiHeatOn, confettiHeatOn } from './render.js';
import { resetProgress, markDirty } from './persistence.js';
import { getRoute, requestRoute, getPlanningColour, setOnRouteReady, invalidateAllRoutes, stitchesPerLength } from './planner.js';
import { blockOrderList, gotoBlock, blockOf, centreOnCell } from './blocks.js';
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
    if (colourAt(i)===v && isStitched(i)!==on) cellsToToggle.push(i);
  }
  cellsToToggle.forEach(i=>setStitched(i, on));
  logEvent({kind:'bulk', c:v, cells:cellsToToggle, unmark: !on});
  if (on && isColourComplete(v)) celebrateBulk('Colour finished!');
  refreshUI(); draw();
});
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
    const done = state.stitchedCount[idx], complete = isColourComplete(idx);
    chip.classList.toggle('sel', state.selected===idx);
    chip.classList.toggle('faded', state.selected!=null && state.selected!==idx);
    chip.classList.toggle('done', complete);
    chip.setAttribute('aria-pressed', String(state.selected===idx));
    chip.querySelector('.cnt').textContent = `${done}/${c[3]}`;
    chip.setAttribute('aria-label',
      `DMC ${c[0]} ${c[1]}, ${done} of ${c[3]} stitches${complete?', complete':''}`);
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
  const pct = Math.round(doneCount/TOTAL*100);
  document.getElementById('pctNum').textContent = pct;
  document.getElementById('pctDetail').textContent =
    doneCount.toLocaleString()+' / '+TOTAL.toLocaleString()+' stitches';
  document.getElementById('barFill').style.width = pct+'%';

  markToggle.disabled = state.selected==null;
  undoBtn.disabled = state.journey.length===0;
  readout.hidden = state.selected==null;
  readout.textContent = state.selected==null
    ? ''
    : `DMC ${COLORS[state.selected-1][0]} · ${state.stitchedCount[state.selected]} / ${COLORS[state.selected-1][3]}`;

  setStartBtn.disabled = state.selected==null;
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
    `<span class="rp-item">${route.legs.length}<small>clusters</small></span>` +
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
    li.innerHTML = `<span>Cluster ${i+1} (${leg.size} cell${leg.size===1?'':'s'})</span><span>${leg.anchor || '—'}</span>`;
    anchorListEl.appendChild(li);
  });
  if (route.legs.length > ANCHOR_LIST_CAP){
    const li = document.createElement('li');
    li.className = 'rd-empty';
    li.textContent = `+${route.legs.length - ANCHOR_LIST_CAP} more clusters not shown`;
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
  'origin', 'darkCarryGuard', 'confettiFirst',
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
  setTopLegDirection.value = s.topLegDirection;
  setBlockOrder.value = s.blockOrder;
  setOrigin.value = s.origin;
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
  const remaining = TOTAL - doneCount;
  const rate = stitchesPerHour(state.journey); // null when not enough data
  const finish = estimatedFinish(remaining, rate, state.settings.railroading);
  const perLength = stitchesPerLength();

  let html = '';
  html += `<div class="stat-group"><h3>Overall</h3>`;
  html += `<div class="stat-row"><span>Stitched</span><span>${doneCount.toLocaleString()} / ${TOTAL.toLocaleString()} (${fmtPct(doneCount,TOTAL)})</span></div>`;
  html += `<div class="stat-row"><span>Rate</span><span>${rate!=null ? Math.round(rate)+' stitches/hr (estimate)' : 'not enough data'}</span></div>`;
  html += `<div class="stat-row"><span>Est. finish</span><span>${finish ? finish.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})+' (estimate)' : 'unavailable'}</span></div>`;
  html += `</div>`;

  html += `<div class="stat-group"><h3>Per colour</h3>`;
  COLORS.forEach((c,i)=>{
    const v = i+1;
    const total = c[3];
    const done = state.stitchedCount[v];
    const rem = total - done;
    const lengthsRemaining = Math.ceil(rem / perLength);
    const skeins = skeinsForLengths(lengthsRemaining);
    html += `<div class="stat-row"><span>DMC ${c[0]} · ${c[1]}</span>` +
      `<span>${done}/${total} (${fmtPct(done,total)})<small>${lengthsRemaining} length${lengthsRemaining===1?'':'s'} left · ${skeins.toFixed(1)} skeins (est.)</small></span></div>`;
  });
  html += `</div>`;
  statsBody.innerHTML = html;
}
statsBtn.addEventListener('click', ()=>{ refreshStatsPanel(); statsSheet.classList.add('show'); });
closeStatsBtn.addEventListener('click', ()=> statsSheet.classList.remove('show'));

