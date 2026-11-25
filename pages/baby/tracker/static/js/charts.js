// "Over time": per-day column charts, the weight line and the sleep/feed pattern grid.
// Charts are flex columns of real <button>s inside a frame of HTML axes: a y gutter with round
// tick values and gridlines, an x row of day ticks, and a dashed line per average. Colours come
// from CSS custom properties (trends.css), so a theme switch needs no re-render.
//
// Structure: each host gets a stable "shell" (cards, plots, control hosts) that is rebuilt only
// when a card flips between empty and non-empty or the range changes; everything inside is
// filled in place. That keeps the zoom viewports alive across the 30 s refresh and during
// gestures (zoom.js listens on them).
//
// Interaction: hover / focus / arrow keys move the day readout; click, tap, Enter or Space on a
// column opens that day's entries (openList), a weigh-in diamond opens its edit sheet.

import { addDays, esc, fmtDayMonth, fmtDuration, fmtKg, fmtShortDay, fmtTime, icon, startOfDay, ymd } from './util.js';
import { entryStart, logRow } from './entries.js';
import { openEntry, openList } from './forms.js';
import { createLookback, fmtMl, targetOver } from './lookback.js';
import { applyTrack, attachZoom, resetZoom, zoomWindow } from './zoom.js';

// Past this many days the flex columns get too thin to read or tap, so the column charts and
// the pattern grid cover only the latest MAX_DAYS days (summaries still cover the whole range).
const MAX_DAYS    = 60;
const DENSE_OVER  = 20;   // the design narrows the columns past 20 days
const PACKED_OVER = 45;
const WEIGHT_PAD  = 20;   // grams of headroom above and below the weight line, before rounding to the axis step
const Y_LINES     = 5;    // most gridlines above the baseline (26 px apart in a 130 px plot)
const AVG_ROOM    = 1.16; // the y axis reaches this far past an average, so its label fits above the line
const LABEL_GAP   = 0.15; // two average labels at the same end need this share of the plot height between them
const DAY_MS      = 86400e3;
const ROOMY_ROWS  = 14;   // pattern rows are 44 px tall up to here
const TIGHT_ROWS  = 30;   // and 24 px past here
const REOPEN_MS   = 20000;

// Zoom state keys (zoom.js). The column charts, the pattern rows and (when the day domain is
// the same) the weight line share GROUP: its window says which days are shown.
const GROUP  = 'trends-days';
const WEIGHT = 'trends-weight';   // the weight line's own window when the columns are capped
const HOURS  = 'trends-hours';    // the pattern grid's time-of-day axis

const HOUR_FMT    = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const NUM_FMT     = new Intl.NumberFormat();
const ROW_DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' });
// Idle readout: empty. The hint is said once, under the range buttons (index.html), not in every card.
const HINT        = '';
// The column plots' fixed sizes (trends.css): the look-back is drawn to the same plot height, with
// its baseline on the columns' baseline, so it lines up with the cards beside it.
const PLOT_H      = 130;   // #charts .plot
const X_TALL      = 36;    // #charts .x-axis.tall (two-line day ticks, up to TALL_DAYS days in view)
const X_SHORT     = 24;    // #charts .x-axis
const TALL_DAYS   = 14;
const LOOK_TOP    = 26;    // room above the look-back's plot for the knot totals (over the unit row)

// Selection lives here so it survives the 30 s re-render; it resets when the range changes.
const view = {
  range: null, day: null, weigh: null, data: null, charts: null, pattern: null, onDone: null,
  model: null, drawn: '', muted: false, reopen: null, zoom: new Map(), width: 0,
  info: null,   // the card whose "?" explainer is open
};
const bound  = new WeakSet();
const shells = new WeakMap();   // host -> signature of the shell it holds
const filled = new WeakMap();   // element -> the HTML last written into it

