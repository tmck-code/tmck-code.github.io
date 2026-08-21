// insights.js - pure calculators over state.journey (no DOM access).
// Later waves build the stats panel UI on top of these.

// A session boundary is any gap between consecutive event timestamps of
// this many ms or more. 30 minutes chosen per design.md: a naive
// first-to-last-timestamp rate is meaningless across a months-long project,
// so we only count time actually spent stitching in a sitting.
export const SESSION_GAP_MS = 30 * 60 * 1000;

// Below this we don't trust the rate enough to show it: need at least two
// sessions (so there's an actual gap-bounded duration, not just a single
// instant) OR a single session covering at least this many ms of active
// time, and at least one stitch counted. Guards against "picked up the
// needle, put it down" producing a wild stitches/hour number from a
// near-zero denominator.
const MIN_SESSION_MS = 2 * 60 * 1000; // 2 minutes

// Stitches contributed by one journey event. mark/bulk add cells.length,
// unmark subtracts cells.length. compacted events approximate: they fold
// away cell detail but preserve the event count `n`, and design.md treats
// them as still contributing to counts/rate stats, so we add n (compacted
// events are only ever produced from prior mark/bulk activity that has
// already been rate-relevant; treating each folded event as ~1 stitch is
// the documented approximation - it will undercount multi-cell bulk fills
// that got compacted, but there's no way to recover that detail).
function stitchDelta(ev){
  if (ev.kind === 'mark' || ev.kind === 'bulk') return ev.cells ? ev.cells.length : 0;
  if (ev.kind === 'unmark') return -(ev.cells ? ev.cells.length : 0);
  if (ev.kind === 'compacted') return ev.n || 0;
  return 0; // tieoff and anything else: no stitch-count contribution
}

// sessions(journey) -> [{start, end, durationMs, events, stitches}]
// Splits the (chronologically-ordered, append-only) journey log into
// maximal runs of events with gaps < SESSION_GAP_MS between consecutive
// timestamps. Each session:
//   start:      t of first event in the session
//   end:        t of last event in the session
//   durationMs: end - start (0 for a single-event session)
//   events:     count of events in the session
//   stitches:   net stitches marked during the session (see stitchDelta)
export function sessions(journey){
  if (!journey || journey.length === 0) return [];
  const out = [];
  let cur = null;
  for (const ev of journey){
    if (!cur || ev.t - cur.end >= SESSION_GAP_MS){
      if (cur) out.push(cur);
      cur = { start: ev.t, end: ev.t, durationMs: 0, events: 0, stitches: 0 };
    }
    cur.end = ev.t;
    cur.durationMs = cur.end - cur.start;
    cur.events++;
    cur.stitches += stitchDelta(ev);
  }
  if (cur) out.push(cur);
  return out;
}

// stitchesPerHour(journey) -> number|null
// Rate computed over the *summed* session durations (active stitching
// time only), not wall-clock span. Returns null when there's too little
// data to trust: fewer than one session with at least MIN_SESSION_MS of
// duration, or zero net stitches recorded.
export function stitchesPerHour(journey){
  const sess = sessions(journey);
  if (sess.length === 0) return null;
  let totalMs = 0, totalStitches = 0;
  for (const s of sess){
    totalMs += s.durationMs;
    totalStitches += s.stitches;
  }
  const qualifies = sess.length >= 2 || sess.some(s => s.durationMs >= MIN_SESSION_MS);
  if (!qualifies || totalMs <= 0 || totalStitches <= 0) return null;
  return totalStitches / (totalMs / 3600000);
}

/* ---------------- 6.9 stats-panel calculators ---------------- */

// Railroading (laying the two plies of each strand parallel with a laying
// tool before pulling through) adds a deliberate extra step per stitch, so
// an observed stitches/hour rate measured *without* it will overstate speed
// once it's switched on. Documented as a coarse estimate, not measured:
// ~15% slower is a middle-of-the-road guess for the added laying motion,
// consistent with design.md's stance that cost-model numbers are labelled
// estimates rather than presented as precise.
export const RAILROADING_SLOWDOWN = 0.85; // effective-rate multiplier when settings.railroading

// estimatedFinish(remaining, ratePerHour, railroading) -> Date|null.
// null when the rate is unavailable (never fabricate a finish date from a
// zero/unknown rate) or when there's nothing left to stitch (returns the
// current time in that case, per "0 remaining => already finished").
export function estimatedFinish(remaining, ratePerHour, railroading, now = Date.now()){
  if (ratePerHour == null || ratePerHour <= 0) return null;
  if (remaining <= 0) return new Date(now);
  const effectiveRate = railroading ? ratePerHour * RAILROADING_SLOWDOWN : ratePerHour;
  const hoursLeft = remaining / effectiveRate;
  return new Date(now + hoursLeft * 3600000);
}

// DMC skeins are sold as ~8m/8.7yd of 6-strand floss; the community rule of
// thumb usable-length figure (accounting for wastage/loss at the ends) is
// ~17 workable 18" lengths per skein. Kept as a named constant so the 6.9
// skein estimate and any future UI can cite the same number.
export const LENGTHS_PER_SKEIN = 17;

// skeinsForLengths(lengthCount) -> number of skeins (fractional, so the UI
// can show "2.3 skeins" or round up for a shopping-list figure).
export function skeinsForLengths(lengthCount){
  return lengthCount / LENGTHS_PER_SKEIN;
}
