// Baby log: the shell, the Today view, and the data loading for Over time. Settings is in settings.js.

import { api } from './api.js';
import { renderTrends } from './charts.js';
import { entryStart, entryTitle, liveAttrs, logRow, nappyTitle } from './entries.js';
import { TYPES, openEntry, openStartExpress, openStartFeed, openTypePicker } from './forms.js';
import { initStopwatch, tickStopwatch, updateStopwatch } from './stopwatch.js';
import { createLookback, fmtMl, targetOver } from './lookback.js';
import { initReminders, loadReminders, tickReminders } from './reminders.js';
import { loadSettings } from './settings.js';
import { toast } from './toast.js';
import {
  TZ, addDays, elapsedSeconds, entryIcon, esc, fmtAgo, fmtDay, fmtDuration, fmtKg, fmtMidDay, fmtShortDay, fmtTime, fmtTimer, fmtWeekday,
  icon, otherSide, startOfDay, ymd,
} from './util.js';
import { applyTrack, attachZoom, zoomWindow } from './zoom.js';

const REFRESH_MS  = 30000;
const THEME_COLOR = { dark: '#171512', light: '#F6EFE3' };
const $ = (id) => document.getElementById(id);

const state = {
  view:        'today',
  day:         startOfDay(new Date()),
  followToday: true,
  range:       '7',
  clockOffset: 0,      // server clock minus this device's clock, so timers agree across phones
  status:      null,
  events:      null,
  summary:     null,
  recent:      null,   // feeds for the intake look-back: the 24 hours up to now, or up to the end of a past day
  window:      '24h',  // how far back today's look-back goes: '24h', or 'midnight' (today so far); see WINDOWS
  weight:      null,   // latest weigh-in up to the end of the shown day: { grams, at } or { grams, day }
  entries:     new Map(),
  loads:       0,
  busy:        false,  // a start/stop request is in flight
  dismissed:   false,  // "Show dashboard" was pressed on the stopwatch; cleared once nothing is running
};

const now     = () => Date.now() + state.clockOffset;
const ms      = (t) => new Date(t).getTime();
const isToday = () => state.day.getTime() === startOfDay(new Date()).getTime();
const seconds = (from, to) => (ms(to) - ms(from)) / 1000;
const parseYmd = (text) => { const [y, m, d] = text.split('-').map(Number); return new Date(y, m - 1, d); };

// Only touch the DOM when the markup changed, so a background refresh keeps focus and scroll.
const rendered = new WeakMap();
function setHTML(el, html) {
  if (rendered.get(el) === html) return;
  rendered.set(el, html);
  el.innerHTML = html;
}

// ── Loading ────────────────────────────────────────────────────────────────────────────

async function refresh() {
  if (state.followToday) state.day = startOfDay(new Date());
  const load = ++state.loads;
  try {
    // Reminders ride along with every view's refresh: one small request, which never fails the rest.
    const [apply, applyReminders] = await Promise.all([LOADERS[state.view](), loadReminders()]);
    if (load !== state.loads) return;   // a newer refresh superseded this one
    apply();
    applyReminders();
  } catch (error) {
    if (load !== state.loads) return;
    toast(error.message, true, 'Not updated');
  }
}

// The weigh-in tile shows the latest weight up to the end of the shown day. /api/status only knows
// the latest overall, so a past day with a later weigh-in needs the per-day totals before it.
const earlier = { key: null, value: null };
async function weightBefore(day) {
  const key = ymd(day);
  if (earlier.key === key) return earlier.value;
  const rows  = await api.daily({ tz: TZ, end: ymd(addDays(day, -1)) });
  const found = rows.filter((r) => r.weight_g !== null).pop();
  earlier.key   = key;
  earlier.value = found ? { grams: found.weight_g, day: parseYmd(found.date) } : null;
  return earlier.value;
}

async function latestWeight(day, end, status, events) {
  const inDay = events.weights.slice().sort((a, b) => ms(a.logged_at) - ms(b.logged_at)).pop();
  if (inDay) return { grams: inDay.grams, at: inDay.logged_at };
  const last = status.last.weight;
  if (!last) return null;
  if (ms(last.logged_at) < end.getTime()) return { grams: last.grams, at: last.logged_at };
  return weightBefore(day);
}

async function loadToday() {
  const [day, end] = [state.day, addDays(state.day, 1)];
  // The intake look-back covers 24 hours: back from now (which reaches into yesterday), or back from
  // the end of a past day. A past day's own events already hold those, unless the day is not 24 hours long.
  const back = RECENT_HOURS.at(-1) * 3600e3;
  const recentFeeds = isToday()
    ? api.events(new Date(now() - back), new Date(now() + 60e3)).then((e) => e.feeds)
    : end.getTime() - day.getTime() < back ? api.events(new Date(end.getTime() - back), end).then((e) => e.feeds) : null;
  const [status, events, summary, fetched] = await Promise.all(
    [api.status(), api.events(day, end), api.summary(day, end), recentFeeds]);
  const recent = fetched || events.feeds;
  const weight = await latestWeight(day, end, status, events);
  return () => {
    state.clockOffset = ms(status.now) - Date.now();
    Object.assign(state, { status, events, summary, weight, recent });
    renderToday();
  };
}