const sum     = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const plural  = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ms      = (iso) => new Date(iso).getTime();
const percent = (value) => Number(value.toFixed(3));
const clamp   = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function setHTML(el, html) {
  if (!el || filled.get(el) === html) return;
  filled.set(el, html);
  el.innerHTML = html;
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

// The design's rule: the mean over days that have a value, so empty days don't drag it down.
function average(rows, value) {
  const values = rows.map(value).filter((v) => v > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

const bottleMl  = (d) => Math.max(0, d.intake_ml - d.estimated_ml);
const expressMl = (d) => d.express_ml || 0;

// Every column chart. `types` are the entry types its day popup lists.
// Each has: figure and summary (the card's headline average and the line under it), unit (the y-axis
// title), kind (how the y axis is stepped and written: 'time' in hours, otherwise whole numbers), avgs
// (the averages drawn as dashed lines: value, the label on the line, the legend text) and legend
// ([swatch class, text]).
function columnDefs(daily, range, events) {
  // The range is on the buttons above the cards: the cards don't say it again.
  const rangeWord = range === 'all' ? 'so far' : 'in this range';
  const avg = {
    sleep:   average(daily, (d) => d.sleep_seconds),
    intake:  Math.round(average(daily, (d) => d.intake_ml)),
    feeds:   average(daily, (d) => d.feed_count),
    express: Math.round(average(daily, expressMl)),
    wet:     average(daily, (d) => d.wet_count),
    dirty:   average(daily, (d) => d.dirty_count),
  };
  const totalMl   = sum(daily, (d) => d.intake_ml);
  const estimated = totalMl ? Math.round((sum(daily, (d) => d.estimated_ml) / totalMl) * 100) : 0;
  // The default breast estimate is the server's; read it off a feed that used it.
  const byDefault = (events.feeds || []).find((f) => f.intake_source === 'default' && typeof f.intake_ml === 'number');
  const fallback  = byDefault ? `about ${byDefault.intake_ml} ml each` : 'a standard amount each';
  const byRate    = (events.feeds || []).some((f) => f.intake_source === 'rate');
  const byManual  = (events.feeds || []).some((f) => f.intake_source === 'manual_rate');
  const learned   = `from the feed’s length at the rate of recent weighed feeds, or ${fallback} without enough of those`;
  const typed     = 'from the feed’s length at the rate set in Settings';
  const unweighed = byManual && byRate ? `${typed} or of recent weighed feeds, or ${fallback} where there was neither`
    : byManual ? (byDefault ? `${typed}, or ${fallback} where none was set` : typed)
    : byRate ? learned : fallback;
  return [
    {
      key:     'sleep',
      title:   'Sleep per day',
      ev:      'sleep',
      icon:    'moon',
      parts:   (d) => [d.sleep_seconds],
      bars:    ['bar-sleep'],
      figure:  fmtDuration(avg.sleep),
      summary: 'asleep per day, on average',
      unit:    'hours',
      kind:    'time',
      avgs:    [{ value: avg.sleep, label: `avg ${fmtDuration(avg.sleep)}`, text: 'Average' }],
      read:    (d) => `${fmtDuration(d.sleep_seconds)} asleep`,
      legend:  [['bar-sleep', 'Hours asleep']],
      empty:   `No sleep logged ${rangeWord}.`,
      types:   ['sleep'],
      popup:   'Sleep',
      none:    'No sleep logged this day.',
    },
    {
      key:     'intake',
      title:   'Intake per day',
      ev:      'feed',
      icon:    'milk',
      parts:   (d) => [bottleMl(d), d.estimated_ml],
      bars:    ['bar-feed', 'bar-est'],
      figure:  `${fmtMl(avg.intake)} ml`,
      summary: `per day, on average · ${estimated}% est.`,
      unit:    'ml',
      avgs:    [{ value: avg.intake, label: `avg ${fmtMl(avg.intake)}`, text: 'Average' }],
      read:    (d) => `${d.intake_ml} ml: ${bottleMl(d)} bottle, about ${d.estimated_ml} breast (estimated)`,
      brief:   (d) => `${d.intake_ml} ml: ${bottleMl(d)} bottle, ~${d.estimated_ml} breast`,
      legend:  [['bar-feed', 'Bottle'], ['bar-est', 'Breast (est.)']],
      info:    ['How breast feeds are estimated', `From the before and after weights when given, otherwise ${unweighed}.`],
      empty:   `No intake recorded ${rangeWord}.`,
      types:   ['feed'],
      popup:   'Feeds',
      none:    'No feeds logged this day.',
    },
    {
      key:     'feeds',
      title:   'Feeds per day',
      ev:      'feed',
      icon:    'milk',
      parts:   (d) => [d.bottle_count, d.breast_count],
      bars:    ['bar-feed', 'bar-est'],
      figure:  `${avg.feeds.toFixed(1)} feeds`,
      summary: 'per day, on average',
      unit:    'feeds',
      avgs:    [{ value: avg.feeds, label: `avg ${avg.feeds.toFixed(1)}`, text: 'Average' }],
      read:    (d) => `${plural(d.feed_count, 'feed')}: ${d.bottle_count} bottle, ${d.breast_count} breast`,
      legend:  [['bar-feed', 'Bottle'], ['bar-est', 'Breast']],
      empty:   `No feeds logged ${rangeWord}.`,
      types:   ['feed'],
      popup:   'Feeds',
      none:    'No feeds logged this day.',
    },
    {
      key:     'nappies',
      title:   'Nappies per day',
      ev:      'wet',
      icon:    'nappy',
      side:    true,
      parts:   (d) => [d.wet_count, d.dirty_count],
      bars:    ['bar-wet', 'bar-dirty'],
      figure:  `${avg.wet.toFixed(1)} wet · ${avg.dirty.toFixed(1)} dirty`,
      summary: 'per day, on average',
      unit:    'nappies',
      avgs:    [
        { value: avg.wet, cls: 'avg-wet', label: `avg wet ${avg.wet.toFixed(1)}`, text: 'Wet average' },
        { value: avg.dirty, cls: 'avg-dirty', label: `avg dirty ${avg.dirty.toFixed(1)}`, text: 'Dirty average' },
      ],
      read:    (d) => `${d.wet_count} wet, ${d.dirty_count} dirty`,
      legend:  [['bar-wet', 'Wet'], ['bar-dirty', 'Dirty']],   // the swatches show outlined and solid
      empty:   `No nappies logged ${rangeWord}.`,
      types:   ['nappy'],
      popup:   'Nappies',
      none:    'No nappies logged this day.',
    },
    {
      key:     'express',
      title:   'Expressed per day',
      ev:      'express',
      icon:    'express',
      parts:   (d) => [expressMl(d)],
      bars:    ['bar-express'],
      figure:  `${fmtMl(avg.express)} ml`,
      summary: 'expressed per day, on average',
      unit:    'ml',
      avgs:    [{ value: avg.express, label: `avg ${fmtMl(avg.express)}`, text: 'Average' }],
      read:    (d) => `${expressMl(d)} ml expressed in ${plural(d.express_count || 0, 'session')}`,
      brief:   (d) => `${expressMl(d)} ml in ${plural(d.express_count || 0, 'session')}`,
      legend:  [['bar-express', 'Expressed (not counted in intake)']],
      empty:   `Nothing expressed ${rangeWord}.`,
      types:   ['express'],
      popup:   'Expressed',
      none:    'Nothing expressed this day.',
    },
  ];
}

// The pattern grid's day popup: everything it draws for that day.
const PATTERN = {
  key:   'pattern',
  types: ['sleep', 'feed'],
  popup: 'Sleep and feeds',
  none:  'No sleeps or feeds logged this day.',
  read:  (d) => `${fmtDuration(d.sleep_seconds)} asleep, ${plural(d.feed_count, 'feed')}`,
};

// The intake look-back card (lookback.js): cumulative intake going back from now (the left edge) over
// the range, each knot with its date under it.
// Knots are in days, spaced so their labels stay apart on a phone.
const LOOKBACK_KNOTS = { 7: [1, 3, 7], 14: [1, 3, 7, 14], 30: [1, 7, 14, 30] };
const lookback = createLookback();
const daysWord = (n) => (n === 1 ? 'day' : `${n} days`);
const LOOK_SUMMARY = 'Running total in ml';

// "All" reaches back to the first feed day, which is rarely a whole number of days ago: a day, a
// quarter and a half of the span, and the whole of it, dropping any that crowd a later one.
function allKnots(span) {
  const gap = Math.max(1, span * 0.12);
  return [1, Math.round(span / 4), Math.round(span / 2), span]
    .filter((n, i, all) => i === all.length - 1 || (n >= 1 && all.slice(i + 1).every((later) => later - n >= gap)));
}

// The look-back's own numbers. `since` is where its data starts: local midnight of the day of the
// earliest finished feed in the fetched events (the first day "Intake per day" has a column for).
// A fixed range gets a "no data" stretch before it when its first day column is empty too, i.e. when
// `since` is after the first day of the range (the window itself starts up to a day before that
// column, and a feed-less evening there is not a gap). "All" ends at `since` instead.
function lookbackModel(m) {
  const feeds = (m.events.feeds || []).filter((f) => f.ended_at && (f.intake_ml ?? null) !== null);
  if (!feeds.length) return { empty: true };
  const since = startOfDay(new Date(Math.min(...feeds.map((f) => ms(f.started_at))))).getTime();
  if (m.range !== 'all') {
    const short = since > (m.days.length ? m.days[0].getTime() : m.now - m.span * DAY_MS);
    return { feeds, since: short ? since : null, span: m.span, knots: LOOKBACK_KNOTS[m.span] || allKnots(m.span), whole: null };
  }
  // Rounded up to 0.01 day so the oldest feed is inside, and the knot keeps its value between refreshes.
  const whole = Math.max(0.01, Math.ceil(((m.now - since) / DAY_MS) * 100) / 100);
  return { feeds, since: null, first: since, span: whole, knots: allKnots(whole), whole };
}

function lookbackShell(empty) {
  if (empty) {
    return `<section class="panel" data-ev="feed" data-card="lookback">${cardHead('Recent intake', 'milk', 'Nothing to add up yet', { figure: false })}${emptyBlock('No finished feeds in this range yet.')}</section>`;
  }
  return `
    <section class="panel" data-ev="feed" data-card="lookback">
      ${cardHead('Recent intake', 'milk', LOOK_SUMMARY, { figure: false })}
      <div class="recent"></div>
    </section>`;
}

function fillLookback(m) {
  const section = card('lookback');
  const host    = section && section.querySelector('.recent');
  const look    = m.lookback;
  if (!host || look.empty) return;
  const [dayLo, dayHi] = targetOver(24);
  const isWhole = (n) => look.whole !== null && n === look.whole;
  const legend  = [
    ['bottle', 'Bottle'],
    ['breast', 'Breast (est.)'],
    ['band', `Target ${fmtMl(dayLo)}–${fmtMl(dayHi)} ml a day`],   // a knot's split line has the target for its span
  ];
  if (look.since !== null) legend.push(['gap', `No data before ${fmtShortDay(look.since)}`]);
  // The range is the selected one (or, for "All", the axis's last date says where it starts).
  setText(section.querySelector('.chart-summary'), LOOK_SUMMARY);
  lookback.draw(host, {
    feeds:  look.feeds,
    end:    m.now,
    slack:  60e3,
    unit:   DAY_MS,
    knots:  look.knots,
    tick:   (n) => (isWhole(n) ? 'all' : `${n}d`),
    when:   (n, t) => fmtDayMonth(isWhole(n) ? look.first : t),
    origin: 'now',
    phrase: (n) => (isWhole(n) ? `Since ${fmtShortDay(look.first)}` : n === 1 ? 'Last 24 hours' : `Last ${n} days`),
    target: (n) => targetOver(n * 24),
    hint:   '',   // the hint above the cards covers it
    // Same plot height and baseline as the column charts beside it (their x axis is under it).
    plot:     PLOT_H,
    top:      LOOK_TOP,
    below:    m.vis.daily.length <= TALL_DAYS ? X_TALL : X_SHORT,
    roundTop: true,
    label:  `Running total of intake in ml, left to right from now (${fmtDayMonth(m.now)}) back ${look.whole !== null ? `to ${fmtShortDay(look.first)}` : `over ${daysWord(look.span)}`}`,
    legend,
    since:      look.since ?? undefined,
    sinceLabel: look.since !== null ? fmtShortDay(look.since) : undefined,
  });
}

const colTotal = (def, parts) => (def.side ? Math.max(...parts) : parts.reduce((a, b) => a + b, 0));

// Each sleep/feed clipped to the local day (days can be 23 or 25 h); running ones end at now.
function daySegments(day, events, now) {
  const from = day.getTime();
  const to   = addDays(day, 1).getTime();
  const clip = (kind) => (item) => {
    const start = Math.max(ms(item.started_at), from);
    const end   = Math.min(item.ended_at ? ms(item.ended_at) : now, to);
    return end > start ? { kind, left: percent(((start - from) / (to - from)) * 100), width: percent(((end - start) / (to - from)) * 100) } : null;
  };
  return [...(events.sleeps || []).map(clip('sleep')), ...(events.feeds || []).map(clip('feed'))].filter(Boolean);
}

// Everything a draw needs, derived from the data and the current zoom windows.
function model() {
  const { range, now } = view.data;
  const span   = view.data.span || (range === 'all' ? Math.max(1, (view.data.daily || []).length) : Number(range));
  const daily  = view.data.daily || [];
  const days   = view.data.days || [];
  const events = view.data.events || {};
  const shown  = { daily: daily.slice(-MAX_DAYS), days: days.slice(-MAX_DAYS) };
  const n      = shown.daily.length;
  const win    = zoomWindow(GROUP);
  const i0     = n ? clamp(Math.round(win.start * n), 0, n - 1) : 0;
  const i1     = n ? clamp(Math.round(win.end * n), i0 + 1, n) : 0;
  const defs   = columnDefs(daily, range, events);

  const from = days.length ? days[0].getTime() : 0;
  const to   = days.length ? addDays(days[days.length - 1], 1).getTime() : 0;
  const weighIns = (events.weights || [])
    .map((w) => ({ id: w.id, grams: w.grams, at: ms(w.logged_at) }))
    .filter((w) => w.at >= from && w.at < to)
    .sort((a, b) => a.at - b.at);

  return {
    range, span, now, daily, days, events, shown, n, i0, i1, defs, weighIns, from, to,
    lookback: lookbackModel({ range, span, now, events, days }),
    vis:      { daily: shown.daily.slice(i0, i1), days: shown.days.slice(i0, i1) },
    zoomed:   i1 - i0 < n,
    today:    ymd(new Date(now)),
    empty:    Object.fromEntries(defs.map((def) => [def.key, !shown.daily.some((d) => colTotal(def, def.parts(d)) > 0)])),
    weightId: daily.length > n ? WEIGHT : GROUP,
    patternEmpty: !shown.days.some((day) => daySegments(day, events, now).length),
  };
}

const dayLabel = (m, day) => (ymd(day) === m.today ? 'Today' : fmtShortDay(day));

// ── Shells ───────────────────────────────────────────────────────────────────────────────

// A tinted chip, then the headline figure (filled in later; the title stays for screen readers) over
// a summary line. Without a figure (empty cards, the look-back) the title itself is the heading.
// `tools` go at the right of the head: the zoom controls (zoom.js fills [data-zoom-host]) and "?".
function cardHead(title, iconName, summary, { figure = true, tools = '' } = {}) {
  const heading = figure
    ? `<h2><span class="vh">${esc(title)}: </span><span class="chart-figure"></span></h2>`
    : `<h2>${esc(title)}</h2>`;
  return `
    <div class="card-head">
      ${iconName ? `<span class="chip chip-40">${icon(iconName, 24)}</span>` : ''}
      <div class="card-text">
        ${heading}
        <div class="chart-summary">${esc(summary)}</div>
      </div>
      ${tools ? `<div class="card-tools">${tools}</div>` : ''}
    </div>`;
}

// A "?" button and the explainer it opens, a small panel under the head (filled by fillColumn).
function infoTools(key, title) {
  const id = `trends-info-${key}`;
  return `
        <button type="button" class="btn btn-icon info-btn" data-info="${esc(key)}" aria-expanded="false" aria-controls="${id}" aria-label="${esc(title)}" title="${esc(title)}"><span aria-hidden="true">?</span></button>
        <div class="info-pop" id="${id}" role="note" aria-label="${esc(title)}" hidden><p class="info-title">${esc(title)}</p><p class="info-text"></p></div>`;
}

function emptyBlock(text) {
  return `<div class="chart-empty"><div class="empty-dot"></div><div class="empty-text">${esc(text)}</div></div>`;
}

// Over the plot: the y-axis title (its unit, and "5 of 14 days" while zoomed), then the readout of the
// day or weigh-in in hand (empty until one is hovered, focused or tapped).
const chartBar = '<div class="chart-bar"><div class="chart-unit"></div><div class="readout"></div></div>';
const zoomHost = '<div data-zoom-host></div>';

// The frame every chart sits in: y gutter, plot (gridlines behind, average lines in front), x ticks.
const frame = (plot, cls = '') => `
      <div class="chart-frame${cls}">
        <div class="y-axis" aria-hidden="true"></div>
        <div class="plot-area">
          <div class="plot-grid" aria-hidden="true"></div>
          ${plot}
          <div class="plot-marks" aria-hidden="true"></div>
        </div>
        <div class="x-axis" aria-hidden="true"></div>
      </div>`;

function columnShell(def, empty) {
  if (empty) {
    return `<section class="panel" data-ev="${def.ev}" data-card="${def.key}">${cardHead(def.title, def.icon, 'Nothing to average yet', { figure: false })}${emptyBlock(def.empty)}</section>`;
  }
  return `
    <section class="panel" data-ev="${def.ev}" data-card="${def.key}">
      ${cardHead(def.title, def.icon, '', { tools: zoomHost + (def.info ? infoTools(def.key, def.info[0]) : '') })}
      ${chartBar}
      ${frame(`<div class="plot" role="group" aria-label="${esc(def.title)}"></div>`)}
      <div class="legend"></div>
    </section>`;
}

function weightShell(empty) {
  if (empty) {
    return `<section class="panel" data-ev="weight" data-card="weight">${cardHead('Weight', 'weight', 'Nothing to chart yet', { figure: false })}${emptyBlock('No weigh-ins in this range yet. Log one from Today.')}</section>`;
  }
  return `
    <section class="panel" data-ev="weight" data-card="weight">
      ${cardHead('Weight', 'weight', '', { tools: zoomHost })}
      ${chartBar}
      ${frame('<div class="plot-line" role="group" aria-label="Weight"><div class="line-track"></div></div>', ' is-line')}
      <div class="legend"></div>
    </section>`;
}

const PATTERN_SUMMARY = 'One row per day, newest at the top';

function patternShell(empty) {
  if (empty) {
    return `${cardHead('Sleep and feed pattern', '', PATTERN_SUMMARY, { figure: false })}
      <div class="pattern-empty"><div class="empty-dot"></div><div class="empty-text">No sleeps or feeds in this range yet. The rhythm shows up here after a day or two.</div></div>`;
  }
  return `${cardHead('Sleep and feed pattern', '', PATTERN_SUMMARY, { figure: false, tools: '<div data-zoom-host="days"></div><div data-zoom-host="hours"></div>' })}
    <div class="pattern-span"></div>
    <div class="pattern-grid">
      <div class="pattern-days"></div>
      <div class="pattern-plot zoom-clip">
        <div class="pattern-inner">
          <div class="pattern-ticks" aria-hidden="true"></div>
          <div class="pattern-rows"></div>
        </div>
      </div>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="swatch-sleep"></span>Sleep</span>
      <span class="legend-item"><span class="swatch-feed"></span>Feed</span>
      <span class="legend-note" data-capped></span>
    </div>`;
}

function ensureShells(m) {
  const chartSig = `${m.range}|${m.defs.map((def) => `${def.key}:${m.empty[def.key]}`).join(',')}|weight:${!m.weighIns.length}|lookback:${Boolean(m.lookback.empty)}`;
  if (shells.get(view.charts) !== chartSig) {
    shells.set(view.charts, chartSig);
    // The look-back sits straight after "Intake per day".
    view.charts.innerHTML = m.defs.map((def) => columnShell(def, m.empty[def.key]) + (def.key === 'intake' ? lookbackShell(m.lookback.empty) : '')).join('')
      + weightShell(!m.weighIns.length);
  }
  const patternSig = `pattern:${m.patternEmpty}`;
  if (shells.get(view.pattern) !== patternSig) {
    shells.set(view.pattern, patternSig);
    view.pattern.innerHTML = patternShell(m.patternEmpty);
  }
}

const card = (key) => view.charts.querySelector(`[data-card="${key}"]`);

// (Re)attach the zoom helper. Cheap when the element is already attached; the windows persist
// per key in zoom.js, so rebuilt shells pick their zoom back up.
function attachAll(m) {
  view.zoom.clear();
  for (const def of m.defs) {
    const section = card(def.key);
    const plot    = section && section.querySelector('.plot');
    if (!plot) continue;
    view.zoom.set(def.key, attachZoom(plot, {
      key:      `trends-${def.key}`,
      group:    GROUP,
      units:    m.n,
      controls: section.querySelector('[data-zoom-host]'),
      iconOnly: true,
      onChange: onZoom,
    }));
  }

  const line = view.charts.querySelector('.plot-line');
  if (line) {
    attachZoom(line, {
      key:      WEIGHT,
      group:    m.weightId,
      units:    m.daily.length,
      controls: card('weight').querySelector('[data-zoom-host]'),
      iconOnly: true,
      onChange: onZoom,
    });
  }

  const plot = view.pattern.querySelector('.pattern-plot');
  if (plot) {
    attachZoom(plot, {
      key:        HOURS,
      maxScale:   12,
      controls:   view.pattern.querySelector('[data-zoom-host="hours"]'),
      resetLabel: 'Show the whole day',
      resetIcon:  'clock',
      iconOnly:   true,
      onChange:   applyHours,
    });
    // The rows follow the day window of the charts; this member only offers its Reset.
    attachZoom(view.pattern.querySelector('.pattern-days'), {
      key:        'trends-pattern-days',
      group:      GROUP,
      units:      m.n,
      passive:    true,
      controls:   view.pattern.querySelector('[data-zoom-host="days"]'),
      resetLabel: 'Show all days',
      resetIcon:  'calendar',
      iconOnly:   true,
      onChange:   onZoom,
    });
  }
}

// ── Filling ──────────────────────────────────────────────────────────────────────────────

// Y axis: round steps, at most Y_LINES of them above the baseline. `ticks` run from `lo` to `top`.
const WHOLE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000];
const HOUR_STEPS  = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 24].map((h) => h * 3600);
const KG_STEPS    = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];   // grams

