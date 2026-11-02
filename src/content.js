// Runs inside Practice Fusion. Shows a "Fill a form" button whenever a patient chart is open.
// Practice Fusion is a single-page app, so we watch the URL hash instead of relying on page loads.
// Safe to inject more than once (the background re-injects it into tabs that were already open
// when the extension was installed or enabled).
(() => {
  if (window.__dffContentLoaded) { window.__dffRender && window.__dffRender(); return; }
  window.__dffContentLoaded = true;

  const CHART_RE = /#\/PF\/charts\/patients\/([0-9a-f-]{36})/i;
  const BTN_ID = 'dff-fill-form-button';
  const currentPatientId = () => { const m = location.hash.match(CHART_RE); return m ? m[1] : null; };

  /** Is the button really visible (not clipped by Practice Fusion's layout or covered)? */
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    // Sample across the whole width: a button cut in half by an overflow-hidden bar must count as hidden.
    const y = Math.min(innerHeight - 1, r.top + r.height / 2);
    return [0.1, 0.5, 0.9].every(f => {
      const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width * f), y);
      return !!hit && (hit === el || el.contains(hit));
    });
  }

  function float(btn) {
    btn.classList.remove('dff-inline');
    if (btn.parentElement !== document.body) document.body.appendChild(btn);
  }

  function render() {
    const pid = currentPatientId();
    let btn = document.getElementById(BTN_ID);
    if (!pid) { if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.title = 'Doc Form Filler: pre-fill a form from this chart (Alt+Shift+F)';
      btn.innerHTML = '<span aria-hidden="true">📝</span> Fill a form';
      btn.addEventListener('click', () => {
        const name = (document.querySelector('[data-element="patient-ribbon-patient-name"]') || {}).innerText || '';
        chrome.runtime.sendMessage({ type: 'open-filler', patientId: currentPatientId(), patientName: name.trim() });
      });
    }
    btn.dataset.patientId = pid;
    // Preferred spot: Practice Fusion's blue patient bar, next to its "Actions" button. On some screen
    // sizes that bar clips or covers extra content, so keep the button there only if it is really
    // visible; otherwise float it at the bottom-left of the window.
    const actions = document.querySelector('[data-element="patient-header-actions-menu-dropdown"]');
    if (actions && actions.offsetParent && !btn.dataset.forceFloat) {
      if (btn.nextElementSibling !== actions) actions.parentElement.insertBefore(btn, actions);
      btn.classList.add('dff-inline');
      requestAnimationFrame(() => { if (!visible(btn)) { btn.dataset.forceFloat = '1'; float(btn); } });
    } else {
      float(btn);
    }
  }
  window.__dffRender = render;

  // Settings → "Check setup" asks open Practice Fusion tabs whether the button is running here.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === 'dff-ping') {
      const btn = document.getElementById(BTN_ID);
      reply({ ok: true, onChart: !!currentPatientId(), buttonVisible: !!btn && visible(btn) });
    }
  });

  window.addEventListener('hashchange', () => { const b = document.getElementById(BTN_ID); if (b) delete b.dataset.forceFloat; render(); });
  window.addEventListener('resize', () => { const b = document.getElementById(BTN_ID); if (b) { delete b.dataset.forceFloat; render(); } });
  render();
  // Practice Fusion re-renders its header often; re-check periodically.
  setInterval(render, 1500);
})();