async function loadTrends() {
  const range  = state.range;
  const today  = startOfDay(new Date());
  const params = { tz: TZ, end: ymd(today) };
  if (range !== 'all') params.start = ymd(addDays(today, 1 - Number(range)));
  const daily  = await api.daily(params);
  const days   = daily.map((d) => parseYmd(d.date));
  // The intake look-back spans as many whole days back from now as the range has days, which starts
  // a little before the first day's midnight.
  const span   = range === 'all' ? Math.max(1, days.length) : Number(range);
  const from   = Math.min((days[0] || today).getTime(), now() - span * 86400e3);
  const events = await api.events(new Date(from), addDays(today, 1));
  return () => {
    syncStopwatch();
    renderHead(days[0]);
    renderTrends($('charts'), $('pattern'), { daily, days, events, range, span, now: now() }, { onDone: done });
  };
}

// Settings draws itself (settings.js); a feed edited from its list refreshes like any other save.
async function loadSettingsView() {
  const apply = await loadSettings($('settings'), { onDone: done });
  return () => { syncStopwatch(); apply(); };
}

const LOADERS = { today: loadToday, trends: loadTrends, settings: loadSettingsView };

// ── Copy (entry titles and log rows are in entries.js) ─────────────────────────────────

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ── Header ─────────────────────────────────────────────────────────────────────────────

// The header's title and subtitle name what is shown: the day on Today, the range on Over time.
// `first` is the first day Over time has data for, which is where "All" starts.
function renderHead(first) {
  if (state.view === 'today') { renderDayNav(); return; }
  const [title, sub] = state.view === 'trends' ? ['Over time', rangeText(first)] : ['Settings', 'Reminders, estimates and appearance'];
  $('day-title').textContent = title;
  $('day-sub').textContent   = sub;
}

// "Thu 19 Nov – Wed 25 Nov" for the days the range covers, up to today.
function rangeText(first) {
  const today = startOfDay(new Date());
  const start = state.range !== 'all' ? addDays(today, 1 - Number(state.range)) : first;
  if (!start) return 'Every day logged';
  return start.getTime() >= today.getTime() ? fmtShortDay(today) : `${fmtShortDay(start)} – ${fmtShortDay(today)}`;
}

// ── Today ──────────────────────────────────────────────────────────────────────────────

const narrowQuery = window.matchMedia('(max-width: 899px)');
narrowQuery.addEventListener('change', () => { if (state.view === 'today') renderDayNav(); });

function renderDayNav() {
  const today = isToday();
  const diff  = Math.round(seconds(state.day, startOfDay(new Date())) / 86400);
  $('day-title').textContent = today ? 'Today' : diff === 1 ? 'Yesterday' : fmtShortDay(state.day);
  const year = state.day.getFullYear();
  // Phones have room for "Wed 25 November" beside the header buttons; wider screens spell the weekday out.
  const day  = narrowQuery.matches ? fmtMidDay(state.day) : fmtDay(state.day);
  $('day-sub').textContent   = day + (year !== new Date().getFullYear() ? ` ${year}` : '');
  $('day-next').disabled     = today;
  $('day-today').hidden      = today;
}

const RUNNING = ['sleep', 'feed', 'express'];   // what can have a timer running, one of each

// A running sleep, feed or express session is driven from the fullscreen stopwatch; the dashboard keeps a compact
// bar per activity with a live, pause-aware timer: tapping its body reopens the stopwatch, and the
// round button stops it (as the stopwatch's Stop does).
const NOUN = { sleep: 'sleep', feed: 'feed', express: 'expressing' };

function runBar(type, entry) {
  const label    = type === 'sleep' ? 'Sleeping' : type === 'express' ? 'Expressing' : `Feeding, ${entry.kind}`;
  const paused   = Boolean(entry.paused_at);
  const dayStart = startOfDay(new Date(now())).getTime();
  const since    = (ms(entry.started_at) < dayStart ? `${fmtShortDay(entry.started_at)}, ` : '') + fmtTime(entry.started_at);
  const said     = `${label}${paused ? ', paused' : ''}, since ${since}`;
  return `
    <section class="run-bar${paused ? ' is-paused' : ''}" data-ev="${type}" aria-label="Happening now: ${esc(label)}${paused ? ', paused' : ''}">
      <button type="button" class="run-main" data-open-sw aria-label="Open stopwatch: ${esc(said)}" title="Open stopwatch">
        <span class="run-ico">${icon(paused ? 'pause' : entryIcon(type), 24)}</span>
        <span class="run-text">
          <span class="run-label">${esc(label)}</span>
          <span class="run-sub">${paused ? '<span class="run-paused">Paused</span>' : ''}since ${esc(since)}</span>
        </span>
      </button>
      <span class="run-timer" role="timer" aria-live="off" data-since="${esc(entry.started_at)}" ${liveAttrs(entry)}></span>
      <button type="button" class="run-stop" data-stop="${type}" aria-label="Stop ${NOUN[type]}" title="Stop ${NOUN[type]}"><svg class="ico-solid" width="18" height="18" aria-hidden="true"><use href="#i-stop"/></svg></button>
    </section>`;
}

function renderRunning() {
  const { active } = state.status;
  const bars = !isToday() ? [] : RUNNING.filter((type) => active[type]).map((type) => [type, active[type]])
    .sort((a, b) => ms(a[1].started_at) - ms(b[1].started_at));
  $('running').hidden = !bars.length;
  setHTML($('running'), bars.map(([type, entry]) => runBar(type, entry)).join(''));
}