function axisScale(peak, kind) {
  const steps = kind === 'time' ? HOUR_STEPS : WHOLE_STEPS;
  const step  = steps.find((n) => peak / n <= Y_LINES) ?? steps.at(-1) * Math.ceil(peak / steps.at(-1) / Y_LINES);
  const count = Math.max(1, Math.ceil(peak / step - 1e-9));
  return {
    lo:    0,
    top:   count * step,
    ticks: Array.from({ length: count + 1 }, (_, i) => i * step),
    fmt:   kind === 'time' ? (v) => String(Number((v / 3600).toFixed(2))) : (v) => NUM_FMT.format(v),
  };
}

// Weight does not start at zero: the axis runs between round values just outside the weigh-ins.
function weightScale(min, max) {
  for (const step of KG_STEPS) {
    const lo  = Math.floor((min - WEIGHT_PAD) / step) * step;
    const top = Math.ceil((max + WEIGHT_PAD) / step) * step;
    if ((top - lo) / step > Y_LINES && step !== KG_STEPS.at(-1)) continue;
    const places = step % 1000 === 0 || step % 100 === 0 ? 1 : 2;
    return { lo, top, ticks: Array.from({ length: Math.round((top - lo) / step) + 1 }, (_, i) => lo + i * step), fmt: (g) => (g / 1000).toFixed(places) };
  }
  return null;
}

