// The intake "look-back staircase", shared by Today, a past day and Over time.
//
// Cumulative ml of finished feeds going back from a reference time on a linear time axis that reads
// left to right: the reference ("now") is the left edge at 0 and the look-back grows to the right, so
// the staircase climbs to the right and reading it at a knot gives the total for that long before the
// reference. Bottle is solid, the breast estimate hatched; a wedge shows the target band. Each knot is
// labelled with its total, and under the axis with how far back it is ("3h") and the clock time or
// date that is; hover (title), tap, focus or Enter/Space shows the split in the line under the chart.
//
// Every chart is its own instance: the open knot, the measured width and the SVG pattern id are
// per instance, so several can be in the document at once.

import { esc } from './util.js';

// Height of the drawing in px. The plot area follows from it; type, dots and strokes do not scale.
const HEIGHT   = 176;
const TOP      = 20;            // room above the plot for the knot totals
const BASE     = HEIGHT - 29;   // the baseline; two lines sit under it: how far back, and when that was
const TICK_Y   = [BASE + 14, BASE + 26];
const TICK_GAP = 5;             // least space between two knots' labels under the axis
const ORIGIN   = 4;             // how far past the left edge the origin's label (which ends there) may run
const NUDGE    = 14;            // furthest a knot's label may move off its knot to make room for the origin's
const GRID_GAP = 18;            // least distance between two y-axis lines, so their numbers never collide
const STEPS    = [25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000];

const NUM = new Intl.NumberFormat();
export const fmtMl = (n) => NUM.format(n);

const ms     = (t) => new Date(t).getTime();
const r1     = (n) => Math.round(n * 10) / 10;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const textW  = (text, per = 7.5) => String(text).length * per;

// Width of an axis label (11px body type), measured where a canvas is to hand, else estimated.
let pen = null;
function labelW(text, family) {
  pen ??= document.createElement('canvas').getContext?.('2d') || false;
  if (!pen) return textW(text, 6.2);
  pen.font = `11px ${family}`;
  return Math.ceil(pen.measureText(String(text)).width) + 1;
}

// Centres for the labels under the axis: each as near its knot as it can be with TICK_GAP between
// neighbours and all of them inside lo..hi. Close knots share the move, so their order always holds.
function spread(blocks, lo, hi) {
  const at   = blocks.map((b) => b.x);
  const need = (i) => (blocks[i].w + blocks[i + 1].w) / 2 + TICK_GAP;
  const clamp = () => blocks.forEach((b, i) => { at[i] = Math.min(hi - b.w / 2, Math.max(lo + b.w / 2, at[i])); });
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < at.length - 1; i++) {
      const over = need(i) - (at[i + 1] - at[i]);
      if (over > 0) { at[i] -= over / 2; at[i + 1] += over / 2; }
    }
    clamp();
  }
  for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1] + need(i - 1));
  clamp();
  for (let i = at.length - 2; i >= 0; i--) at[i] = Math.min(at[i], at[i + 1] - need(i));
  return at.map(r1);
}

let made = 0;

