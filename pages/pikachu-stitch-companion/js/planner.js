// planner.js - stitching-order/route planning: clustering, ordering,
// run-walk within-cluster paths, carry/tie-off cost model, thread-length
// segmentation and cached, idle-scheduled route computation.

import { N, COLORS, cells } from './pattern.js';
import { state, idxOf, rowOf, colOf, colourAt, isStitched } from './state.js';
import { draw } from './render.js';

/* ---------------- 3.1 clustering ---------------- */

// Iterative 8-connectivity flood fill over unstitched cells of colour v.
// Explicit stack, no recursion (largest colour cluster ~1.5k cells).
export function clusterColour(v){
  const seen = new Uint8Array(N*N);
  const clusters = [];
  for (let r0=0; r0<N; r0++){
    for (let c0=0; c0<N; c0++){
      if (cells[r0][c0] !== v) continue;
      const start = idxOf(r0,c0);
      if (seen[start]) continue;
      if (isStitched(start)) { seen[start]=1; continue; }
      const stack = [start];
      seen[start] = 1;
      const cellsOut = [];
      let minR=r0, maxR=r0, minC=c0, maxC=c0, sumR=0, sumC=0;
      while (stack.length){
        const i = stack.pop();
        const r = rowOf(i), c = colOf(i);
        cellsOut.push(i);
        sumR += r; sumC += c;
        if (r<minR) minR=r; if (r>maxR) maxR=r;
        if (c<minC) minC=c; if (c>maxC) maxC=c;
        for (let dr=-1; dr<=1; dr++){
          for (let dc=-1; dc<=1; dc++){
            if (dr===0 && dc===0) continue;
            const nr=r+dr, nc=c+dc;
            if (nr<0||nr>=N||nc<0||nc>=N) continue;
            if (cells[nr][nc] !== v) continue;
            const ni = idxOf(nr,nc);
            if (seen[ni]) continue;
            seen[ni] = 1;
            if (isStitched(ni)) continue;
            stack.push(ni);
          }
        }
      }
      clusters.push({
        cells: cellsOut,
        centroid: { r: sumR/cellsOut.length, c: sumC/cellsOut.length },
        bbox: { minR, maxR, minC, maxC },
      });
    }
  }
  return clusters;
}

/* ---------------- 3.2 start-point suggestion ---------------- */

const PATTERN_CENTRE = { r: 75, c: 75 };

export function suggestStart(v, clusters){
  if (!clusters.length) return null;
  if (state.settings.origin === 'page'){
    // top-left-most cluster: smallest (minR, then minC); then its
    // top-left-most cell within that cluster.
    let best = clusters[0];
    for (const cl of clusters){
      if (cl.bbox.minR < best.bbox.minR ||
          (cl.bbox.minR === best.bbox.minR && cl.bbox.minC < best.bbox.minC)){
        best = cl;
      }
    }
    let bestCell = best.cells[0];
    for (const i of best.cells){
      const r=rowOf(i), c=colOf(i);
      const br=rowOf(bestCell), bc=colOf(bestCell);
      if (r<br || (r===br && c<bc)) bestCell = i;
    }
    return bestCell;
  }
  // centre mode: prefer large clusters near the pattern centre, then pick
  // the cell nearest that cluster's centroid.
  let best = clusters[0], bestScore = -Infinity;
  for (const cl of clusters){
    const d = Math.hypot(cl.centroid.r - PATTERN_CENTRE.r, cl.centroid.c - PATTERN_CENTRE.c);
    const score = cl.cells.length - d; // large & close wins
    if (score > bestScore){ bestScore = score; best = cl; }
  }
  let bestCell = best.cells[0], bestD = Infinity;
  for (const i of best.cells){
    const r=rowOf(i), c=colOf(i);
    const d = Math.hypot(r-best.centroid.r, c-best.centroid.c);
    if (d < bestD){ bestD = d; bestCell = i; }
  }
  return bestCell;
}

/* ---------------- 3.3 cluster ordering ---------------- */