// The stopwatch takes over Today while something is running, until "Show dashboard" is pressed.
// A past day, Over time and Settings always show the normal UI.
function syncStopwatch() {
  const active  = (state.status && state.status.active) || {};
  const running = RUNNING.some((type) => active[type]);
  if (!running) state.dismissed = false;
  const show = state.view === 'today' && isToday() && running && !state.dismissed;
  document.body.classList.toggle('sw-open', show);
  updateStopwatch(active, show);
}

// Time since the last feed (started) and nappy, and how long awake (since the last sleep ended) or
// asleep (the running sleep). The spans tick through tick()'s [data-for]; "–" where nothing is logged.
function renderSince() {
  const show = isToday();
  $('since').hidden = !show;
  if (!show) return;
  const { active, last } = state.status;
  const live  = (from, attrs = 'data-paused="0"') => `<span data-for="${esc(from)}" ${attrs}></span>`;
  const ago   = (from) => (from ? `${live(from)} <span class="since-ago">ago</span>` : '–');
  const cell  = (ev, name, label, value) => `
    <div class="since-cell" data-ev="${ev}"><span class="since-ico" role="img" aria-label="${esc(label)}">${icon(name, 24)}</span><span class="since-value">${value}</span></div>`;
  const sleep = active.sleep
    ? cell('sleep', 'moon', 'Asleep for', live(active.sleep.started_at, liveAttrs(active.sleep)))
    : cell('sleep', 'sun', 'Awake for', last.sleep && last.sleep.ended_at ? live(last.sleep.ended_at) : '–');
  setHTML($('since'), [
    cell('feed', 'milk', 'Since the last feed', active.feed ? 'now' : ago(last.feed && last.feed.started_at)),
    cell('wet', 'nappy', 'Since the last nappy', ago(last.nappy && last.nappy.logged_at)),
    sleep,
  ].join(''));
}

function renderQuick() {
  const { sleep, feed, express } = state.status.active;
  const button = (start, ev, name, word, label) => `
    <button type="button" class="quick-btn" data-ev="${ev}" data-start="${start}" aria-label="${label}" title="${label}"><span class="quick-ico chip chip-40">${icon(name, 24)}</span><span class="quick-label" aria-hidden="true">${word}</span></button>`;
  $('quick').hidden = !isToday();
  setHTML($('quick'), [
    sleep ? '' : button('sleep', 'sleep', 'moon', 'Sleep', 'Start sleep'),
    feed ? '' : button('feed', 'feed', 'milk', 'Feed', 'Start feed'),
    button('nappy', 'wet', 'nappy', 'Nappy', 'Nappy'),
    express ? '' : button('express', 'express', 'express', 'Express', 'Start expressing'),
    button('weight', 'weight', 'weight', 'Weigh', 'Weigh-in'),
  ].join(''));
}

// Intake look-back (lookback.js): ml from feeds that finished within the last 1, 3, 12 and 24 hours.
// A feed counts once it has ended (at its end time); a breast figure is an estimate, as in the day's
// Intake tile. Today it looks back from now; a past day looks back from the midnight that ended it,
// so its 24h knot is that day's total. The axis reads left to right: now (or that midnight) at the
// left, 24h back at the right, each knot with its clock time under it.
// The heading says which; the legend under the chart names the fills and the target band.
//
// Today the chart has a window toggle (remembered in localStorage): the 24 hours above, or back to
// the most recent midnight, which is today's intake so far. Then the axis ends at midnight: the
// 1h, 3h and 12h knots that fall inside it are kept (one too near midnight to tell apart from it is
// dropped), and the last knot is midnight itself, named by how long ago that was. It counts as the
// rest of the chart does, by when a feed ended, so a feed begun before midnight and finished after it
// is in, while the day's Intake tile (which goes by when a feed started) leaves that one to yesterday.
const RECENT_HOURS = [1, 3, 12, 24];
const WINDOWS      = ['24h', 'midnight'];
const WINDOW_KEY   = 'recent-window';
const NEAR_MIDNIGHT = (span) => Math.max(0.5, span * 0.08);   // hours: a knot closer than this to midnight is dropped
const MIN_SPAN      = 1 / 60;                                   // hours: the axis is never shorter than a minute
const hoursWord    = (hours) => (hours === 1 ? 'hour' : `${hours} hours`);
const recentChart  = createLookback();
let recentAt = 0;   // when the chart was last drawn, for the once-a-minute redraw in tick()

// Beside the toggle the heading's unit has a short form for where the long one would wrap (style.css).
const unitHTML = (long, short) => `<span class="unit-long">${esc(long)}</span><span class="unit-short">${esc(short)}</span>`;

// The card's figure (the whole span's total), its target, and the legend with each fill's share.
// Counted as the chart counts: finished feeds with an amount that ended within `hours` before `end`
// (or up to `slack` ms after it). Returns the legend for the chart.
function intakeFigure(feeds, end, hours, slack) {
  const from = end - hours * 3600e3;
  const sums = { bottle: 0, breast: 0 };
  feeds.forEach((f) => {
    if (!f.ended_at || (f.intake_ml ?? null) === null) return;
    const t = ms(f.ended_at);
    if (t > from && t <= end + slack) sums[f.kind === 'breast' ? 'breast' : 'bottle'] += f.intake_ml;
  });
  const [lo, hi] = targetOver(hours);
  $('recent-total').textContent  = `${fmtMl(sums.bottle + sums.breast)} ml`;
  $('recent-target').textContent = `target ${fmtMl(lo)}–${fmtMl(hi)} ml`;
  return [
    ['bottle', `Bottle ${fmtMl(sums.bottle)} ml`],
    ['breast', `Breast ≈${fmtMl(sums.breast)} ml`],
    ['band', 'Target'],
  ];
}

