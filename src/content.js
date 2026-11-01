// Runs inside Practice Fusion (static.practicefusion.com/apps/ehr/...).
// Shows a "Fill a form" button whenever a patient chart is open. Practice Fusion is a
// single-page app, so we watch the URL hash instead of relying on page loads.
const CHART_RE = /#\/PF\/charts\/patients\/([0-9a-f-]{36})/i;
const BTN_ID = 'dff-fill-form-button';

function currentPatientId() {
  const m = location.hash.match(CHART_RE);
  return m ? m[1] : null;
}

function render() {
  const pid = currentPatientId();
  let btn = document.getElementById(BTN_ID);
  if (!pid) { if (btn) btn.remove(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.title = 'Doc Form Filler: pre-fill a form from this chart';
    btn.innerHTML = '<span aria-hidden="true">📝</span> Fill a form';
    btn.addEventListener('click', () => {
      const name = document.querySelector('[data-element="patient-ribbon-patient-name"]')?.innerText?.trim() || '';
      chrome.runtime.sendMessage({ type: 'open-filler', patientId: currentPatientId(), patientName: name });
    });
  }
  // Preferred spot: in the blue patient bar, just left of Practice Fusion's "Actions" button.
  // Fallback: a floating button at the bottom-left of the window.
  const actions = document.querySelector('[data-element="patient-header-actions-menu-dropdown"]');
  if (actions && actions.offsetParent) {
    if (btn.nextElementSibling !== actions) actions.parentElement.insertBefore(btn, actions);
    btn.classList.add('dff-inline');
  } else if (btn.parentElement !== document.body) {
    btn.classList.remove('dff-inline');
    document.body.appendChild(btn);
  }
  btn.dataset.patientId = pid;
}

window.addEventListener('hashchange', render);
render();
// Practice Fusion sometimes swaps the hash before the body is ready; re-check briefly.
setInterval(render, 1500);