function chebyshevCentroid(a, b){
  return Math.max(Math.abs(a.r-b.r), Math.abs(a.c-b.c));
}

function nnOrder(clusters, fromPt){
  const remaining = clusters.slice();
  const order = [];
  let pt = fromPt;
  while (remaining.length){
    let bestI = 0, bestD = Infinity;
    for (let i=0;i<remaining.length;i++){
      const d = chebyshevCentroid(pt, remaining[i].centroid);
      if (d < bestD){ bestD = d; bestI = i; }
    }
    const [cl] = remaining.splice(bestI,1);
    order.push(cl);
    pt = cl.centroid;
  }
  return order;
}

// Cluster size at/below which a cluster counts as "confetti" for the 6.6
// confettiFirst ordering partition (mirrors the 1-2 cell "maximum isolation"
// definition used by confettiScore below).
const CONFETTI_MAX_CELLS = 2;

// 3.3 cluster ordering, extended by 6.6: partition clusters into
// isolated/confetti (<=CONFETTI_MAX_CELLS cells) vs the rest, then order
// *within* each partition with NN + 2-opt, concatenating the partitions in
// the order settings.confettiFirst dictates (confetti-first vs
// confetti-last). Ordering within a partition before concatenating (rather
// than optimising the flat list afterwards) is what stops 2-opt from
// immediately undoing the setting: 2-opt only ever reorders within a
// partition here, it never reaches across the partition boundary.
export function orderClusters(clusters, startIdx){
  if (clusters.length <= 1) return clusters.slice();
  const startPt = { r: rowOf(startIdx), c: colOf(startIdx) };
  const isolated = clusters.filter(cl => cl.cells.length <= CONFETTI_MAX_CELLS);
  const large = clusters.filter(cl => cl.cells.length > CONFETTI_MAX_CELLS);
  const groups = state.settings.confettiFirst ? [isolated, large] : [large, isolated];
  const deadline = Date.now() + 200; // shared 200ms 2-opt budget across both partitions
  let fromPt = startPt;
  let full = [];
  for (const group of groups){
    if (!group.length) continue;
    let ordered = nnOrder(group, fromPt);
    ordered = twoOpt(ordered, deadline, fromPt);
    full = full.concat(ordered);
    fromPt = ordered[ordered.length-1].centroid;
  }
  return full;
}

function tourLength(order, startPt){
  let total = 0, prev = startPt;
  for (const cl of order){
    total += chebyshevCentroid(prev, cl.centroid);
    prev = cl.centroid;
  }
  return total;
}

// 2-opt improvement over cluster visit order, capped at deadlineMs
// (absolute Date.now() deadline) or convergence, whichever first.
// startPt (optional) is the point the tour departs from; defaults to the
// first cluster's own centroid (legacy behaviour for callers with no
// meaningful "from" point).
export function twoOpt(order, deadlineMs, startPt){
  if (order.length < 4) return order;
  const anchor = startPt || (order.length ? order[0].centroid : {r:0,c:0});
  let improved = true;
  let best = order.slice();
  let bestLen = tourLength(best, anchor);
  while (improved && Date.now() < deadlineMs){
    improved = false;
    for (let i=1; i<best.length-1 && Date.now() < deadlineMs; i++){
      for (let j=i+1; j<best.length; j++){
        const candidate = best.slice(0,i)
          .concat(best.slice(i,j+1).reverse())
          .concat(best.slice(j+1));
        const len = tourLength(candidate, anchor);
        if (len < bestLen - 1e-9){
          best = candidate; bestLen = len; improved = true;
        }
      }
    }
  }
  return best;
}

/* ---------------- 6.4 confetti isolation score ---------------- */

// confettiScore(v) -> Map(cellIdx -> score in [0,1]), one entry per
// unstitched cell of colour v, scored by its cluster's isolation: 1-2 cell
// clusters (CONFETTI_MAX_CELLS) score 1 (maximum isolation), larger
// clusters score 1/cellCount, tapering toward 0. Lives in planner.js (not
// insights.js) because it needs clusterColour. Cached per colour alongside
// routeCache; invalidated together so it's computed once per colour, not
// once per frame.
const confettiCache = new Map();

