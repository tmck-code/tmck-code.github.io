// Settings: what an unweighed breast feed is estimated from, how that was worked out, and the
// form that changes it. Everything shown comes from /api/settings/breast-estimate, which runs the
// same code as the estimates themselves; nothing is recalculated here.

import { api } from './api.js';
import { clearRateCache, openEntry } from './forms.js';
import { toast } from './toast.js';
import { esc, fmtDuration, fmtShortDay, fmtTime } from './util.js';

const view = {
  host:   null,
  data:   null,
  onDone: null,
  dirty:  false,   // something was typed since the form was last filled: a refresh leaves it alone
  busy:   false,
};

const plural  = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtRate = (rate) => String(Number(rate.toFixed(2)));            // 2.13, 2.5, 3
const fmtMins = (seconds) => String(Number((seconds / 60).toFixed(1)));
const fmtWhen = (t) => `${fmtShortDay(t)}, ${fmtTime(t)}`;

// Only touch the DOM when the markup changed, so a background refresh keeps focus and scroll.
const rendered = new WeakMap();
function setHTML(el, html) {
  if (rendered.get(el) === html) return;
  rendered.set(el, html);
  el.innerHTML = html;
}

const slot = (name) => view.host.querySelector(`[data-slot="${name}"]`);

// ── The five parts ─────────────────────────────────────────────────────────────────────

function nowHTML(d) {
  const { source, ml_per_min: rate, feeds, default_ml: fallback, examples } = d.in_force;
  const capMin = Math.round(d.rule.max_seconds / 60);
  const since  = d.current && d.current.effective_from ? ` It has applied to feeds since ${fmtWhen(d.current.effective_from)}.` : '';
  let line;
  let extra;
  if (source === 'manual_rate') {
    line  = `An unweighed breast feed counts <strong>${esc(fmtRate(rate))} ml for each minute</strong> of feeding. This rate was set here in Settings.${esc(since)}`;
    extra = `A feed with no length to go on counts ${fallback} ml. Minutes past ${capMin} are not counted.`;
  } else if (source === 'rate') {
    line  = `An unweighed breast feed counts <strong>${esc(fmtRate(rate))} ml for each minute</strong> of feeding. This rate is calculated from the last ${plural(feeds, 'weighed feed', 'weighed feeds')}.`;
    extra = `A feed with no length to go on counts ${fallback} ml. Minutes past ${capMin} are not counted.`;
  } else {
    const have = d.pool.feeds;
    line  = `An unweighed breast feed counts <strong>a flat ${fallback} ml</strong>, however long it lasts.`;
    extra = `There is no rate yet: ${have} of the ${d.pool.min_feeds} usable weighed feeds it needs ${have === 1 ? 'has' : 'have'} been logged.`;
  }
  const rows = examples.map((e) => `
    <div class="set-example">
      <div class="set-example-label">${e.minutes} minute feed</div>
      <div class="set-example-value">${e.ml} ml</div>
    </div>`).join('');
  return `
    <p class="set-line">${line}</p>
    <div class="set-examples">${rows}</div>
    <p class="set-note">${esc(extra)} Weighed breast feeds and bottle feeds are never estimated this way.</p>`;
}

