// render.js - canvas setup and drawing: fit(), clampView(), draw(), applyZoom().

import { N, COLORS, cells } from './pattern.js';
import { state, idxOf, rowOf, colOf, isStitched, hasTieOff } from './state.js';
import { getRoute, isDark, confettiScore } from './planner.js';
import { blockCount, blockSize, blockAtViewCentre, blocksForColour, blockIsCompleteForColour, gotoBlock } from './blocks.js';

// 23 hand-picked, mutually non-confusable glyphs, index-parallel to COLORS
// (glyph for colour v is SYMBOLS[v-1]). Kept separate from pattern.js's CH
// because CH intentionally reuses ambiguous chars (0/1/5/I) for compactness;
// these need to be told apart at a glance on a phone screen.
export const SYMBOLS = [
  '●','■','▲','◆','★','✚','✖','◐',
  '◉','⬟','⬢','▼','◇','☆','○','◈',
  '✦','⧫','⬣','⬪','▽','✳','❖',
];

// view-only toggles for group 5 (not persisted; see task notes)
export let symbolsOn = false;
export function setSymbolsOn(on){ symbolsOn = on; }

// 6.4: confetti heatmap overlay is a view toggle, not a persisted setting
// (it doesn't feed any calculator, so it doesn't belong in state.settings).
export let confettiHeatOn = false;
export function setConfettiHeatOn(on){ confettiHeatOn = on; }

/* ---------- canvas ---------- */
export const stage = document.getElementById('stage');
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

// view transform (css px); held as an object so other modules can mutate
// its fields without needing reassignable module bindings.
export const view = { scale:1, tx:0, ty:0, base:1, dpr:1, backView:false, pivotCol:null };
// pivotCol: grid column pinned by long-press; flip mirrors about it (null = viewport centre)

// client (px) -> cell index, through the current view transform + stage
// bounding rect; -1 when outside the grid. Accounts for view.backView
// (group 5's mirror) by inverting the column.
export function cellAtClient(x, y){
  const rect = stage.getBoundingClientRect();
  const s = view.base*view.scale;
  const lx = x-rect.left-view.tx, ly = y-rect.top-view.ty;
  let c = Math.floor(lx/s), r = Math.floor(ly/s);
  if (view.backView) c = N-1-c;
  if (r<0||r>=N||c<0||c>=N) return -1;
  return r*N+c;
}

