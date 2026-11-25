// Thin fetch wrapper around the JSON API.

async function request(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`api/${path}`, options);
  } catch (e) {
    const error = new Error('Can’t reach Baby log on the home wifi. Check the connection and try again.');
    error.network = true;   // the server was unreachable, as opposed to it rejecting the request
    throw error;
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const error = new Error(describe(data) || `Request failed (${response.status})`);
  error.status = response.status;   // e.g. 409 when another phone got there first
  throw error;
}

function describe(data) {
  const detail = data && data.detail;
  if (typeof detail === 'string') return detail[0].toUpperCase() + detail.slice(1);
  if (Array.isArray(detail) && detail.length) return detail.map((d) => d.msg.replace(/^Value error, /, '')).join('; ');
  return '';
}

const query = (params) => new URLSearchParams(params).toString();

export const api = {
  status:  ()               => request('GET', 'status'),
  events:  (start, end)     => request('GET', `events?${query({ start: start.toISOString(), end: end.toISOString() })}`),
  summary: (start, end)     => request('GET', `summary?${query({ start: start.toISOString(), end: end.toISOString() })}`),
  daily:   (params)         => request('GET', `daily?${query(params)}`),
  // The rate an unweighed breast feed starting at `at` (ISO) is estimated from; excludeId: the feed being edited.
  breastRate: (at, excludeId) => request('GET', `breast-rate?${query(excludeId === undefined ? { at } : { at, exclude_id: excludeId })}`),
  // Settings page: what unweighed breast feeds are estimated from, with the breakdown behind it.
  // Saving takes { default_ml, manual_rate_ml_per_min, scope: 'all' | 'future' } (null: no override).
  breastEstimate:      ()     => request('GET', 'settings/breast-estimate'),
  saveBreastEstimate:  (body) => request('PUT', 'settings/breast-estimate', body),
  resetBreastEstimate: ()     => request('DELETE', 'settings/breast-estimate'),
  create:  (table, body)    => request('POST', table, body),
  update:  (table, id, body) => request('PUT', `${table}/${id}`, body),
  stop:    (table, id, body) => request('POST', `${table}/${id}/stop`, body || {}),
  remove:  (table, id)      => request('DELETE', `${table}/${id}`),
  // Stopwatch state lives on the server. table is 'sleeps' or 'feeds'; each returns the updated entry.
  pause:   (table, id)      => request('POST', `${table}/${id}/pause`, {}),
  resume:  (table, id)      => request('POST', `${table}/${id}/resume`, {}),
  side:    (id, side)       => request('POST', `feeds/${id}/side`, { side }),
  // Reminders (reminders.js). The list comes with each one's state and next due time worked out.
  reminders:        ()         => request('GET', 'reminders'),
  saveReminder:     (id, body) => (id === undefined ? request('POST', 'reminders', body) : request('PUT', `reminders/${id}`, body)),
  removeReminder:   (id)       => request('DELETE', `reminders/${id}`),
  pauseReminder:    (id, on)   => request('POST', `reminders/${id}/${on ? 'pause' : 'resume'}`, {}),
  completeReminder: (id)       => request('POST', `reminders/${id}/complete`, {}),
  undoReminder:     (id, tick) => request('DELETE', `reminders/${id}/completions/${tick}`),
  reminderHistory:  (id)       => request('GET', `reminders/${id}/completions?limit=10`),
};
