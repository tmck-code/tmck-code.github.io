// Toasts: a brief success pill, or an error card that stays longer.
//
// #toast is a manual popover where supported, so it sits in the top layer and can be raised above
// an open <dialog>. Without popover support it falls back to a fixed element with a .show class.

import { esc, icon } from './util.js';

const SUCCESS_MS = 3500;
const ERROR_MS   = 6000;

let timer = null;

function hide(el) {
  el.classList.remove('show');
  if (el.hidePopover && el.matches(':popover-open')) el.hidePopover();
}

function show(el) {
  el.classList.add('show');
  if (!el.showPopover) return;
  try {
    // Re-showing moves it to the top of the top layer, above a sheet opened in the meantime.
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  } catch (e) { /* not a popover in this browser: the .show class alone displays it */ }
}

// `action` ({ label, run }): a success toast with one button in it, such as Undo. It stays as long
// as an error does, and pressing the button dismisses it.
export function toast(message, isError = false, title = 'Not saved', action = null) {
  const el = document.getElementById('toast');
  if (!el || !message) return;
  const acts = Boolean(action) && !isError;
  clearTimeout(timer);
  el.classList.toggle('error', isError);
  el.classList.toggle('has-action', acts);
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.innerHTML = isError
    ? `${icon('alert', 26)}<div><div class="toast-title">${esc(title)}</div><div class="toast-msg">${esc(message)}</div></div>`
    : acts ? `<span>${esc(message)}</span><button type="button" class="toast-action">${esc(action.label)}</button>`
    : esc(message);
  if (acts) el.querySelector('.toast-action').addEventListener('click', () => { clearTimeout(timer); hide(el); action.run(); });
  show(el);
  timer = setTimeout(() => hide(el), isError || acts ? ERROR_MS : SUCCESS_MS);
}

// A sheet opened after a toast would cover it (later top-layer entries sit above earlier ones),
// so lift a visible toast back to the top whenever the sheet opens.
const sheet = document.getElementById('sheet');
if (sheet && typeof MutationObserver === 'function') {
  new MutationObserver(() => {
    const el = document.getElementById('toast');
    if (sheet.open && el && el.classList.contains('show')) show(el);
  }).observe(sheet, { attributes: true, attributeFilter: ['open'] });
}
