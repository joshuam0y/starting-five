// Every dropdown on the site in the site's own look (the MENU's font, colors and group headers) instead of the
// system one: each <select> gets a button and a list; the real <select> stays underneath, hidden, so every page
// reads and sets it as before (its change event fires as usual, and setting .value or .selectedIndex repaints).
// A <select> inside [data-native] keeps the system look.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const done = new WeakSet();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = HTMLSelectElement.prototype;
  const dValue = Object.getOwnPropertyDescriptor(P, 'value'), dIndex = Object.getOwnPropertyDescriptor(P, 'selectedIndex');
  let openOne = null;

  function enhance(sel) {
    if (done.has(sel) || sel.multiple || sel.size > 1 || sel.closest('[data-native]') || !sel.parentNode) return;
    done.add(sel);
    const w = sel.offsetWidth, pw = sel.parentNode.clientWidth || 0;
    const wrap = document.createElement('div');
    wrap.className = 'fs';
    if (w && pw && w < pw - 4) { wrap.classList.add('fs-inline'); wrap.style.minWidth = Math.max(120, w) + 'px'; }
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('fs-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fs-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
    if (lab) btn.setAttribute('aria-label', lab.textContent.trim());
    else if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    wrap.appendChild(btn);
    const list = document.createElement('div');
    list.className = 'fs-list'; list.hidden = true; list.setAttribute('role', 'listbox');
    wrap.appendChild(list);

    const paint = () => {
      const o = sel.options[sel.selectedIndex];
      btn.innerHTML = '<span>' + esc(o ? o.text : '') + '</span><i aria-hidden="true"></i>';
      btn.disabled = sel.disabled;
    };
    const opt = o => `<button type="button" class="fs-opt${o.selected ? ' on' : ''}" role="option" aria-selected="${o.selected}" data-i="${o.index}"${o.disabled ? ' disabled' : ''}>${esc(o.text)}</button>`;
    const build = () => {
      list.innerHTML = Array.from(sel.children).map(ch => ch.tagName === 'OPTGROUP'
        ? `<div class="fs-k">${esc(ch.label)}</div>` + Array.from(ch.children).filter(o => !o.hidden).map(opt).join('')
        : ch.hidden ? '' : opt(ch)).join('');
    };
    const close = () => {
      if (list.hidden) return;
      list.hidden = true; wrap.classList.remove('open', 'up'); btn.setAttribute('aria-expanded', 'false');
      if (openOne === close) openOne = null;
    };
    const open = () => {
      if (openOne) openOne();
      build();
      list.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      // opens upward when there is no room below
      const r = btn.getBoundingClientRect(), below = window.innerHeight - r.bottom, h = Math.min(list.scrollHeight, 340);
      wrap.classList.toggle('up', below < h + 12 && r.top > below);
      const on = list.querySelector('.fs-opt.on') || list.querySelector('.fs-opt');
      if (on) { on.scrollIntoView({ block: 'nearest' }); on.focus({ preventScroll: true }); }
      openOne = close;
    };
    const choose = i => {
      const changed = sel.selectedIndex !== i;
      dIndex.set.call(sel, i);
      paint(); close(); btn.focus();
      if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    btn.addEventListener('click', e => { e.preventDefault(); if (list.hidden) open(); else close(); });
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    list.addEventListener('click', e => { const b = e.target.closest('.fs-opt'); if (b && !b.disabled) choose(+b.dataset.i); });
    list.addEventListener('keydown', e => {
      const all = Array.from(list.querySelectorAll('.fs-opt:not([disabled])')), k = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = all[Math.max(0, Math.min(all.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { close(); if (e.key === 'Escape') btn.focus(); }
    });
    // the page sets the value itself: repaint
    Object.defineProperty(sel, 'value', { configurable: true, get() { return dValue.get.call(this); }, set(v) { dValue.set.call(this, v); paint(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return dIndex.get.call(this); }, set(v) { dIndex.set.call(this, v); paint(); } });
    sel.addEventListener('change', paint);
    new MutationObserver(() => { paint(); if (!list.hidden) build(); }).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
    paint();
  }

  const scan = root => { if (root.tagName === 'SELECT') enhance(root); else if (root.querySelectorAll) root.querySelectorAll('select').forEach(enhance); };
  document.addEventListener('click', e => { if (openOne && !e.target.closest('.fs.open')) openOne(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openOne) openOne(); });
  const start = () => {
    scan(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); }))).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
