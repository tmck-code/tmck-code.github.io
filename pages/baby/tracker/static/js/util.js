// Time and formatting helpers. All day maths happens in the browser's local timezone.

export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const TIME_FMT  = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY_FMT   = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const MID_FMT   = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
const SHORT_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const DM_FMT    = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const WD_FMT    = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

export const fmtTime     = (d) => TIME_FMT.format(new Date(d));
export const fmtDay      = (d) => DAY_FMT.format(new Date(d));     // "Wednesday 11 November"
export const fmtMidDay   = (d) => MID_FMT.format(new Date(d));     // "Wed 11 November"
export const fmtShortDay = (d) => SHORT_FMT.format(new Date(d));   // "Wed 11 Nov"
export const fmtDayMonth = (d) => DM_FMT.format(new Date(d));      // "11 Nov"
export const fmtWeekday  = (d) => WD_FMT.format(new Date(d));      // "Wed"

export function startOfDay(d) {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
}

// setDate keeps local midnight across daylight-saving changes (days of 23 or 25 hours).
export function addDays(d, n) {
  const day = new Date(d);
  day.setDate(day.getDate() + n);
  return day;
}

const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Value for <input type="datetime-local">, in local time.
export function toInput(d) {
  if (!d) return '';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return `${ymd(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

// datetime-local value -> ISO string, or null when empty or unparseable.
export function fromInput(value) {
  if (!value) return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

// Under a minute it gives seconds ("36s"), so a short pause or side never reads as "0m".
export function fmtDuration(seconds) {
  if (seconds >= 1 && seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
}

export function fmtTimer(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function fmtAgo(seconds) {
  return seconds < 60 ? 'just now' : `${fmtDuration(seconds)} ago`;
}

export const fmtKg = (grams) => `${(grams / 1000).toFixed(3)} kg`;

export const fmtHours = (seconds) => `${(seconds / 3600).toFixed(1)} h`;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Inline icon from the sprite in index.html. `name` is a sprite id without the "i-" prefix.
export function icon(name, size = 20) {
  const s = Number(size) || 20;
  return `<svg class="ico" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${esc(name)}"/></svg>`;
}

// Sprite id for an entry. A nappy with no entry (the generic "nappy" action) uses the combined icon.
export function entryIcon(type, entry) {
  if (type === 'sleep') return 'moon';
  if (type === 'feed') return 'milk';
  if (type === 'weight') return 'weight';
  if (type === 'express') return 'express';
  if (!entry) return 'nappy';
  if (entry.wet && entry.dirty) return 'both';
  return entry.dirty ? 'disc' : 'droplet';
}

// data-ev key for an entry: a nappy is "dirty" when dirty, otherwise "wet".
export function entryEv(type, entry) {
  if (type === 'nappy') return entry && entry.dirty ? 'dirty' : 'wet';
  return type;
}

// ── Pause-aware timing (state lives on the server; see README "Stopwatch") ─────────────────

// Active seconds of a sleep or feed: wall time minus paused time. A paused entry is frozen at
// its pause moment; a finished one uses the server's duration_seconds. `nowMs` is server-aligned.
export function elapsedSeconds(entry, nowMs) {
  if (entry.ended_at && typeof entry.duration_seconds === 'number') return entry.duration_seconds;
  const end   = entry.ended_at || entry.paused_at;
  const endMs = end ? new Date(end).getTime() : nowMs;
  return Math.max(0, (endMs - new Date(entry.started_at).getTime()) / 1000 - (entry.paused_seconds || 0));
}

// Live per-side seconds of a breast feed: the stored totals plus the segment now running.
// `tracked` is false for feeds with no side data (bottle feeds, entries from before sides existed).
export function sideSeconds(feed, nowMs) {
  const tracked = feed.left_seconds !== null && feed.left_seconds !== undefined
    || feed.right_seconds !== null && feed.right_seconds !== undefined;
  const sides = { left: feed.left_seconds || 0, right: feed.right_seconds || 0, tracked };
  if (!feed.ended_at && !feed.paused_at && feed.active_side && feed.side_since) {
    sides[feed.active_side] += Math.max(0, (nowMs - new Date(feed.side_since).getTime()) / 1000);
  }
  return sides;
}

// ── Breast-feed rate estimates (the server works them out; see README "Breast-feed intake") ──

// Seconds of a breast feed that a rate estimate counts: time past the server's cap earns nothing.
const ratedSeconds = (feed, seconds) => Math.min(seconds, feed.intake_rate_max_seconds ?? Infinity);

// A feed estimated from its length: at the rate learned from weighed feeds ('rate'), or at the one
// typed in on the Settings page ('manual_rate').
export const ratedSource = (source) => source === 'rate' || source === 'manual_rate';

// "12m at 2.5 ml/min, from 3 weighed feeds" for a finished feed estimated from its length, or
// "12m at 2.5 ml/min, set in Settings" when the rate was typed in there; else ''.
export function rateText(feed) {
  if (!ratedSource(feed.intake_source) || typeof feed.intake_rate_ml_per_min !== 'number') return '';
  const counted = ratedSeconds(feed, feed.duration_seconds);
  const feeds   = feed.intake_rate_feeds;
  const from    = feed.intake_source === 'manual_rate' ? ', set in Settings'
    : typeof feeds === 'number' ? `, from ${feeds} weighed feed${feeds === 1 ? '' : 's'}` : '';
  return `${counted < feed.duration_seconds ? 'first ' : ''}${fmtDuration(counted)} at ${feed.intake_rate_ml_per_min.toFixed(1)} ml/min${from}`;
}

// The rate rule itself, unrounded: ml per active minute over the counted seconds. Written as the
// server has it (rate.py estimate_ml), so both sides do the same sum.
const ratedMl = (feed, seconds) => feed.intake_rate_ml_per_min * (ratedSeconds(feed, seconds) / 60);

// Running estimate for a breast feed still in progress, in whole ml; null when the server sent no
// rate. Worked out here rather than read from the server: once the feed stops, the server's
// intake_ml replaces it.
export function liveEstimateMl(feed, nowMs) {
  if (feed.ended_at || feed.kind !== 'breast' || typeof feed.intake_rate_ml_per_min !== 'number') return null;
  return Math.round(ratedMl(feed, elapsedSeconds(feed, nowMs)));
}

// What the server will report for a finished, unweighed breast feed of that active length: whole
// ml, halves rounding up, never under minMl. `feed` carries intake_rate_ml_per_min and
// intake_rate_max_seconds, as a rate feed from the API does. For a form to show before saving.
export function ratedEstimateMl(feed, seconds, minMl = 1) {
  return Math.max(Math.floor(ratedMl(feed, seconds) + 0.5), minMl);
}

export const otherSide = (side) => (side === 'left' ? 'right' : side === 'right' ? 'left' : null);