// draw(host, cfg) paints into `host` (and binds to it, if it is a new element). cfg:
//   feeds   feeds from the events API; one counts at its ended_at, with its intake_ml
//   end     reference time in ms (the left edge, 0 on the axis)
//   slack   ms past `end` a feed may end and still count (clock skew when `end` is "now")
//   unit    ms per knot unit (an hour or a day)
//   knots   ascending positions in units; the last one is the span of the axis
//   tick    (n) => the name under a knot, e.g. "3h"
//   when    (n, t) => the clock time or date of the moment t (ms) that is n units back, written under
//           the knot's name, e.g. "20:41"; n is 0 for the reference itself
//   origin  the name of the reference under the left edge, e.g. "now"; it is written (over its
//           `when`) while that fits in the y-axis gutter without pushing the knots' labels far
//   phrase  (n) => how the detail line starts, e.g. "Last 3 hours"
//   target  (n) => [lo, hi] ml expected over n units
//   hint    the detail line while no knot is open
//   label   the chart's aria-label
// Optional (a chart that leaves them out is drawn exactly as before):
//   since       ms of the earliest data. When that is inside the axis, the staircase and the target
//               band stop there, the stretch before it (to the right) is hatched as "no data", and a knot that reaches
//               into it becomes a muted tick with no total and no tap target
//   sinceLabel  how to name that moment, e.g. "Thu 12 Nov" (written into the stretch when it fits)
//   legend      [[kind, text], ...] drawn as swatch + label under the chart; kind is 'bottle',
//               'breast', 'band' or 'gap' (styles in trends.css)
//   follow      a name for the last knot when its position moves from one draw to the next (the
//               knot at midnight, as "now" moves on). While two draws in a row carry the same name,
//               that knot stays open and focused although its position changed
export function createLookback() {
  const ui = { id: ++made, host: null, cfg: null, open: null, moved: null, width: 242, wasOpen: false, refocus: false, html: '' };
  const knotOf = (event) => event.target.closest?.('.recent-knot');

  function paint() {
    const { host, cfg } = ui;
    if (!host || !cfg) return;
    const { end, unit, knots } = cfg;
    const span = knots.at(-1);
    // How far back the data goes, in units; short of the axis span there is a "no data" stretch.
    const reach = Number.isFinite(cfg.since) ? Math.min(span, Math.max(0, (end - cfg.since) / unit)) : span;
    const gap   = reach < span - 1e-9;
    const known = (n) => !gap || n <= reach + 1e-9;
    if (!knots.includes(ui.open) || !known(ui.open)) ui.open = null;

    const done = cfg.feeds
      .filter((f) => f.ended_at && (f.intake_ml ?? null) !== null)
      .filter((f) => ms(f.ended_at) > end - span * unit && ms(f.ended_at) <= end + (cfg.slack || 0))
      .sort((a, b) => ms(b.ended_at) - ms(a.ended_at));
    const rows = knots.map((n) => {
      const feeds  = done.filter((f) => ms(f.ended_at) > end - n * unit);
      const total  = feeds.reduce((sum, f) => sum + f.intake_ml, 0);
      const breast = feeds.filter((f) => f.kind === 'breast').reduce((sum, f) => sum + f.intake_ml, 0);
      const sub = `${cfg.phrase(n)}: ` + (feeds.length
        ? `${fmtMl(total - breast)} ml bottle, ${breast ? 'about ' : ''}${fmtMl(breast)} ml breast (${plural(feeds.length, 'feed', 'feeds')})`
        : 'no finished feeds') + `. Target ${cfg.target(n).map(fmtMl).join('–')} ml`;
      return { n, total, sub };
    });

    // The drawing is sized to the host's content box; that is zero while it is not laid out.
    if (host.clientWidth) {
      const css = getComputedStyle(host);
      ui.width = Math.max(160, host.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight));
    }
    const [bandLo, bandHi] = cfg.target(reach);         // the band covers only the stretch with data
    const yMax = Math.max(rows.at(-1).total, bandHi, 1);   // always room for the whole target band
    // Y axis: a line and number every "nice" step, as many as fit without the numbers colliding.
    const lines = Math.floor((BASE - TOP) / GRID_GAP);
    const step  = STEPS.find((n) => yMax / n <= lines) ?? 100000;
    const marks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);
    // x0 leaves a gutter for the y-axis numbers, wider when they run to thousands.
    const W = ui.width, x0 = Math.max(30, Math.ceil(textW(fmtMl(marks.at(-1)), 6.2) + 10)), x1 = W - 4;
    const x = (u) => r1(x0 + (Math.min(span, Math.max(0, u)) / span) * (x1 - x0));   // linear: the reference at the left edge
    const y = (ml) => r1(BASE - (ml / yMax) * (BASE - TOP));
    const grid = marks.map((ml) => `
      ${ml ? `<line class="recent-grid" x1="${x0}" x2="${W}" y1="${y(ml)}" y2="${y(ml)}"/>` : ''}
      <text x="${x0 - 6}" y="${r1(y(ml) + 3.5)}" text-anchor="end">${fmtMl(ml)}</text>`).join('');
    const stairs = (pick) => {
      let sum = 0, d = `M${x0} ${BASE}`;
      done.forEach((f) => { d += `H${x((end - ms(f.ended_at)) / unit)}`; sum += pick(f); d += `V${y(sum)}`; });
      return `${d}H${x(reach)}`;
    };
    const all = stairs((f) => f.intake_ml), bottle = stairs((f) => (f.kind === 'breast' ? 0 : f.intake_ml));
    const band = `M${x0} ${BASE}L${x(reach)} ${y(bandLo)}V${y(bandHi)}Z`;
    // The stretch before the earliest data, on the right: hatched, edged, and named when the words fit.
    const gapHatch = `recent-gap-${ui.id}`;
    let gapHTML = '';
    if (gap) {
      const gx = x(reach), room = W - gx, mid = r1((gx + W) / 2), my = r1((TOP + BASE) / 2);
      const long = cfg.sinceLabel ? ['no data before', cfg.sinceLabel] : [];
      const words = long.length && room >= Math.max(...long.map((t) => textW(t, 6.2))) + 8 ? long
        : room >= textW('no data', 6.2) + 8 ? ['no data'] : [];
      gapHTML = `<g class="recent-gap" aria-hidden="true">
        <rect x="${gx}" y="${TOP}" width="${r1(room)}" height="${BASE - TOP}" fill="url(#${gapHatch})"/>
        <line class="recent-gap-edge" x1="${gx}" x2="${gx}" y1="${TOP}" y2="${BASE}"/>
        ${words.map((t, i) => `<text class="recent-gap-text" x="${mid}" y="${r1(my + 4 + (i - (words.length - 1) / 2) * 13)}" text-anchor="middle">${esc(t)}</text>`).join('')}
      </g>`;
    }
    // Under the axis each knot has two lines: how far back it is, and when that was. On a linear axis
    // the first knots sit close together, so the labels are spread apart (the tick under a knot leans towards
    // a label that moved). The reference is named in the y-axis gutter when that leaves the rest near home.
    const family = getComputedStyle(host).getPropertyValue('--font-body') || 'sans-serif';
    const ticks  = knots.map((n) => {
      const lines = [cfg.tick(n), cfg.when ? cfg.when(n, end - n * unit) : ''].map(String);
      return { x: x(n), lines, w: Math.max(...lines.map((t) => labelW(t, family))) };
    });
    const origin = cfg.origin ? [cfg.origin, cfg.when ? cfg.when(0, end) : ''].map(String) : null;
    const alone  = spread(ticks, 0, W);
    const beside = origin && Math.max(...origin.map((t) => labelW(t, family))) <= x0 + ORIGIN ? spread(ticks, x0 + ORIGIN + TICK_GAP, W) : null;
    const off    = (at, i) => Math.abs(at[i] - ticks[i].x);
    const named  = Boolean(beside) && ticks.every((_, i) => off(beside, i) <= Math.max(NUDGE, off(alone, i)));
    const tickAt = named ? beside : alone;
    const lean   = (i) => r1(ticks[i].x + Math.min(6, Math.max(-6, tickAt[i] - ticks[i].x)));
    const tickHTML = (i) => `
        <line class="recent-lead" x1="${ticks[i].x}" x2="${lean(i)}" y1="${BASE + 1}" y2="${BASE + 4}"/>
        ${ticks[i].lines.map((t, row) => (t ? `<text${row ? ' class="recent-when"' : ''} x="${tickAt[i]}" y="${TICK_Y[row]}" text-anchor="middle">${esc(t)}</text>` : '')).join('')}`;
    const originHTML = !named ? '' : `<g class="recent-origin" aria-hidden="true">
        <line class="recent-lead" x1="${x0}" x2="${x0}" y1="${BASE + 1}" y2="${BASE + 4}"/>
        ${origin.map((t, row) => (t ? `<text${row ? ' class="recent-when"' : ''} x="${x0 + ORIGIN}" y="${TICK_Y[row]}" text-anchor="end">${esc(t)}</text>` : '')).join('')}
      </g>`;
    // Each knot's tap area runs to the midpoint with its neighbour, shifted where a spread label
    // would otherwise fall in the wrong one (but never past either dot).
    const edges = [0, ...knots.slice(0, -1).map((n, i) => {
      const [a, b] = [ticks[i].x, ticks[i + 1].x];
      const fit = Math.min(tickAt[i + 1] - ticks[i + 1].w / 2, Math.max(tickAt[i] + ticks[i].w / 2, (a + b) / 2));
      return Math.min(Math.max(b - 6, (a + b) / 2), Math.max(Math.min(a + 6, (a + b) / 2), fit));
    }), W];
    // A total sits to the left of its dot, over the lower part of the curve, or centred above the dot
    // when that would run into the y-axis numbers or an earlier total (as the first always is); one
    // that still runs into a total already placed moves up a line.
    const placed = [];
    const knotsHTML = rows.map(({ n, total, sub }, i) => {
      const kx = x(n), ky = y(total), on = ui.open === n, text = fmtMl(total), w = textW(text);
      // Beyond the data there is no total to show: a muted tick, not a knot.
      if (!known(n)) {
        return `<g class="recent-knot-off" aria-hidden="true">${tickHTML(i)}
      </g>`;
      }
      const hits  = (left, ly) => placed.some((box) => left < box.right + 3 && left + w > box.left - 3 && Math.abs(ly - box.y) < 13);
      const above = [Math.max(kx, r1(x0 + 2 + w / 2)), r1(ky - 9), 'middle'];
      let [lx, ly, anchor] = i === 0 || kx - 6 - w < x0 + 2 || hits(kx - 6 - w, ky - 7) ? above : [r1(kx - 6), r1(ky - 7), 'end'];
      const left = anchor === 'middle' ? lx - w / 2 : lx - w;
      while (hits(left, ly)) ly = r1(ly - 13);
      placed.push({ left, right: left + w, y: ly });
      const said = [cfg.tick(n), ticks[i].lines[1]].filter(Boolean).join(', ');
      return `<g class="recent-knot${on ? ' is-on' : ''}" data-knot="${n}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${esc(`${said}: ${text} ml. ${sub}`)}">
        <title>${esc(sub)}</title>
        <rect class="recent-hit" x="${r1(edges[i])}" y="0" width="${r1(edges[i + 1] - edges[i])}" height="${HEIGHT}" rx="6"/>
        <line class="recent-drop" x1="${kx}" x2="${kx}" y1="${ky}" y2="${BASE}"/>
        <circle class="recent-dot" cx="${kx}" cy="${ky}" r="4.5"/>
        <text class="recent-strong" x="${lx}" y="${ly}" text-anchor="${anchor}">${text}</text>${tickHTML(i)}
      </g>`;
    }).join('');
    const open    = rows.find((r) => r.n === ui.open);
    const had     = host.contains(document.activeElement) ? document.activeElement.dataset.knot : null;
    const focused = ui.moved && had === String(ui.moved[0]) ? String(ui.moved[1]) : had;
    const hatch   = `recent-hatch-${ui.id}`;
    const legend  = !cfg.legend?.length ? '' : `
    <div class="recent-legend">${cfg.legend.map(([kind, text]) => `<span class="recent-key"><span class="recent-swatch is-${esc(kind)}"></span>${esc(text)}</span>`).join('')}</div>`;
    const html = `
    <svg class="recent-chart" width="${W}" height="${HEIGHT}" viewBox="0 0 ${W} ${HEIGHT}" role="group" aria-label="${esc(cfg.label)}">
      <defs><pattern id="${hatch}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect class="recent-hatch-bg" width="4" height="4"/><rect class="recent-hatch-fg" width="2" height="4"/></pattern>${gap ? `
        <pattern id="${gapHatch}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect class="recent-gap-fg" width="1.5" height="6"/></pattern>` : ''}</defs>
      ${gapHTML}
      <path d="${all}V${BASE}Z" fill="url(#${hatch})"/>
      <path class="recent-bottle" d="${bottle}V${BASE}Z"/>
      <g aria-hidden="true">${grid}</g>
      <path class="recent-band" d="${band}"/>
      <path class="recent-line" d="${all}"/>
      <line class="recent-base" x1="${x0}" x2="${W}" y1="${BASE}" y2="${BASE}"/>
      ${originHTML}
      ${knotsHTML}
    </svg>${legend}
    <div class="recent-detail">${esc(open ? open.sub : cfg.hint)}</div>`;
    // Only touch the DOM when the markup changed, so a background refresh keeps focus.
    if (html === ui.html) return;
    ui.html = html;
    host.innerHTML = html;
    // A re-render replaces the knots, so hand keyboard focus back to the one that had it.
    if (focused && !host.contains(document.activeElement)) {
      ui.refocus = true;   // not a new focus: it must not reopen a knot that was just closed
      host.querySelector(`.recent-knot[data-knot="${focused}"]`)?.focus({ preventScroll: true });
      ui.refocus = false;
    }
  }

  function setOpen(n) {
    if (ui.open === n) return;
    ui.open = n;
    paint();
  }

  // The chart is drawn at the host's pixel width, so redraw when that changes (rotation, window resize).
  const watcher = new ResizeObserver(() => {
    if (ui.host && ui.host.clientWidth) paint();
  });

  // A knot shows its split while it is the open one. Focus (Tab, or a tap) opens it; a tap or
  // Enter/Space on the open knot closes it again. pointerdown runs before the focus a tap causes,
  // so it can tell "was already open" from "just opened by this tap".
  function bind(host) {
    watcher.disconnect();
    ui.host = host;
    ui.html = '';
    host.addEventListener('pointerdown', (event) => {
      const knot = knotOf(event);
      ui.wasOpen = Boolean(knot) && ui.open === Number(knot.dataset.knot);
    });
    host.addEventListener('focusin', (event) => {
      const knot = knotOf(event);
      if (knot && !ui.wasOpen && !ui.refocus) setOpen(Number(knot.dataset.knot));
    });
    host.addEventListener('click', (event) => {
      const knot = knotOf(event);
      if (!knot) return;
      setOpen(ui.wasOpen ? null : Number(knot.dataset.knot));
      ui.wasOpen = false;
    });
    host.addEventListener('keydown', (event) => {
      const knot = knotOf(event);
      if (!knot || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      const n = Number(knot.dataset.knot);
      setOpen(ui.open === n ? null : n);
    });
    watcher.observe(host);
    // The axis labels are measured, so lay them out again once the web font is in.
    document.fonts?.ready.then(() => { if (ui.host === host) paint(); });
  }

  return {
    draw(host, cfg) {
      if (host !== ui.host) bind(host);
      // A last knot that follows the clock (cfg.follow) is the same knot at a new position.
      const [from, to] = [ui.cfg?.knots.at(-1), cfg.knots.at(-1)];
      ui.moved = cfg.follow && ui.cfg?.follow === cfg.follow && from !== to ? [from, to] : null;
      if (ui.moved && ui.open === from) ui.open = to;
      ui.cfg = cfg;
      paint();
      ui.moved = null;
    },
  };
}

// Feeds are meant to be 60 to 80 ml every 3 hours; over a longer stretch that is a band from
// lo*h/3 to hi*h/3 (480 to 640 ml a day).
export const INTAKE_TARGET = { lo: 60, hi: 80, every: 3 };
export const targetOver = (hours) => [INTAKE_TARGET.lo, INTAKE_TARGET.hi].map((ml) => Math.round((ml * hours) / INTAKE_TARGET.every));
