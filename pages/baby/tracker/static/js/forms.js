// The sheet (native <dialog id="sheet">) and every form shown in it.

import { api } from './api.js';
import { toast } from './toast.js';
import {
  addDays, elapsedSeconds, esc, fmtDuration, fmtKg, fmtShortDay, fmtTime, fromInput, icon, rateText, ratedEstimateMl,
  ratedSource, sideSeconds, toInput, ymd,
} from './util.js';

export const TYPES = {
  sleep:  { table: 'sleeps',  label: 'Sleep',    noun: 'sleep' },
  feed:   { table: 'feeds',   label: 'Feed',     noun: 'feed' },
  nappy:  { table: 'nappies', label: 'Nappy',    noun: 'nappy' },
  weight: { table: 'weights', label: 'Weigh-in', noun: 'weigh-in' },
  express: { table: 'expresses', label: 'Express', noun: 'express' },
};

const MINUTE     = 60000;
const ML_MAX     = 2000;   // backend: 0..2000
const GRAMS_MIN  = 500;    // backend accepts 1..30000; the design narrows it to a plausible baby
const GRAMS_MAX  = 20000;
const NOTES_MAX  = 500;
const EXPRESS_MIN = 1;     // backend: 1..2000
const SIDE_MAX   = 86400;  // backend: 0..86400 seconds per side
const SLACK      = 120;    // seconds: edited times only have minute precision
const ML_PRESETS = [20, 30, 50];   // one-tap amounts beside a millilitre input
const ML_STEP    = 10;

const MSG = {
  offline:     'Nothing was saved. Your details are still here, so try again.',
  offlineDel:  'Nothing was deleted. Try again.',
  noStart:     'Add a start time.',
  futureStart: 'The start time is in the future.',
  endFirst:    'The end time is before the start. Check both times.',
  futureEnd:   (noun) => `The end time is in the future. Leave it empty if the ${noun} is still going.`,
  running:     (noun) => `Another ${noun} is already running. Stop it first, or add an end time here.`,
  noEnd:       'Add an end time.',
  noTime:      'Add a time.',
  futureTime:  'That time is in the future.',
  nappy:       'Pick wet, dirty or both.',
  grams:       'Enter the weight in grams, for example 3545.',
  feedGrams:   `Enter the weights in grams, between ${GRAMS_MIN} and ${GRAMS_MAX}.`,
  afterLower:  'Weight after is lower than weight before. Check the two numbers.',
  ml:          `Enter the millilitres as a number from 0 to ${ML_MAX}.`,
  bottleMl:    `Enter the millilitres in the bottle as a number from 0 to ${ML_MAX}.`,
  expressMl:   `Enter the millilitres expressed, from ${EXPRESS_MIN} to ${ML_MAX}.`,
  expressOpen: 'Add an end time to save the millilitres, or clear them while it is still going.',
  minutes:     'Enter the minutes as a number, for example 7.5.',
  pausedLong:  (noun) => `The paused time is longer than the ${noun} itself. Check the minutes and both times.`,
  sidesLong:   'Left and right add up to more than the feed lasted. Check the minutes and both times.',
};

const NEW_TITLE   = { sleep: 'Add a sleep', feed: 'Log a finished feed', nappy: 'Nappy', weight: 'Weigh-in', express: 'Log a finished express' };
// The sheet's title (with the activity's icon) already names the activity, so the button is one word.
const NEW_PRIMARY = { sleep: 'Add', feed: 'Add', nappy: 'Log nappy', weight: 'Save', express: 'Log' };
const NOTES_HINT  = {
  sleep:  'Settled in the pram',
  feed:   'Took a while to settle',
  nappy:  'Bit of a rash',
  weight: 'Weighed before a feed',
  express: 'Left side only',
};
const PICKER = [
  ['sleep', 'moon', 'sleep'], ['feed', 'milk', 'feed'], ['nappy', 'nappy', 'wet'], ['weight', 'weight', 'weight'],
  ['express', 'express', 'express'],
];
const TIMED = ['sleep', 'feed', 'express'];   // entries with a start and an end; the rest are one moment

const sheet = document.getElementById('sheet');
let generation = 0; // bumped on every render and close, so a late response never closes a newer sheet

// Close on a click that both starts and ends on the scrim (the dialog element itself has no padding).
let pressedOnScrim = false;
sheet.addEventListener('pointerdown', (event) => { pressedOnScrim = event.target === sheet; });
sheet.addEventListener('click', (event) => {
  if (event.target.closest('[data-close]')) return sheet.close();
  const ml = event.target.closest('[data-ml]');
  if (ml) return mlQuick(ml);
  if (event.target === sheet && pressedOnScrim) sheet.close();
});
sheet.addEventListener('close', () => {
  generation += 1;
  sheet.innerHTML = '';
});

export function closeSheet() {
  if (sheet.open) sheet.close();
}

// ---------- markup ----------

// The same sprite symbol and event colour as the activity's quick button, for the sheet's title.
function titleIcon(type) {
  const found = PICKER.find(([key]) => key === type);
  return found ? `<span class="sheet-ico chip chip-44" data-ev="${found[2]}">${icon(found[1], 24)}</span>` : '';
}

