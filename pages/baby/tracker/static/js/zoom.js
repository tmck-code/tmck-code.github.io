// One shared, dependency-free zoom helper for every graph (Today strip, Over-time charts).
//
// A "window" is { start, end } as fractions 0..1 of the full axis. It lives in module state per
// key (or per group), so DOM that is re-rendered and re-attached keeps its zoom.
//
//   attachZoom(viewport, opts) -> controller      see the option list on attachZoom below
//   zoomWindow(keyOrGroup)     -> { start, end }  the persisted window ({0,1} when none)
//   resetZoom(keyOrGroup)                         back to the full axis (notifies members)
//   applyTrack(track, win)                        stretch a %-positioned track to show `win`
//
// Gestures (all owned here, listened on the viewport):
//   ctrl+wheel / trackpad pinch   zoom around the pointer        (Safari: gesture events)
//   wheel sideways / shift+wheel  pan when zoomed
//   mouse or pen drag             zoom to the dragged range      (shift+drag pans when zoomed)
//   two-finger pinch              zoom around the midpoint
//   one-finger sideways drag      pan when zoomed (vertical still scrolls the page: pan-y)
//   long-press then drag          zoom to the dragged range      (or the "Select range" toggle)
//   + / - / 0, shift+arrows       zoom in / out / reset, pan     (focus inside the viewport)
//   Escape                        cancel a selection, leave "Select range" mode
// A drag or pinch swallows the click that follows it; a plain tap or click is left alone.

const EPS            = 1e-9;
const FULL           = Object.freeze({ start: 0, end: 1 });
const LONG_PRESS_MS  = 450;
const CLICK_GUARD_MS = 450;
const SETTLE_MS      = 250;
const MOUSE_SLOP     = 5;    // px before a mouse drag counts as a selection
const TOUCH_SLOP     = 10;   // px before a touch counts as a drag (and cancels the long-press)
const MIN_BAND       = 8;    // px: a narrower selection is treated as a cancelled one
const MIN_PINCH      = 24;   // px: floor for the finger distance, so a tight pinch can't explode
const DEFAULT_SCALE  = 24;

const stores   = new Map();       // id (group or key) -> { id, win, raw, members, timer }
const attached = new WeakMap();   // viewport element -> ctl
const hosts    = new WeakMap();   // controls host element -> ctl that listens on it
const picking  = new Set();       // keys with "Select range" mode on
let selecting  = null;            // the ctl with a live selection band (for Escape)

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const same  = (a, b) => Math.abs(a.start - b.start) < EPS && Math.abs(a.end - b.end) < EPS;
const span  = (win) => win.end - win.start;

// ── Window maths (pure) ──────────────────────────────────────────────────────────────────

function normalise(opts = {}) {
  const units = Number.isInteger(opts.units) && opts.units > 0 ? opts.units : 0;
  const id    = String(opts.group ?? opts.key ?? '');
  return {
    id,
    key:        String(opts.key ?? id),
    units,
    minUnits:   units ? clamp(Math.round(opts.minUnits) || 1, 1, units) : 0,
    maxScale:   opts.maxScale > 1 ? opts.maxScale : DEFAULT_SCALE,
    onChange:   typeof opts.onChange === 'function' ? opts.onChange : null,
    controls:   opts.controls || null,
    passive:    Boolean(opts.passive),
    resetLabel: opts.resetLabel ? String(opts.resetLabel) : '',
    iconOnly:   Boolean(opts.iconOnly),
    resetIcon:  /^[a-z-]+$/.test(opts.resetIcon || '') ? opts.resetIcon : 'reset',
  };
}

const minSpan = (o) => (o.units ? o.minUnits / o.units : 1 / o.maxScale);

// Force a window to a legal size (min..1) and slide it inside 0..1. A window that had to grow
// grows around its centre; one that only overhangs an edge is shifted, not squeezed.
function fit(start, end, min) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ...FULL };
  const size = clamp(end - start, Math.min(min, 1), 1);
  const from = clamp((start + end - size) / 2, 0, 1 - size);
  return { start: from, end: from + size };
}

// Snap to unit boundaries. `outward` (a selection) covers every unit the window touches.
function snap(win, o, outward = false) {
  const n = o.units;
  const a = outward ? Math.floor(win.start * n + 1e-6) : Math.round(win.start * n);
  const b = outward ? Math.ceil(win.end * n - 1e-6) : a + Math.round(span(win) * n);
  const length = clamp(b - a, o.minUnits, n);
  const from   = clamp(a - Math.floor((length - (b - a)) / 2), 0, n - length);
  return { start: from / n, end: (from + length) / n };
}

