// Entry copy shared by the Today log (app.js) and the Over time day popup (charts.js): the title,
// the detail line and the log row markup for a sleep, feed, nappy, weigh-in or express.

import {
  elapsedSeconds, entryEv, entryIcon, esc, fmtDuration, fmtKg, fmtTime, icon, rateText, ratedSource, sideSeconds,
} from './util.js';

const ms    = (t) => new Date(t).getTime();
const known = (v) => v !== null && v !== undefined;

// An express session has a start once it is timed; one logged at a single moment only has logged_at.
export const entryStart = (type, entry) => (type === 'sleep' || type === 'feed' ? entry.started_at : entry.started_at ?? entry.logged_at);

export function nappyTitle(n) {
  const wetSize = n.wet && n.wet_size ? ` (${n.wet_size})` : '';
  const size    = n.dirty && n.dirty_size ? ` (${n.dirty_size})` : '';
  if (n.wet && n.dirty) return `Wet${wetSize} and dirty${size}`;
  return n.dirty ? `Dirty${size}` : `Wet${wetSize}`;
}

// "Bottle, 60 of 80 ml" when some of what was in the bottle was left.
function feedTitle(f) {
  if (f.kind === 'bottle') {
    if (!known(f.intake_ml)) return 'Bottle';
    return known(f.bottle_ml) && f.bottle_ml > f.intake_ml ? `Bottle, ${f.intake_ml} of ${f.bottle_ml} ml` : `Bottle, ${f.intake_ml} ml`;
  }
  // In progress there is no intake yet; a finished breast feed always has an estimate.
  return f.ended_at && known(f.intake_ml) ? `Breast, about ${f.intake_ml} ml` : 'Breast';
}

// Running: "Expressing". Stopped with the amount still to be filled in: "Expressed".
function expressTitle(x) {
  if (x.started_at && !x.ended_at) return 'Expressing';
  return known(x.amount_ml) ? `Expressed ${x.amount_ml} ml` : 'Expressed';
}

// A session logged at one moment (no length to show), as every express was before it could be timed.
const untimed = (x) => !x.started_at || (x.ended_at && ms(x.ended_at) === ms(x.started_at));

// Unescaped title of an entry.
export function entryTitle(type, entry) {
  if (type === 'sleep') return 'Sleep';
  if (type === 'weight') return `Weighed ${fmtKg(entry.grams)}`;
  if (type === 'express') return expressTitle(entry);
  return type === 'nappy' ? nappyTitle(entry) : feedTitle(entry);
}

// Attributes that make a ticking element pause-aware. app.js's tick() computes
// (data-frozen or now) - start - data-paused for every [data-since] and [data-for] element.
export function liveAttrs(entry) {
  const frozen = entry.paused_at ? ` data-frozen="${esc(entry.paused_at)}"` : '';
  return `data-paused="${Number(entry.paused_seconds) || 0}"${frozen}`;
}

// "Left 6m, right 4m" for a breast feed with tracked sides, otherwise ''.
export function sidesText(feed, nowMs) {
  if (feed.kind !== 'breast') return '';
  const sides = sideSeconds(feed, nowMs);
  return sides.tracked ? `Left ${fmtDuration(sides.left)}, right ${fmtDuration(sides.right)}` : '';
}

function intakeDetail(f) {
  if (f.kind !== 'breast' || !f.ended_at) return '';
  const weighed = known(f.weight_before_g) && known(f.weight_after_g);
  const source  = f.intake_source || (weighed ? 'weights' : known(f.intake_ml) ? 'default' : null);
  if (source === 'weights' && weighed) return `estimated from ${fmtKg(f.weight_before_g)} to ${fmtKg(f.weight_after_g)}`;
  if (ratedSource(source) && rateText(f)) return `estimated, ${rateText(f)}`;
  return source === 'default' ? 'estimated, no weights' : 'no weights';
}

// The detail line of a log row, as already-escaped fragments to join with a middle dot.
// dayStartMs/dayEndMs bound the day the row is listed under (optional). A running entry gets a
// live span that app.js's tick() keeps current; it is pre-filled only when nowMs is given, so a
// caller that re-renders often (the Today log) can omit nowMs and keep its markup stable.
export function logDetail(type, e, dayStartMs, dayEndMs, nowMs) {
  if (type === 'weight') return [esc(`${e.grams} g`), esc(e.notes)].filter(Boolean);
  if (type === 'nappy') return ['Nappy change', esc(e.notes)].filter(Boolean);
  if (type === 'express' && untimed(e)) return ['Expressed milk', esc(e.notes)].filter(Boolean);

  const bits   = [];
  const paused = Number(e.paused_seconds) || 0;
  if (e.ended_at) {
    const nextDay = Number.isFinite(dayEndMs) && ms(e.ended_at) >= dayEndMs ? ' the next day' : '';
    bits.push(esc(`${fmtDuration(elapsedSeconds(e, nowMs))}, ended ${fmtTime(e.ended_at)}${nextDay}`));
  } else if (e.paused_at) {
    bits.push(esc(`Paused, ${fmtDuration(elapsedSeconds(e, nowMs))} so far`));
  } else {
    const text = Number.isFinite(nowMs) ? esc(fmtDuration(elapsedSeconds(e, nowMs))) : '';
    bits.push(`Still going, <span data-for="${esc(e.started_at)}" ${liveAttrs(e)}>${text}</span> so far`);
  }
  if (Number.isFinite(dayStartMs) && ms(e.started_at) < dayStartMs) bits.push('began the day before');
  if (e.ended_at && paused > 0) bits.push(esc(`paused ${fmtDuration(paused)}`));
  if (type === 'feed') {
    const sides = e.ended_at ? sidesText(e, nowMs) : '';
    if (sides) bits.push(esc(sides));
    const intake = intakeDetail(e);
    if (intake) bits.push(esc(intake));
    // What was in the bottle, where the title cannot say "60 of 80 ml": no amount taken (yet), or
    // more taken than it held (a top-up). It is not intake.
    if (e.kind === 'bottle' && known(e.bottle_ml) && (!known(e.intake_ml) || e.bottle_ml < e.intake_ml)) bits.push(esc(`${e.bottle_ml} ml in bottle`));
  }
  if (e.notes) bits.push(esc(e.notes));
  return bits;
}

// One row of a log list. `attr` is the data attribute that carries "type:id" (the Log uses
// data-edit, which app.js's click handler opens; a sheet list uses data-pick).
export function logRow(type, entry, { dayStartMs, dayEndMs, nowMs, attr = 'data-edit' } = {}) {
  return `
    <li><button type="button" class="log-row" data-ev="${entryEv(type, entry)}" ${attr}="${type}:${entry.id}">
      <span class="log-time">${esc(fmtTime(entryStart(type, entry)))}</span>
      <span class="log-ico">${icon(entryIcon(type, entry), 20)}</span>
      <span class="log-text"><span class="log-title">${esc(entryTitle(type, entry))}</span><span class="log-detail">${logDetail(type, entry, dayStartMs, dayEndMs, nowMs).join(' · ')}</span></span>
      <span class="log-chev">${icon('right', 18)}</span>
    </button></li>`;
}