// Tick numbers in the gutter and a gridline for each (the baseline is the plot's own border).
function fillYAxis(section, scale) {
  const at = (v) => percent(((v - scale.lo) / (scale.top - scale.lo)) * 100);
  setHTML(section.querySelector('.y-axis'), scale.ticks.map((v) => `<span style="bottom:${at(v)}%">${esc(scale.fmt(v))}</span>`).join(''));
  setHTML(section.querySelector('.plot-grid'), scale.ticks.slice(1).map((v) => `<i style="bottom:${at(v)}%"></i>`).join(''));
}

// X axis: a tick under the middle of every `every`-th day, counted back from the newest day of the
// whole range so ticks stay on the same days while panning. Up to a fortnight in view they are
// "Thu" over "12"; more than that, "12 Nov". `every` is the smallest step whose labels cannot touch
// at the plot's current width. first: index of days[0] in the whole range of `total` days.
const TICK_EVERY = [1, 2, 3, 4, 7, 14, 28, 56, 91, 182, 364];
const GUTTER     = 36;   // px, the y gutter (trends.css --gutter)

function fillXAxis(section, m, days, first, total) {
  const axis  = section.querySelector('.x-axis');
  const count = days.length;
  if (!axis || !count) return;
  const width = axis.clientWidth || 260;
  const colW  = width / count;
  const tall  = count <= 14;
  const every = TICK_EVERY.find((k) => k * colW >= (tall ? 27 : 46)) ?? TICK_EVERY.at(-1);
  let html = '';
  days.forEach((day, i) => {
    if ((total - 1 - first - i) % every) return;
    const name   = ymd(day) === m.today ? 'Today' : tall ? WEEKDAY_FMT.format(day) : fmtDayMonth(day);
    const centre = (i + 0.5) * colW;
    const half   = name.length * 3.2;
    // A label that would run off the card slides back in; its tick mark stays on the day.
    // "Today" is wider than a weekday, so on tight ticks it leans right, away from its neighbour.
    const lean   = name === 'Today' ? Math.max(0, 33 - every * colW) : 0;
    const shift  = Math.round(clamp(centre + lean, half - GUTTER + 2, width + 12 - half) - centre);
    const left   = percent(((i + 0.5) / count) * 100);
    const today  = ymd(day) === m.today ? ' class="is-today"' : '';
    html += `<s style="left:${left}%"></s><span${today} style="left:${left}%${shift ? `;margin-left:${shift}px` : ''}"><b>${esc(name)}</b>${tall ? `<i>${day.getDate()}</i>` : ''}</span>`;
  });
  axis.classList.toggle('tall', tall);
  setHTML(axis, html);
}