const legal = (win, o, outward) => {
  const fitted = fit(win.start, win.end, minSpan(o));
  return o.units ? snap(fitted, o, outward) : fitted;
};

// Exposed for unit tests of the maths only.
export const zoomMaths = { fit, snap, normalise, legal };

// ── Shared state ─────────────────────────────────────────────────────────────────────────

function storeFor(id) {
  let store = stores.get(id);
  if (!store) {
    store = { id, win: { ...FULL }, raw: { ...FULL }, members: new Set(), timer: 0 };
    stores.set(id, store);
  }
  return store;
}

const isZoomed = (store) => span(store.win) < 1 - EPS;

// `raw` is the unsnapped window a gesture is steering; it collapses onto the snapped window
// once the gesture is over.
function settle(store) {
  clearTimeout(store.timer);
  store.raw = { ...store.win };
}

function prune(store, keep) {
  for (const ctl of [...store.members]) if (ctl !== keep && !ctl.viewport.isConnected) teardown(ctl);
}

function notify(store) {
  prune(store, null);
  const members = [...store.members];
  for (const ctl of members) sync(ctl);
  for (const ctl of members) emit(ctl);
}

function emit(ctl) {
  if (!ctl.opts.onChange || ctl.dead) return;
  try {
    ctl.opts.onChange({ ...ctl.store.win });
  } catch (error) {
    console.error('zoom onChange failed', error);
  }
}

// Steer the window (continuous `start..end`), snapping for unit axes. True when it changed.
function propose(ctl, start, end, outward = false) {
  const { store, opts } = ctl;
  store.raw = fit(start, end, minSpan(opts));
  const win = opts.units ? snap(store.raw, opts, outward) : { ...store.raw };
  if (same(win, store.win)) return false;
  store.win = win;
  notify(store);
  return true;
}

function setWindow(ctl, start, end, outward = false) {
  const changed = propose(ctl, start, end, outward);
  settle(ctl.store);
  return changed;
}