export function fit(){
  view.dpr = window.devicePixelRatio||1;
  const w = stage.clientWidth, h = stage.clientHeight;
  cv.width = w*view.dpr; cv.height = h*view.dpr;
  view.base = Math.min(w,h)*0.96/N;      // css px per cell at scale 1
  clampView(); draw();
}
export function clampView(){
  view.scale = Math.min(Math.max(view.scale,1),16);
  const w=stage.clientWidth,h=stage.clientHeight,sz=N*view.base*view.scale;
  // reserve the ruler strips (top + left chrome) so row/col 0 stay visible
  const cx=RULER+(w-RULER-sz)/2, cy=RULER+(h-RULER-sz)/2;
  const minX=Math.min(cx, w-sz), maxX=Math.max(cx, RULER);
  const minY=Math.min(cy, h-sz), maxY=Math.max(cy, RULER);
  view.tx=Math.min(Math.max(view.tx,minX),maxX);
  view.ty=Math.min(Math.max(view.ty,minY),maxY);
}
export function draw(){
  const w=stage.clientWidth,h=stage.clientHeight;
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const s=view.base*view.scale;
  ctx.translate(view.tx,view.ty);
  // fabric backdrop
  ctx.fillStyle='#14113f';
  ctx.fillRect(0,0,N*s,N*s);
  const back = view.backView;
  // visible range — cell-space columns are mirrored in back view (drawn
  // inside the translate(N*s,0)+scale(-1,1) block below), so the
  // screen->column mapping flips: screenX = tx + N*s - c*s, not tx + c*s.
  const c0 = back
    ? Math.max(0,Math.floor((view.tx+N*s-w)/s))
    : Math.max(0,Math.floor(-view.tx/s));
  const c1 = back
    ? Math.min(N,Math.ceil((view.tx+N*s)/s))
    : Math.min(N,Math.ceil((w-view.tx)/s));
  const r0=Math.max(0,Math.floor(-view.ty/s)), r1=Math.min(N,Math.ceil((h-view.ty)/s));
  const detail = s>=7;               // draw crosses when zoomed
  const topDir = state.settings.topLegDirection;   // '/' or '\\'
  const showSymbols = symbolsOn && s>=11;
  const textQueue = [];              // {x,y,text,dark} — drawn un-mirrored after restore
  let startTag = null;               // {x,y} grid-space anchor for the START label

  // ---- mirrored region: cells, tie-off knots + buried-tail shading, carry hops ----
  ctx.save();
  if (back){ ctx.translate(N*s,0); ctx.scale(-1,1); }

  // layer: cells (dim/full by per-cell F_STITCHED)
  for(let r=r0;r<r1;r++){
    const row=cells[r];
    for(let c=c0;c<c1;c++){
      const v=row[c]; if(!v) continue;
      const dim = state.selected!=null && v!==state.selected;
      const i = idxOf(r,c);
      const stitched = isStitched(i);
      const inSel = state.selected!=null && v===state.selected;
      const col = COLORS[v-1][2];
      const x=c*s, y=r*s;
      ctx.globalAlpha = dim ? 0.10 : (inSel && !stitched ? 0.55 : 1);
      if (detail && stitched && !dim){
        // stitched: render as an X; the leg drawn second (on top) follows
        // settings.topLegDirection: '/' = bottom-left->top-right on top.
        ctx.strokeStyle=col;
        ctx.lineWidth=Math.max(1.4,s*0.24);
        ctx.lineCap='round';
        const p=s*0.18;
        const slash    = [[x+s-p,y+p],[x+p,y+s-p]]; // '/'  (BL-TR)
        const backslash= [[x+p,y+p],[x+s-p,y+s-p]]; // '\'  (TL-BR)
        const under  = topDir==='/' ? backslash : slash;
        const over   = topDir==='/' ? slash : backslash;
        ctx.beginPath();
        ctx.moveTo(under[0][0],under[0][1]); ctx.lineTo(under[1][0],under[1][1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(over[0][0],over[0][1]); ctx.lineTo(over[1][0],over[1][1]);
        ctx.stroke();
      } else {
        ctx.fillStyle=col;
        ctx.fillRect(x,y,s-(detail?0.6:0),s-(detail?0.6:0));
        if (stitched && !dim){
          ctx.globalAlpha=0.35;
          ctx.fillStyle='#000';
          ctx.fillRect(x,y,s,s);
        }
      }
      if (showSymbols && !dim){
        const cx=x+s/2, cy=y+s/2;
        textQueue.push({cx,cy,text:SYMBOLS[v-1],dark:isDark(col)});
      }
    }
  }
  ctx.globalAlpha=1;

  // layer: pinned pivot column (flip mirrors about it) — drawn inside the
  // mirrored region so it lands on the same grid column in either view
  if (view.pivotCol!=null){
    ctx.fillStyle='rgba(98,216,182,0.18)';
    ctx.fillRect(view.pivotCol*s, 0, s, N*s);
    ctx.strokeStyle='rgba(98,216,182,0.7)'; ctx.lineWidth=Math.max(1,s*0.06);
    ctx.strokeRect(view.pivotCol*s, 0, s, N*s);
  }

  // layer: confetti heatmap overlay (6.4) — shades the *selected* colour's
  // cells by their cluster's isolation score (planner.confettiScore, cached
  // per colour and invalidated alongside routes, so this is a cheap map
  // lookup per visible cell rather than a recluster every frame). Gated on
  // its own view toggle, independent of the persisted settings.
  if (confettiHeatOn && state.selected!=null){
    const scores = confettiScore(state.selected);
    for(let r=r0;r<r1;r++){
      for(let c=c0;c<c1;c++){
        const i = idxOf(r,c);
        const score = scores.get(i);
        if (score==null) continue;
        const x=c*s, y=r*s;
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(255,90,90,${(0.25+score*0.55).toFixed(2)})`;
        ctx.fillRect(x,y,s,s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // layer: route path + hop markers (3.12). Front-view only — back-view carry
  // hops are already drawn by the next layer below, and drawing both would
  // double up the same segments; tie-off hop markers here are subdued dots
  // distinct from the prominent tie-off knot layer further down (that layer
  // draws the actual stitched knot; this one marks the *route's* handling of
  // a tie-off as a routing decision, e.g. before any stitching has happened).
  if (!back && state.selected!=null){
    const route = getRoute(state.selected);
    if (route){
      // ordered path within each leg: polyline through leg cell centres
      ctx.strokeStyle='rgba(253,233,73,0.55)';
      ctx.lineWidth=Math.max(1,s*0.06);
      ctx.lineCap='round'; ctx.lineJoin='round';
      for (const leg of route.legs){
        if (leg.cells.length<2) continue;
        ctx.beginPath();
        leg.cells.forEach((idx,k)=>{
          const px=colOf(idx)*s+s/2, py=rowOf(idx)*s+s/2;
          if (k===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        });
        ctx.stroke();
      }
      // hop lines: exit of one cluster -> entry of the next, so the visit
      // order (which settings like confetti-first reorder) is visible
      ctx.lineWidth=Math.max(0.8,s*0.04);
      ctx.setLineDash([s*0.2, s*0.15]);
      for (const hop of route.hops){
        const fx=colOf(hop.from)*s+s/2, fy=rowOf(hop.from)*s+s/2;
        const tx=colOf(hop.to)*s+s/2, ty=rowOf(hop.to)*s+s/2;
        ctx.strokeStyle = hop.kind==='carry' ? 'rgba(244,241,255,0.35)' : 'rgba(253,233,73,0.3)';
        ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(tx,ty); ctx.stroke();
      }
      ctx.setLineDash([]);
      // hop markers: carry vs tie-off, distinct colour/shape
      for (const hop of route.hops){
        const tx=colOf(hop.to)*s+s/2, ty=rowOf(hop.to)*s+s/2;
        if (hop.kind==='carry'){
          ctx.fillStyle='rgba(244,241,255,0.65)';
          ctx.beginPath(); ctx.arc(tx,ty,Math.max(1.2,s*0.09),0,Math.PI*2); ctx.fill();
        } else {
          ctx.strokeStyle='rgba(253,233,73,0.85)';
          ctx.lineWidth=Math.max(1,s*0.05);
          const r=Math.max(1.5,s*0.14);
          ctx.beginPath();
          ctx.moveTo(tx-r,ty-r); ctx.lineTo(tx+r,ty+r);
          ctx.moveTo(tx-r,ty+r); ctx.lineTo(tx+r,ty-r);
          ctx.stroke();
        }
      }
      // thread-length boundary markers
      ctx.fillStyle='rgba(98,216,182,0.9)';
      for (const len of route.lengths){
        const px=colOf(len.to)*s+s/2, py=rowOf(len.to)*s+s/2;
        ctx.beginPath(); ctx.moveTo(px,py-s*0.22); ctx.lineTo(px+s*0.18,py); ctx.lineTo(px,py+s*0.22); ctx.lineTo(px-s*0.18,py);
        ctx.closePath(); ctx.fill();
      }
      // highlighted start point: soft halo + bold ring so it reads at any
      // zoom, plus a "START" tag (queued so it isn't mirrored / clipped)
      const sx=colOf(route.start)*s+s/2, sy=rowOf(route.start)*s+s/2;
      const rr=Math.max(6,s*0.6);
      ctx.fillStyle='rgba(253,233,73,0.22)';
      ctx.beginPath(); ctx.arc(sx,sy,rr*1.9,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#0d0b2c'; ctx.lineWidth=Math.max(4,s*0.22);
      ctx.beginPath(); ctx.arc(sx,sy,rr,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='#fde949'; ctx.lineWidth=Math.max(2,s*0.12);
      ctx.beginPath(); ctx.arc(sx,sy,rr,0,Math.PI*2); ctx.stroke();
      startTag = {x:sx, y:sy-rr*1.9-2};
    }
  }

  // layer: carry hops (back view only) — read the cached route, never plan here
  if (back && state.selected!=null){
    const route = getRoute(state.selected);
    if (route){
      for (const hop of route.hops){
        if (hop.kind!=='carry') continue;
        const fx=colOf(hop.from)*s+s/2, fy=rowOf(hop.from)*s+s/2;
        const tx=colOf(hop.to)*s+s/2, ty=rowOf(hop.to)*s+s/2;
        ctx.strokeStyle = hop.dark ? 'rgba(255,90,90,0.85)' : 'rgba(244,241,255,0.55)';
        ctx.lineWidth = hop.dark ? Math.max(1.2,s*0.08) : Math.max(0.8,s*0.05);
        ctx.setLineDash(hop.dark ? [] : [s*0.15, s*0.1]);
        ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(tx,ty); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // layer: tie-off knots (+ buried-tail zone in back view)
  for(let r=r0;r<r1;r++){
    for(let c=c0;c<c1;c++){
      const i = idxOf(r,c);
      if (!hasTieOff(i)) continue;
      const v = cells[r][c]; if (!v) continue;
      const dim = state.selected!=null && v!==state.selected;
      if (dim) continue;
      const x=c*s, y=r*s, cx=x+s/2, cy=y+s/2;
      if (back){
        // buried-tail zone: 3-5 already-stitched neighbours, shaded faintly
        const neigh=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1]];
        let shaded=0;
        for (const [dr,dc] of neigh){
          if (shaded>=5) break;
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=N||nc<0||nc>=N) continue;
          const ni=idxOf(nr,nc);
          if (!isStitched(ni)) continue;
          ctx.globalAlpha=0.28;
          ctx.fillStyle='#fde949';
          ctx.fillRect(nc*s,nr*s,s,s);
          shaded++;
        }
        ctx.globalAlpha=1;
      }
      // knot marker: prominent in back view, subdued in front view
      ctx.beginPath();
      ctx.arc(cx,cy, s*(back?0.22:0.14), 0, Math.PI*2);
      ctx.fillStyle = back ? '#fde949' : 'rgba(253,233,73,0.55)';
      ctx.fill();
      ctx.strokeStyle = back ? '#14113f' : 'rgba(20,17,63,0.6)';
      ctx.lineWidth = Math.max(0.6,s*0.03);
      ctx.stroke();
    }
  }

  ctx.restore();

  // ---- un-mirrored region: symbol glyphs (text must never be mirrored) ----
  if (showSymbols){
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font = `${Math.round(s*0.55)}px ui-rounded, system-ui, sans-serif`;
    for (const t of textQueue){
      // symbols were queued in un-mirrored (grid) coordinates already, since
      // this block runs after ctx.restore() undid the back-view mirror.
      const cx = back ? N*s - t.cx : t.cx;
      ctx.fillStyle = t.dark ? '#fff' : '#000';
      ctx.fillText(t.text, cx, t.cy);
    }
  }

  // START tag above the route start marker (front view only; drawn here so
  // the text isn't mirrored and sits above the cell layers)
  if (startTag){
    const fs = Math.max(10, Math.min(16, s*0.9));
    ctx.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.lineWidth = 4; ctx.strokeStyle='#0d0b2c'; ctx.lineJoin='round';
    ctx.strokeText('START', startTag.x, startTag.y);
    ctx.fillStyle='#fde949';
    ctx.fillText('START', startTag.x, startTag.y);
  }

  // fine per-cell grid when zoomed close
  if (s>=10){
    ctx.strokeStyle='rgba(244,241,255,0.07)';
    ctx.lineWidth=1;
    ctx.beginPath();
    for(let i=c0;i<=c1;i++){ ctx.moveTo(i*s, r0*s); ctx.lineTo(i*s, r1*s); }
    for(let i=r0;i<=r1;i++){ ctx.moveTo(c0*s, i*s); ctx.lineTo(c1*s, i*s); }
    ctx.stroke();
  }
  // bold 10-square guide lines (cross-stitch convention / block boundaries)
  if (s>=4){
    ctx.strokeStyle='rgba(244,241,255,0.22)';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let i=0;i<=N;i+=10){
      ctx.moveTo(i*s, r0*s); ctx.lineTo(i*s, r1*s);
      ctx.moveTo(c0*s, i*s); ctx.lineTo(c1*s, i*s);
    }
    ctx.stroke();
  }
  // block boundaries when the navigation block size differs from the
  // 10-square convention — dashed so they read as "app blocks", not fabric
  const B = blockSize();
  if (B!==10 && s>=2){
    ctx.strokeStyle='rgba(98,216,182,0.45)';
    ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
    ctx.beginPath();
    for(let i=0;i<=N;i+=B){
      ctx.moveTo(i*s, r0*s); ctx.lineTo(i*s, r1*s);
      ctx.moveTo(c0*s, i*s); ctx.lineTo(c1*s, i*s);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // border
  ctx.strokeStyle='rgba(253,233,73,0.35)';
  ctx.lineWidth=1.5;
  ctx.strokeRect(0,0,N*s,N*s);

  drawRulers(w, h, s, back);

  drawMiniMap();
}

/* ---------- grid axis rulers (global stitch index) ----------
   Screen-space strips along the top and left stage edges with a number every
   10 cells, so stitchers can cross-reference "column 40, row 80" counts.
   Drawn after the grid in identity (screen) coordinates so they never scale
   or pan away. Column labels honour the back-view mirror. */
const RULER = 18; // strip thickness, css px
function drawRulers(w, h, s, back){
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0);
  ctx.fillStyle='rgba(23,20,71,0.85)';
  ctx.fillRect(0,0,w,RULER);          // top strip
  ctx.fillRect(0,RULER,RULER,h-RULER);// left strip
  ctx.fillStyle='#9d97d6';
  ctx.font='11px ui-rounded, system-ui, sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.strokeStyle='rgba(157,151,214,0.6)';
  ctx.lineWidth=1;
  for(let i=0;i<=N;i+=10){
    // columns (top)
    const label = back ? N-i : i;
    const x = view.tx + i*s;
    if (x>=RULER-2 && x<=w+2){
      ctx.beginPath(); ctx.moveTo(x,RULER-5); ctx.lineTo(x,RULER); ctx.stroke();
      if (i>0 && i<N) ctx.fillText(String(label), x, RULER/2);
    }
    // rows (left)
    const y = view.ty + i*s;
    if (y>=RULER-2 && y<=h+2){
      ctx.beginPath(); ctx.moveTo(RULER-5,y); ctx.lineTo(RULER,y); ctx.stroke();
      if (i>0 && i<N) ctx.fillText(String(i), RULER/2, y);
    }
  }
}

/* ---------- mini-map (4.5): block field overlay (blockCount() per axis) ---------- */
const miniCv = document.getElementById('miniMap');
const miniCtx = miniCv ? miniCv.getContext('2d') : null;
export function drawMiniMap(){
  if (!miniCtx) return;
  const w = miniCv.clientWidth||miniCv.width, h = miniCv.clientHeight||miniCv.height;
  const dpr = window.devicePixelRatio||1;
  if (miniCv.width !== Math.round(w*dpr) || miniCv.height !== Math.round(h*dpr)){
    miniCv.width = Math.round(w*dpr); miniCv.height = Math.round(h*dpr);
  }
  miniCtx.setTransform(dpr,0,0,dpr,0,0);
  miniCtx.clearRect(0,0,w,h);
  const BLOCKS = blockCount();
  const cell = Math.min(w,h)/BLOCKS;
  const v = state.selected;
  const withColour = v!=null ? new Set(blocksForColour(v).map(b=>b.br+','+b.bc)) : new Set();
  const s = view.base*view.scale;
  for (let br=0; br<BLOCKS; br++){
    for (let bc=0; bc<BLOCKS; bc++){
      const key = br+','+bc;
      const x=bc*cell, y=br*cell;
      let fill = 'rgba(244,241,255,0.08)';
      if (v!=null && withColour.has(key)){
        fill = blockIsCompleteForColour(br,bc,v) ? 'rgba(98,216,182,0.55)' : 'rgba(253,233,73,0.55)';
      }
      miniCtx.fillStyle = fill;
      miniCtx.fillRect(x+0.5,y+0.5,cell-1,cell-1);
    }
  }
  // current block (from centre of the visible stage in grid coordinates)
  const { br: br0, bc: bc0 } = blockAtViewCentre();
  miniCtx.strokeStyle = '#fde949';
  miniCtx.lineWidth = 1.5;
  miniCtx.strokeRect(bc0*cell+1, br0*cell+1, cell-2, cell-2);
}

if (miniCv){
  miniCv.addEventListener('pointerdown', (e)=>{
    const rect = miniCv.getBoundingClientRect();
    const BLOCKS = blockCount();
    const cell = Math.min(rect.width, rect.height)/BLOCKS;
    const bc = Math.min(BLOCKS-1, Math.max(0, Math.floor((e.clientX-rect.left)/cell)));
    const br = Math.min(BLOCKS-1, Math.max(0, Math.floor((e.clientY-rect.top)/cell)));
    e.stopPropagation();
    gotoBlock(br, bc);
  });
}

export function applyZoom(cx,cy,f){
  const rect=stage.getBoundingClientRect();
  cx-=rect.left; cy-=rect.top;
  const ns=Math.min(Math.max(view.scale*f,1),16);
  const real=ns/view.scale;
  view.tx=cx-(cx-view.tx)*real; view.ty=cy-(cy-view.ty)*real;
  view.scale=ns;
}