// `type`: the activity the sheet is about, whose icon then sits in front of the title.
// `iconHTML`: for a sheet that is not about an activity (reminders.js), its own title icon instead.
function render(title, body, type = '', iconHTML = '') {
  generation += 1;
  const wasOpen = sheet.open;
  sheet.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-head">
        <h2 id="sheet-title" tabindex="-1" autofocus>${iconHTML || titleIcon(type)}<span class="sheet-title-text">${esc(title)}</span></h2>
        <button type="button" class="btn btn-icon sheet-close" data-close aria-label="Close">${icon('x', 24)}</button>
      </div>
      ${body}
    </div>`;
  sheet.scrollTop = 0;
  if (!wasOpen) sheet.showModal();
  // Focus the title, never a text input: no on-screen keyboard popping up on a phone.
  else sheet.querySelector('#sheet-title').focus();
  return sheet;
}

// The sheet with a body of the caller's own (reminders.js builds its forms there, with the helpers exported below).
export const openSheet = (title, body, iconHTML = '') => render(title, body, '', iconHTML);

// Everything that may be left empty sits together at the end of a form, under one heading. It is
// always open (no extra tap at night); sync hides it when the chosen feed kind leaves it empty.
export const optionalSection = (inner) => `
  <fieldset class="optional" data-group>
    <legend>Optional</legend>
    ${inner}
  </fieldset>`;

export const alertBox = () => `
  <div class="sheet-alert" role="alert" hidden>${icon('alert', 20)}<span></span></div>`;

const nudgeButton = (field, delta, label, aria = '', extra = '') =>
  `<button type="button" class="btn btn-secondary nudge${extra}" data-nudge="${field}" data-delta="${delta}"${aria ? ` aria-label="${aria}"` : ''}>${label}</button>`;

// A time of day only: the date rides along in data-date (see "times without a date" below) and
// shows as a small hint beside the label only when it is not the obvious one. `full` is the
// fallback for an entry a time of day cannot describe (a day or longer): date and time together.
function timeField(name, label, value, { labelExtra = '', canClear = false, full = false } = {}) {
  const local        = toInput(value);
  const [date, time] = local ? local.split('T') : ['', ''];
  const input = full
    ? `<input id="f-${name}" class="input" type="datetime-local" name="${name}" value="${esc(local)}"
        data-initial="${esc(local)}" data-iso="${esc(value || '')}">`
    : `<input id="f-${name}" class="input" type="time" name="${name}" value="${esc(time)}" data-date="${esc(date)}"
        data-initial="${esc(time)}" data-initial-date="${esc(date)}" data-iso="${esc(value || '')}">`;
  return `
    <div class="field">
      <label for="f-${name}">${label}${labelExtra}<span class="day-hint" data-day-hint="${name}" hidden></span></label>
      <div class="time-row">
        ${input}
        <div class="nudges" role="group" aria-label="Adjust ${esc(label.toLowerCase())} time">
          ${nudgeButton(name, -5, '−5', '5 minutes earlier')}
          ${nudgeButton(name, 5, '+5', '5 minutes later')}
          ${nudgeButton(name, 'now', 'Now', 'Set to now')}
        </div>
      </div>
      ${canClear ? nudgeButton(name, 'clear', 'Still going', '', ' nudge-wide') : ''}
    </div>`;
}

const mlButton = (name, attr, value, text, label) =>
  `<button type="button" class="btn btn-secondary ml-btn" data-ml="${name}" ${attr}="${value}" aria-label="${label}">${text}</button>`;

// Shortcuts around a millilitre input: −10 / +10 either side of it, the common amounts underneath.
// `ev` is the event colour (a data-ev key). One click handler on the sheet serves them all (mlQuick).
const mlShortcuts = (name, ev, input) => `
  <div class="ml-quick" data-ev="${ev}">
    <div class="ml-row">
      ${mlButton(name, 'data-ml-step', -ML_STEP, `−${ML_STEP}`, `Subtract ${ML_STEP} ml`)}
      ${input}
      ${mlButton(name, 'data-ml-step', ML_STEP, `+${ML_STEP}`, `Add ${ML_STEP} ml`)}
    </div>
    <div class="ml-presets" role="group" aria-label="Common amounts">
      ${ML_PRESETS.map((ml) => mlButton(name, 'data-ml-set', ml, `${ml} ml`, `Set ${ml} ml`)).join('')}
    </div>
  </div>`;

// `quick`: a data-ev key; when given, the field gets the millilitre shortcuts in that event colour.
// `liveHint`: an empty hint that sync fills in (and hides again) as the form changes.
function numberField(name, label, value, { min, max, placeholder, hint = '', hidden = false, quick = '', liveHint = false }) {
  const hinted = hint || liveHint;
  const input = `<input id="f-${name}" class="input input-big" type="number" name="${name}" inputmode="numeric"
        min="${min}" max="${max}" step="1" placeholder="${placeholder}" value="${esc(value ?? '')}"
        autocomplete="off" ${hinted ? `aria-describedby="f-${name}-hint"` : ''}>`;
  return `
    <div class="field" data-field="${name}" ${hidden ? 'hidden' : ''}>
      <label for="f-${name}">${label}</label>
      ${quick ? mlShortcuts(name, quick, input) : input}
      ${hinted ? `<div class="field-hint" id="f-${name}-hint" ${hint ? '' : 'hidden'}>${hint}</div>` : ''}
    </div>`;
}

// Minutes shown with one decimal; the stored seconds ride along so an untouched field sends them back exactly.
const toMinutes = (seconds) => String(Math.round(seconds / 6) / 10);

// `hintId`: the id of a hint rendered elsewhere (under the row the field sits in).
function minutesField(name, label, seconds, { blankZero = false, hintId = '' } = {}) {
  const has   = seconds !== null && seconds !== undefined;
  const shown = has && !(blankZero && seconds === 0) ? toMinutes(seconds) : '';
  return `
    <div class="field" data-field="${name}">
      <label for="f-${name}">${label}</label>
      <input id="f-${name}" class="input" type="number" name="${name}" inputmode="decimal"
        min="0" step="0.1" placeholder="0" value="${esc(shown)}" data-initial="${esc(shown)}"
        data-seconds="${has ? esc(seconds) : ''}" autocomplete="off" ${hintId ? `aria-describedby="${hintId}"` : ''}>
    </div>`;
}

// Left, right and paused minutes on one row of equal columns (whichever of them the form has and
// the feed kind shows). "sides" and "paused" stay separate data-fields: sync shows and hides them
// independently and readTimings asks whether each is shown.
const timingRow = (v, noun, { sides = false, paused = false } = {}) => (sides || paused ? `
  <div class="field-group" data-group>
    <div class="field-row">
      ${sides ? `
      <div class="field-cells" data-field="sides" ${v.kind === 'breast' && v.ended_at ? '' : 'hidden'}>
        ${minutesField('left_seconds', 'Left min', v.left_seconds)}
        ${minutesField('right_seconds', 'Right min', v.right_seconds)}
      </div>` : ''}
      ${paused ? `
      <div class="field-cells" data-field="paused" ${v.ended_at ? '' : 'hidden'}>
        ${minutesField('paused_seconds', 'Paused min', v.paused_seconds || 0, { blankZero: true, hintId: 'f-paused_seconds-hint' })}
      </div>` : ''}
    </div>
    ${paused ? `<div class="field-hint" id="f-paused_seconds-hint" data-field="paused_hint" ${v.ended_at ? '' : 'hidden'}>Paused is time off the clock. It is not counted in the length of the ${noun}.</div>` : ''}
  </div>` : '');

const sideSeg = (side, hidden) => `
  <div class="field field-inline" data-field="side" ${hidden ? 'hidden' : ''}>
    <div class="seg-label" id="f-side-label">First side</div>
    <div class="seg side-seg" role="radiogroup" aria-labelledby="f-side-label">
      <label class="seg-opt"><input type="radio" name="side" value="left" ${side === 'right' ? '' : 'checked'}>Left</label>
      <label class="seg-opt"><input type="radio" name="side" value="right" ${side === 'right' ? 'checked' : ''}>Right</label>
    </div>
  </div>`;

// "Left 6m, right 4m" for a breast feed with side times, otherwise ''.
function sidesText(feed) {
  const sides = sideSeconds(feed, Date.now());
  return sides.tracked ? `Left ${fmtDuration(sides.left)}, right ${fmtDuration(sides.right)}` : '';
}

const notesField = (type, value) => `
  <div class="field">
    <label for="f-notes">Notes</label>
    <input id="f-notes" class="input" type="text" name="notes" maxlength="${NOTES_MAX}"
      placeholder="${esc(NOTES_HINT[type])}" value="${esc(value)}" autocomplete="off">
  </div>`;

const kindSeg = (kind) => `
  <div class="seg kind-seg" role="radiogroup" aria-label="Feed type">
    <label class="seg-opt"><input type="radio" name="kind" value="bottle" ${kind === 'breast' ? '' : 'checked'}>Bottle</label>
    <label class="seg-opt"><input type="radio" name="kind" value="breast" ${kind === 'breast' ? 'checked' : ''}>Breast</label>
  </div>`;

const START_WEIGHT_HINT = 'Weigh again after the feed to estimate the intake. Without both weights the feed counts as a standard estimate.';
const START_WEIGHT_PLACEHOLDER = 'Weight before, in g (optional)';

// The amount of a bottle feed. It may be left empty, but it is the one thing a bottle feed is
// logged for, so it sits above the Optional section with the main fields.
const AMOUNT_HINT = '80';
const amountField = (v, breast, hint = '') =>
  numberField('amount_ml', 'Taken, in ml', v.amount_ml, { min: 0, max: ML_MAX, placeholder: AMOUNT_HINT, hidden: breast, quick: 'feed', hint });

// What was in the bottle, as opposed to what the baby took of it. Always optional, and never
// counted as intake. Its hint speaks up (syncBottle) when more was taken than the bottle held.
const bottleField = (v, breast) =>
  numberField('bottle_ml', 'In the bottle, in ml', v.bottle_ml, { min: 0, max: ML_MAX, placeholder: '80', hidden: breast, quick: 'feed', liveHint: true });
const TOPPED_UP = 'Less than the millilitres taken. That is fine if the bottle was topped up.';

// The baby's weight before and after a breast feed, side by side. Starting a feed (withAfter
// false) only has the weight before, which then keeps its full label and the hint.
const weightsRow = (v, breast, withAfter = true) => `
  <div class="field-row" data-group role="group" aria-label="Baby’s weight before and after the feed, in grams" ${breast ? '' : 'hidden'}>
    ${numberField('weight_before_g', withAfter ? 'Weight before (g)' : 'Baby’s weight before, in grams', v.weight_before_g, { min: GRAMS_MIN, max: GRAMS_MAX, placeholder: withAfter ? '3540' : START_WEIGHT_PLACEHOLDER, hidden: !breast, hint: withAfter ? '' : START_WEIGHT_HINT })}
    ${withAfter ? numberField('weight_after_g', 'Weight after (g)', v.weight_after_g, { min: GRAMS_MIN, max: GRAMS_MAX, placeholder: '3585', hidden: !breast }) : ''}
  </div>`;

// What a breast feed counts as: read-only, worked out by estimateView from the rest of the form.
const estimateField = (breast) => `
  <div class="field" data-field="estimate" ${breast ? '' : 'hidden'}>
    <label for="f-estimate">Estimated ml</label>
    <output id="f-estimate" class="input input-big readout" aria-describedby="f-estimate-hint">–</output>
    <div class="field-hint" id="f-estimate-hint"></div>
  </div>`;

// One row per type: the toggle, then its two sizes. The sizes are always there (no jump in the
// layout) and only dimmed while their type is off; tapping one turns the type on (see wire).
const nappyRow = (name, ev, glyph, label, sizeLabel, on, sizes, size) => `
  <div class="nappy-row" data-ev="${ev}">
    <label class="seg-opt nappy-toggle" data-ev="${ev}"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="nappy-glyph">${icon(glyph, 22)}</span><span class="nappy-check">${icon('check', 22)}</span><span>${label}</span></label>
    <div class="seg size-seg${on ? '' : ' is-off'}" data-ev="${ev}" data-size-of="${name}" role="radiogroup" aria-label="${sizeLabel}">
      ${sizes.map(([value, text], i) => `<label class="seg-opt"><input type="radio" name="${name}_size" value="${value}" ${(size === value || (i === 0 && size !== sizes[1][0])) ? 'checked' : ''}>${text}</label>`).join('')}
    </div>
  </div>`;

const nappyFields = (v) => `
  <div class="nappy-rows" role="group" aria-label="What was in the nappy">
    ${nappyRow('wet', 'wet', 'droplet', 'Wet', 'How wet', v.wet, [['light', 'Light'], ['heavy', 'Heavy']], v.wet_size)}
    ${nappyRow('dirty', 'dirty', 'disc', 'Dirty', 'How big', v.dirty, [['small', 'Small'], ['big', 'Big']], v.dirty_size)}
  </div>`;

// ---------- reading and validating ----------

// null when empty, NaN when not a usable number, otherwise a whole number.
function readNumber(form, name) {
  const input = form.elements[name];
  if (!input) return null;
  const raw = input.value.trim();
  if (raw === '') return input.validity && input.validity.badInput ? NaN : null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

// For a minutes field: null when empty, NaN when unusable, otherwise seconds (the original ones when untouched).
function readMinutes(form, name) {
  const input = form.elements[name];
  if (!input) return null;
  const bad = input.validity && input.validity.badInput;
  const raw = input.value.trim();
  if (!bad && raw === input.dataset.initial) return input.dataset.seconds === '' ? null : Number(input.dataset.seconds);
  if (raw === '') return bad ? NaN : null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : NaN;
}

const isShown = (form, field) => {
  const el = form.querySelector(`[data-field="${field}"]`);
  return Boolean(el) && !el.hidden;
};

// Paused and per-side minutes of an ended sleep or feed. Returns { error } or the extra body fields.
function readTimings(type, form, entry, kind, wallSeconds) {
  const extras = {};
  const breast = kind === 'breast';
  let paused = entry.id !== undefined && wallSeconds !== null ? (entry.paused_seconds || 0) : 0;
  if (wallSeconds !== null && isShown(form, 'paused')) {
    paused = readMinutes(form, 'paused_seconds');
    if (Number.isNaN(paused)) return fail(MSG.minutes);
    paused = paused || 0;
    if (paused > wallSeconds) return fail(MSG.pausedLong(TYPES[type].noun));
    extras.paused_seconds = paused;
  }
  if (type !== 'feed') return extras;
  if (wallSeconds !== null && isShown(form, 'sides')) {
    const left  = readMinutes(form, 'left_seconds');
    const right = readMinutes(form, 'right_seconds');
    if (Number.isNaN(left) || Number.isNaN(right)) return fail(MSG.minutes);
    if (Math.max(left || 0, right || 0) > SIDE_MAX) return fail(MSG.sidesLong);
    if ((left || 0) + (right || 0) > wallSeconds - paused + SLACK) return fail(MSG.sidesLong);
    extras.left_seconds  = left;
    extras.right_seconds = right;
  } else if (entry.id !== undefined && entry.ended_at) {
    // An ended feed's side times are replaced by the PUT like any other field: pass them back.
    extras.left_seconds  = breast ? entry.left_seconds ?? null : null;
    extras.right_seconds = breast ? entry.right_seconds ?? null : null;
  }
  return extras;
}

const known   = (v) => v !== null && v !== undefined;
const outside = (n, min, max) => n !== null && (Number.isNaN(n) || n < min || n > max);

// ---------- times without a date ----------
//
// The forms ask for a time of day only. The date is implied:
//   - a start ("Started", "When") carries its date in data-date: the day being viewed for a new
//     entry, the entry's own date when editing. Typing a time keeps that date; the -5/+5 chips move
//     it when they cross midnight; "Now" sets today's date as well as the time.
//   - an end has no date of its own: it is the first time that time of day comes round at or after
//     the start, so an end earlier than the start means the next day.
// A hint beside the label says so whenever the date is not the obvious one (syncTimes).

const parseYmd = (text) => { const [y, m, d] = text.split('-').map(Number); return new Date(y, m - 1, d); };
const clock    = (d) => toInput(d).slice(11);   // "HH:MM", local

// The date of a time-only field as "YYYY-MM-DD".
function fieldDate(form, name) {
  const input = form.elements[name];
  const start = form.elements.started_at;
  if (name !== 'ended_at' || !start || start.type !== 'time' || !start.value || !start.dataset.date) return input.dataset.date;
  return input.value >= start.value ? start.dataset.date : ymd(addDays(parseYmd(start.dataset.date), 1));
}

// A time of day can only say when an entry ended if that is under a day after it started.
function needsFullDates(entry) {
  if (!entry.started_at || !entry.ended_at) return false;
  const [startDate, startTime] = toInput(entry.started_at).split('T');
  const [endDate, endTime]     = toInput(entry.ended_at).split('T');
  return endDate !== (endTime >= startTime ? startDate : ymd(addDays(parseYmd(startDate), 1)));
}

// Swap the time-only inputs of a form for full date-and-time ones, keeping what they hold.
function showFullDates(form) {
  const inputs = [...form.querySelectorAll('input[type="time"]')];
  const dates  = inputs.map((input) => fieldDate(form, input.name));
  inputs.forEach((input, i) => {
    const { value, dataset } = input;
    input.type      = 'datetime-local';
    input.value     = value ? `${dates[i]}T${value}` : '';
    dataset.initial = dataset.initial ? `${dataset.initialDate}T${dataset.initial}` : '';
  });
}

// The hints beside the time labels: "+1 day" on an end that falls on the day after the start, and
// the day itself on a start that is not on the day being viewed (form.dataset.day).
function syncTimes(form) {
  const today = ymd(new Date());
  form.querySelectorAll('[data-day-hint]').forEach((hint) => {
    const name  = hint.dataset.dayHint;
    const input = form.elements[name];
    let text = '';
    if (input.type === 'time' && input.value) {
      const date = fieldDate(form, name);
      if (name === 'ended_at') text = form.elements.started_at && date !== form.elements.started_at.dataset.date ? '+1 day' : '';
      else if (date && date !== form.dataset.day) text = date === today ? 'Today' : fmtShortDay(parseYmd(date));
    }
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = !text;
  });
}

// An untouched time keeps its exact stored value (the inputs only have minute precision).
function readTime(form, name) {
  const input = form.elements[name];
  if (!input || !input.value) return null;
  try {
    if (input.type !== 'time') {
      return input.dataset.iso && input.value === input.dataset.initial ? input.dataset.iso : fromInput(input.value);
    }
    const date      = fieldDate(form, name);
    const untouched = input.value === input.dataset.initial && date === input.dataset.initialDate;
    return input.dataset.iso && untouched ? input.dataset.iso : fromInput(`${date}T${input.value}`);
  } catch (e) {
    return null;
  }
}

const fail = (error) => ({ error });

function readFeedDetails(form, kind) {
  if (kind === 'bottle') {
    const ml = readNumber(form, 'amount_ml');
    if (outside(ml, 0, ML_MAX)) return fail(MSG.ml);
    const inBottle = readNumber(form, 'bottle_ml');
    if (outside(inBottle, 0, ML_MAX)) return fail(MSG.bottleMl);
    return { amount_ml: ml, bottle_ml: inBottle, weight_before_g: null, weight_after_g: null };
  }
  const before = readNumber(form, 'weight_before_g');
  const after  = readNumber(form, 'weight_after_g');
  if (outside(before, GRAMS_MIN, GRAMS_MAX) || outside(after, GRAMS_MIN, GRAMS_MAX)) return fail(MSG.feedGrams);
  if (before !== null && after !== null && after < before) return fail(MSG.afterLower);
  return { amount_ml: null, bottle_ml: null, weight_before_g: before, weight_after_g: after };
}

// Returns { error } or the request body for this entry.
function readEntry(type, form, entry, stopMode) {
  const now   = Date.now();
  const notes = form.elements.notes ? form.elements.notes.value.trim() : (entry.notes || '');
  const noun  = TYPES[type].noun;

  if (stopMode && type === 'express') {
    const ml = readNumber(form, 'amount_ml');
    if (ml === null || outside(ml, EXPRESS_MIN, ML_MAX)) return fail(MSG.expressMl);
    // The recorded start and end are passed back untouched; the pause stays as the server has it.
    return { started_at: entry.started_at, ended_at: entry.ended_at, amount_ml: ml, notes };
  }

  if (stopMode) {
    const details = readFeedDetails(form, entry.kind);
    if (details.error) return details;
    // The recorded start, end and side times are passed back untouched.
    const sides = entry.kind === 'breast'
      ? { left_seconds: entry.left_seconds ?? null, right_seconds: entry.right_seconds ?? null }
      : {};
    return { kind: entry.kind, started_at: entry.started_at, ended_at: entry.ended_at, ...details, ...sides, notes };
  }

  if (TIMED.includes(type)) {
    const kind    = type === 'feed' ? form.elements.kind.value : null;
    const details = type === 'feed' ? readFeedDetails(form, kind) : {};
    // Same order as the design: the weight check comes before the time checks.
    if (details.error === MSG.afterLower) return details;
    const started = readTime(form, 'started_at');
    const ended   = readTime(form, 'ended_at');
    if (!started) return fail(MSG.noStart);
    const st = Date.parse(started);
    const en = ended ? Date.parse(ended) : null;
    if (st > now + MINUTE) return fail(MSG.futureStart);
    if (en !== null && en < st) return fail(MSG.endFirst);
    if (en !== null && en > now + MINUTE) return fail(MSG.futureEnd(noun));
    if (details.error) return details;
    const timings = readTimings(type, form, entry, kind, en === null ? null : (en - st) / 1000);
    if (timings.error) return timings;
    const body = { started_at: started, ended_at: ended, notes, ...timings };
    if (type === 'express') {
      // The amount belongs to a finished session: none while it runs, required once it has an end.
      const ml = readNumber(form, 'amount_ml');
      if (en === null && entry.id === undefined) return fail(MSG.noEnd);
      if (en === null) return ml === null ? body : fail(MSG.expressOpen);
      if (ml === null || outside(ml, EXPRESS_MIN, ML_MAX)) return fail(MSG.expressMl);
      return { ...body, amount_ml: ml };
    }
    return type === 'feed' ? { kind, ...body, ...details } : body;
  }

  const logged = readTime(form, 'logged_at');
  if (!logged) return fail(MSG.noTime);
  if (Date.parse(logged) > now + MINUTE) return fail(MSG.futureTime);
  if (type === 'nappy') {
    const wet   = form.elements.wet.checked;
    const dirty = form.elements.dirty.checked;
    if (!wet && !dirty) return fail(MSG.nappy);
    return {
      logged_at:  logged,
      wet,
      dirty,
      wet_size:   wet ? form.elements.wet_size.value : null,
      dirty_size: dirty ? form.elements.dirty_size.value : null,
      notes,
    };
  }
  const grams = readNumber(form, 'grams');
  if (grams === null || outside(grams, GRAMS_MIN, GRAMS_MAX)) return fail(MSG.grams);
  return { logged_at: logged, grams, notes };
}

// ---------- behaviour shared by the forms ----------

export function showError(scope, message) {
  const box = scope.querySelector('.sheet-alert');
  box.querySelector('span').textContent = message;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
}

export function clearError(scope) {
  const box = scope.querySelector('.sheet-alert');
  if (box) box.hidden = true;
}

function describeFailure(error, type, offlineMessage = MSG.offline) {
  if (error.network) {
    toast(error.message, true);
    return offlineMessage;
  }
  if (type && /already in progress/i.test(error.message)) return MSG.running(TYPES[type].noun);
  return error.message || 'Something went wrong. Try again.';
}

// Runs one request with the given buttons disabled. Returns the result, or undefined after showing the error.
export async function attempt(scope, buttons, action, type, offlineMessage) {
  const mine = generation;
  clearError(scope);
  buttons.forEach((b) => { b.disabled = true; });
  scope.setAttribute('aria-busy', 'true');
  try {
    const result = await action();
    return { result, current: mine === generation };
  } catch (error) {
    const message = describeFailure(error, type, offlineMessage);
    if (mine === generation) showError(scope, message);
    return undefined;
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
    scope.removeAttribute('aria-busy');
  }
}

function finish(outcome, onDone, message) {
  rateCache.clear();   // whatever was saved or deleted may have changed the weighed feeds
  if (outcome.current) closeSheet();
  if (onDone) onDone(message);
}

function setHidden(form, field, hidden) {
  const el = form.querySelector(`[data-field="${field}"]`);
  if (el) el.hidden = hidden;
}

// A group (the Optional section, a row of fields) hides once none of its fields is showing, so no
// heading or empty row is left behind. Inner groups first: an outer one counts them.
function syncGroups(form) {
  const showing = (field, group) => {
    for (let el = field; el !== group; el = el.parentElement) if (el.hidden) return false;
    return true;
  };
  [...form.querySelectorAll('[data-group]')].reverse().forEach((group) => {
    group.hidden = ![...group.querySelectorAll('.field')].some((field) => showing(field, group));
  });
}

// ---------- the estimated ml of a breast feed ----------

// What the server estimates an unweighed breast feed from depends on when the feed starts (only
// feeds weighed before then count), so it is asked for per start time and kept for the session of
// the page. A weighed feed logged later only adds entries: the keys of earlier moments stay right
// unless an old feed is edited, and the cache is dropped whenever a sheet saves (see finish) or
// the Settings page does.
const rateCache = new Map();

// Saving on the Settings page changes what every start time is estimated from.
export const clearRateCache = () => rateCache.clear();

// Active seconds of the feed as the form now has it, the way the server will count them
// (whole seconds of wall time, less the pause). null when there is no usable start and end yet.
function formSeconds(form, entry, stopMode) {
  if (stopMode) return typeof entry.duration_seconds === 'number' ? entry.duration_seconds : null;
  const started = readTime(form, 'started_at');
  const ended   = readTime(form, 'ended_at');
  if (!started || !ended) return null;
  const untouched = entry.id !== undefined && started === entry.started_at && ended === entry.ended_at;
  // Untouched times: the server's own count, which saw the stored microseconds.
  const wall = untouched && entry.duration_seconds > 0
    ? entry.duration_seconds + (entry.paused_seconds || 0)
    : Math.floor((Date.parse(ended) - Date.parse(started)) / 1000);
  if (!(wall >= 0)) return null;
  let paused = entry.id !== undefined ? Math.min(entry.paused_seconds || 0, wall) : 0;
  if (isShown(form, 'paused')) {
    paused = readMinutes(form, 'paused_seconds') || 0;   // NaN counts as none; saving reports it
    if (paused > wall) return null;
  }
  return wall - paused;
}

// { label, value, hint } for the read-only field. `rate` is the /api/breast-rate answer for the
// start time, undefined while it loads, null when it could not be fetched.
function estimateView(form, entry, stopMode, rate) {
  const before = readNumber(form, 'weight_before_g');
  const after  = readNumber(form, 'weight_after_g');
  if (Number.isFinite(before) && Number.isFinite(after)) {
    return after < before
      ? { label: 'Weighed ml', value: '–', hint: 'Weight after is lower than weight before.' }
      : { label: 'Weighed ml', value: String(after - before), hint: 'Measured from the two weights (1 g = 1 ml), not estimated.' };
  }
  const label   = 'Estimated ml';
  const seconds = formSeconds(form, entry, stopMode);
  if (seconds === null) {
    const going = form.elements.ended_at && form.elements.ended_at.value === '';
    return { label, value: '–', hint: going ? 'Worked out from the length once the feed has ended.' : 'Check the times and the paused minutes.' };
  }
  if (!rate) {
    // No answer (yet): a saved feed that is unchanged still has the server's own figure.
    const same = entry.kind === 'breast' && typeof entry.intake_ml === 'number' && entry.duration_seconds === seconds
      && (stopMode || readTime(form, 'started_at') === entry.started_at);
    if (same && ratedSource(entry.intake_source)) return { label, value: String(entry.intake_ml), hint: `${rateText(entry)}.` };
    if (same && entry.intake_source === 'default') return { label, value: String(entry.intake_ml), hint: 'A standard estimate.' };
    return { label, value: rate === null ? '–' : '…', hint: rate === null ? 'Worked out when the feed is saved.' : '' };
  }
  if (rate.ml_per_min === null) {
    return { label, value: String(rate.default_ml), hint: 'A standard estimate, until enough feeds have been weighed before and after.' };
  }
  if (seconds === 0) return { label, value: String(rate.default_ml), hint: 'A standard estimate: the feed has no length to go on.' };
  // The same shape a rate feed from the API has, so the stopwatch's helpers do the sum and the wording.
  const rated = {
    intake_source:           rate.feeds === null ? 'manual_rate' : 'rate',   // no feeds behind it: set in Settings
    intake_rate_ml_per_min:  rate.ml_per_min,
    intake_rate_feeds:       rate.feeds,
    intake_rate_max_seconds: rate.max_seconds,
    duration_seconds:        seconds,
  };
  return { label, value: String(ratedEstimateMl(rated, seconds, rate.min_ml)), hint: `${rateText(rated)}.` };
}

// Fill the read-only field, fetching the rate for the form's start time when it is not known yet.
function showEstimate(form, entry, estimate) {
  const started = estimate.stopMode ? entry.started_at : readTime(form, 'started_at');
  const key     = started ? `${started}|${entry.id ?? ''}` : '';
  if (key && !rateCache.has(key)) {
    rateCache.set(key, undefined);
    api.breastRate(started, entry.id).then(
      (rate) => { rateCache.set(key, rate); },
      () => { rateCache.set(key, null); },
    ).then(() => {
      if (form.isConnected) sync(form, estimate.fixedKind, entry, estimate);
      // A failed lookup is retried the next time it is needed.
      if (rateCache.get(key) === null) rateCache.delete(key);
    });
  }
  const view  = estimateView(form, entry, estimate.stopMode, key ? rateCache.get(key) : null);
  const field = form.querySelector('[data-field="estimate"]');
  const parts = [['label', view.label], ['output', view.value], ['.field-hint', view.hint]];
  parts.forEach(([selector, text]) => {
    const el = field.querySelector(selector);
    if (el.textContent !== text) el.textContent = text;
  });
}

// The two amounts of a bottle feed. More taken than the bottle held gets a soft note (a top-up is
// real, so it is never an error). On a form that asks for both afresh (data-suggest: logging a
// finished feed, or one just stopped), what was in the bottle shows as the placeholder of an empty
// "taken": a suggestion to type, never a value that is saved.
function syncBottle(form) {
  const input = form.elements.bottle_ml;
  if (!input) return;
  const taken    = readNumber(form, 'amount_ml');
  const inBottle = readNumber(form, 'bottle_ml');
  const hint     = form.querySelector('#f-bottle_ml-hint');
  const text     = Number.isFinite(taken) && Number.isFinite(inBottle) && taken > inBottle ? TOPPED_UP : '';
  if (hint.textContent !== text) hint.textContent = text;
  hint.hidden = !text;
  if (!form.dataset.suggest || !form.elements.amount_ml) return;
  const suggestion = Number.isFinite(inBottle) && inBottle > 0 && inBottle <= ML_MAX ? String(inBottle) : AMOUNT_HINT;
  if (form.elements.amount_ml.placeholder !== suggestion) form.elements.amount_ml.placeholder = suggestion;
}

// Show the fields for the chosen feed kind / nappy contents and refresh the live hints.
function sync(form, fixedKind, entry = {}, estimate = null) {
  const els = form.elements;
  if (els.kind || fixedKind) {
    const breast = (fixedKind || els.kind.value) === 'breast';
    const ended  = !els.ended_at || els.ended_at.value !== '';
    setHidden(form, 'side', !breast);
    setHidden(form, 'sides', !breast || !ended);
    setHidden(form, 'amount_ml', breast);
    setHidden(form, 'bottle_ml', breast);
    setHidden(form, 'weight_before_g', !breast);
    setHidden(form, 'weight_after_g', !breast);
    setHidden(form, 'estimate', !breast);
  }
  if (els.ended_at) {
    setHidden(form, 'paused', els.ended_at.value === '');
    setHidden(form, 'paused_hint', els.ended_at.value === '');
  }
  form.querySelectorAll('[data-size-of]').forEach((seg) => seg.classList.toggle('is-off', !els[seg.dataset.sizeOf].checked));
  syncTimes(form);
  syncBottle(form);
  const hint = form.querySelector('#f-grams-hint');
  if (hint) {
    const grams = readNumber(form, 'grams');
    const text  = Number.isFinite(grams) && grams > 0 ? `Shown as ${fmtKg(grams)}` : 'Entered in grams, shown in kg.';
    if (hint.textContent !== text) hint.textContent = text;
  }
  syncGroups(form);
  if (estimate && isShown(form, 'estimate')) showEstimate(form, entry, estimate);
}

function nudge(form, button) {
  const input = form.elements[button.dataset.nudge];
  const delta = button.dataset.delta;
  if (delta === 'clear') {
    input.value = '';
    return;
  }
  const timeOnly = input.type === 'time';
  const current  = !input.value ? NaN : new Date(timeOnly ? `${fieldDate(form, input.name)}T${input.value}` : input.value).getTime();
  const base     = Number.isFinite(current) ? current : Date.now();
  const target   = new Date(delta === 'now' ? Date.now() : base + Number(delta) * MINUTE);
  if (!timeOnly) {
    input.value = toInput(target);
    return;
  }
  // A start takes the date along (a chip may cross midnight, "Now" is today). An end only takes
  // the time: its date follows from the start.
  input.value        = clock(target);
  input.dataset.date = ymd(target);
  // "Now" on an end that is a day or more after the start: a time of day cannot say that.
  if (delta === 'now' && fieldDate(form, input.name) !== ymd(target)) {
    showFullDates(form);
    input.value = toInput(target);
  }
}

// A millilitre shortcut: set a common amount, or step by ten. Empty counts as 0; stepping down to 0
// (or from empty) leaves the field empty, which is how every amount field says "no amount".
function mlQuick(button) {
  const input = button.form && button.form.elements[button.dataset.ml];
  if (!input) return;
  const current = Number(input.value);
  const base    = Number.isFinite(current) ? Math.round(current) : 0;
  const next    = 'mlSet' in button.dataset
    ? Number(button.dataset.mlSet)
    : Math.min(ML_MAX, Math.max(0, base + Number(button.dataset.mlStep)));
  input.value = next > 0 ? String(next) : '';
  // The form listens for these to clear the error and refresh its hints.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function wire(form, fixedKind, entry, stopMode = false) {
  // Only forms with the read-only estimate field (a finished or editable feed) work one out.
  const estimate = form.querySelector('[data-field="estimate"]') ? { fixedKind, stopMode } : null;
  sync(form, fixedKind, entry, estimate);
  const changed = () => {
    clearError(form);
    sync(form, fixedKind, entry, estimate);
  };
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  form.addEventListener('click', (event) => {
    // Picking a size says the nappy was that type: tapping a dimmed size turns its type on.
    const size = event.target.closest('[data-size-of] input');
    if (size) {
      form.elements[size.closest('[data-size-of]').dataset.sizeOf].checked = true;
      return changed();
    }
    const button = event.target.closest('[data-nudge]');
    if (!button) return undefined;
    nudge(form, button);
    return changed();
  });
}

// ---------- the sheets ----------

// Create (entry.id === undefined), edit, or (mode 'stopFeed' / 'stopExpress') add details to a
// feed or express session that was just stopped. `day` (a Date) is the day being viewed: a time
// whose date is another day gets a hint. Without it the entry's own day counts as the viewed one.
export function openEntry(type, entry, opts = {}) {
  const { mode, onDone, day } = opts;
  const { table, noun }  = TYPES[type];
  const stopMode = mode === 'stopFeed' || mode === 'stopExpress';
  const isNew    = !stopMode && entry.id === undefined;
  const breast   = entry.kind === 'breast';
  const title    = stopMode ? (type === 'express' ? 'Expressing stopped' : 'Feed stopped') : isNew ? NEW_TITLE[type] : `Edit ${noun}`;
  const primary  = stopMode || !isNew ? 'Save' : NEW_PRIMARY[type];
  const stillGoing = ' <span class="opt">(leave empty if still going)</span>';
  const full     = needsFullDates(entry);
  const expressMl = (v) => numberField('amount_ml', 'Millilitres expressed', v.amount_ml, { min: EXPRESS_MIN, max: ML_MAX, placeholder: '60', quick: 'express' });

  let fields = '';
  if (stopMode && type === 'express') {
    const length = fmtDuration(elapsedSeconds(entry, Date.now()));
    const paused = entry.paused_seconds > 0 ? ` Paused ${fmtDuration(entry.paused_seconds)}.` : '';
    fields = `
      <p class="sheet-intro">${esc(`Ended at ${fmtTime(entry.ended_at)} after ${length}.${paused} Add the amount now, or skip and fill it in later.`)}</p>
      ${expressMl(entry)}
      ${optionalSection(notesField(type, entry.notes))}`;
  } else if (stopMode) {
    const length = fmtDuration(elapsedSeconds(entry, Date.now()));
    const sides  = breast ? sidesText(entry) : '';
    const paused = entry.paused_seconds > 0 ? ` Paused ${fmtDuration(entry.paused_seconds)}.` : '';
    // The usual case is a finished bottle: "taken" starts at what was in it, and says so.
    const filled = !breast && !known(entry.amount_ml) && entry.bottle_ml > 0;
    const taken  = filled ? { ...entry, amount_ml: entry.bottle_ml } : entry;
    fields = `
      <p class="sheet-intro">${esc(`Ended at ${fmtTime(entry.ended_at)} after ${length}.${sides ? ` ${sides}.` : ''}${paused} Add the details now, or skip and fill them in later.`)}</p>
      ${estimateField(breast)}
      ${amountField(taken, breast, filled ? `Starts at the ${esc(entry.bottle_ml)} ml that was in the bottle. Lower it if some was left.` : '')}
      ${optionalSection(`
        ${bottleField(entry, breast)}
        ${weightsRow(entry, breast)}`)}`;
  } else if (type === 'sleep' || type === 'feed') {
    const feed = type === 'feed';
    fields = `
      ${feed ? kindSeg(entry.kind) : ''}
      ${timeField('started_at', 'Started', entry.started_at, { full })}
      ${timeField('ended_at', 'Ended', entry.ended_at, { labelExtra: stillGoing, canClear: true, full })}
      ${feed ? estimateField(breast) : ''}
      ${feed ? amountField(entry, breast) : ''}
      ${optionalSection(`
        ${feed ? bottleField(entry, breast) : ''}
        ${timingRow(entry, noun, { sides: feed && Boolean(isNew || entry.ended_at), paused: Boolean(!isNew && entry.ended_at) })}
        ${feed ? weightsRow(entry, breast) : ''}
        ${notesField(type, entry.notes)}`)}`;
  } else if (type === 'nappy') {
    fields = `
      ${nappyFields(entry)}
      ${timeField('logged_at', 'When', entry.logged_at)}
      ${optionalSection(notesField(type, entry.notes))}`;
  } else if (type === 'express') {
    // Logging a finished session needs its end; a saved one may be left (or put back) running.
    const end = isNew ? {} : { labelExtra: stillGoing, canClear: true };
    fields = `
      ${expressMl(entry)}
      ${timeField('started_at', 'Started', entry.started_at, { full })}
      ${timeField('ended_at', 'Ended', entry.ended_at, { ...end, full })}
      ${optionalSection(`
        ${timingRow(entry, 'session', { paused: Boolean(!isNew && entry.ended_at) })}
        ${notesField(type, entry.notes)}`)}`;
  } else {
    fields = `
      ${numberField('grams', 'Weight in grams', entry.grams, { min: GRAMS_MIN, max: GRAMS_MAX, placeholder: '3545', hint: 'Entered in grams, shown in kg.' })}
      ${timeField('logged_at', 'When', entry.logged_at)}
      ${optionalSection(notesField(type, entry.notes))}`;
  }

  const canDelete = !stopMode && !isNew;
  const dialog = render(title, `
    <form class="sheet-form" novalidate>
      ${fields}
      ${alertBox()}
      <button type="submit" class="btn btn-primary sheet-primary">${primary}</button>
      ${stopMode ? '<button type="button" class="btn btn-secondary sheet-skip" data-close>Skip for now</button>' : ''}
      ${canDelete ? `<button type="button" class="btn btn-danger-text sheet-delete" data-ask-delete>${icon('trash', 18)}Delete ${esc(noun)}</button>` : ''}
    </form>
    ${canDelete ? `
    <div class="sheet-confirm" hidden>
      <p class="sheet-confirm-text">It can’t be undone.</p>
      ${alertBox()}
      <div class="sheet-confirm-actions">
        <button type="button" class="btn sheet-keep" data-keep>Keep it</button>
        <button type="button" class="btn btn-danger" data-delete>Delete ${esc(noun)}</button>
      </div>
    </div>` : ''}`, type);

  const form    = dialog.querySelector('form');
  const heading = dialog.querySelector('.sheet-title-text');
  const first   = entry.started_at || entry.logged_at;
  form.dataset.day = ymd(day || (first ? new Date(first) : new Date()));
  if (type === 'feed' && (isNew || stopMode)) form.dataset.suggest = 'true';
  wire(form, stopMode && type === 'feed' ? entry.kind : null, entry, stopMode);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type=submit]');
    if (submitButton.disabled) return;
    const body = readEntry(type, form, entry, stopMode);
    if (body.error) return showError(form, body.error);
    const outcome = await attempt(
      form, [submitButton],
      () => (isNew ? api.create(table, body) : api.update(table, entry.id, body)),
      type,
    );
    if (!outcome) return;
    const message = stopMode && type === 'express' ? `Expressed ${body.amount_ml} ml`
      : stopMode ? 'Feed details saved'
      : !isNew ? 'Changes saved'
      : type === 'nappy' ? 'Nappy logged'
      : type === 'weight' ? `Weighed ${fmtKg(body.grams)}`
      : type === 'express' ? `Expressed ${body.amount_ml} ml`
      : `${TYPES[type].label} added`;
    finish(outcome, onDone, message);
  });

  if (!canDelete) return;
  const confirm = dialog.querySelector('.sheet-confirm');
  const showConfirm = (on) => {
    // The form stays in the DOM (only hidden), so whatever was typed is still there after "Keep it".
    form.hidden    = on;
    confirm.hidden = !on;
    clearError(confirm);
    heading.textContent = on ? `Delete this ${noun}?` : title;
    sheet.scrollTop = 0;
    (on ? confirm.querySelector('[data-keep]') : form.querySelector('[data-ask-delete]')).focus();
  };
  form.querySelector('[data-ask-delete]').addEventListener('click', () => showConfirm(true));
  confirm.querySelector('[data-keep]').addEventListener('click', () => showConfirm(false));
  confirm.querySelector('[data-delete]').addEventListener('click', async () => {
    const buttons = [...confirm.querySelectorAll('button')];
    const outcome = await attempt(confirm, buttons, () => api.remove(table, entry.id), null, MSG.offlineDel);
    if (!outcome) return;
    finish(outcome, onDone, `${noun[0].toUpperCase()}${noun.slice(1)} deleted`);
  });
}

// Starting a feed: bottle or breast, and for breast which side first and optionally the weight before.
export function openStartFeed(lastKind, { onDone, onLogPast, defaultSide } = {}) {
  const breast = lastKind === 'breast';
  const dialog = render('Start a feed', `
    <form class="sheet-form" novalidate>
      ${kindSeg(breast ? 'breast' : 'bottle')}
      ${sideSeg(defaultSide, !breast)}
      ${optionalSection(`
        ${bottleField({}, breast)}
        ${weightsRow({}, breast, false)}`)}
      ${alertBox()}
      <button type="submit" class="btn btn-primary sheet-primary">Start feed</button>
      <button type="button" class="btn btn-ghost sheet-escape" data-past>Log a finished feed instead</button>
    </form>`, 'feed');
  const form = dialog.querySelector('form');
  wire(form);
  form.querySelector('[data-past]').addEventListener('click', () => { if (onLogPast) onLogPast(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type=submit]');
    if (submitButton.disabled) return;
    const kind = form.elements.kind.value;
    const body = { kind };
    if (kind === 'breast') {
      body.side = form.elements.side.value === 'right' ? 'right' : 'left';
      const before = readNumber(form, 'weight_before_g');
      if (outside(before, GRAMS_MIN, GRAMS_MAX)) return showError(form, MSG.grams.replace('3545', '3540'));
      if (before !== null) body.weight_before_g = before;
    } else {
      const inBottle = readNumber(form, 'bottle_ml');
      if (outside(inBottle, 0, ML_MAX)) return showError(form, MSG.bottleMl);
      if (inBottle !== null) body.bottle_ml = inBottle;
    }
    const outcome = await attempt(form, [submitButton], () => api.create('feeds', body), 'feed');
    if (!outcome) return;
    const started = (outcome.result && outcome.result.started_at) || new Date();
    const what = kind === 'breast' ? `Breast feed started at ${fmtTime(started)}, ${body.side} side`
      : `Bottle feed started at ${fmtTime(started)}${body.bottle_ml ? `, ${body.bottle_ml} ml in the bottle` : ''}`;
    finish(outcome, onDone, what);
  });
}

// Starting an express session: a timer like a feed's. The amount is asked for when it stops.
export function openStartExpress({ onDone, onLogPast } = {}) {
  const dialog = render('Start expressing', `
    <form class="sheet-form" novalidate>
      <p class="sheet-intro">Starts a timer now. The millilitres are asked for when you stop.</p>
      ${alertBox()}
      <button type="submit" class="btn btn-primary sheet-primary">Start expressing</button>
      <button type="button" class="btn btn-ghost sheet-escape" data-past>Log a finished session instead</button>
    </form>`, 'express');
  const form = dialog.querySelector('form');
  form.querySelector('[data-past]').addEventListener('click', () => { if (onLogPast) onLogPast(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type=submit]');
    if (submitButton.disabled) return;
    const outcome = await attempt(form, [submitButton], () => api.create('expresses', {}), 'express');
    if (!outcome) return;
    const started = (outcome.result && outcome.result.started_at) || new Date();
    finish(outcome, onDone, `Expressing started at ${fmtTime(started)}`);
  });
}

// Choosing which kind of entry to add retrospectively.
export function openTypePicker(onPick) {
  const dialog = render('Add an entry', `
    <div class="sheet-picker">
      ${PICKER.map(([type, glyph, ev]) => `
        <button type="button" class="quick-btn" data-ev="${ev}" data-pick="${type}">
          <span class="quick-ico chip chip-40">${icon(glyph, 24)}</span><span>${esc(TYPES[type].label)}</span>
        </button>`).join('')}
    </div>`);
  dialog.querySelector('.sheet-picker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-pick]');
    if (button) onPick(button.dataset.pick);
  });
}

// A read-only list of entries (the Over-time day popup). `rowsHTML` is the caller's <li> rows built with
// logRow(..., { attr: 'data-pick' }); picking one calls onPick('type:id').
export function openList({ title, subtitle = '', rowsHTML = '', emptyText = 'Nothing logged.', onPick } = {}) {
  const dialog = render(title, `
    <div class="sheet-listing">
      ${subtitle ? `<p class="sheet-intro">${esc(subtitle)}</p>` : ''}
      ${rowsHTML
        ? `<ul class="log-list sheet-list" aria-labelledby="sheet-title">${rowsHTML}</ul>`
        : `<p class="sheet-empty">${esc(emptyText)}</p>`}
      <button type="button" class="btn btn-secondary sheet-skip" data-close>Close</button>
    </div>`);
  const list = dialog.querySelector('.sheet-list');
  if (!list) return;
  list.addEventListener('click', (event) => {
    const row = event.target.closest('[data-pick]');
    if (row && onPick) onPick(row.dataset.pick);
  });
}
