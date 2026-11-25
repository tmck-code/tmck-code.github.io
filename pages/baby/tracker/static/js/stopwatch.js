// Fullscreen stopwatch-only view, shown while a sleep, a feed and/or an express session is running.
//
// All state lives on the server: every control calls the API, applies the entity it returns and
// asks app.js to refresh. Times are always derived from timestamps (elapsedSeconds / sideSeconds),
// never counted, so a backgrounded tab or a second phone shows the same numbers.

import { api } from './api.js';
import { toast } from './toast.js';
import {
  elapsedSeconds, liveEstimateMl, sideSeconds, fmtTimer, fmtTime, fmtShortDay, startOfDay, entryIcon, icon, esc,
} from './util.js';

const TABLES    = { sleep: 'sleeps', feed: 'feeds', express: 'expresses' };
const TYPES     = Object.keys(TABLES);
const NOUN      = { sleep: 'sleep', feed: 'feed', express: 'expressing' };
const SIDES     = ['left', 'right'];
const SIDE_NAME = { left: 'Left', right: 'Right' };
const TICK_MS   = 250;
const STOP_GUARD_MS = 1000;

let cfg       = null;                         // { host, now, onChanged, onStop, onFix, onDismiss }
let host      = null;
let stage     = null;                         // holds the cards
let live      = null;                         // polite live region: state changes only, never the seconds
let entries   = { sleep: null, feed: null, express: null };
let signature = '';                           // which cards are built; a change means rebuild
let timer     = null;
const cards    = new Map();                   // type -> element refs + last rendered state
const busy     = new Set();                   // types with a pause/resume/side request in flight
const stopping = new Map();                   // type -> time of the last Stop tap (double-tap guard)

const now      = () => (cfg && typeof cfg.now === 'function' ? cfg.now() : Date.now());
const isBreast = (type, entry) => type === 'feed' && entry.kind === 'breast';
const noun     = (type) => NOUN[type];