export function confettiScore(v){
  const cached = confettiCache.get(v);
  if (cached) return cached;
  const clusters = clusterColour(v);
  const map = new Map();
  for (const cl of clusters){
    const score = cl.cells.length <= CONFETTI_MAX_CELLS ? 1 : Math.min(1, 1/cl.cells.length);
    for (const i of cl.cells) map.set(i, score);
  }
  confettiCache.set(v, map);
  return map;
}

/* ---------------- 6.5 anchor suggestion ---------------- */

// suggestAnchor(cluster, prevExit) -> 'pin stitch' | 'short carry' |
// 'loop start' | null, per cluster, for the route panel's per-cluster
// advice. Precedence (see task notes):
//   1. a single-cell cluster is always 'pin stitch' regardless of distance
//      from the previous exit — there's no serpentine path to loop through.
//   2. otherwise, if prevExit is within settings.maxCarry (Chebyshev
//      distance, cell-to-cell) of the cluster's centroid, prefer a
//      'short carry' from the previous work rather than a fresh anchor.
//   3. otherwise, a cluster of >=5 cells supports a 'loop start' (enough
//      length to loop the working thread through before the first stitch).
//   4. mid-size (3-4 cell) clusters that are neither within carry range nor
//      long enough to loop return null ("no specific suggestion" — the UI
//      shows this as "—"); a pin stitch would be overkill for 3-4 cells and
//      a loop is documented as needing >=5, so we don't force an answer.
export function suggestAnchor(cluster, prevExit){
  if (cluster.cells.length === 1) return 'pin stitch';
  if (prevExit != null){
    const d = chebyshevCentroid({ r: rowOf(prevExit), c: colOf(prevExit) }, cluster.centroid);
    if (d <= state.settings.maxCarry) return 'short carry';
  }
  if (cluster.cells.length >= 5) return 'loop start';
  return null;
}

/* ---------------- 3.4 within-cluster walk ---------------- */

// A stitcher works contiguous *runs* (horizontal strips of adjacent cells),
// moving to a touching run in the next row, and only jumps when the current
// strand of work dead-ends — never a row-by-row sweep across the cluster's
// whole bounding box (which carries thread across bare fabric between, say,
// the two legs of a shape). walkCluster() models exactly that: it returns the
// cluster as an ordered list of *segments*, each a chain of 8-adjacent
// cells; the gaps between segments are where the stitcher must carry or tie
// off, and planRoute turns them into hops.
function clusterRuns(cluster){
  const rows = new Map();
  for (const i of cluster.cells){
    const r = rowOf(i);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(i);
  }
  const runs = [];
  for (const [r, cellsInRow] of rows){
    cellsInRow.sort((a,b)=>colOf(a)-colOf(b));
    let start = 0;
    for (let k=1; k<=cellsInRow.length; k++){
      if (k===cellsInRow.length || colOf(cellsInRow[k]) !== colOf(cellsInRow[k-1])+1){
        const cells = cellsInRow.slice(start, k);
        runs.push({ r, c0: colOf(cells[0]), c1: colOf(cells[cells.length-1]), cells });
        start = k;
      }
    }
  }
  return runs;
}

// two runs touch if they sit on adjacent rows and their column spans overlap
// or meet diagonally (8-connectivity)
function runsTouch(a, b){
  return Math.abs(a.r-b.r)===1 && b.c0 <= a.c1+1 && b.c1 >= a.c0-1;
}

