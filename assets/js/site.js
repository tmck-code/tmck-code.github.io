/* tmck-code.github.io — site behaviour.
 *
 * Plain browser JS, no build step, no dependencies. Loaded site-wide with
 * <script defer src="/assets/js/site.js"></script>, so every feature below is
 * guarded: on a page with none of its data-* hooks it does nothing at all.
 *
 * Hooks (see .scratch/new-ui/design-spec.md "Cross-agent interface contract"):
 *   data-palette-root / data-palette-input / data-palette-list / data-palette-data
 *   data-filter-input / data-filter-tag / data-filter-clear / data-filter-item
 *   data-filter-empty / data-tags / data-text / data-lang
 *   data-tabs / data-tab
 *   data-copy / data-toast / data-theme-toggle / data-clock
 *   data-repo / data-stars / data-forks
 * State classes: .is-active .is-selected .is-hidden .is-open .is-dim
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Sprite icon markup, matching _includes/icon.html.
  function iconHtml(name, size) {
    var s = size || 20;
    return '<svg class="icon" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<use href="/assets/img/icons.svg#i-' + escapeHtml(name) + '"></use></svg>';
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function isExternal(href) {
    if (!href || href.indexOf('http') !== 0) return false;
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch (e) {
      return true;
    }
  }

  // ------------------------------------------------------------------ toast

  var TOAST_MS = 2600;

  function toastHost() {
    var host = $('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function showToast(title, message) {
    var host = toastHost();
    var el = document.createElement('div');
    el.className = 'toast toast--success';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="toast__icon">' + iconHtml('check', 18) + '</span>' +
      '<div class="toast__body">' +
        '<div class="toast__title">' + escapeHtml(title) + '</div>' +
        (message ? '<div class="toast__msg">' + escapeHtml(message) + '</div>' : '') +
      '</div>' +
      '<button class="toast__close" type="button" aria-label="Dismiss">' + iconHtml('x', 16) + '</button>';

    var timer = null;
    function dismiss() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (el.parentNode) el.parentNode.removeChild(el);
      if (!host.children.length && host.parentNode) host.parentNode.removeChild(host);
    }
    var close = $('.toast__close', el);
    if (close) close.addEventListener('click', dismiss);
    host.appendChild(el);
    timer = setTimeout(dismiss, TOAST_MS);
    return dismiss;
  }

  function initToastTriggers() {
    document.addEventListener('click', function (ev) {
      var trigger = ev.target && ev.target.closest ? ev.target.closest('[data-toast]') : null;
      if (!trigger) return;
      var raw = trigger.getAttribute('data-toast') || '';
      var split = raw.indexOf('|');
      var title = split === -1 ? raw : raw.slice(0, split);
      var message = split === -1 ? '' : raw.slice(split + 1);
      showToast(title, message);
    });
  }

  // ------------------------------------------------------------------- copy

  var COPY_REVERT_MS = 1400;

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    var ok = false;
    try {
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function markCopied(btn) {
    if (btn.dataset.copyBusy === '1') return;
    btn.dataset.copyBusy = '1';
    var original = btn.innerHTML;
    btn.innerHTML = iconHtml('check', 13) + '<span>copied</span>';
    btn.classList.add('is-active');
    setTimeout(function () {
      btn.innerHTML = original;
      btn.classList.remove('is-active');
      delete btn.dataset.copyBusy;
    }, COPY_REVERT_MS);
  }

  function initCopy() {
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-copy]') : null;
      if (!btn) return;
      ev.preventDefault();
      copyText(btn.getAttribute('data-copy') || '').then(function (ok) {
        if (ok) markCopied(btn);
      });
    });
  }

  // ------------------------------------------------------------------ theme

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('theme', theme); } catch (e) { /* private mode */ }
    $$('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    });
  }

  function initTheme() {
    var toggles = $$('[data-theme-toggle]');
    if (!toggles.length) return;
    // The inline head script (or investments.html) may already have set it.
    var current = document.documentElement.dataset.theme;
    if (current !== 'light' && current !== 'dark') {
      var stored = null;
      try { stored = window.localStorage.getItem('theme'); } catch (e) { /* ignore */ }
      current = (stored === 'light' || stored === 'dark') ? stored : 'dark';
      document.documentElement.dataset.theme = current;
    }
    applyTheme(current);
    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
      });
    });
  }

  // ------------------------------------------------------------------ clock

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function initClock() {
    var nodes = $$('[data-clock]');
    if (!nodes.length) return;
    function tick() {
      var now = new Date();
      var hhmm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      nodes.forEach(function (n) { n.textContent = hhmm; });
    }
    tick();
    // Align to the next minute boundary, then tick every minute.
    setTimeout(function () {
      tick();
      setInterval(tick, 60000);
    }, (60 - new Date().getSeconds()) * 1000 + 50);
  }

  // ----------------------------------------------------------- filter/tabs

  // One filter controller per container. A container is the nearest common
  // ancestor of the input/chips/items — we take the whole document if the page
  // only has one, otherwise scope to [data-filter-scope] when present.
  function filterScopes() {
    var scoped = $$('[data-filter-scope]');
    if (scoped.length) return scoped;
    if ($('[data-filter-item]')) return [document];
    return [];
  }

  function initFilters() {
    filterScopes().forEach(function (root) {
      var items = $$('[data-filter-item]', root);
      if (!items.length) return;

      var input = $('[data-filter-input]', root);
      var chips = $$('[data-filter-tag]', root);
      var clearBtn = $('[data-filter-clear]', root);
      var empty = $('[data-filter-empty]', root);
      var tabsRoot = $('[data-tabs]', root);
      var tabs = tabsRoot ? $$('[data-tab]', tabsRoot) : $$('[data-tab]', root);

      var state = { q: '', tag: null, lang: 'all' };

      var activeTab = tabs.filter(function (t) { return t.classList.contains('is-active'); })[0];
      if (activeTab) state.lang = activeTab.getAttribute('data-tab') || 'all';

      function matches(item) {
        if (state.q) {
          var text = (item.getAttribute('data-text') || item.textContent || '').toLowerCase();
          if (text.indexOf(state.q) === -1) return false;
        }
        if (state.tag) {
          var tags = (item.getAttribute('data-tags') || '').toLowerCase().split(/[\s,]+/);
          if (tags.indexOf(state.tag) === -1) return false;
        }
        if (state.lang && state.lang !== 'all') {
          var lang = (item.getAttribute('data-lang') || '').toLowerCase();
          if (lang !== state.lang) return false;
        }
        return true;
      }

      function render() {
        var shown = 0;
        items.forEach(function (item) {
          var ok = matches(item);
          item.classList.toggle('is-hidden', !ok);
          if (ok) shown++;
        });

        if (empty) empty.classList.toggle('is-hidden', shown !== 0);

        var anyTag = !!state.tag;
        chips.forEach(function (chip) {
          var t = (chip.getAttribute('data-filter-tag') || '').toLowerCase();
          var on = anyTag && t === state.tag;
          chip.classList.toggle('is-active', on);
          chip.classList.toggle('is-dim', anyTag && !on);
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        tabs.forEach(function (tab) {
          var on = (tab.getAttribute('data-tab') || 'all').toLowerCase() === state.lang;
          tab.classList.toggle('is-active', on);
          tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        if (clearBtn) clearBtn.classList.toggle('is-hidden', !(state.q || state.tag));
      }

      if (input) {
        input.addEventListener('input', function () {
          state.q = input.value.trim().toLowerCase();
          render();
        });
      }

      chips.forEach(function (chip) {
        chip.addEventListener('click', function (ev) {
          ev.preventDefault();
          var t = (chip.getAttribute('data-filter-tag') || '').toLowerCase();
          state.tag = state.tag === t ? null : t;
          render();
        });
      });

      tabs.forEach(function (tab) {
        tab.addEventListener('click', function (ev) {
          ev.preventDefault();
          state.lang = (tab.getAttribute('data-tab') || 'all').toLowerCase();
          render();
        });
      });

      if (clearBtn) {
        clearBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          state.q = '';
          state.tag = null;
          if (input) input.value = '';
          render();
        });
      }

      render();
    });
  }

  // ---------------------------------------------------------------- palette

  function initPalette() {
    var root = $('[data-palette-root]');
    if (!root) return;

    var input = $('[data-palette-input]', root);
    var list = $('[data-palette-list]', root);
    if (!input || !list) return;

    var commands = [];
    var dataEl = $('script[type="application/json"][data-palette-data]') ||
                 $('[data-palette-data]');
    if (dataEl) {
      try {
        var parsed = JSON.parse(dataEl.textContent || '[]');
        if (Object.prototype.toString.call(parsed) === '[object Array]') commands = parsed;
      } catch (e) { commands = []; }
    }

    var open = false;
    var sel = 0;
    var shown = commands.slice();
    var lastFocus = null;

    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Command palette');
    root.setAttribute('aria-hidden', 'true');
    root.classList.remove('is-open');

    function filter() {
      var q = input.value.trim().toLowerCase();
      shown = commands.filter(function (c) {
        return String(c && c.label || '').toLowerCase().indexOf(q) !== -1;
      });
      return q;
    }

    function render() {
      var q = filter();
      if (sel > shown.length - 1) sel = Math.max(0, shown.length - 1);
      if (!shown.length) {
        list.innerHTML = '<div class="palette__empty">command not found: ' + escapeHtml(q) + '</div>';
        return;
      }
      var html = shown.map(function (c, i) {
        return '<div class="palette__item' + (i === sel ? ' is-selected' : '') + '"' +
          ' role="option" aria-selected="' + (i === sel ? 'true' : 'false') + '"' +
          ' data-palette-index="' + i + '">' +
          iconHtml(c.icon || 'chevron-right', 15) +
          '<span class="palette__label">' + escapeHtml(c.label || '') + '</span>' +
          (i === sel ? '<span class="palette__enter">↵</span>' : '') +
          '</div>';
      }).join('');
      list.innerHTML = html;
      scrollSelectionIntoView();
    }

    function scrollSelectionIntoView() {
      var node = $('.palette__item.is-selected', list);
      if (!node) return;
      var top = node.offsetTop;
      var bottom = top + node.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    }

    // Move the selection without rebuilding the list — rebuilding under the
    // cursor makes hover-select flicker.
    function setSel(i) {
      var next = Math.max(0, Math.min(i, shown.length - 1));
      if (next === sel || !shown.length) return;
      sel = next;
      $$('.palette__item', list).forEach(function (node, idx) {
        var on = idx === sel;
        node.classList.toggle('is-selected', on);
        node.setAttribute('aria-selected', on ? 'true' : 'false');
        var mark = $('.palette__enter', node);
        if (on && !mark) {
          mark = document.createElement('span');
          mark.className = 'palette__enter';
          mark.textContent = '↵';
          node.appendChild(mark);
        } else if (!on && mark) {
          node.removeChild(mark);
        }
      });
      scrollSelectionIntoView();
    }

    function openPalette() {
      if (open) return;
      open = true;
      lastFocus = document.activeElement;
      input.value = '';
      sel = 0;
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      list.setAttribute('role', 'listbox');
      render();
      setTimeout(function () { try { input.focus(); } catch (e) { /* ignore */ } }, 30);
    }

    function closePalette() {
      if (!open) return;
      open = false;
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
      if (lastFocus && lastFocus.focus) {
        try { lastFocus.focus(); } catch (e) { /* ignore */ }
      }
      lastFocus = null;
    }

    function activate(cmd) {
      if (!cmd) return;
      closePalette();
      var href = cmd.href;
      if (!href) return;
      if (isExternal(href)) window.open(href, '_blank', 'noopener');
      else window.location.href = href;
    }

    input.addEventListener('input', function () {
      sel = 0;
      render();
    });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel(sel + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel(sel - 1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); activate(shown[sel]); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closePalette(); }
    });

    list.addEventListener('click', function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest('[data-palette-index]') : null;
      if (!item) return;
      activate(shown[parseInt(item.getAttribute('data-palette-index'), 10)]);
    });

    list.addEventListener('mousemove', function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest('[data-palette-index]') : null;
      if (!item) return;
      setSel(parseInt(item.getAttribute('data-palette-index'), 10));
    });

    // Clicking the scrim (or any part of the root that is not the panel) closes.
    root.addEventListener('mousedown', function (ev) {
      var panel = $('.palette__panel', root);
      if (!panel || !panel.contains(ev.target)) closePalette();
    });

    document.addEventListener('keydown', function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        if (open) closePalette(); else openPalette();
      } else if (ev.key === 'Escape' && open) {
        closePalette();
      }
    });

    // Any control that opens the palette explicitly (e.g. the nav ⌘K button).
    $$('[data-palette-open]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) { ev.preventDefault(); openPalette(); });
    });

    if (prefersReducedMotion()) root.setAttribute('data-reduced-motion', 'true');
  }

  // ------------------------------------------------------- github enrichment

  var GH_URL = 'https://api.github.com/users/tmck-code/repos?per_page=100';
  var GH_CACHE_KEY = 'gh-repos-v1';
  var GH_CACHE_MS = 30 * 60 * 1000;

  function ghCacheRead() {
    try {
      var raw = window.sessionStorage.getItem(GH_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.at || (Date.now() - obj.at) > GH_CACHE_MS) return null;
      return obj.repos || null;
    } catch (e) { return null; }
  }

  function ghCacheWrite(repos) {
    try {
      window.sessionStorage.setItem(GH_CACHE_KEY, JSON.stringify({ at: Date.now(), repos: repos }));
    } catch (e) { /* quota / private mode — enrichment still works this page */ }
  }

  function applyRepoData(repos) {
    if (!repos || !repos.length) return;
    var byName = {};
    repos.forEach(function (r) {
      if (r && r.name) byName[String(r.name).toLowerCase()] = r;
    });
    $$('[data-repo]').forEach(function (card) {
      var r = byName[(card.getAttribute('data-repo') || '').toLowerCase()];
      if (!r) return;
      var stars = $('[data-stars]', card);
      var forks = $('[data-forks]', card);
      if (stars && typeof r.stargazers_count === 'number') {
        stars.textContent = String(r.stargazers_count);
      }
      if (forks && typeof r.forks_count === 'number') {
        forks.textContent = String(r.forks_count);
      }
    });
  }

  function initGithub() {
    if (!$('[data-repo]')) return;
    if (typeof window.fetch !== 'function') return;

    var cached = ghCacheRead();
    if (cached) { applyRepoData(cached); return; }

    fetch(GH_URL, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('gh ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (Object.prototype.toString.call(json) !== '[object Array]') return;
        // Keep only what we need — sessionStorage is small.
        var slim = json.map(function (r) {
          return { name: r.name, stargazers_count: r.stargazers_count, forks_count: r.forks_count };
        });
        ghCacheWrite(slim);
        applyRepoData(slim);
      })
      .catch(function () { /* rate limited / offline — keep server-rendered values */ });
  }

  // ------------------------------------------------------------------- boot

  function boot() {
    try { initTheme(); } catch (e) { /* keep going */ }
    try { initPalette(); } catch (e) { /* keep going */ }
    try { initFilters(); } catch (e) { /* keep going */ }
    try { initCopy(); } catch (e) { /* keep going */ }
    try { initToastTriggers(); } catch (e) { /* keep going */ }
    try { initClock(); } catch (e) { /* keep going */ }
    try { initGithub(); } catch (e) { /* keep going */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
