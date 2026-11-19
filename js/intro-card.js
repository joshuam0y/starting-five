/* One-time launch card. UI.introCard({ key, kicker, title, text, preview, primary: { label, fn }, secondary: 'GOT IT' }).
   Shows once per key (localStorage 'sf-intro-' + key), set when closed by a button, Escape or a backdrop tap. */
(function () {
  'use strict';
  const UI = window.UI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const K = key => 'sf-intro-' + key;
  UI.introCard = function (o) {
    try { if (localStorage.getItem(K(o.key))) return; } catch (e) { /* private mode: show it */ }
    if (document.getElementById('introCard')) return;
    const prev = document.activeElement;
    const el = document.createElement('div');
    el.className = 'ic-wrap'; el.id = 'introCard';
    el.innerHTML = `<div class="ic-box" role="dialog" aria-modal="true" aria-labelledby="icTitle">
      <div class="ic-k">${esc(o.kicker)}</div>
      <h2 class="ic-t" id="icTitle">${esc(o.title)}</h2>
      <p class="ic-p">${esc(o.text)}</p>
      ${o.preview ? `<div class="ic-prev">${o.preview}</div>` : ''}
      <div class="ic-go"><button type="button" class="btn btn-gold" id="icPrimary">${esc(o.primary.label)}</button><button type="button" class="btn" id="icSecondary">${esc(o.secondary || 'GOT IT')}</button></div>
    </div>`;
    function close() {
      try { localStorage.setItem(K(o.key), '1'); } catch (e) { /* private mode */ }
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* gone */ } }
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        const b = [el.querySelector('#icPrimary'), el.querySelector('#icSecondary')];
        const i = b.indexOf(document.activeElement);
        e.preventDefault();
        b[(i + 1) % 2].focus();
      }
    }
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.querySelector('#icPrimary').addEventListener('click', () => { try { if (o.primary.fn) o.primary.fn(); } finally { close(); } });
    el.querySelector('#icSecondary').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    el.querySelector('#icPrimary').focus();
  };
})();