function unitHTML(unit, shown, total) {
  return `${esc(unit)}${shown < total ? `<span class="axis-note"> · ${shown} of ${esc(plural(total, 'day'))}</span>` : ''}`;
}

// Which end of an average line its label sits at: one where no column in view rises past the line
// (the label is above it), else the end with the shorter columns.
function labelSide(totals, value) {
  const reach = Math.max(1, Math.ceil(totals.length * 0.3));
  const left  = Math.max(...totals.slice(0, reach));
  const right = Math.max(...totals.slice(-reach));
  return left <= value || left <= right ? 'left' : 'right';
}

function fillColumn(section, def, m) {
  const { daily, days } = m.vis;
  const parts  = daily.map(def.parts);
  const totals = parts.map((p) => colTotal(def, p));
  const max    = Math.max(0, ...totals);
  const count  = parts.length;
  const avgs   = def.avgs.filter((a) => a.value > 0);
  // The scale covers the tallest day in view and every average (which is over the whole range).
  const scale  = axisScale(Math.max(max, ...avgs.map((a) => a.value * AVG_ROOM)), def.kind);

  const cols = parts.map((values, i) => {
    const bars = !max ? '' : values
      .map((value, k) => ({ value, cls: def.bars[k] }))
      .filter((bar) => def.side || bar.value > 0)
      .map((bar) => `<span class="cbar ${bar.cls}${bar.value > 0 ? '' : ' is-zero'}" style="height:${percent((bar.value / scale.top) * 100)}%"></span>`)
      .join('');
    const label = `${fmtShortDay(days[i])}: ${def.read(daily[i])}`;
    return `<button type="button" class="daycol" data-chart="${def.key}" data-day="${esc(daily[i].date)}" tabindex="-1" aria-haspopup="dialog" aria-label="${esc(label)}"><span class="col-in${def.side ? ' side' : ''}">${bars}</span></button>`;
  }).join('');

  const plot = section.querySelector('.plot');
  plot.classList.toggle('dense', count > DENSE_OVER && count <= PACKED_OVER);
  plot.classList.toggle('packed', count > PACKED_OVER);
  setHTML(plot, cols);

  fillYAxis(section, scale);
  fillXAxis(section, m, days, m.i0, m.n);
  // Each label goes where the columns leave room; two that would sit on top of each other (nappies,
  // with close averages) take an end each.
  const sides = avgs.map((a) => labelSide(totals, a.value));
  if (avgs.length > 1 && sides[0] === sides[1] && Math.abs(avgs[0].value - avgs[1].value) / scale.top < LABEL_GAP) {
    sides[1] = sides[0] === 'left' ? 'right' : 'left';
  }
  setHTML(section.querySelector('.plot-marks'), avgs.map((a, k) => {
    const side = sides[k];
    return `<div class="avg-line ${a.cls || ''}" style="bottom:${percent((a.value / scale.top) * 100)}%"><span class="avg-label at-${side}">${esc(a.label)}</span></div>`;
  }).join(''));

  const item   = ([cls, text]) => `<span class="legend-item"><span class="swatch ${cls}"></span>${esc(text)}</span>`;
  const legend = def.legend.map(item).join('') + avgs.map((a) => item([`swatch-line ${a.cls || ''}`, a.text])).join('');
  const capped = m.daily.length > m.n ? `<span class="legend-note">Columns cover the latest ${m.n} of ${m.daily.length} days; averages cover them all.</span>` : '';

  setText(section.querySelector('.chart-figure'), def.figure);
  setText(section.querySelector('.chart-summary'), def.summary);
  setHTML(section.querySelector('.chart-unit'), unitHTML(def.unit, count, m.n));
  setHTML(section.querySelector('.legend'), legend + capped);
  if (def.info) {
    setText(section.querySelector('.info-text'), def.info[1]);
    showInfo(section, view.info === def.key);
  }
}