function label(type, entry) {
  if (type === 'sleep') return 'Sleeping';
  if (type === 'express') return 'Expressing';
  return entry.kind ? `Feeding, ${entry.kind}` : 'Feeding';
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function announce(message) {
  if (live) live.textContent = message;
}

// "since 2:05 pm", with the short day in front when it began before today.
function sinceText(entry) {
  const started = new Date(entry.started_at);
  const time    = fmtTime(started);
  return started.getTime() < startOfDay(new Date(now())).getTime()
    ? `since ${fmtShortDay(started)}, ${time}`
    : `since ${time}`;
}

// The line under the label. A breast feed with a rate (learned from weighed feeds, or set in
// Settings) adds what it has likely taken so far.
function sinceLine(entry, t) {
  const ml = liveEstimateMl(entry, t);
  return ml === null ? sinceText(entry) : `${sinceText(entry)} · about ${ml} ml so far`;
}

// Running activities, older first.
function running() {
  return TYPES
    .filter((type) => entries[type])
    .sort((a, b) => new Date(entries[a].started_at) - new Date(entries[b].started_at));
}

// ── Markup ───────────────────────────────────────────────────────────────────────────────

function sideHTML(type, side) {
  return `
    <button type="button" class="sw-side" data-sw="side" data-type="${type}" data-side="${side}" aria-pressed="false">
      <span class="sw-side-name">${SIDE_NAME[side]}</span>
      <span class="sw-side-time">0:00</span>
      <span class="sw-side-mark"></span>
    </button>`;
}

function cardHTML(type, entry) {
  const breast = isBreast(type, entry);
  return `
    <section class="sw-card" data-ev="${type}" data-type="${type}" data-paused="false">
      <header class="sw-head">
        <span class="sw-chip">${icon(entryIcon(type), 24)}</span>
        <div class="sw-what">
          <h2 class="sw-label"></h2>
          <div class="sw-since"></div>
          <div class="sw-since sw-bottle" hidden></div>
        </div>
        <button type="button" class="sw-fix" data-sw="fix" data-type="${type}" aria-label="Fix ${noun(type)} time" title="Fix time">${icon('pencil', 18)}</button>
      </header>
      <div class="sw-state"><span class="sw-state-ico"></span><span class="sw-state-text"></span></div>
      <div class="sw-clock">
        ${breast ? '<div class="sw-total-cap">Total</div>' : ''}
        <div class="sw-timer" role="timer" aria-live="off" aria-atomic="true"></div>
      </div>
      ${breast ? `<div class="sw-sides" role="group" aria-label="Breast side">${SIDES.map((s) => sideHTML(type, s)).join('')}</div>` : ''}
      <div class="sw-actions">
        <button type="button" class="sw-btn sw-pause" data-sw="pause" data-type="${type}"><span class="sw-btn-ico"></span></button>
        <button type="button" class="sw-btn sw-stop" data-sw="stop" data-type="${type}" aria-label="Stop ${noun(type)}" title="Stop ${noun(type)}"><svg class="ico-solid" width="26" height="26" aria-hidden="true"><use href="#i-stop"/></svg></button>
      </div>
    </section>`;
}

function build(types) {
  // Rebuilding drops focus; remember which control had it and give it back.
  const focused = host.contains(document.activeElement) ? document.activeElement : null;
  const refocus = focused && focused.dataset.sw
    ? `[data-sw="${focused.dataset.sw}"]`
      + (focused.dataset.type ? `[data-type="${focused.dataset.type}"]` : '')
      + (focused.dataset.side ? `[data-side="${focused.dataset.side}"]` : '')
    : null;

  stage.innerHTML = types.map((type) => cardHTML(type, entries[type])).join('');
  cards.clear();
  for (const type of types) {
    const el = stage.querySelector(`.sw-card[data-type="${type}"]`);
    const sides = {};
    for (const side of SIDES) {
      const button = el.querySelector(`.sw-side[data-side="${side}"]`);
      if (button) sides[side] = { button, time: button.querySelector('.sw-side-time'), mark: button.querySelector('.sw-side-mark'), state: null };
    }
    cards.set(type, {
      el,
      label:     el.querySelector('.sw-label'),
      since:     el.querySelector('.sw-since'),
      bottle:    el.querySelector('.sw-bottle'),
      stateIco:  el.querySelector('.sw-state-ico'),
      stateText: el.querySelector('.sw-state-text'),
      timer:     el.querySelector('.sw-timer'),
      pause:     el.querySelector('.sw-pause'),
      pauseIco:  el.querySelector('.sw-pause .sw-btn-ico'),
      sides,
      paused: null,      // null = not rendered yet, so the first patch announces nothing
      active: undefined,
    });
  }

  if (!focused) return;
  const target = (refocus && host.querySelector(refocus)) || stage;
  target.focus({ preventScroll: true });
}

// ── In-place updates ─────────────────────────────────────────────────────────────────────

// Everything that changes only when the entity changes (not every second).
function patch(type) {
  const card  = cards.get(type);
  const entry = entries[type];
  if (!card || !entry) return;
  const what   = label(type, entry);
  const paused = Boolean(entry.paused_at);

  setText(card.label, what);
  card.el.setAttribute('aria-label', `${what} stopwatch`);
  // What was in the bottle of a bottle feed, when that was given: a line of its own under "since".
  const inBottle = type === 'feed' && entry.kind === 'bottle' && typeof entry.bottle_ml === 'number';
  setText(card.bottle, inBottle ? `${entry.bottle_ml} ml in bottle` : '');
  card.bottle.hidden = !inBottle;

  if (paused !== card.paused) {
    const first = card.paused === null;
    card.paused = paused;
    card.el.dataset.paused = String(paused);
    // The status row only speaks up while paused; a moving timer already says "running".
    card.stateIco.innerHTML = paused ? icon('pause', 18) : '';
    setText(card.stateText, paused ? 'Paused' : '');
    card.pauseIco.innerHTML = icon(paused ? 'play' : 'pause', 28);
    const pauseLabel = `${paused ? 'Resume' : 'Pause'} ${noun(type)}`;
    card.pause.setAttribute('aria-label', pauseLabel);
    card.pause.title = pauseLabel;
    if (!first) announce(`${what} ${paused ? 'paused' : 'resumed'} at ${fmtTimer(elapsedSeconds(entry, now()))}`);
  }

  if (!card.sides.left) return;
  const active = SIDES.includes(entry.active_side) ? entry.active_side : null;
  if (card.active !== undefined && active && active !== card.active) announce(`Now on the ${active} side`);
  card.active = active;
  for (const side of SIDES) {
    const ref   = card.sides[side];
    const state = side === active ? (paused ? 'paused' : 'feeding') : (active ? 'switch' : 'start');
    if (state === ref.state) continue;
    ref.state = state;
    ref.button.setAttribute('aria-pressed', String(side === active));
    ref.button.dataset.state = state;
    if (state === 'feeding')     ref.mark.innerHTML = '<span class="sw-dot"></span>feeding';
    else if (state === 'paused') ref.mark.innerHTML = `${icon('pause', 14)}paused`;
    else                         ref.mark.textContent = state === 'switch' ? 'tap to switch' : 'tap to start';
  }
}

// The numbers. Runs several times a second while visible; writes only when the text changes.
function tick() {
  if (!host || host.hidden) return;
  const t = now();
  for (const [type, card] of cards) {
    const entry = entries[type];
    if (!entry) continue;
    const text = fmtTimer(elapsedSeconds(entry, t));
    setText(card.since, sinceLine(entry, t));
    if (card.timer.textContent !== text) {
      card.timer.textContent = text;
      card.timer.dataset.len = String(text.length);   // the CSS steps the size down past an hour
    }
    if (!card.sides.left) continue;
    const seconds = sideSeconds(entry, t);
    for (const side of SIDES) setText(card.sides[side].time, fmtTimer(seconds[side]));
  }
}

function render() {
  const types = running();
  const next  = types.map((type) => `${type}:${entries[type].id}:${isBreast(type, entries[type]) ? 'breast' : 'plain'}`).join('|');
  if (next !== signature) {
    signature = next;
    build(types);
  }
  host.dataset.count = String(types.length);
  types.forEach(patch);
  tick();
}

// ── Show / hide ──────────────────────────────────────────────────────────────────────────

function startTimer() {
  if (timer === null) timer = setInterval(tick, TICK_MS);
}

function stopTimer() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function reveal() {
  if (!host.hidden) return;
  host.hidden = false;
  host.scrollTop = 0;
  // The page underneath is hidden while this shows, so bring keyboard focus along (unless a
  // sheet is open above: it is modal and keeps its own focus).
  if (!document.querySelector('dialog[open]') && !host.contains(document.activeElement)) {
    stage.focus({ preventScroll: true });
  }
}

function conceal() {
  stopTimer();
  if (host.hidden) return;
  const hadFocus = host.contains(document.activeElement);
  host.hidden = true;
  if (hadFocus && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────

// api.js errors carry only a message, so a 409 ("the other phone got there first") is
// recognised by its text as well as by a status, should one ever be attached.
function isConflict(error) {
  return error.status === 409
    || /\(409\)|^already (stopped|paused)|^not paused|^only breast feeds/i.test(error.message || '');
}

function setBusy(type, on) {
  const card = cards.get(type);
  if (!card) return;
  // aria-disabled, not disabled: a disabled button would drop keyboard focus mid-request.
  for (const button of card.el.querySelectorAll('.sw-pause, .sw-side')) {
    if (on) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
}

async function act(type, call) {
  const entry = entries[type];
  if (!entry || busy.has(type)) return;
  busy.add(type);
  setBusy(type, true);
  let refresh = true;
  try {
    const updated = await call(entry);
    if (updated && entries[type] && entries[type].id === updated.id) {
      entries[type] = updated;
      if (!host.hidden) render();
    }
  } catch (error) {
    if (!isConflict(error)) {
      toast(error.message, true);
      refresh = !error.network;
    }
  } finally {
    busy.delete(type);
    setBusy(type, false);
  }
  if (refresh) cfg.onChanged();
}

function onClick(event) {
  const button = event.target.closest('[data-sw]');
  if (!button || !host.contains(button)) return;
  const { sw, type, side } = button.dataset;

  if (sw === 'dismiss') return void cfg.onDismiss();
  const entry = entries[type];
  if (!entry) return;

  if (sw === 'fix') return void cfg.onFix(type, entry);
  if (sw === 'stop') {
    const t = Date.now();
    if (t - (stopping.get(type) || 0) < STOP_GUARD_MS) return;
    stopping.set(type, t);
    return void cfg.onStop(type);
  }
  if (sw === 'pause') {
    return void act(type, (e) => (e.paused_at ? api.resume(TABLES[type], e.id) : api.pause(TABLES[type], e.id)));
  }
  if (sw === 'side' && type === 'feed' && SIDES.includes(side)) {
    if (entry.active_side === side) return;   // already on this side
    return void act(type, (e) => api.side(e.id, side));
  }
}

// ── Public interface ─────────────────────────────────────────────────────────────────────

export function initStopwatch({ host: el, now: clock, onChanged, onStop, onFix, onDismiss }) {
  const noop = () => {};
  host = el;
  cfg  = { now: clock, onChanged: onChanged || noop, onStop: onStop || noop, onFix: onFix || noop, onDismiss: onDismiss || noop };
  if (!host) return;

  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Happening now');   // no visible heading: the cards say what is running
  host.innerHTML = `
    <div class="sw-bar">
      <button type="button" class="sw-dismiss" data-sw="dismiss" aria-label="Show dashboard" title="Show dashboard">${icon('shrink', 20)}</button>
    </div>
    <div class="sw-stage" tabindex="-1"></div>
    <p class="sw-live" aria-live="polite"></p>`;
  stage = host.querySelector('.sw-stage');
  live  = host.querySelector('.sw-live');
  signature = '';
  cards.clear();

  host.addEventListener('click', onClick);
  host.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) cfg.onDismiss();
  });
  // Timers are throttled in a background tab; catch up the moment it is visible again.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
}

export function updateStopwatch(active, show) {
  if (!host) return;
  for (const type of TYPES) {
    const next = (active && active[type]) || null;
    // A refresh that started before our own request finished may carry the older state: while
    // the request is in flight, keep what we have (onChanged() refreshes again afterwards).
    if (busy.has(type) && next && entries[type] && entries[type].id === next.id) continue;
    entries[type] = next;
  }
  if (!show || !running().length) {
    conceal();
    return;
  }
  render();
  reveal();
  startTimer();
  tick();
}

export function tickStopwatch() {
  tick();
}
