// Reminders: recurring or one-time tasks ("vitamin D, daily", "bath, every 2 days at 08:00").
//
// The server decides what is due (babytracker/reminders.py); this module only draws it: the card on
// Today, the section on Settings, the count on the Today button, and the sheet that adds and edits.
// There are no notifications: a plain web page on the home wifi cannot send any, so a reminder is
// something you see when you open the app.
//
// A server from before reminders existed answers 404: the feature then hides itself, silently.

import { api } from './api.js';
import { alertBox, attempt, closeSheet, openSheet, optionalSection, showError } from './forms.js';
import { toast } from './toast.js';
import { TZ, addDays, esc, fmtShortDay, fmtTime, fmtWeekday, icon, startOfDay, ymd } from './util.js';

const TITLE_MAX = 60;    // backend: 1..60
const NOTES_MAX = 500;
const EVERY_MAX = { hours: 72, days: 365, weeks: 52 };   // backend: reminders.py EVERY_MAX
const SHOWN     = 3;     // rows on Today before "Show all" (everything due or overdue always shows)
const WIDE      = '(min-width: 1080px)';   // desktop Today: three columns, the card grows and scrolls, so all show
const MINUTE    = 60000;
const DAY       = 86400000;

// Keys the backend stores; the artwork is the sprite in index.html and the colour pairs in reminders.css.
const ICONS = [
  ['bell', 'Bell'], ['clock', 'Clock'], ['droplet', 'Drops'], ['bath', 'Bath'], ['pill', 'Medicine'], ['thermometer', 'Thermometer'],
  ['scissors', 'Scissors'], ['sun', 'Sun'], ['moon', 'Moon'], ['calendar', 'Calendar'], ['heart', 'Heart'], ['star', 'Star'],
];
const COLOURS = [
  ['neutral', 'Neutral'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple'], ['pink', 'Pink'],
];
const PRESETS = [['Daily', 1, 'days'], ['Every 2 days', 2, 'days'], ['Weekly', 1, 'weeks']];
const UNIT    = { hours: ['hour', 'hours'], days: ['day', 'days'], weeks: ['week', 'weeks'] };

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const ms  = (t) => new Date(t).getTime();
const cap = (text) => text && text[0].toUpperCase() + text.slice(1);
const parseYmd = (text) => { const [y, m, d] = text.split('-').map(Number); return new Date(y, m - 1, d); };

let ctx         = { now: () => Date.now(), isToday: () => true, refresh: () => {} };
let items       = null;    // the last list the server sent; null until one arrives
let unavailable = false;   // the server has no reminders (an older version): show nothing, ask no more
let showAll     = false;
let drawnMinute = -1;

const rendered = new WeakMap();
function setHTML(el, html) {
  if (rendered.get(el) === html) return;
  rendered.set(el, html);
  el.innerHTML = html;
}

// ── Wording ────────────────────────────────────────────────────────────────────────────

// "25 min", "3 h", "2 d": how far away, or how late.
function span(millis) {
  const mins = Math.max(1, Math.round(millis / MINUTE));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

// "today", "tomorrow", "yesterday", "Thu" within the week ahead, else "Thu 26 Nov".
function dayWord(date, nowMs) {
  const diff = Math.round((startOfDay(date).getTime() - startOfDay(new Date(nowMs)).getTime()) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 1 && diff < 7 ? fmtWeekday(date) : fmtShortDay(date);
}

// When an occurrence is: "20:00" today, "tomorrow 08:00", "Thu 08:00"; a whole-day one is just the day.
function moment(due, allDay, nowMs) {
  const day = dayWord(due, nowMs);
  if (allDay) return day;
  return day === 'today' ? fmtTime(due) : `${day} ${fmtTime(due)}`;
}

// The server's state, moved on by this device's clock between refreshes (upcoming → due → overdue).
function liveState(r, nowMs) {
  if (r.state === 'upcoming' && r.next_due_at && nowMs >= ms(r.next_due_at)) return nowMs >= ms(r.overdue_at) ? 'overdue' : 'due';
  if (r.state === 'due' && r.overdue_at && nowMs >= ms(r.overdue_at)) return 'overdue';
  return r.state;
}

// { flag, text }: the word that says where it stands ("Overdue", "Due now", "Done"), and the detail.
function standing(r, nowMs) {
  const state = liveState(r, nowMs);
  const due   = r.next_due_at ? new Date(r.next_due_at) : null;
  if (state === 'paused') return { state, flag: 'Paused', text: '' };
  if (state === 'done') {
    const at   = r.last_completed_at ? new Date(r.last_completed_at) : null;
    const when = at ? moment(at, false, nowMs) : '';
    return { state, flag: `Done${when ? ` ${when}` : ''}`, text: due ? `next ${moment(due, r.all_day, nowMs)}` : '' };
  }
  if (state === 'overdue') {
    if (r.all_day) return { state, flag: 'Overdue', text: `due ${moment(due, true, nowMs)}` };
    return { state, flag: `Overdue ${span(nowMs - due.getTime())}`, text: `due ${moment(due, false, nowMs)}` };
  }
  if (state === 'due') return r.all_day ? { state, flag: 'Due today', text: '' } : { state, flag: 'Due now', text: fmtTime(due) };
  const today = dayWord(due, nowMs) === 'today';
  if (!r.all_day && today) return { state, flag: '', text: `In ${span(due.getTime() - nowMs)} · ${fmtTime(due)}` };
  return { state, flag: '', text: cap(moment(due, r.all_day, nowMs)) };
}

// "08:00" as this device writes a time of day.
const clockText = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return fmtTime(new Date(2026, 0, 1, h, m)); };

// "Daily at 08:00", "Every 2 days", "Weekly", "Every 4 hours", "Once · Thu 26 Nov 14:30".
function cadenceText(c) {
  if (c.unit === 'once') return `Once · ${c.on ? fmtShortDay(parseYmd(c.on)) : 'no date yet'}${c.at ? ` ${clockText(c.at)}` : ''}`;
  const every = Number(c.every) || 1;
  const base  = every === 1 ? { hours: 'Hourly', days: 'Daily', weeks: 'Weekly' }[c.unit] : `Every ${every} ${UNIT[c.unit][1]}`;
  return c.unit !== 'hours' && c.at ? `${base} at ${clockText(c.at)}` : base;
}

// When a cadence just saved would first be due (the server's rule, reminders.py, for a schedule starting now).
function firstDue(c, nowMs) {
  if (c.unit === 'hours') return { due: new Date(nowMs + c.every * 3600e3), allDay: false };
  const [h, m] = (c.at || '00:00').split(':').map(Number);
  const today  = new Date(nowMs);
  const due    = c.unit === 'once' ? parseYmd(c.on) : startOfDay(today);
  due.setHours(h, m, 0, 0);
  if (c.unit === 'once') return { due, allDay: false };
  if (!c.at) return { due: startOfDay(today), allDay: true };
  return { due: due.getTime() < nowMs ? addDays(due, 1) : due, allDay: false };
}

// ── Rows ───────────────────────────────────────────────────────────────────────────────

const disc = (r, size = 24) => `<span class="rem-ico">${icon(r.icon, size)}</span>`;

const DOT = '<span class="rem-dot" aria-hidden="true"> · </span>';

// "every 2 days at 08:00": the cadence as the tail of a status line.
const cadenceTail = (r) => `<span class="rem-cadence">${DOT}${esc(cadenceText(r).replace(/^[A-Z]/, (c) => c.toLowerCase()))}</span>`;

// One reminder: the body opens it, the round button ticks it off. `detail` adds the cadence (Settings),
// on the same line as the status.
function row(r, nowMs, { detail = false, tick = true } = {}) {
  const s    = standing(r, nowMs);
  const flag = s.flag ? `<strong class="rem-flag">${esc(s.flag)}</strong>` : '';
  const when = [flag, s.text ? `<span>${esc(s.text)}</span>` : ''].filter(Boolean).join(DOT);
  const done = s.state === 'done';
  const tickButton = tick && s.state !== 'paused' ? `
      <button type="button" class="rem-tick" data-rem-tick="${r.id}" aria-pressed="${done}"
        aria-label="${esc(done ? `${r.title}: done. Undo` : `Mark ${r.title} done`)}" title="${done ? 'Done' : 'Mark done'}">${icon('check', 24)}</button>` : '';
  return `
    <li class="rem-row is-${s.state}" data-rc="${esc(r.colour)}">
      <button type="button" class="rem-main" data-rem-open="${r.id}">
        ${disc(r)}
        <span class="rem-text">
          <span class="rem-name">${esc(r.title)}</span>
          <span class="rem-when">${when}${detail ? cadenceTail(r) : ''}</span>
        </span>
      </button>${tickButton}
    </li>`;
}

// A finished one-time reminder leaves Today once the day it was ticked on is over.
const finishedEarlier = (r, nowMs) => r.finished && (!r.last_completed_at || ms(r.last_completed_at) < startOfDay(new Date(nowMs)).getTime());
const pressing = (r, nowMs) => ['overdue', 'due'].includes(liveState(r, nowMs));
const RANK     = { overdue: 0, due: 1, upcoming: 2, done: 3, paused: 4 };

// The server's order (most pressing first), kept right as this device's clock moves states on.
const ordered = (list, nowMs) => list
  .map((r, i) => [RANK[liveState(r, nowMs)], i, r])
  .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  .map(([, , r]) => r);

function renderCard(nowMs) {
  const card = $('reminders');
  if (!card) return;
  const list = items && ctx.isToday() ? ordered(items.filter((r) => r.active && !finishedEarlier(r, nowMs)), nowMs) : [];
  card.hidden = list.length === 0;
  if (!list.length) return;
  const urgent = list.filter((r) => pressing(r, nowMs)).length;
  const wide   = window.matchMedia(WIDE).matches;
  const few    = wide ? list.length : Math.max(SHOWN, urgent);
  const shown  = showAll ? list : list.slice(0, few);
  const more   = list.length > few
    ? `<button type="button" class="btn rem-more" data-rem-more aria-expanded="${showAll}"
        aria-label="${showAll ? 'Show fewer' : `Show all ${list.length} reminders`}">${list.length}${icon(showAll ? 'up' : 'down', 24)}</button>` : '';
  setHTML(card, `
    <div class="rem-head">
      <h2 id="reminders-title">Reminders</h2>
      ${more}
      <button type="button" class="btn btn-icon rem-add" data-rem-add aria-label="Add a reminder" title="Add a reminder">${icon('plus', 24)}</button>
    </div>
    <ul class="rem-list">${shown.map((r) => row(r, nowMs)).join('')}</ul>`);
}

function group(title, list, nowMs, options) {
  if (!list.length) return '';
  return `${title ? `<h3 class="rem-group">${esc(title)}</h3>` : ''}<ul class="rem-list">${list.map((r) => row(r, nowMs, options)).join('')}</ul>`;
}

function renderSettings(nowMs) {
  const host = $('reminders-settings');
  if (!host) return;
  host.hidden = items === null;
  if (items === null) return;
  const finished = items.filter((r) => r.finished);
  const paused   = items.filter((r) => !r.active && !r.finished);
  const running  = ordered(items.filter((r) => r.active && !r.finished), nowMs);
  // A finished one reads "Done Tue 24 Nov 08:12": always with its date, however long ago.
  const past = finished.map((r) => `
    <li class="rem-row is-done" data-rc="${esc(r.colour)}">
      <button type="button" class="rem-main" data-rem-open="${r.id}">
        ${disc(r)}
        <span class="rem-text">
          <span class="rem-name">${esc(r.title)}</span>
          <span class="rem-when"><strong class="rem-flag">${esc(r.last_completed_at ? `Done ${fmtShortDay(r.last_completed_at)} ${fmtTime(r.last_completed_at)}` : 'Done')}</strong>${cadenceTail(r)}</span>
        </span>
      </button>
    </li>`).join('');
  setHTML(host, `
    <div class="rem-head">
      <h2 id="rem-settings-title">Reminders</h2>
      <button type="button" class="btn btn-icon rem-add" data-rem-add aria-label="Add a reminder" title="Add a reminder">${icon('plus', 24)}</button>
    </div>
    <p class="rem-note">Due reminders show on Today. This page cannot send notifications.</p>
    ${items.length ? '' : '<p class="rem-empty">No reminders yet.</p>'}
    ${group('', running, nowMs, { detail: true })}
    ${group('Paused', paused, nowMs, { detail: true, tick: false })}
    ${past ? `<h3 class="rem-group">Done</h3><ul class="rem-list">${past}</ul>` : ''}`);
}

function renderBadge(nowMs) {
  const badge = $('reminders-badge');
  if (!badge) return;
  const count  = (items || []).filter((r) => r.active && pressing(r, nowMs)).length;
  const button = badge.closest('button');
  badge.hidden = count === 0;
  badge.textContent = count > 9 ? '9+' : String(count);
  if (button) button.setAttribute('aria-label', count ? `Today, ${count} reminder${count === 1 ? '' : 's'} due` : 'Today');
}

function render() {
  const nowMs = ctx.now();
  drawnMinute = Math.floor(nowMs / MINUTE);
  renderCard(nowMs);
  renderSettings(nowMs);
  renderBadge(nowMs);
}

// ── Loading ────────────────────────────────────────────────────────────────────────────

// Fetches the list; resolves to the function that draws it. Never rejects: whatever went wrong, the
// view's own loader reports a lost connection, and what was last drawn stays.
export async function loadReminders() {
  if (unavailable) return () => {};
  try {
    const list = await api.reminders();
    return () => { items = Array.isArray(list) ? list : []; render(); };
  } catch (error) {
    if (error.status === 404 || error.status === 405) { unavailable = true; items = null; }
    return render;
  }
}

// The "in 3 h" texts move with the clock: redraw when the minute changes.
export function tickReminders() {
  if (items && Math.floor(ctx.now() / MINUTE) !== drawnMinute) render();
}

// ── Ticking off ────────────────────────────────────────────────────────────────────────

const failed = (error) => toast(error.message, true);

async function undo(r, tickId) {
  try {
    await api.undoReminder(r.id, tickId);
    toast(`${r.title}: not done`);
  } catch (error) {
    // 404: the other phone undid it already. Nothing to say.
    if (error.status !== 404) failed(error);
  }
  ctx.refresh();
}

const undoAction = (r, tickId) => ({ label: 'Undo', run: () => undo(r, tickId) });

async function tick(r) {
  if (liveState(r, ctx.now()) === 'done') {
    // A second tap changes nothing: say it is done, and offer the way back.
    const at = r.last_completed_at ? ` ${fmtTime(r.last_completed_at)}` : '';
    toast(`${r.title}: already done${at}`, false, '', r.last_completion_id ? undoAction(r, r.last_completion_id) : null);
    return;
  }
  try {
    const { reminder, completion } = await api.completeReminder(r.id);
    const next = reminder.next_due_at ? ` · next ${moment(new Date(reminder.next_due_at), reminder.all_day, ctx.now())}` : '';
    toast(`${r.title} done${next}`, false, '', undoAction(r, completion.id));
  } catch (error) {
    // 409: the other phone ticked it a moment ago. The refresh shows it done.
    if (error.status !== 409) failed(error);
  }
  ctx.refresh();
}

// ── The sheet: add, edit, look at ──────────────────────────────────────────────────────

const titleIcon = (r) => `<span class="sheet-ico rem-sheet-ico" data-rc="${esc(r.colour)}">${icon(r.icon, 22)}</span>`;

const picker = (name, label, options, chosen, inner) => `
  <div class="field">
    <div class="seg-label" id="rem-${name}-label">${label}</div>
    <div class="rem-pick rem-pick-${name}" role="radiogroup" aria-labelledby="rem-${name}-label">
      ${options.map(([key, text]) => `
        <label class="rem-opt" title="${esc(text)}" ${name === 'colour' ? `data-rc="${key}"` : ''}>
          <input type="radio" name="${name}" value="${key}" aria-label="${esc(text)}" ${key === chosen ? 'checked' : ''}>${inner(key)}
        </label>`).join('')}
    </div>
  </div>`;

// The next whole hour, for a new one-time reminder: later today, or tomorrow if that would be past midnight.
function nextHour(nowMs) {
  const t = new Date(nowMs);
  t.setHours(t.getHours() + 1, 0, 0, 0);
  return t;
}

function formHTML(r, isNew, nowMs) {
  const once    = r.unit === 'once';
  const soon    = nextHour(nowMs);
  const unit    = once ? 'days' : r.unit;
  const preset  = (every, u) => !once && Number(r.every) === every && r.unit === u;
  return `
    <div class="field">
      <label for="f-rem-title">Title</label>
      <input id="f-rem-title" class="input" type="text" name="title" maxlength="${TITLE_MAX}" value="${esc(r.title)}"
        placeholder="e.g. Vitamin D drops" autocomplete="off" enterkeyhint="done">
    </div>
    <div class="seg kind-seg" role="radiogroup" aria-label="How often">
      <label class="seg-opt"><input type="radio" name="kind" value="repeat" ${once ? '' : 'checked'}>Repeats</label>
      <label class="seg-opt"><input type="radio" name="kind" value="once" ${once ? 'checked' : ''}>One time</label>
    </div>
    <div class="rem-repeat" data-rem-kind="repeat" ${once ? 'hidden' : ''}>
      <div class="rem-presets" role="group" aria-label="Common choices">
        ${PRESETS.map(([text, every, u]) => `<button type="button" class="btn btn-secondary rem-preset" data-rem-preset="${every}:${u}" aria-pressed="${preset(every, u)}">${text}</button>`).join('')}
      </div>
      <div class="rem-every">
        <label for="f-rem-every">Every</label>
        <input id="f-rem-every" class="input" type="number" name="every" inputmode="numeric" min="1" max="${EVERY_MAX[unit]}" step="1"
          value="${esc(once ? 1 : r.every)}" autocomplete="off" aria-label="Every how many">
        <select class="input" name="unit" aria-label="Hours, days or weeks">
          ${Object.keys(UNIT).map((u) => `<option value="${u}" ${u === unit ? 'selected' : ''}>${UNIT[u][1]}</option>`).join('')}
        </select>
      </div>
      <div class="field" data-rem-at ${unit === 'hours' ? 'hidden' : ''}>
        <label for="f-rem-at">At <span class="opt">(optional: leave empty for any time that day)</span></label>
        <div class="rem-at">
          <input id="f-rem-at" class="input" type="time" name="at" value="${esc(once ? '' : r.at || '')}">
          <button type="button" class="btn btn-secondary rem-clear" data-rem-clear>Any time</button>
        </div>
      </div>
    </div>
    <div class="field-row" data-rem-kind="once" ${once ? '' : 'hidden'}>
      <div class="field">
        <label for="f-rem-on">Date</label>
        <input id="f-rem-on" class="input" type="date" name="on" value="${esc(once && r.on ? r.on : ymd(soon))}">
      </div>
      <div class="field">
        <label for="f-rem-once-at">Time</label>
        <input id="f-rem-once-at" class="input" type="time" name="once_at" value="${esc(once && r.at ? r.at : `${pad(soon.getHours())}:00`)}">
      </div>
    </div>
    <p class="rem-summary" data-rem-summary aria-live="polite"></p>
    ${optionalSection(`
      <div class="field">
        <label for="f-rem-description">Description</label>
        <input id="f-rem-description" class="input" type="text" name="description" maxlength="${NOTES_MAX}" value="${esc(r.description)}"
          placeholder="e.g. one drop, on the tongue" autocomplete="off">
      </div>
      ${picker('icon', 'Icon', ICONS, r.icon, (key) => icon(key, 22))}
      ${picker('colour', 'Colour', COLOURS, r.colour, () => `<span class="rem-swatch">${icon('check', 18)}</span>`)}`)}
    ${alertBox()}
    <button type="submit" class="btn btn-primary sheet-primary">${isNew ? 'Add' : 'Save'}</button>`;
}

const fail = (error) => ({ error });

// The form as the API takes it, or { error } with what to fix.
function readForm(form, r) {
  const value = (name) => form.elements[name].value;
  const title = value('title').trim();
  if (!title) return fail('Give the reminder a title.');
  const look = { title, description: value('description').trim(), icon: value('icon') || 'bell', colour: value('colour') || 'neutral' };
  let cadence;
  if (value('kind') === 'once') {
    if (!value('on') || !value('once_at')) return fail('Choose the date and the time.');
    cadence = { unit: 'once', every: 1, on: value('on'), at: value('once_at') };
  } else {
    const unit  = value('unit');
    const every = Number(value('every'));
    if (!Number.isInteger(every) || every < 1 || every > EVERY_MAX[unit]) return fail(`Every how many ${UNIT[unit][1]}? A whole number from 1 to ${EVERY_MAX[unit]}.`);
    cadence = { unit, every, on: null, at: unit === 'hours' ? null : value('at') || null };
  }
  // The schedule keeps the time zone it was saved in unless the schedule itself is changed here.
  const same = r.id !== undefined && ['unit', 'every', 'on', 'at'].every((key) => (r[key] ?? null) === cadence[key]);
  return { ...look, ...cadence, tz: same ? r.tz : TZ, sameCadence: same };
}

// The line under the cadence: what was chosen in words, and when it is next due.
function summaryText(form, r, nowMs) {
  const body = readForm(form, { ...r, title: r.title || 'x' });
  const draft = body.error ? null : body;
  if (!draft) {
    const title = form.elements.title.value.trim();
    // Only the title missing: the cadence can still be described.
    if (!title) { const again = readFormCadence(form); return again ? describe(again, r, nowMs, false) : ''; }
    return '';
  }
  return describe(draft, r, nowMs, draft.sameCadence);
}

function readFormCadence(form) {
  const probe = { title: 'x' };
  const saved = form.elements.title.value;
  form.elements.title.value = 'x';
  const body = readForm(form, probe);
  form.elements.title.value = saved;
  return body.error ? null : body;
}

function describe(c, r, nowMs, same) {
  const text = cadenceText(c);
  if (c.unit === 'once') {
    const { due } = firstDue(c, nowMs);
    if (same && r.finished) return `${text} · done. Change the date to use it again.`;
    return due.getTime() < nowMs ? `${text} · already past, so it will show as overdue` : text;
  }
  if (same && r.active === false) return `${text} · paused`;
  const next = same && r.next_due_at ? { due: new Date(r.next_due_at), allDay: r.all_day } : firstDue(c, nowMs);
  const day  = `${fmtShortDay(next.due)}${next.allDay ? '' : ` ${fmtTime(next.due)}`}`;
  return `${text} · next due ${dayWord(next.due, nowMs) === 'today' ? `today${next.allDay ? '' : ` ${fmtTime(next.due)}`}` : day}`;
}

function wireForm(dialog, form, r) {
  const heading = dialog.querySelector('.rem-sheet-ico');
  const sync = () => {
    const once = form.elements.kind.value === 'once';
    const unit = form.elements.unit.value;
    form.querySelectorAll('[data-rem-kind]').forEach((el) => { el.hidden = (el.dataset.remKind === 'once') !== once; });
    form.querySelector('[data-rem-at]').hidden = unit === 'hours';
    form.elements.every.max = EVERY_MAX[unit];
    form.querySelectorAll('[data-rem-preset]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.remPreset === `${Number(form.elements.every.value)}:${unit}`));
    });
    form.querySelector('[data-rem-clear]').disabled = !form.elements.at.value;
    if (heading) {
      heading.dataset.rc = form.elements.colour.value || 'neutral';
      heading.innerHTML  = icon(form.elements.icon.value || 'bell', 22);
    }
    form.querySelector('[data-rem-summary]').textContent = summaryText(form, r, ctx.now());
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.addEventListener('click', (event) => {
    const preset = event.target.closest('[data-rem-preset]');
    if (preset) {
      const [every, unit] = preset.dataset.remPreset.split(':');
      form.elements.every.value = every;
      form.elements.unit.value  = unit;
      return sync();
    }
    if (event.target.closest('[data-rem-clear]')) { form.elements.at.value = ''; sync(); }
  });
  sync();
}

const historyHTML = (ticks) => (ticks.length ? `
  <ul class="rem-history">
    ${ticks.map((t) => `
      <li>
        <span>${esc(`${fmtShortDay(t.completed_at)} ${fmtTime(t.completed_at)}`)}</span>
        <button type="button" class="btn btn-secondary rem-untick" data-rem-untick="${t.id}"
          aria-label="${esc(`Remove the tick of ${fmtShortDay(t.completed_at)} ${fmtTime(t.completed_at)}`)}">${icon('x', 18)}Remove</button>
      </li>`).join('')}
  </ul>` : '<p class="rem-history-empty">Not ticked off yet.</p>');

const blank = () => ({ title: '', description: '', every: 1, unit: 'days', at: null, on: null, icon: 'bell', colour: 'neutral', active: true });

// Add a reminder (no `r`), or look at one and edit it: its standing and a tick button on top, the
// form, then its history, pause and delete.
export function openReminder(r = blank()) {
  const isNew = r.id === undefined;
  const nowMs = ctx.now();
  const s     = isNew ? null : standing(r, nowMs);
  const state = s && s.state;
  const top   = isNew ? '' : `
    <div class="rem-status is-${state}" data-rc="${esc(r.colour)}">
      <span class="rem-when">
        ${s.flag ? `<strong class="rem-flag">${esc(s.flag)}</strong>` : ''}
        ${s.text ? `<span>${esc(s.text)}</span>` : ''}
      </span>
      ${state === 'paused' ? '' : state === 'done'
        ? (r.last_completion_id ? `<button type="button" class="btn btn-secondary rem-status-btn" data-rem-undo>Undo</button>` : '')
        : `<button type="button" class="btn btn-primary rem-status-btn" data-rem-done>${icon('check', 20)}Mark done</button>`}
    </div>`;
  const title  = isNew ? 'New reminder' : 'Reminder';
  const dialog = openSheet(title, `
    ${top}
    <form class="sheet-form" novalidate>
      ${formHTML(r, isNew, nowMs)}
    </form>
    ${isNew ? '' : `
    <div class="rem-extra">
      <section class="rem-past" aria-labelledby="rem-past-title">
        <h3 id="rem-past-title">Ticked off</h3>
        <div data-rem-history><p class="rem-history-empty">Loading…</p></div>
        ${alertBox()}
      </section>
      <button type="button" class="btn btn-secondary rem-pause" data-rem-pause>${icon(r.active ? 'pause' : 'play', 18)}${r.active ? 'Pause this reminder' : 'Resume this reminder'}</button>
      <button type="button" class="btn btn-danger-text sheet-delete" data-ask-delete>${icon('trash', 18)}Delete reminder</button>
    </div>
    <div class="sheet-confirm" hidden>
      <p class="sheet-confirm-text">Its history goes too. It can’t be undone.</p>
      ${alertBox()}
      <div class="sheet-confirm-actions">
        <button type="button" class="btn btn-secondary" data-keep>Keep it</button>
        <button type="button" class="btn btn-danger" data-delete>Delete reminder</button>
      </div>
    </div>`}`, titleIcon(r));

  const form = dialog.querySelector('form');
  wireForm(dialog, form, r);
  const finish = (message, action = null) => {
    closeSheet();
    if (message) toast(message, false, '', action);
    ctx.refresh();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    if (button.disabled) return;
    const { error, sameCadence, ...body } = readForm(form, r);
    if (error) return showError(form, error);
    const outcome = await attempt(form, [button], () => api.saveReminder(r.id, body));
    if (!outcome) return;
    if (outcome.current) closeSheet();
    toast(isNew ? 'Reminder added' : 'Changes saved');
    ctx.refresh();
  });
  if (isNew) return;

  const status = dialog.querySelector('.rem-status');
  const extra  = dialog.querySelector('.rem-extra');
  const past   = dialog.querySelector('.rem-past');
  const act = async (scope, buttons, action) => {
    const outcome = await attempt(scope, buttons, action);
    return outcome && outcome.current ? outcome.result : undefined;
  };

  status.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-rem-done], [data-rem-undo]');
    if (!button || button.disabled) return;
    if (button.dataset.remUndo !== undefined) {
      const undone = await act(past, [button], () => api.undoReminder(r.id, r.last_completion_id));
      if (undone) finish(`${r.title}: not done`);
      return;
    }
    const ticked = await act(past, [button], () => api.completeReminder(r.id));
    if (!ticked) return;
    const next = ticked.reminder.next_due_at ? ` · next ${moment(new Date(ticked.reminder.next_due_at), ticked.reminder.all_day, ctx.now())}` : '';
    finish(`${r.title} done${next}`, undoAction(r, ticked.completion.id));
  });

  const history = dialog.querySelector('[data-rem-history]');
  const loadHistory = async () => {
    try {
      history.innerHTML = historyHTML(await api.reminderHistory(r.id));
    } catch (error) {
      history.innerHTML = '<p class="rem-history-empty">The history could not be loaded.</p>';
    }
  };
  history.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-rem-untick]');
    if (!button || button.disabled) return;
    const updated = await act(past, [button], () => api.undoReminder(r.id, Number(button.dataset.remUntick)));
    if (!updated) return;
    // The standing on top has changed with it: draw the sheet again from what the server sent back.
    ctx.refresh();
    openReminder(updated);
  });
  loadHistory();

  extra.querySelector('[data-rem-pause]').addEventListener('click', async (event) => {
    const updated = await act(past, [event.currentTarget], () => api.pauseReminder(r.id, r.active));
    if (updated) finish(r.active ? `${r.title} paused` : `${r.title} resumed`);
  });

  const confirm = dialog.querySelector('.sheet-confirm');
  const heading = dialog.querySelector('.sheet-title-text');
  const showConfirm = (on) => {
    [status, form, extra].forEach((el) => { el.hidden = on; });
    confirm.hidden = !on;
    heading.textContent = on ? 'Delete this reminder?' : title;
    dialog.scrollTop = 0;
    (on ? confirm.querySelector('[data-keep]') : extra.querySelector('[data-ask-delete]')).focus();
  };
  extra.querySelector('[data-ask-delete]').addEventListener('click', () => showConfirm(true));
  confirm.querySelector('[data-keep]').addEventListener('click', () => showConfirm(false));
  confirm.querySelector('[data-delete]').addEventListener('click', async () => {
    const outcome = await attempt(confirm, [...confirm.querySelectorAll('button')], () => api.removeReminder(r.id), null, 'Not deleted. You’re offline.');
    if (outcome) finish('Reminder deleted');
  });
}

// ── Wiring ─────────────────────────────────────────────────────────────────────────────

// `now`: the server-aligned clock. `isToday`: whether Today shows today (the card hides on a past
// day). `refresh`: reloads the view, reminders included.
export function initReminders(options) {
  ctx = { ...ctx, ...options };
  // Crossing the desktop width changes how many rows Today shows.
  const wide = window.matchMedia(WIDE);
  if (wide.addEventListener) wide.addEventListener('change', () => { if (items) render(); });
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-rem-tick], [data-rem-open], [data-rem-add], [data-rem-more]');
    if (!el || el.closest('#sheet')) return;
    const data = el.dataset;
    if (data.remAdd !== undefined) return openReminder();
    if (data.remMore !== undefined) { showAll = !showAll; return render(); }
    const found = (items || []).find((r) => String(r.id) === (data.remTick || data.remOpen));
    if (!found) return;
    if (data.remTick) {
      if (el.disabled) return;
      el.disabled = true;
      tick(found).finally(() => { el.disabled = false; });
    } else {
      openReminder(found);
    }
  });
}