// ── The "?" explainer ───────────────────────────────────────────────────────────────────

function showInfo(section, open) {
  const button = section.querySelector('[data-info]');
  const pop    = section.querySelector('.info-pop');
  if (!button || !pop) return;
  button.setAttribute('aria-expanded', String(open));
  pop.hidden = !open;
}

function setInfo(key) {
  view.info = key;
  if (!view.charts) return;
  for (const section of view.charts.querySelectorAll('[data-card]')) showInfo(section, section.dataset.card === key);
}

// Escape, or a tap anywhere but the "?" and its panel, closes the open explainer.
function onInfoKey(event) {
  if (event.key !== 'Escape' || !view.info || !view.charts) return;
  const section = card(view.info);
  const inside  = section && section.querySelector('.card-tools').contains(document.activeElement);
  setInfo(null);
  if (inside) section.querySelector('[data-info]').focus();
}

function onInfoOutside(event) {
  if (!view.info || !view.charts) return;
  const section = card(view.info);
  if (section && section.querySelector('.card-tools').contains(event.target)) return;
  setInfo(null);
}

const weighWhen = (p) => `${fmtShortDay(new Date(p.at))}, ${fmtTime(new Date(p.at))}`;

function fillWeight(m) {
  const section = card('weight');
  const track   = section && section.querySelector('.line-track');
  m.points = [];
  if (!track) return;

  const grams = m.weighIns.map((w) => w.grams);
  const scale = weightScale(Math.min(...grams), Math.max(...grams));
  const lo    = scale.lo;
  const hi    = scale.top;
  fillYAxis(section, scale);
  m.points = m.weighIns.map((w) => ({
    ...w,
    x: percent(((w.at - m.from) / (m.to - m.from)) * 100),
    y: percent((1 - (w.grams - lo) / (hi - lo)) * 100),
  }));
  const first  = m.points[0];
  const latest = m.points[m.points.length - 1];
  const diff   = latest.grams - first.grams;

  const dots = m.points.map((p) => `<button type="button" class="weigh" data-weigh="${esc(p.id)}" tabindex="-1" aria-haspopup="dialog" aria-label="${esc(`${weighWhen(p)}: ${fmtKg(p.grams)}`)}" style="left:${p.x}%;top:${p.y}%"><span class="diamond"></span></button>`).join('');
  setHTML(track, `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${m.points.map((p) => `${p.x},${p.y}`).join(' ')}" vector-effect="non-scaling-stroke"/></svg>${dots}`);

  const at = new Date(latest.at);
  setText(section.querySelector('.chart-figure'), fmtKg(latest.grams));
  setText(section.querySelector('.chart-summary'), m.points.length > 1
    ? `${diff >= 0 ? 'up' : 'down'} ${Math.abs(diff)} g from ${fmtKg(first.grams)}`
    : 'One weigh-in in this range');
  setHTML(section.querySelector('.legend'), `<span class="legend-item"><span class="swatch diamond"></span>${esc(`Weigh-in · latest ${ymd(at) === m.today ? 'today' : fmtShortDay(at)}, ${fmtTime(at)}`)}</span>`);
}

function hourTicks(win) {
  const hours = (win.end - win.start) * 24;
  const every = hours > 12 ? 6 : hours > 6 ? 3 : 1;
  let html = '';
  for (let h = 0; h < 24; h += every) html += `<span style="left:${percent((h / 24) * 100)}%">${esc(HOUR_FMT.format(new Date(2020, 0, 1, h)))}</span>`;
  return html;
}

// The pattern grid's own zoom: which part of the 24 h is shown.
function applyHours() {
  if (!view.pattern) return;
  const win = zoomWindow(HOURS);
  applyTrack(view.pattern.querySelector('.pattern-inner'), win);
  setHTML(view.pattern.querySelector('.pattern-ticks'), hourTicks(win));
}

function fillPattern(m) {
  const grid = view.pattern.querySelector('.pattern-grid');
  if (!grid) return;
  const rows = m.vis.days.map((day, i) => ({ day, totals: m.vis.daily[i], segs: daySegments(day, m.events, m.now) })).reverse();
  grid.classList.toggle('roomy', rows.length <= ROOMY_ROWS);
  grid.classList.toggle('tight', rows.length > TIGHT_ROWS);

  setHTML(grid.querySelector('.pattern-days'), `<div class="pattern-corner"></div>${rows.map((row) => {
    const label = `${fmtShortDay(row.day)}: ${PATTERN.read(row.totals)}`;
    return `<button type="button" class="pattern-day${ymd(row.day) === m.today ? ' is-today' : ''}" data-pday="${esc(row.totals.date)}" aria-haspopup="dialog" aria-label="${esc(label)}">${esc(ROW_DAY_FMT.format(row.day))}</button>`;
  }).join('')}`);
  setHTML(grid.querySelector('.pattern-rows'), rows.map((row) => {
    const segs = row.segs.map((s) => `<span class="seg-${s.kind}" style="left:${s.left}%;width:${s.width}%"></span>`).join('');
    return `<div class="pattern-track" aria-hidden="true">${segs}</div>`;
  }).join(''));

  const days = m.vis.days;
  setText(view.pattern.querySelector('.pattern-span'), m.zoomed && days.length
    ? (days.length > 1 ? `Showing ${fmtShortDay(days[0])} to ${dayLabel(m, days[days.length - 1])}` : `Showing ${dayLabel(m, days[0])}`)
    : '');
  setText(view.pattern.querySelector('[data-capped]'), m.daily.length > m.n ? `Covers the latest ${m.n} of ${m.daily.length} days.` : '');
  applyHours();
}