export function walkCluster(cluster, fromIdx){
  const runs = clusterRuns(cluster);
  const fromR = fromIdx!=null ? rowOf(fromIdx) : rowOf(cluster.cells[0]);
  const fromC = fromIdx!=null ? colOf(fromIdx) : colOf(cluster.cells[0]);
  const unvisited = new Set(runs);

  // entry end of a run from a point: the nearer of its two ends
  const entryFor = (run, r, c) => {
    const dLeft = Math.max(Math.abs(run.r-r), Math.abs(run.c0-c));
    const dRight = Math.max(Math.abs(run.r-r), Math.abs(run.c1-c));
    return dLeft <= dRight ? { dist: dLeft, fromLeft: true } : { dist: dRight, fromLeft: false };
  };

  // first run: the one containing fromIdx if it's in this cluster, else the
  // nearest run to the from-point
  let cur = null, best = Infinity, curEntry = null;
  for (const run of runs){
    const e = entryFor(run, fromR, fromC);
    const contains = run.r===fromR && run.c0<=fromC && fromC<=run.c1;
    const d = contains ? -1 : e.dist;
    if (d < best){ best = d; cur = run; curEntry = e; }
  }

  const segments = [];
  let seg = [];
  let lastDir = 0; // -1 up, +1 down, 0 none — prefer continuing the same way
  while (cur){
    unvisited.delete(cur);
    const cells = curEntry.fromLeft ? cur.cells : cur.cells.slice().reverse();
    seg.push(...cells);
    const exit = cells[cells.length-1];
    const er = rowOf(exit), ec = colOf(exit);

    // next: prefer a touching run (continuing in the same vertical direction,
    // then the nearer entry); otherwise the nearest run anywhere in the
    // cluster, which starts a new segment (a carry / tie-off)
    let next = null, nextEntry = null, nextScore = Infinity, touching = false;
    for (const run of unvisited){
      const e = entryFor(run, er, ec);
      const t = runsTouch(cur, run);
      const dir = Math.sign(run.r - cur.r);
      // touching runs always beat non-touching ones; among touching, same
      // direction first, then shorter entry hop; among non-touching, nearest
      const score = t
        ? (dir===lastDir || lastDir===0 ? 0 : 50) + e.dist
        : 1000 + e.dist;
      if (score < nextScore){ nextScore = score; next = run; nextEntry = e; touching = t; }
    }
    if (!next) break;
    if (!touching){ segments.push(seg); seg = []; }
    lastDir = Math.sign(next.r - cur.r) || lastDir;
    cur = next; curEntry = nextEntry;
  }
  if (seg.length) segments.push(seg);
  return segments;
}

// kept for callers/tests expecting the old single-path shape: the walk's
// segments concatenated, with entry/exit of the whole cluster
export function serpentine(cluster, fromIdx){
  const segs = walkCluster(cluster, fromIdx);
  const out = segs.flat();
  return { cells: out, entry: out[0], exit: out[out.length-1] };
}

/* ---------------- 3.6 luminance / darkness ---------------- */

// Threshold on relative luminance (0..1, WCAG-style coefficients) below
// which a thread colour is treated as "dark" for the carry guard.
const DARK_LUMINANCE_THRESHOLD = 0.35;

export function isDark(hex){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16)/255;
  const g = parseInt(h.substring(2,4),16)/255;
  const b = parseInt(h.substring(4,6),16)/255;
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  return lum < DARK_LUMINANCE_THRESHOLD;
}

/* ---------------- 3.5 hop cost ---------------- */

// Bresenham line between two cell indices, inclusive of both ends.
function bresenhamLine(fromIdx, toIdx){
  let r0=rowOf(fromIdx), c0=colOf(fromIdx);
  const r1=rowOf(toIdx), c1=colOf(toIdx);
  const dr = Math.abs(r1-r0), dc = Math.abs(c1-c0);
  const sr = r0<r1 ? 1 : -1, sc = c0<c1 ? 1 : -1;
  let err = dr - dc;
  const out = [];
  while (true){
    out.push(idxOf(r0,c0));
    if (r0===r1 && c0===c1) break;
    const e2 = 2*err;
    if (e2 > -dc){ err -= dc; r0 += sr; }
    if (e2 < dr){ err += dr; c0 += sc; }
  }
  return out;
}