// "9h 40m" since midnight, as the clock under "now" reads 9:40.
function sinceWord(hours) {
  const minutes = Math.floor(hours * 60 + 1e-6);
  const [h, m]  = [Math.floor(minutes / 60), minutes % 60];
  return !h ? `${m}m` : !m ? `${h}h` : `${h}h ${m}m`;   // never under a minute: see MIN_SPAN
}

// Today, back to midnight: the same chart on a shorter axis whose last knot is midnight.
function renderSinceMidnight() {
  const from     = recentAt;
  const midnight = startOfDay(new Date(from)).getTime();
  const span     = Math.max(MIN_SPAN, (from - midnight) / 3600e3);
  const knots    = [...RECENT_HOURS.filter((hours) => hours <= span - NEAR_MIDNIGHT(span)), span];
  const atEnd    = (hours) => hours === span;
  // Only feeds that ended after midnight, so the last knot does not rest on rounding in the axis.
  const feeds    = state.recent.filter((f) => f.ended_at && ms(f.ended_at) > midnight);
  const any      = feeds.some((f) => (f.intake_ml ?? null) !== null && ms(f.ended_at) <= from + 60e3);
  $('recent-title').textContent = 'Intake';
  setHTML($('recent-unit'), unitHTML('ml, from now back to midnight', 'ml, from now back'));
  const legend = intakeFigure(feeds, from, span, 60e3);
  recentChart.draw($('recent'), {
    feeds,
    end:    from,
    slack:  60e3,
    unit:   3600e3,
    knots,
    follow: 'midnight',
    tick:   (hours) => (atEnd(hours) ? sinceWord(hours) : `${hours}h`),
    when:   (hours, t) => fmtTime(atEnd(hours) ? midnight : t),
    origin: 'now',
    phrase: (hours) => (atEnd(hours) ? 'Since midnight' : `Last ${hoursWord(hours)}`),
    target: targetOver,
    hint:   any ? 'Tap a dot for the split.' : 'Nothing yet since midnight.',
    legend,
    label:  `Running total of intake in ml, left to right from now (${fmtTime(from)}) back to midnight (${fmtTime(midnight)}), ${sinceWord(span)} ago`,
  });
}