// Beside the weight card the pattern takes that card's height (trends.css #pattern.is-paired): only
// when the two share a grid row and there is a weight line to set it. Alone in its row, or beside an
// empty weight card, it keeps its own height.
function pairPattern(m) {
  const weight = card('weight');
  const a = weight && weight.getBoundingClientRect();
  const b = view.pattern.getBoundingClientRect();
  if (!a || !a.width || !b.width) return;   // a hidden view: decided once it shows (the resize observer refills)
  view.pattern.classList.toggle('is-paired', m.weighIns.length > 0 && Math.abs(a.top - b.top) < 1);
}

// Highlight view.day in every column chart, keep one tab stop per plot, write the readouts.
function markDay() {
  const m = view.model;
  const i = m.shown.daily.findIndex((d) => d.date === view.day);
  for (const def of m.defs) {
    const section = card(def.key);
    const plot    = section && section.querySelector('.plot');
    if (!plot) continue;
    const buttons = [...plot.querySelectorAll(':scope > button')];
    let current   = null;
    let stop      = null;
    for (const button of buttons) {
      const on = button.dataset.day === view.day;
      if (on) current = button;
      if (on) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      if (button.tabIndex === 0) stop = button;
    }
    if (!stop && buttons.length) (current || buttons[buttons.length - 1]).tabIndex = 0;
    // Short enough to share the unit's line (the day popup and the column's label have the long form).
    const text = i >= 0 ? `${ROW_DAY_FMT.format(m.shown.days[i])} · ${(def.brief || def.read)(m.shown.daily[i])}` : HINT;
    const out  = section.querySelector('.readout');
    setText(out, text);
    if (out && out.title !== text) out.title = text;
  }
}