export function hopCost(exitIdx, entryIdx, v){
  const dist = Math.max(Math.abs(rowOf(exitIdx)-rowOf(entryIdx)), Math.abs(colOf(exitIdx)-colOf(entryIdx)));
  if (dist > state.settings.maxCarry){
    return { kind:'tieoff', dist, cost: dist, dark:false };
  }
  const path = bresenhamLine(exitIdx, entryIdx);
  const stitchedCount = path.reduce((n,i)=> n + (isStitched(i)?1:0), 0);
  const majorityStitched = stitchedCount > path.length/2;
  const dark = state.settings.darkCarryGuard && isDark(COLORS[v-1][2]);
  const crossesUnstitched = path.some(i => !isStitched(i) && i!==exitIdx && i!==entryIdx);

  let cost = dist;
  if (majorityStitched) cost *= 0.5;          // discount: mostly hidden under stitched work
  const isDarkCrossing = dark && crossesUnstitched;
  if (isDarkCrossing) cost *= 1.75;             // penalise: dark carry visible over bare fabric

  return { kind:'carry', dist, cost, dark: isDarkCrossing };
}

/* ---------------- 3.7 thread-length segmentation ---------------- */

// Fudge factor accounts for take-up on knots/tension losses versus the
// theoretical stitches-per-inch figure.
const SEGMENT_FUDGE = 0.9;

// Empirical inches of floss consumed per cross stitch, at 1 strand on
// 1-count fabric; scaled down by fabricCount (denser fabric = shorter
// stitches) and up by strand count (thicker bundles feed through slower
// and take up more length per pass). Tuned so 18in/14ct/2-strand lands
// close to the ~36-stitch community rule of thumb.
const STITCH_CONSUMPTION_FACTOR = 3.1;

export function inchesPerStitch(fabricCount, strands){
  return STITCH_CONSUMPTION_FACTOR * strands / fabricCount;
}

export function stitchesPerLength(){
  const { threadLength, fabricCount, strands } = state.settings;
  const perStitch = inchesPerStitch(fabricCount, strands);
  return Math.max(1, Math.floor(threadLength / perStitch * SEGMENT_FUDGE));
}

function isTieOffFriendly(i, orderedSet){
  // adjacent to already-stitched fabric, and not an isolated single stitch
  // (i.e. has at least one same-colour neighbour in the working set).
  const r = rowOf(i), c = colOf(i);
  let hasStitchedNeighbour = false, hasSameColourNeighbour = false;
  const v = colourAt(i);
  for (let dr=-1; dr<=1; dr++){
    for (let dc=-1; dc<=1; dc++){
      if (dr===0 && dc===0) continue;
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=N||nc<0||nc>=N) continue;
      const ni = idxOf(nr,nc);
      if (isStitched(ni)) hasStitchedNeighbour = true;
      if (cells[nr][nc]===v && orderedSet.has(ni)) hasSameColourNeighbour = true;
    }
  }
  return hasStitchedNeighbour && hasSameColourNeighbour;
}

export function segmentRoute(orderedCells){
  const perLength = stitchesPerLength();
  const orderedSet = new Set(orderedCells);
  const lengths = [];
  let segStart = 0;
  while (segStart < orderedCells.length){
    let segEnd = Math.min(segStart + perLength - 1, orderedCells.length - 1);
    // nudge boundary to nearest tie-off-friendly cell (search outward)
    if (segEnd < orderedCells.length - 1){
      let nudged = segEnd;
      for (let radius=0; radius <= perLength; radius++){
        const fwd = segEnd + radius, back = segEnd - radius;
        if (fwd < orderedCells.length && isTieOffFriendly(orderedCells[fwd], orderedSet)){ nudged = fwd; break; }
        if (back >= segStart && isTieOffFriendly(orderedCells[back], orderedSet)){ nudged = back; break; }
      }
      segEnd = nudged;
    }
    lengths.push({ from: orderedCells[segStart], to: orderedCells[segEnd], stitchCount: segEnd - segStart + 1 });
    segStart = segEnd + 1;
  }
  return lengths;
}

/* ---------------- 3.8 plan composition ---------------- */