function renderRecent() {
  const show = Array.isArray(state.recent);
  $('recent-section').hidden = !show;
  if (!show) return;
  const today = isToday();
  // The toggle is for today only: a past day's chart already is that whole day.
  $('recent-window').hidden = !today;
  $('recent-window').querySelectorAll('[data-window]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.window === state.window)));
  if (today && state.window === 'midnight') { recentAt = now(); renderSinceMidnight(); return; }
  const end   = addDays(state.day, 1).getTime();
  const whole = end - state.day.getTime() === RECENT_HOURS.at(-1) * 3600e3;   // not on a daylight-saving day
  recentAt = now();
  $('recent-title').textContent = 'Intake';
  setHTML($('recent-unit'), today ? unitHTML('ml, from now back 24 h', 'ml, from now back') : esc('ml, from midnight back'));
  // The clock time under a knot. One on another day than the chart's own (today, or the day shown)
  // says which: the first knot to cross midnight does, and the last, e.g. "Wed 23:41".
  const from   = today ? recentAt : end;
  const home   = today ? startOfDay(new Date(recentAt)).getTime() : state.day.getTime();
  const away   = (t) => startOfDay(new Date(t)).getTime() !== home;
  const when   = (hours, t) => {
    const i = RECENT_HOURS.indexOf(hours);
    const marked = i >= 0 && away(t) && (i === RECENT_HOURS.length - 1 || !i || !away(from - RECENT_HOURS[i - 1] * 3600e3));
    return `${marked ? `${fmtWeekday(t)} ` : ''}${fmtTime(t)}`;
  };
  const oldest = when(RECENT_HOURS.at(-1), from - RECENT_HOURS.at(-1) * 3600e3);
  const legend = intakeFigure(state.recent, from, RECENT_HOURS.at(-1), today ? 60e3 : 0);
  recentChart.draw($('recent'), {
    feeds:  state.recent,
    end:    from,
    slack:  today ? 60e3 : 0,
    unit:   3600e3,
    knots:  RECENT_HOURS,
    tick:   (hours) => `${hours}h`,
    when,
    origin: today ? 'now' : 'end',
    phrase: today
      ? (hours) => `Last ${hoursWord(hours)}`
      : (hours) => (whole && hours === RECENT_HOURS.at(-1) ? 'Whole day' : `Last ${hoursWord(hours)} of the day`),
    target: targetOver,
    hint:   'Tap a dot for the split.',
    legend,
    label:  `Running total of intake in ml, left to right from ${today ? `now (${fmtTime(from)})` : `the end of the day (${fmtTime(from)})`} back ${RECENT_HOURS.at(-1)} hours to ${oldest}`,
  });
}

function renderTotals() {
  const s = state.summary;
  const [dayStart, dayEnd] = [state.day.getTime(), addDays(state.day, 1).getTime()];
  const inDay = (t) => ms(t) >= dayStart && ms(t) < dayEnd;
  const { sleeps, feeds, nappies } = state.events;
  const expresses = (state.events.expresses || []).filter((x) => inDay(x.logged_at));

  // Finished bottle feeds with no amount. A breast feed without weights counts as an estimate.
  const unknown = feeds
    .filter((f) => inDay(f.started_at) && f.ended_at && f.kind === 'bottle' && (f.intake_ml ?? null) === null).length;
  // A session counts once it has ended, as in the server's totals; one still running is left out.
  const expressed    = expresses.filter((x) => !x.started_at || x.ended_at);
  const lastExpress  = expressed.slice().sort((a, b) => ms(a.logged_at) - ms(b.logged_at)).pop();
  const expressCount = s.express_count ?? expressed.length;
  const expressMl    = s.express_ml ?? expressed.reduce((sum, x) => sum + (x.amount_ml || 0), 0);
  const dirty   = nappies.filter((n) => n.dirty);
  const big     = dirty.filter((n) => n.dirty_size === 'big').length;
  const small   = dirty.filter((n) => n.dirty_size === 'small').length;
  const unsized = dirty.length - big - small;
  const wet     = nappies.filter((n) => n.wet);
  const heavy   = wet.filter((n) => n.wet_size === 'heavy').length;
  const light   = wet.filter((n) => n.wet_size === 'light').length;
  const noSize  = wet.length - heavy - light;
  const wetSub  = wet.length ? `${heavy} heavy, ${light} light${noSize ? `, ${noSize} not sized` : ''}, ` : '';
  const w       = state.weight;

  // Each item: a chip naming it (to assistive tech), the value and a short line under it. The longer
  // detail is a hover tooltip; focusing or tapping an item shows it in a bubble (.tile-detail).
  const tile = (ev, name, label, value, sub, detail) => `
    <div class="tile" data-ev="${ev}"${detail ? ` tabindex="0" title="${esc(detail)}"` : ''}>
      <span class="tile-ico chip chip-32" role="img" aria-label="${esc(label)}">${icon(name, 20)}</span>
      <div class="tile-text">
        <div class="tile-value">${esc(value)}</div>
        <div class="tile-sub">${esc(sub)}</div>
      </div>
      ${detail ? `<div class="tile-detail">${esc(detail)}</div>` : ''}
    </div>`;
  const feedDetail = s.feed_count
    ? `${s.bottle_count} bottle, ${s.breast_count} breast; `
      + (s.estimated_ml ? `about ${s.estimated_ml} ml estimated` : 'none estimated') + (unknown ? `, ${unknown} unknown` : '')
    : 'None yet';
  setHTML($('totals'), [
    tile('feed', 'milk', 'Feeds', `${s.intake_ml} ml`, plural(s.feed_count, 'feed', 'feeds'), feedDetail),
    tile('sleep', 'moon', 'Sleep', fmtDuration(s.sleep_seconds), plural(sleeps.length, 'sleep', 'sleeps')),
    tile('express', 'express', 'Expressed', `${expressMl} ml`, plural(expressCount, 'session', 'sessions'),
      lastExpress ? `Last at ${fmtTime(lastExpress.logged_at)}` : ''),
    tile('wet', 'droplet', 'Wet nappies', s.wet_count, 'wet', s.nappy_count ? wetSub + plural(s.nappy_count, 'change', 'changes') : ''),
    tile('dirty', 'nappy', 'Dirty nappies', s.dirty_count, 'dirty',
      dirty.length ? `${big} big, ${small} small${unsized ? `, ${unsized} not sized` : ''}` : ''),
    tile('weight', 'weight', 'Latest weight', w ? fmtKg(w.grams) : 'Not yet',
      !w ? 'no weigh-in' : w.at && ms(w.at) >= dayStart ? fmtTime(w.at) : fmtShortDay(w.at || w.day)),
  ].join(''));
}

// The strip's frame is built once and only the track inside it is re-rendered, so the zoom helper
// stays attached to one viewport element (.strip-lanes) for the life of the page.
const strip = { lanes: null, track: null, pointers: 0 };

// Hour labels get denser as the window narrows; the edges only clip while zoomed, so an unzoomed
// strip can still let a dot or the "now" label overhang its ends.
function applyStripZoom(win) {
  const span = win.end - win.start;
  applyTrack(strip.track, win);
  strip.lanes.classList.toggle('is-zoomed', span < 0.999);
  strip.lanes.dataset.zoom = span <= 0.2 ? '2' : span <= 0.6 ? '1' : '0';
}

function buildStrip() {
  if (strip.lanes) return;
  $('strip').innerHTML = `
    <div class="strip">
      <div class="strip-names">
        <div class="strip-name" data-ev="sleep">${icon('moon', 24)}<span class="vh">Sleep</span></div>
        <div class="strip-name" data-ev="feed">${icon('milk', 24)}<span class="vh">Feeds</span></div>
        <div class="strip-name" data-ev="wet">${icon('nappy', 24)}<span class="vh">Nappies</span></div>
        <div class="strip-name" data-ev="express">${icon('express', 24)}<span class="vh">Expressing</span></div>
      </div>
      <div class="strip-lanes"><div class="strip-track"></div></div>
    </div>
    <div class="legend">
      <span><span class="key-bar"></span>Bottle</span>
      <span><span class="key-bar hatch"></span>Breast</span>
      <span><span class="key-dot wet"></span>Wet</span>
      <span><span class="key-dot dirty"></span>Dirty</span>
      <span><span class="key-dot both"></span>Both</span>
      <span><span class="key-diamond"></span>Expressed</span>
      <span class="key-now-item" hidden><span class="key-now"></span><span class="key-now-text">Now</span></span>
    </div>`;
  strip.lanes = $('strip').querySelector('.strip-lanes');
  strip.track = strip.lanes.firstElementChild;
  // While a finger or the mouse is down on the strip (a pinch, pan or range selection), the track
  // is left alone: replacing the element under a touch would cut the gesture off.
  strip.lanes.addEventListener('pointerdown', () => { strip.pointers += 1; });
  const release = () => { strip.pointers = Math.max(0, strip.pointers - 1); };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
}

function renderStrip() {
  const [start, end] = [state.day.getTime(), addDays(state.day, 1).getTime()];
  const { sleeps, feeds, nappies } = state.events;
  const expresses = state.events.expresses || [];
  const t   = now();
  const pct = (time) => ((Math.min(Math.max(ms(time), start), end) - start) / (end - start)) * 100;
  const hourAt = (h) => { const d = new Date(start); d.setHours(h); return d; };
  const HOUR   = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

  // Bars span wall-clock time; the label gives the active (pause-free) duration.
  const bar = (type) => (e) => {
    const left  = pct(e.started_at);
    const right = pct(e.ended_at || t);
    const cls   = [
      'bar',
      ms(e.started_at) < start ? 'cont-l' : '',
      !e.ended_at || ms(e.ended_at) > end ? 'cont-r' : '',
      e.kind === 'breast' ? 'hatch' : '',
    ].filter(Boolean).join(' ');
    const length = e.ended_at ? `, ${fmtDuration(elapsedSeconds(e, t))}` : e.paused_at ? ', paused' : ', still going';
    const label  = `${entryTitle(type, e)}, ${fmtTime(e.started_at)}${length}`;
    return `<button type="button" class="${cls}" data-edit="${type}:${e.id}" style="left:${left.toFixed(3)}%;width:max(${Math.max(right - left, 0).toFixed(3)}%, 8px)" aria-label="${esc(label)}" title="${esc(label)}"></button>`;
  };
  const dot = (n) => {
    const kind  = n.wet && n.dirty ? 'both' : n.dirty ? 'dirty' : 'wet';
    const label = `${nappyTitle(n)}, ${fmtTime(n.logged_at)}`;
    return `<button type="button" class="ndot ${kind}" data-edit="nappy:${n.id}" style="left:${pct(n.logged_at).toFixed(3)}%" aria-label="${esc(label)}" title="${esc(label)}"><span></span></button>`;
  };
  const diamond = (x) => {
    const label = `${entryTitle('express', x)}, ${fmtTime(x.logged_at)}`;
    return `<button type="button" class="ndot xmark" data-edit="express:${x.id}" style="left:${pct(x.logged_at).toFixed(3)}%" aria-label="${esc(label)}" title="${esc(label)}"><span></span></button>`;
  };
  // Every hour is labelled; CSS shows 6-hourly, 3-hourly or hourly labels depending on the zoom.
  const ticks = Array.from({ length: 24 }, (_, h) => {
    const every = h % 6 === 0 ? 't6' : h % 3 === 0 ? 't3' : 't1';
    return `<span class="${every}" style="left:${pct(hourAt(h)).toFixed(3)}%">${esc(HOUR.format(hourAt(h)))}</span>`;
  }).join('');
  const showNow = isToday() && t >= start && t < end;
  const nowline = showNow ? `<div class="nowline" style="left:${pct(t).toFixed(3)}%"><span class="vh">now</span></div>` : '';

  buildStrip();
  if (!strip.pointers) setHTML(strip.track, `
    <div class="strip-ticks" aria-hidden="true">${ticks}</div>
    <div class="lane lane-clip" data-ev="sleep">${sleeps.map(bar('sleep')).join('')}</div>
    <div class="lane lane-clip" data-ev="feed">${feeds.map(bar('feed')).join('')}</div>
    <div class="lane">${nappies.map(dot).join('')}</div>
    <div class="lane" data-ev="express">${expresses.map(diamond).join('')}</div>
    ${nowline}`);
  // The legend's "Now" key carries the time the line stands at.
  const nowKey = $('strip').querySelector('.key-now-item');
  nowKey.hidden = !showNow;
  const nowText = `Now, ${fmtTime(t)}`;
  if (showNow && nowKey.lastElementChild.textContent !== nowText) nowKey.lastElementChild.textContent = nowText;
  // Same element every time, so this is a cheap update; the window itself persists under the key.
  attachZoom(strip.lanes, { key: 'strip', onChange: applyStripZoom, controls: $('strip-zoom') });
  applyStripZoom(zoomWindow('strip'));
}

function renderLog() {
  const [dayStartMs, dayEndMs] = [state.day.getTime(), addDays(state.day, 1).getTime()];
  const { sleeps, feeds, nappies, weights } = state.events;
  const rows = [
    ...sleeps.map((e) => ['sleep', e]), ...feeds.map((e) => ['feed', e]),
    ...nappies.map((e) => ['nappy', e]), ...weights.map((e) => ['weight', e]),
    ...(state.events.expresses || []).map((e) => ['express', e]),
  ].sort((a, b) => ms(entryStart(...b)) - ms(entryStart(...a)));

  if (!rows.length) {
    const today = isToday();
    setHTML($('log'), `
      <div class="empty">
        <div class="empty-art" aria-hidden="true"></div>
        <div>
          <div class="empty-title">${today ? 'Nothing logged yet today' : 'Nothing was logged this day'}</div>
          <div class="empty-body">${today ? 'Tap a button above when something happens.' : 'Use Add an entry to fill in something you remember.'}</div>
        </div>
      </div>`);
    return;
  }
  // No nowMs: a running row's live span is filled by tick(), which keeps this markup stable
  // between refreshes (so focus and scroll survive).
  setHTML($('log'), `<ul class="log-list">${rows.map(([type, e]) => logRow(type, e, { dayStartMs, dayEndMs })).join('')}</ul>`);
}

// Everything that can be opened for editing, keyed "type:id" (what data-edit carries).
function indexEntries() {
  const { sleeps, feeds, nappies, weights } = state.events;
  const { active } = state.status;
  state.entries.clear();
  const add = (type) => (e) => state.entries.set(`${type}:${e.id}`, e);
  sleeps.forEach(add('sleep'));
  feeds.forEach(add('feed'));
  nappies.forEach(add('nappy'));
  weights.forEach(add('weight'));
  (state.events.expresses || []).forEach(add('express'));
  RUNNING.filter((type) => active[type]).forEach((type) => add(type)(active[type]));
}

function renderToday() {
  indexEntries();
  renderDayNav();
  renderRunning();
  renderSince();
  renderQuick();
  renderRecent();
  renderTotals();
  renderStrip();
  renderLog();
  syncStopwatch();
  tick();
}

// Timers and "ago" texts are derived from their timestamp on every tick (never counted), so they
// stay right after the phone sleeps. A timer element may carry data-paused (seconds of completed
// pauses) and data-frozen (the moment an open pause began), see liveAttrs in entries.js.
// Text is only written when it changes.
function tick() {
  const t   = now();
  const put = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const active = (el, from) => {
    const until = el.dataset.frozen ? ms(el.dataset.frozen) : t;
    return Math.max(0, (until - ms(from)) / 1000 - (Number(el.dataset.paused) || 0));
  };
  document.querySelectorAll('[data-since]').forEach((el) => put(el, fmtTimer(active(el, el.dataset.since))));
  document.querySelectorAll('[data-for]').forEach((el) => put(el, fmtDuration(active(el, el.dataset.for))));
  document.querySelectorAll('[data-ago]').forEach((el) => put(el, fmtAgo(seconds(el.dataset.ago, t))));
  // The look-back is anchored on "now": redraw it if a refresh has not done so for a minute.
  if (state.view === 'today' && isToday() && t - recentAt >= 60e3) renderRecent();
  tickStopwatch();
  tickReminders();
}

// ── Actions ────────────────────────────────────────────────────────────────────────────

// forms.js calls this with the toast text for whatever was saved, started or deleted.
function done(message) {
  earlier.key = null;
  if (typeof message === 'string' && message) toast(message);
  refresh();
}

function failed(error) {
  toast(error.message, true);
  // Offline, a refresh would only fail too and replace "Not saved" with "Not updated".
  if (!error.network) refresh();
}

// Default times for a new entry (the design's openNew): ending now, or at midday on a past day.
// A sleep defaults to the last hour, a feed to the last 25 minutes, an express session to the last
// 15, a nappy to wet. The forms only ask for the time of day: the date is the one given here, so
// a new entry lands on the day being viewed.
function blankEntry(type) {
  const MIN   = 60000;
  const base  = isToday() ? now() : state.day.getTime() + 720 * MIN;
  const iso   = (t) => new Date(t).toISOString();
  const last  = state.status && state.status.last.feed;
  return {
    sleep:  { started_at: iso(base - 60 * MIN), ended_at: iso(base), notes: '' },
    feed:   {
      kind: last ? last.kind : 'bottle', started_at: iso(base - 25 * MIN), ended_at: iso(base),
      amount_ml: null, weight_before_g: null, weight_after_g: null, notes: '',
    },
    nappy:   { logged_at: iso(base), wet: true, dirty: false, wet_size: null, dirty_size: null, notes: '' },
    weight:  { logged_at: iso(base), grams: null, notes: '' },
    express: { started_at: iso(base - 15 * MIN), ended_at: iso(base), amount_ml: null, notes: '' },
  }[type];
}

const addEntry = (type) => openEntry(type, blankEntry(type), { onDone: done, day: state.day });

// Starting a sleep, feed or express session lands in the stopwatch, even if it was dismissed for another activity.
function started(message) {
  state.dismissed = false;
  done(message);
}

async function start(type) {
  if (type === 'nappy' || type === 'weight') return addEntry(type);
  if (!state.status) return undefined;
  if (type === 'express') return openStartExpress({ onDone: started, onLogPast: () => addEntry('express') });
  if (type === 'feed') {
    const { feed: last, breast } = state.status.last;
    return openStartFeed(last ? last.kind : 'bottle', {
      onDone:      started,
      onLogPast:   () => addEntry('feed'),
      // Offer the side the last breast feed did not end on.
      defaultSide: otherSide(breast && breast.active_side) || 'left',
    });
  }
  if (state.busy) return undefined;
  state.busy = true;
  try {
    const sleep = await api.create('sleeps', {});
    started(`Sleep started at ${fmtTime(sleep.started_at)}`);
  } catch (error) {
    failed(error);
  } finally {
    state.busy = false;
  }
  return undefined;
}

// Stopping records the end time straight away; the details of a feed and the amount of an express
// session are asked for afterwards and can be skipped.
const STOPPED = { sleep: 'Sleep', feed: 'Feed', express: 'Expressing' };

async function stop(type) {
  const entry = state.status && state.status.active[type];
  if (!entry || state.busy) return;
  state.busy = true;
  try {
    const stopped = await api.stop(TYPES[type].table, entry.id);
    if (type === 'feed') openEntry('feed', stopped, { mode: 'stopFeed', onDone: done });
    if (type === 'express') openEntry('express', stopped, { mode: 'stopExpress', onDone: done });
    // After the sheet, so the toast lands above it.
    done(`${STOPPED[type]} stopped after ${fmtDuration(elapsedSeconds(stopped, now()))}`);
  } catch (error) {
    failed(error);
  } finally {
    state.busy = false;
  }
}

// ── Shell ──────────────────────────────────────────────────────────────────────────────

function setView(view) {
  if (!LOADERS[view]) return;
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('view-today').hidden  = view !== 'today';
  $('view-trends').hidden = view !== 'trends';
  $('view-settings').hidden = view !== 'settings';
  $('daybar').hidden      = view !== 'today';
  renderHead();
  syncStopwatch();
  window.scrollTo(0, 0);
  refresh();
}

function setRange(range) {
  state.range = range;
  document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
  if (range !== 'all') renderHead();   // "All" waits for the data to say where it starts
  refresh();
}

function setWindow(name) {
  if (!WINDOWS.includes(name) || name === state.window) return;
  state.window = name;
  try { localStorage.setItem(WINDOW_KEY, name); } catch (e) { /* private mode: the choice just isn't remembered */ }
  if (state.status) renderRecent();
}

function setDay(day) {
  state.day = startOfDay(day);
  state.followToday = isToday();
  syncStopwatch();
  refresh();
}

// Theme (Settings, Appearance): 'dark' or 'light' is saved; 'system' removes the saved choice and
// follows the device, live. The inline script in index.html applies the same rule before first paint.
const THEME_KEY  = 'theme';
const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
let themeChoice  = 'system';
try { const saved = localStorage.getItem(THEME_KEY); if (saved === 'dark' || saved === 'light') themeChoice = saved; } catch (e) { /* follow the device */ }

function applyTheme() {
  const root  = document.documentElement;
  const theme = themeChoice !== 'system' ? themeChoice : lightQuery.matches ? 'light' : 'dark';
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[theme];
  document.querySelectorAll('[data-theme-choice]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === themeChoice)));
}

function setTheme(choice) {
  if (!['dark', 'light', 'system'].includes(choice)) return;
  themeChoice = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch (e) { /* private mode: the choice just isn't remembered */ }
  applyTheme();
}

lightQuery.addEventListener?.('change', () => { if (themeChoice === 'system') applyTheme(); });

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-edit], [data-start], [data-stop], [data-view], [data-range], [data-window], [data-open-sw], [data-theme-choice]');
  if (!el) return;
  const data = el.dataset;
  if (data.themeChoice) { setTheme(data.themeChoice); return; }
  if (data.openSw !== undefined) { state.dismissed = false; syncStopwatch(); return; }
  if (data.view) { setView(data.view); return; }
  if (data.start) { start(data.start); return; }
  if (data.stop) { stop(data.stop); return; }
  if (data.range) { setRange(data.range); return; }
  if (data.window) { setWindow(data.window); return; }
  const entry = state.entries.get(data.edit);
  if (entry) openEntry(data.edit.split(':')[0], entry, { onDone: done, day: state.day });
});

$('day-prev').addEventListener('click', () => setDay(addDays(state.day, -1)));
$('day-next').addEventListener('click', () => { if (!isToday()) setDay(addDays(state.day, 1)); });
$('day-today').addEventListener('click', () => setDay(new Date()));
$('add-past').addEventListener('click', () => openTypePicker(addEntry));

document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); refresh(); } });
window.addEventListener('focus', refresh);
window.addEventListener('pageshow', refresh);

initStopwatch({
  host:      $('stopwatch'),
  now,
  onChanged: refresh,
  onStop:    stop,
  onFix:     (type, entry) => openEntry(type, entry, { onDone: done, day: state.day }),
  onDismiss: () => { state.dismissed = true; syncStopwatch(); },
});

initReminders({ now, isToday, refresh });

applyTheme();
// The look-back's window: a saved choice wins, else 24 hours.
try { if (WINDOWS.includes(localStorage.getItem(WINDOW_KEY))) state.window = localStorage.getItem(WINDOW_KEY); } catch (e) { /* 24 hours */ }
tick();
setInterval(tick, 1000);
setInterval(() => { if (!document.hidden && !$('sheet').open) refresh(); }, REFRESH_MS);
refresh();