function calcHTML(d) {
  const { pool, rule, in_force: inForce } = d;
  const refMin = Math.round(rule.ref_min_seconds / 60);
  const capMin = Math.round(rule.max_seconds / 60);
  let sum;
  let status;
  if (!pool.feeds) {
    sum    = '<div class="set-sum is-empty">No usable weighed feeds yet</div>';
    status = `${plural(pool.min_feeds, 'weighed feed is', 'weighed feeds are')} needed before a rate can be calculated.`;
  } else {
    sum = `
      <div class="set-sum">${pool.total_ml} ml ÷ ${esc(fmtMins(pool.total_seconds))} min = <strong>${esc(fmtRate(pool.ml_per_min))} ml/min</strong></div>
      <div class="set-sum-cap">Total weight gained ÷ total minutes fed, over the ${plural(pool.feeds, 'weighed feed', 'weighed feeds')} marked “Used” below.</div>`;
    const more = pool.min_feeds - pool.feeds;
    status = !pool.enough
      ? `Not in use yet: ${plural(more, 'more weighed feed is', 'more weighed feeds are')} needed (${pool.feeds} of ${pool.min_feeds}). Until then a feed counts the default of ${inForce.default_ml} ml.`
      : inForce.source === 'manual_rate'
        ? `Not in use right now: the rate set in Settings (${fmtRate(inForce.ml_per_min)} ml/min) replaces it.`
        : 'In use now for unweighed breast feeds.';
  }
  const rules = [
    `The rate uses the ${rule.recent_feeds} most recent breast feeds that were weighed before and after.`,
    `It is the total ml gained divided by the total minutes fed (pauses left out), not an average of each feed’s own rate.`,
    `It needs at least ${rule.min_feeds} weighed feeds. With fewer, a feed counts the default amount.`,
    `A weighed feed is left out if the weight did not go up, if the gain is over ${rule.ref_max_ml} ml, or if it lasted under ${refMin} minutes.`,
    `An estimate counts at most the first ${capMin} minutes of a feed, and is never under ${rule.min_ml} ml.`,
    'Each feed keeps the rate as it stood when the feed started, so weighing a later feed does not change earlier estimates.',
  ];
  return `
    ${sum}
    <p class="set-status">${esc(status)}</p>
    <ul class="set-rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
}

function weighedHTML(d) {
  if (!d.weighed.length) {
    return '<p class="set-empty">No breast feeds have been weighed yet. Enter the baby’s weight before and after a breast feed and it will be listed here.</p>';
  }
  const row = (w) => {
    const rate   = typeof w.ml_per_min === 'number' ? `${fmtRate(w.ml_per_min)} ml/min` : 'no rate';
    const length = fmtDuration(w.duration_seconds);
    const mark   = w.used ? 'Used' : `Not used: ${w.reason_text}`;
    const label  = `${fmtWhen(w.started_at)}, ${length}, ${w.weight_before_g} to ${w.weight_after_g} grams, ${w.ml} ml, ${rate}. ${mark}. Edit feed`;
    return `
      <li><button type="button" class="set-feed${w.used ? '' : ' is-ignored'}" data-weighed="${w.id}" aria-label="${esc(label)}">
        <span class="set-feed-main">
          <span class="set-feed-when">${esc(fmtWhen(w.started_at))}</span>
          <span class="set-feed-nums">${esc(`${length} · ${w.weight_before_g} → ${w.weight_after_g} g`)}</span>
          <span class="set-feed-nums"><strong>${w.ml} ml</strong>${esc(` · ${rate}`)}</span>
        </span>
        <span class="set-mark${w.used ? ' is-used' : ''}">${esc(mark)}</span>
      </button></li>`;
  };
  return `<ul class="set-feeds">${d.weighed.map(row).join('')}</ul>`;
}

function historyHTML(d) {
  if (!d.history.length) {
    return `<p class="set-empty">No changes saved; using the calculated rate and the ${d.env_default_ml} ml default.</p>`;
  }
  const row = (h) => {
    const from    = h.effective_from ? `From ${fmtWhen(h.effective_from)}` : 'From the beginning (all feeds)';
    const rate    = h.manual_rate_ml_per_min === null ? 'calculated rate' : `${fmtRate(h.manual_rate_ml_per_min)} ml/min set by hand`;
    const amount  = h.default_ml === null ? `standard ${d.env_default_ml} ml default` : `${h.default_ml} ml default`;
    const current = d.current && d.current.id === h.id;
    const saved   = h.effective_from ? '' : ` · saved ${fmtWhen(h.created_at)}`;
    return `
      <li class="set-change${current ? ' is-current' : ''}">
        <span class="set-change-from">${esc(from)}${current ? ' <span class="set-mark is-used">In force now</span>' : ''}</span>
        <span class="set-change-what">${esc(`${rate[0].toUpperCase()}${rate.slice(1)}, ${amount}${saved}`)}</span>
      </li>`;
  };
  return `<ul class="set-changes">${d.history.map(row).join('')}</ul>`;
}

// ── The form ───────────────────────────────────────────────────────────────────────────

const SCOPE_HINT = {
  future: 'Feeds logged so far keep the estimates they have now. Only feeds that start after you save use the new figures.',
  all:    'Every unweighed breast feed, past and future, is re-estimated with these figures. Totals and charts for earlier days change, and earlier entries in the history below are replaced.',
};

const FORM = `
  <form class="set-form" novalidate>
    <div class="field">
      <label for="set-default">Default amount, in ml</label>
      <input id="set-default" class="input" type="number" name="default_ml" inputmode="numeric" min="0" step="1" autocomplete="off" aria-describedby="set-default-hint">
      <div class="field-hint" id="set-default-hint" data-slot="default-hint"></div>
    </div>
    <div class="field">
      <label for="set-rate">Rate, in ml per minute</label>
      <input id="set-rate" class="input" type="number" name="manual_rate" inputmode="decimal" min="0" step="any" autocomplete="off" aria-describedby="set-rate-hint">
      <div class="field-hint" id="set-rate-hint" data-slot="rate-hint"></div>
    </div>
    <fieldset class="set-scope">
      <legend>Apply to</legend>
      <div class="seg" role="radiogroup" aria-label="Apply to">
        <label class="seg-opt"><input type="radio" name="scope" value="all">Recalculate all feeds</label>
        <label class="seg-opt"><input type="radio" name="scope" value="future" checked>Only feeds from now on</label>
      </div>
      <div class="field-hint" data-slot="scope-hint" aria-live="polite"></div>
    </fieldset>
    <div class="set-alert" role="alert" hidden></div>
    <div class="set-actions">
      <button type="submit" class="btn btn-primary set-save">Save</button>
      <button type="button" class="btn btn-secondary set-reset" data-reset>Reset to calculated</button>
    </div>
    <div class="field-hint" data-slot="reset-hint"></div>
  </form>`;

const form = () => view.host.querySelector('.set-form');

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function showAlert(message) {
  const box = form().querySelector('.set-alert');
  box.hidden = !message;
  setText(box, message || '');
}

// The saved figures go into the inputs unless something has been typed since they were last filled.
function fillForm(d) {
  const els  = form().elements;
  const row  = d.current;
  const calc = d.pool.enough ? fmtRate(d.pool.ml_per_min) : '';
  els.default_ml.max      = String(d.limits.default_ml_max);
  els.manual_rate.max     = String(d.limits.manual_rate_max);
  els.manual_rate.placeholder = calc || 'Calculated';
  if (!view.dirty) {
    const values = [[els.default_ml, String(d.in_force.default_ml)], [els.manual_rate, row && row.manual_rate_ml_per_min !== null ? fmtRate(row.manual_rate_ml_per_min) : '']];
    values.forEach(([input, value]) => { if (input.value !== value) input.value = value; });
  }
  setText(slot('default-hint'), `Counted when there is no rate to go on, or the feed has no length. The standard is ${d.env_default_ml} ml.`);
  setText(slot('rate-hint'), calc
    ? `Leave empty to use the calculated rate (${calc} ml/min now). A rate typed here replaces it.`
    : 'Leave empty to use the calculated rate once enough feeds have been weighed. A rate typed here is used straight away.');
  setText(slot('reset-hint'), `Reset to calculated goes back to the calculated rate and the standard ${d.env_default_ml} ml default, for the feeds chosen under “Apply to”.`);
  syncScope();
}

function syncScope() {
  setText(slot('scope-hint'), SCOPE_HINT[form().elements.scope.value]);
}

// { default_ml, manual_rate_ml_per_min } as the API takes them (null: no override), or a message.
function readForm() {
  const els    = form().elements;
  const limits = view.data.limits;
  const amount = els.default_ml.value.trim();
  const rate   = els.manual_rate.value.trim();
  const body   = { default_ml: null, manual_rate_ml_per_min: null };
  if (amount !== '' || els.default_ml.validity.badInput) {
    const ml = Number(amount);
    if (amount === '' || !Number.isInteger(ml) || ml < 0 || ml > limits.default_ml_max) {
      return { error: `The default amount must be a whole number of ml from 0 to ${limits.default_ml_max}.`, focus: els.default_ml };
    }
    // The standard amount is not an override: leaving it unset lets it follow the server's setting.
    body.default_ml = ml === view.data.env_default_ml ? null : ml;
  }
  if (rate !== '' || els.manual_rate.validity.badInput) {
    const perMin = Number(rate);
    if (rate === '' || !Number.isFinite(perMin) || perMin <= 0 || perMin > limits.manual_rate_max) {
      return { error: `The rate must be more than 0 and at most ${limits.manual_rate_max} ml per minute. Leave it empty to use the calculated rate.`, focus: els.manual_rate };
    }
    body.manual_rate_ml_per_min = perMin;
  }
  return { body };
}

async function send(request, message) {
  if (view.busy) return;
  view.busy = true;
  const buttons = [...form().querySelectorAll('button')];
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const data = await request();
    clearRateCache();   // every start time is now estimated from something else
    view.dirty = false;
    form().elements.scope.value = 'future';
    showAlert('');
    apply(data);
    view.onDone(message);   // the toast, and a refresh of whatever is showing
  } catch (error) {
    toast(error.message, true);
  } finally {
    view.busy = false;
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function save(event) {
  event.preventDefault();
  const { body, error, focus } = readForm();
  if (error) { showAlert(error); focus.focus(); return; }
  const scope = form().elements.scope.value;
  send(
    () => api.saveBreastEstimate({ ...body, scope }),
    scope === 'all' ? 'Saved. All breast feeds re-estimated' : 'Saved. Applies to feeds from now on',
  );
}

// Back to the calculated rate and the standard default: for every feed (the history is cleared),
// or only from now on (one more history row, earlier feeds keep their figures).
function reset() {
  const scope = form().elements.scope.value;
  view.dirty = false;
  send(
    scope === 'all'
      ? () => api.resetBreastEstimate()
      : () => api.saveBreastEstimate({ default_ml: null, manual_rate_ml_per_min: null, scope }),
    scope === 'all' ? 'Reset. All breast feeds use the calculated estimate' : 'Reset. Feeds from now on use the calculated estimate',
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────────────

function build(host) {
  host.innerHTML = `
    <h2 class="set-title">Breast feed estimate</h2>
    <p class="set-lede">A breast feed that was not weighed before and after is counted as an estimate. This page shows where that estimate comes from and lets you change it.</p>
    <section class="panel" aria-labelledby="set-h-now"><h3 id="set-h-now">What applies now</h3><div data-slot="now"></div></section>
    <section class="panel" aria-labelledby="set-h-calc"><h3 id="set-h-calc">How the rate is calculated</h3><div data-slot="calc"></div></section>
    <section class="panel" aria-labelledby="set-h-weighed"><h3 id="set-h-weighed">Weighed feeds</h3><div data-slot="weighed"></div></section>
    <section class="panel" aria-labelledby="set-h-adjust"><h3 id="set-h-adjust">Adjust</h3>${FORM}</section>
    <section class="panel" aria-labelledby="set-h-history"><h3 id="set-h-history">History</h3><div data-slot="history"></div></section>`;
  view.host = host;
  form().addEventListener('submit', save);
  form().addEventListener('input', (event) => {
    if (event.target.name === 'scope') { syncScope(); return; }
    view.dirty = true;
    showAlert('');
  });
  form().querySelector('[data-reset]').addEventListener('click', reset);
  host.addEventListener('click', (event) => {
    const el = event.target.closest('[data-weighed]');
    const item = el && view.data.weighed.find((w) => String(w.id) === el.dataset.weighed);
    if (item) openEntry('feed', item.feed, { onDone: view.onDone });
  });
}

function apply(data) {
  view.data = data;
  setHTML(slot('now'), nowHTML(data));
  setHTML(slot('calc'), calcHTML(data));
  setHTML(slot('weighed'), weighedHTML(data));
  setHTML(slot('history'), historyHTML(data));
  fillForm(data);
}

// Fetch the page's data; the returned function draws it (app.js's refresh applies only the newest load).
export async function loadSettings(host, { onDone }) {
  const data = await api.breastEstimate();
  return () => {
    if (view.host !== host) build(host);
    view.onDone = onDone;
    apply(data);
  };
}