export function planRoute(v){
  const clusters = clusterColour(v);
  if (!clusters.length){
    return { colour: v, start: null, legs: [], hops: [], lengths: [] };
  }
  const existingStart = state.startPoints[v];
  const start = (existingStart!=null && colourAt(existingStart)===v && !isStitched(existingStart))
    ? existingStart
    : suggestStart(v, clusters);

  const ordered = orderClusters(clusters, start);

  const legs = [];
  const hops = [];
  let prevExit = start;
  // each cluster is walked as one or more contiguous segments (walkCluster);
  // every segment becomes a leg, and every gap — between clusters *and*
  // between a cluster's own segments — becomes a hop
  let first = true;
  ordered.forEach((cl) => {
    const segs = walkCluster(cl, first ? start : prevExit);
    segs.forEach((cells) => {
      const entry = cells[0], exit = cells[cells.length-1];
      if (!first){
        const hop = hopCost(prevExit, entry, v);
        hops.push({ from: prevExit, to: entry, kind: hop.kind, dist: hop.dist, cost: hop.cost, dark: hop.dark });
      }
      // 6.5: attach the anchor suggestion per leg at plan time so the UI
      // just reads leg.anchor rather than recomputing it.
      let sr=0, sc=0; for (const i of cells){ sr+=rowOf(i); sc+=colOf(i); }
      const pseudo = { cells, centroid: { r: sr/cells.length, c: sc/cells.length } };
      const anchor = suggestAnchor(pseudo, first ? null : prevExit);
      legs.push({ cells, entry, exit, anchor, size: cells.length });
      prevExit = exit;
      first = false;
    });
  });

  const allCells = legs.reduce((acc, leg) => acc.concat(leg.cells), []);
  const lengths = segmentRoute(allCells);

  return { colour: v, start, legs, hops, lengths };
}

/* ---------------- 3.9 route cache + invalidation ---------------- */

export let routeCache = new Map();

export function getRoute(v){
  return routeCache.get(v);
}

export function invalidateRoute(v){
  routeCache.delete(v);
  confettiCache.delete(v);
}

export function invalidateAllRoutes(){
  routeCache.clear();
  confettiCache.clear();
}

/* ---------------- 3.10 idle-scheduled planning ---------------- */

const ric = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (fn) => setTimeout(() => fn({ timeRemaining: () => 0, didTimeout: true }), 0);

let planningColour = null;
let onRouteReady = null;

export function isPlanning(){ return planningColour !== null; }
export function getPlanningColour(){ return planningColour; }
export function setOnRouteReady(fn){ onRouteReady = fn; }

export function requestRoute(v){
  const cached = routeCache.get(v);
  if (cached) return cached;
  if (planningColour === v) return undefined;
  planningColour = v;
  ric(() => {
    const route = planRoute(v);
    routeCache.set(v, route);
    planningColour = null;
    if (typeof onRouteReady === 'function') onRouteReady(v, route);
    if (typeof draw === 'function') draw();
  });
  return undefined;
}

/* ---------------- route-order helpers (mark up-to-here / mark block) ---------------- */

/** routeCells(route) -> all route cells in stitching order (legs concatenated). */
export function routeCells(route){
  return route ? route.legs.reduce((acc, leg) => acc.concat(leg.cells), []) : [];
}

/**
 * markRoutePrefix(v, cells, endIdx) - the shared "I've stitched up to here"
 * primitive: marks cells[0..endIdx] of colour v as stitched, and moves the
 * colour's start point to the next route cell so the re-planned route
 * continues from exactly where the needle is (otherwise suggestStart would
 * pick a fresh start elsewhere once the old one is stitched). Returns the
 * cells it toggled (for the journey log). Does NOT refresh UI / redraw.
 */
export function markRoutePrefix(v, cells, endIdx, setStitchedFn){
  const toggled = [];
  for (let k=0; k<=endIdx && k<cells.length; k++){
    if (!isStitched(cells[k])){ setStitchedFn(cells[k], true); toggled.push(cells[k]); }
  }
  const next = cells[endIdx+1];
  if (next!=null) state.startPoints[v] = next;
  return toggled;
}