// Make the stored window legal for this member (units may have changed between renders).
function adopt(ctl) {
  const { store, opts } = ctl;
  const win = legal(store.win, opts);
  if (same(win, store.win)) return false;
  store.win = win;
  store.raw = { ...win };
  return true;
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────

const svg = (name) => `<svg class="ico" width="18" height="18" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function controlsHTML(o) {
  const pick  = o.passive ? '' : `<button type="button" class="zoom-btn zoom-pick" aria-pressed="false" aria-label="Select a range to zoom into" title="Select a range to zoom into">${svg('select')}</button>`;
  const label = (o.resetLabel || 'Reset').replace(/[&<>"]/g, '');
  if (o.iconOnly) {
    // No visible word: the name is the label (or "Reset zoom"), also shown as the tooltip.
    const name = o.resetLabel ? label : 'Reset zoom';
    return `${pick}<button type="button" class="zoom-btn zoom-reset is-icon" aria-label="${name}" title="${name}" hidden>${svg(o.resetIcon)}</button>`;
  }
  const name  = o.resetLabel ? '' : ' aria-label="Reset zoom"';
  return `${pick}<button type="button" class="zoom-btn zoom-reset"${name} title="Reset zoom" hidden>${svg('reset')}<span>${label}</span></button>`;
}

function mountControls(ctl) {
  const host = ctl.opts.controls;
  if (host !== ctl.host) {
    if (ctl.hostAbort) ctl.hostAbort.abort();
    ctl.host = host;
    ctl.hostAbort = null;
    if (host) {
      const previous = hosts.get(host);   // a re-rendered viewport reusing the same host
      if (previous && previous !== ctl && previous.hostAbort) {
        previous.hostAbort.abort();
        previous.host = null;
        previous.hostAbort = null;
      }
      hosts.set(host, ctl);
      ctl.hostAbort = new AbortController();
      host.addEventListener('click', (event) => onControl(ctl, event), { signal: ctl.hostAbort.signal });
    }
  }
  if (!host) return;
  host.classList.add('zoom-controls');
  if (!host.querySelector(':scope > .zoom-reset')) host.innerHTML = controlsHTML(ctl.opts);
}

function onControl(ctl, event) {
  if (ctl.dead) return;
  if (event.target.closest('.zoom-pick')) return setPick(ctl.opts.key, !picking.has(ctl.opts.key));
  const reset = event.target.closest('.zoom-reset');
  if (!reset) return;
  const focused = document.activeElement === reset;
  setWindow(ctl, 0, 1);
  if (!focused || !ctl.host) return;
  // The button is hidden now: park focus somewhere sensible instead of dropping it on <body>.
  const next = ctl.host.querySelector('.zoom-pick');
  if (next && next.offsetParent !== null) return next.focus();
  const inside = ctl.viewport.querySelector('button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]');
  if (inside) inside.focus({ preventScroll: true });
}

function setPick(key, on) {
  if (on) picking.add(key); else picking.delete(key);
  for (const store of stores.values()) {
    for (const ctl of store.members) if (ctl.opts.key === key) sync(ctl);
  }
}

// Reflect the state on the viewport classes and the control buttons.
function sync(ctl) {
  const zoomed = isZoomed(ctl.store);
  const pick   = !ctl.opts.passive && picking.has(ctl.opts.key);
  ctl.viewport.classList.toggle('is-zoomed', zoomed);
  ctl.viewport.classList.toggle('zoom-picking', pick);
  if (!ctl.host) return;
  const reset  = ctl.host.querySelector(':scope > .zoom-reset');
  const toggle = ctl.host.querySelector(':scope > .zoom-pick');
  if (reset) reset.hidden = !zoomed;
  if (toggle) toggle.setAttribute('aria-pressed', String(pick));
}

// ── Gestures ─────────────────────────────────────────────────────────────────────────────

function fraction(ctl, clientX) {
  const rect = ctl.viewport.getBoundingClientRect();
  return rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
}

const widthOf = (ctl) => ctl.viewport.getBoundingClientRect().width || 1;

function capture(ctl, pointerId) {
  try {
    ctl.viewport.setPointerCapture(pointerId);
  } catch {
    // the pointer is already gone
  }
}

const guardClick = (ctl) => { ctl.guard = performance.now() + CLICK_GUARD_MS; };

function endBand(ctl) {
  if (ctl.band) ctl.band.remove();
  ctl.band = null;
  ctl.viewport.classList.remove('zoom-selecting');
  if (selecting === ctl) selecting = null;
}

function resetGesture(ctl) {
  const g = ctl.g;
  clearTimeout(g.timer);
  endBand(ctl);
  g.pts.clear();
  g.mode = null;
}

// The band as fractions of the viewport, snapped to whole units on a unit axis.
function bandRange(ctl) {
  const g = ctl.g;
  let a = fraction(ctl, Math.min(g.x0, g.x1));
  let b = fraction(ctl, Math.max(g.x0, g.x1));
  if (ctl.opts.units) {
    const shown = Math.max(1, Math.round(span(ctl.store.win) * ctl.opts.units));
    a = Math.floor(a * shown + 1e-6) / shown;
    b = Math.max(Math.ceil(b * shown - 1e-6), a * shown + 1) / shown;
  }
  return [a, Math.min(b, 1)];
}

function drawBand(ctl) {
  // The consumer may have re-rendered the viewport's children mid-drag: put the band back.
  if (!ctl.band || ctl.band.parentElement !== ctl.viewport) {
    ctl.band = document.createElement('div');
    ctl.band.className = 'zoom-band';
    ctl.band.setAttribute('aria-hidden', 'true');
    ctl.viewport.appendChild(ctl.band);
  }
  const [a, b] = bandRange(ctl);
  ctl.band.style.left  = `${a * 100}%`;
  ctl.band.style.width = `${(b - a) * 100}%`;
}

function beginSelect(ctl) {
  const g = ctl.g;
  clearTimeout(g.timer);
  g.mode = 'select';
  g.x1   = g.x0;
  capture(ctl, g.id);
  selecting = ctl;
  ctl.viewport.classList.add('zoom-selecting');
  drawBand(ctl);
}

function beginPan(ctl) {
  const g = ctl.g;
  clearTimeout(g.timer);
  g.mode = 'pan';
  g.base = { ...ctl.store.raw };
  capture(ctl, g.id);
}

function beginPinch(ctl) {
  const g = ctl.g;
  clearTimeout(g.timer);
  endBand(ctl);
  const [a, b] = [...g.pts.values()];
  g.mode = 'pinch';
  g.base = { ...ctl.store.raw };
  g.d0   = Math.max(MIN_PINCH, Math.hypot(a.x - b.x, a.y - b.y));
  g.m0   = fraction(ctl, (a.x + b.x) / 2);
  for (const id of g.pts.keys()) capture(ctl, id);
}

function applySelection(ctl) {
  const g = ctl.g;
  if (Math.abs(g.x1 - g.x0) < MIN_BAND) return;
  const [a, b] = bandRange(ctl);
  const win    = ctl.store.win;
  setWindow(ctl, win.start + a * span(win), win.start + b * span(win), true);
  setPick(ctl.opts.key, false);
}

function onDown(ctl, event) {
  if (event.pointerType !== 'touch' && event.button !== 0) return;
  const g = ctl.g;
  // A primary pointer starts a fresh gesture: drop anything left over from a missed pointerup.
  if (event.isPrimary || event.pointerType !== 'touch') resetGesture(ctl);
  g.pts.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (g.pts.size === 1) {
    Object.assign(g, { mode: 'pending', id: event.pointerId, x0: event.clientX, y0: event.clientY, x1: event.clientX, touch: event.pointerType === 'touch', shift: event.shiftKey });
    if (!g.touch) return;
    if (picking.has(ctl.opts.key)) return beginSelect(ctl);
    g.timer = setTimeout(() => {
      if (g.mode !== 'pending' || g.pts.size !== 1 || !ctl.viewport.isConnected) return;
      beginSelect(ctl);
      if (navigator.vibrate) navigator.vibrate(8);
    }, LONG_PRESS_MS);
  } else if (g.pts.size === 2 && g.touch) {
    beginPinch(ctl);
  }
}

function onMove(ctl, event) {
  const g     = ctl.g;
  const point = g.pts.get(event.pointerId);
  if (!point) return;
  if (!g.touch && event.buttons === 0) return resetGesture(ctl);   // released outside, unseen
  point.x = event.clientX;
  point.y = event.clientY;

  if (g.mode === 'pending') {
    const [dx, dy] = [point.x - g.x0, point.y - g.y0];
    if (g.touch) {
      if (Math.hypot(dx, dy) < TOUCH_SLOP) return;
      clearTimeout(g.timer);
      if (isZoomed(ctl.store) && Math.abs(dx) > Math.abs(dy)) beginPan(ctl);
      else g.mode = 'idle';   // a scroll or a swipe that is none of our business
    } else if (Math.abs(dx) >= MOUSE_SLOP) {
      if (g.shift && isZoomed(ctl.store)) beginPan(ctl); else beginSelect(ctl);
    }
  }

  if (g.mode === 'select') {
    g.x1 = point.x;
    drawBand(ctl);
  } else if (g.mode === 'pan') {
    const shift = (-(point.x - g.x0) / widthOf(ctl)) * span(g.base);
    propose(ctl, g.base.start + shift, g.base.end + shift);
  } else if (g.mode === 'pinch' && g.pts.size >= 2) {
    const [a, b] = [...g.pts.values()];
    const size   = clamp((span(g.base) * g.d0) / Math.max(MIN_PINCH, Math.hypot(a.x - b.x, a.y - b.y)), minSpan(ctl.opts), 1);
    const anchor = g.base.start + g.m0 * span(g.base);
    const start  = anchor - fraction(ctl, (a.x + b.x) / 2) * size;
    propose(ctl, start, start + size);
  }
}

function onUp(ctl, event, cancelled) {
  const g = ctl.g;
  if (!g.pts.delete(event.pointerId)) return;
  clearTimeout(g.timer);
  if (g.mode === 'select') {
    if (!cancelled) applySelection(ctl);
    endBand(ctl);
    guardClick(ctl);
  } else if (g.mode === 'pan' || g.mode === 'pinch') {
    settle(ctl.store);
    guardClick(ctl);
  } else if (g.mode === 'spent') {
    guardClick(ctl);
  }
  // After a pinch the finger that stays down does nothing more (no surprise pan or tap).
  g.mode = g.pts.size ? 'spent' : null;
}

function onClickCapture(ctl, event) {
  if (performance.now() >= ctl.guard) return;
  ctl.guard = 0;
  event.preventDefault();
  event.stopPropagation();
}

function settleSoon(store) {
  clearTimeout(store.timer);
  store.timer = setTimeout(() => settle(store), SETTLE_MS);
}

function onWheel(ctl, event) {
  const store = ctl.store;
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  const size  = span(store.raw);
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const at     = fraction(ctl, event.clientX);
    const next   = clamp(size * Math.exp(clamp(event.deltaY * scale, -60, 60) * 0.01), minSpan(ctl.opts), 1);
    const start  = store.raw.start + at * size - at * next;
    propose(ctl, start, start + next);
    settleSoon(store);
    return;
  }
  if (!isZoomed(store)) return;
  const sideways = event.shiftKey ? (event.deltaX || event.deltaY) : event.deltaX;
  if (!sideways || (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return;
  event.preventDefault();
  const shift = ((sideways * scale) / widthOf(ctl)) * size;
  propose(ctl, store.raw.start + shift, store.raw.end + shift);
  settleSoon(store);
}

// Zoom by a factor around the focused element (or the middle); always moves at least one unit.
function step(ctl, factor) {
  const { store, opts } = ctl;
  const win    = store.win;
  const size   = span(win);
  const active = document.activeElement;
  let at = 0.5;
  if (active && active !== ctl.viewport && ctl.viewport.contains(active)) {
    const rect = active.getBoundingClientRect();
    at = fraction(ctl, rect.left + rect.width / 2);
  }
  let next;
  if (opts.units) {
    const length = Math.round(size * opts.units);
    const target = Math.round(length * factor);
    next = clamp(factor < 1 ? Math.min(length - 1, target) : Math.max(length + 1, target), opts.minUnits, opts.units) / opts.units;
  } else {
    next = clamp(size * factor, minSpan(opts), 1);
  }
  const start = win.start + at * size - at * next;
  setWindow(ctl, start, start + next);
}

function onKeydown(ctl, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.matches && event.target.matches('input, textarea, select, [contenteditable]')) return;
  const win = ctl.store.win;
  if (event.key === '+' || event.key === '=') step(ctl, 0.5);
  else if (event.key === '-' || event.key === '_') step(ctl, 2);
  else if (event.key === '0') setWindow(ctl, 0, 1);
  else if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && isZoomed(ctl.store)) {
    const by = (ctl.opts.units ? 1 / ctl.opts.units : span(win) * 0.2) * (event.key === 'ArrowLeft' ? -1 : 1);
    setWindow(ctl, win.start + by, win.end + by);
  } else return;
  event.preventDefault();
}

// Safari's trackpad pinch arrives as gesture events rather than ctrl+wheel.
function onGesture(ctl, event) {
  const g = ctl.g;
  if (g.pts.size) return;   // a touch pinch is already handled through pointer events
  event.preventDefault();
  if (event.type === 'gesturestart') {
    g.gbase = { ...ctl.store.raw };
    g.gat   = fraction(ctl, event.clientX);
  } else if (event.type === 'gesturechange' && g.gbase && event.scale > 0) {
    const size  = clamp(span(g.gbase) / event.scale, minSpan(ctl.opts), 1);
    const start = g.gbase.start + g.gat * span(g.gbase) - g.gat * size;
    propose(ctl, start, start + size);
  } else if (event.type === 'gestureend') {
    g.gbase = null;
    settle(ctl.store);
  }
}

const ACTIVE = new Set(['select', 'pan', 'pinch']);

function listen(ctl) {
  const v      = ctl.viewport;
  const signal = ctl.abort.signal;
  v.addEventListener('pointerdown', (e) => onDown(ctl, e), { signal });
  v.addEventListener('pointermove', (e) => onMove(ctl, e), { signal });
  v.addEventListener('pointerup', (e) => onUp(ctl, e, false), { signal });
  v.addEventListener('pointercancel', (e) => onUp(ctl, e, true), { signal });
  v.addEventListener('click', (e) => onClickCapture(ctl, e), { signal, capture: true });
  v.addEventListener('wheel', (e) => onWheel(ctl, e), { signal, passive: false });
  v.addEventListener('keydown', (e) => onKeydown(ctl, e), { signal });
  // Once a gesture of ours is live, keep the browser from also scrolling or opening a menu.
  v.addEventListener('touchmove', (e) => { if (ACTIVE.has(ctl.g.mode) && e.cancelable) e.preventDefault(); }, { signal, passive: false });
  v.addEventListener('contextmenu', (e) => { if (ctl.g.touch && ctl.g.mode) e.preventDefault(); }, { signal });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) v.addEventListener(type, (e) => onGesture(ctl, e), { signal });
}

if (typeof document !== 'undefined') {
  // One listener for the whole module: Escape cancels a live selection and leaves pick mode.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (selecting) {
      const ctl = selecting;
      endBand(ctl);
      ctl.g.mode = 'spent';   // the pointer is still down: its release must not click
      event.preventDefault();
    }
    for (const key of [...picking]) setPick(key, false);
  });
}

// ── Public API ───────────────────────────────────────────────────────────────────────────

function teardown(ctl) {
  if (ctl.dead) return;
  ctl.dead = true;
  resetGesture(ctl);
  ctl.abort.abort();
  if (ctl.hostAbort) ctl.hostAbort.abort();
  if (ctl.host && hosts.get(ctl.host) === ctl) hosts.delete(ctl.host);
  ctl.store.members.delete(ctl);
  attached.delete(ctl.viewport);
  ctl.viewport.classList.remove('zoomable', 'is-zoomed', 'zoom-picking', 'zoom-selecting');
}

// attachZoom(viewport, opts) -> { get, set, reset, isZoomed, destroy }
//   viewport       the element whose width IS the axis; must be in the document. Gets class
//                  'zoomable' (position: relative; touch-action: pan-y) and, while zoomed,
//                  'is-zoomed'. The selection band is drawn inside it.
//   opts.key       persistence key. Attaching again to the SAME element only updates opts.
//   opts.group     optional: controllers with the same group share one window.
//   opts.units     optional integer N: the axis is N equal units; windows snap to them,
//                  at least opts.minUnits (default 1). Without units: opts.maxScale (24).
//   opts.onChange  (win) => void on every change of the window (any group member), and once
//                  on attach when the persisted window is not the full axis.
//   opts.controls  host element; the helper owns its content: "Select range" toggle
//                  (.zoom-pick, aria-pressed) and "Reset zoom" (.zoom-reset, hidden unless zoomed).
//   opts.passive   optional: no gestures and no toggle, just follows the group (Reset only).
//   opts.resetLabel optional visible text for the Reset button (default "Reset").
//   opts.iconOnly  optional: the Reset button is a 44 px icon (opts.resetIcon, default "reset")
//                  named by resetLabel (or "Reset zoom") through aria-label and title.
export function attachZoom(viewport, opts) {
  const o     = normalise(opts);
  const store = storeFor(o.id);
  let ctl     = attached.get(viewport);
  const fresh = !ctl;

  if (ctl) {
    if (ctl.store !== store) {
      ctl.store.members.delete(ctl);
      store.members.add(ctl);
      ctl.store = store;
    }
    if (ctl.opts.passive !== o.passive && ctl.host) ctl.host.innerHTML = '';
    ctl.opts = o;
  } else {
    ctl = {
      viewport, opts: o, store, dead: false, guard: 0, band: null, host: null, hostAbort: null,
      abort: new AbortController(),
      g: { mode: null, pts: new Map(), timer: 0 },
    };
    ctl.api = {
      get:      () => ({ ...ctl.store.win }),
      set:      (start, end) => { if (!ctl.dead) setWindow(ctl, start, end); },
      reset:    () => { if (!ctl.dead) setWindow(ctl, 0, 1); },
      isZoomed: () => isZoomed(ctl.store),
      destroy:  () => teardown(ctl),
    };
    attached.set(viewport, ctl);
    store.members.add(ctl);
    viewport.classList.add('zoomable');
    if (!o.passive) listen(ctl);
  }

  prune(store, ctl);
  mountControls(ctl);
  const changed = adopt(ctl);
  sync(ctl);
  if (changed) notify(store);
  else if (fresh && isZoomed(store)) emit(ctl);
  return ctl.api;
}

export function zoomWindow(keyOrGroup) {
  const store = stores.get(String(keyOrGroup));
  return store ? { ...store.win } : { ...FULL };
}

export function resetZoom(keyOrGroup) {
  const store = stores.get(String(keyOrGroup));
  if (!store) return;
  settle(store);
  if (same(store.win, FULL)) return;
  store.win = { ...FULL };
  store.raw = { ...FULL };
  notify(store);
}

// For content positioned in % of the FULL axis: stretch the track so `win` fills its (clipping)
// parent. The parent needs overflow hidden/clip (class 'zoom-clip').
export function applyTrack(track, win) {
  if (!track) return;
  const size = Math.max(span(win), EPS);
  const full = size >= 1 - EPS;
  track.style.width      = full ? '' : `${100 / size}%`;
  track.style.marginLeft = full ? '' : `${(-win.start / size) * 100}%`;
}