// Position the weight line for its zoom window, hide the weigh-ins outside it, mark the
// current one and write the readout.
function markWeigh() {
  const m       = view.model;
  const section = card('weight');
  const track   = section && section.querySelector('.line-track');
  if (!track || !m.points.length) return;

  const win = zoomWindow(m.weightId);
  applyTrack(track, win);
  const inWindow = (p) => p.x >= win.start * 100 - 0.01 && p.x <= win.end * 100 + 0.01;
  const visible  = m.points.filter(inWindow);
  const selected = visible.find((p) => String(p.id) === String(view.weigh)) || visible[visible.length - 1] || null;
  const byId     = new Map(m.points.map((p) => [String(p.id), p]));

  let stop  = null;
  let chosen = null;
  for (const button of track.querySelectorAll(':scope > button')) {
    const point = byId.get(button.dataset.weigh);
    const shown = Boolean(point) && inWindow(point);
    button.hidden = !shown;
    if (point && point === selected) {
      chosen = button;
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
    if (!shown) button.tabIndex = -1;
    else if (button.tabIndex === 0) stop = button;
  }
  if (!stop && chosen) chosen.tabIndex = 0;

  setText(section.querySelector('.readout'), selected ? `${weighWhen(selected)} · ${fmtKg(selected.grams)}` : 'No weigh-ins in these days');
  const n     = m.days.length;
  const a     = clamp(Math.round(win.start * n), 0, n - 1);
  const b     = clamp(Math.round(win.end * n), a + 1, n);
  fillXAxis(section, m, m.days.slice(a, b), a, n);
  setHTML(section.querySelector('.chart-unit'), unitHTML('kg', b - a, n));
}

const windowsKey = () => JSON.stringify([zoomWindow(GROUP), zoomWindow(WEIGHT)]);

const focusSelector = (el) => (el.dataset.weigh !== undefined
  ? `button[data-weigh="${CSS.escape(el.dataset.weigh)}"]`
  : `button[data-chart="${CSS.escape(el.dataset.chart)}"][data-day="${CSS.escape(el.dataset.day)}"]`);

const stopSelector = (el) => (el.dataset.weigh !== undefined
  ? '.line-track > button[tabindex="0"]'
  : `[data-card="${CSS.escape(el.dataset.chart)}"] .plot > button[tabindex="0"]`);

// Make one button in its plot the tab stop (roving tabindex), optionally focusing it.
function setTabStop(button, focus) {
  for (const other of button.parentElement.querySelectorAll(':scope > button')) other.tabIndex = other === button ? 0 : -1;
  if (focus) button.focus({ preventScroll: true });
}

function fill(m) {
  view.model = m;
  view.drawn = windowsKey();

  // Filling can replace the buttons, so carry keyboard focus over to the same day / weigh-in
  // (or, when zooming pushed it out of view, to that chart's tab stop).
  const active = document.activeElement;
  const held   = active && view.charts.contains(active) && active.matches('button[data-day], button[data-weigh]')
    ? [focusSelector(active), stopSelector(active)]
    : null;

  for (const def of m.defs) {
    const section = card(def.key);
    if (section && section.querySelector('.plot')) fillColumn(section, def, m);
  }
  fillLookback(m);
  fillWeight(m);
  fillPattern(m);
  pairPattern(m);
  markDay();
  markWeigh();

  if (!held || (active.isConnected && !active.hidden)) return;
  const target = view.charts.querySelector(held[0]) || view.charts.querySelector(held[1]);
  if (target && !target.hidden) setTabStop(target, true);
}

function draw() {
  const m = model();
  ensureShells(m);
  view.muted = true;    // attaching may report a persisted or re-snapped window: one fill below covers it
  attachAll(m);
  view.muted = false;
  fill(model());
}

// zoom.js calls this for every member of a group; one redraw per window change is enough.
function onZoom() {
  if (view.muted || !view.data || windowsKey() === view.drawn) return;
  fill(model());
}

// ── Day popup ────────────────────────────────────────────────────────────────────────────

// [type, entry] pairs a chart shows for one local day, newest first.
function dayEntries(types, day) {
  const from   = day.getTime();
  const to     = addDays(day, 1).getTime();
  const now    = view.data.now;
  const events = view.data.events || {};
  const within = (iso) => ms(iso) >= from && ms(iso) < to;
  const lists  = {
    sleep:   () => (events.sleeps || []).filter((s) => ms(s.started_at) < to && (s.ended_at ? ms(s.ended_at) : now) > from),
    feed:    () => (events.feeds || []).filter((f) => within(f.started_at)),
    nappy:   () => (events.nappies || []).filter((n) => within(n.logged_at)),
    express: () => (events.expresses || []).filter((x) => within(x.logged_at)),
  };
  return types
    .flatMap((type) => lists[type]().map((entry) => [type, entry]))
    .sort((a, b) => ms(entryStart(...b)) - ms(entryStart(...a)));
}

// Saving or deleting from the popup refreshes the data; renderTrends then reopens it.
const afterEdit = (chart, date) => (message) => {
  if (chart) view.reopen = { chart, date, range: view.range, at: Date.now() };
  if (view.onDone) view.onDone(message);
};

function openDay(chart, date) {
  const data  = view.data;
  const index = (data.daily || []).findIndex((d) => d.date === date);
  const spec  = chart === PATTERN.key ? PATTERN : columnDefs(data.daily || [], data.range, data.events || {}).find((def) => def.key === chart);
  if (index < 0 || !spec) return;

  const day  = data.days[index];
  const rows = dayEntries(spec.types, day);
  const span = { dayStartMs: day.getTime(), dayEndMs: addDays(day, 1).getTime(), nowMs: data.now, attr: 'data-pick' };
  openList({
    title:     `${spec.popup} · ${fmtShortDay(day)}`,
    subtitle:  spec.read(data.daily[index]),
    rowsHTML:  rows.map(([type, entry]) => logRow(type, entry, span)).join(''),
    emptyText: spec.none,
    onPick:    (picked) => {
      const found = rows.find(([type, entry]) => `${type}:${entry.id}` === picked);
      if (found) openEntry(found[0], found[1], { onDone: afterEdit(chart, date) });
    },
  });
}

function reopenAfterRefresh() {
  const pending = view.reopen;
  view.reopen = null;
  if (!pending || pending.range !== view.range || Date.now() - pending.at > REOPEN_MS) return;
  const sheet = document.getElementById('sheet');
  if (sheet && sheet.open) return;   // something else is on screen already
  openDay(pending.chart, pending.date);
}

// ── Events ───────────────────────────────────────────────────────────────────────────────

function showDay(date) {
  if (date === view.day) return;
  view.day = date;
  markDay();
}

function showWeigh(id) {
  if (String(id) === String(view.weigh)) return;
  view.weigh = id;
  markWeigh();
}

// Hover and focus only move the readout.
function onPoint(event) {
  if (!view.data || !view.model) return;
  const button = event.target.closest && event.target.closest('button[data-day], button[data-weigh]');
  if (!button) return;
  if (event.type === 'focusin') setTabStop(button, false);
  if (button.dataset.weigh !== undefined) showWeigh(button.dataset.weigh);
  else showDay(button.dataset.day);
}

// Click, tap, Enter or Space opens the day's entries (or the weigh-in itself).
function onClick(event) {
  if (!view.data || !view.model) return;
  const info = event.target.closest('button[data-info]');
  if (info) {
    setInfo(view.info === info.dataset.info ? null : info.dataset.info);
    return;
  }
  const button = event.target.closest('button[data-day], button[data-weigh]');
  if (!button) return;
  setTabStop(button, false);
  if (button.dataset.weigh === undefined) {
    showDay(button.dataset.day);
    openDay(button.dataset.chart, button.dataset.day);
    return;
  }
  showWeigh(button.dataset.weigh);
  const entry = (view.data.events.weights || []).find((w) => String(w.id) === button.dataset.weigh);
  if (entry) openEntry('weight', entry, { onDone: afterEdit(null, null) });
}

function onPatternClick(event) {
  const button = event.target.closest('button[data-pday]');
  if (button && view.data) openDay(PATTERN.key, button.dataset.pday);
}

// Left/Right/Home/End walk the days (or weigh-ins) of one chart, so Tab moves chart to chart.
// Walking off the edge of a zoomed column chart slides the window by a day.
function onKeydown(event) {
  const button = event.target.closest('button[data-day], button[data-weigh]');
  // A zoom key (+, -, 0) handled on the plot has already redrawn it: the pressed button is gone.
  if (!button || !button.parentElement || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  const all  =[...button.parentElement.querySelectorAll(':scope > button:not([hidden])')];
  const at   = all.indexOf(button);
  const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: all.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();

  const zoom = button.dataset.day !== undefined && (next < 0 || next >= all.length) ? view.zoom.get(button.dataset.chart) : null;
  if (zoom && zoom.isZoomed()) {
    const chart = button.dataset.chart;
    const win   = zoom.get();
    const by    = (next < 0 ? -1 : 1) / view.model.n;
    zoom.set(win.start + by, win.end + by);
    const fresh = [...card(chart).querySelectorAll('.plot > button')];
    if (fresh.length) setTabStop(fresh[next < 0 ? 0 : fresh.length - 1], true);
    return;
  }
  setTabStop(all[clamp(next, 0, all.length - 1)], true);
}

// The x ticks are chosen for the plot's pixel width, so pick them again when that changes.
// #charts is display: contents (its cards share one grid with #pattern), so the grid around it is watched.
const gridOf  = (host) => host.parentElement || host;
const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
  const width = view.charts ? gridOf(view.charts).clientWidth : 0;
  if (!width || width === view.width) return;
  view.width = width;
  if (view.data && view.model && !view.muted) fill(model());
});

function bind(chartsHost, patternHost) {
  if (!bound.has(chartsHost)) {
    bound.add(chartsHost);
    if (resized) resized.observe(gridOf(chartsHost));
    chartsHost.addEventListener('click', onClick);
    document.addEventListener('keydown', onInfoKey);
    document.addEventListener('click', onInfoOutside);
    chartsHost.addEventListener('keydown', onKeydown);
    chartsHost.addEventListener('pointerover', onPoint);
    chartsHost.addEventListener('focusin', onPoint);
  }
  if (!bound.has(patternHost)) {
    bound.add(patternHost);
    patternHost.addEventListener('click', onPatternClick);
  }
}

// data: { daily, days, events, range, span, now }; span is the range in days (the look-back's reach) - see the /api/daily and /api/events shapes.
// onDone(message): app.js's toast + refresh, passed on to the edit sheet.
export function renderTrends(chartsHost, patternHost, data, { onDone } = {}) {
  Object.assign(view, { data, charts: chartsHost, pattern: patternHost, onDone: onDone || null });
  if (data.range !== view.range) {
    Object.assign(view, { range: data.range, day: null, weigh: null, info: null });
    view.muted = true;   // a new range starts unzoomed; the draw below shows it
    for (const id of [GROUP, WEIGHT, HOURS]) resetZoom(id);
    view.muted = false;
    const rows = patternHost.querySelector('.pattern-grid');
    if (rows) rows.scrollTop = 0;   // beside the weight card the rows may scroll: show the newest day first
  }
  bind(chartsHost, patternHost);
  draw();
  reopenAfterRefresh();
}
