import { loadSettings, saveSettings } from './lib/settings.js';
import { PROVIDERS } from './lib/providers.js';

const $ = id => document.getElementById(id);
const TEXT = ['credentials', 'specialty', 'licenseNumber', 'npi', 'fax', 'providerName', 'phoneOverride', 'anthropicApiKey', 'deepseekApiKey'];
const PF_ORIGINS = ['https://*.practicefusion.com/*'];
const PICKERS = {
  anthropic: { key: 'anthropicApiKey', select: 'model', status: 'model-status', button: 'load-models' },
  deepseek: { key: 'deepseekApiKey', select: 'deepseekModel', status: 'deepseek-model-status', button: 'load-deepseek-models' },
};

async function loadModels(provider, selected) {
  const ui = PICKERS[provider];
  const key = $(ui.key).value.trim();
  if (!key) { $(ui.status).textContent = 'Enter the API key first.'; return; }
  $(ui.status).textContent = 'Loading models…';
  try {
    const models = await PROVIDERS[provider].listModels(key);
    const sel = $(ui.select);
    sel.innerHTML = '';
    for (const m of models) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id; sel.appendChild(o); }
    sel.value = selected && models.some(m => m.id === selected) ? selected : PROVIDERS[provider].pickDefault(models);
    $(ui.status).textContent = `Key works. ${models.length} models available.`;
  } catch (e) {
    $(ui.status).textContent = `Could not list models: ${e.message}`;
  }
}

function showProvider() {
  const p = document.querySelector('input[name="aiProvider"]:checked')?.value || 'anthropic';
  $('anthropic-box').classList.toggle('hidden', p !== 'anthropic');
  $('deepseek-box').classList.toggle('hidden', p !== 'deepseek');
}

// ---------- Check setup ----------
function row(state, text, button) {
  const d = document.createElement('div'); d.className = 'check-row';
  const s = document.createElement('span'); s.className = state; s.textContent = state === 'ok' ? '✓' : state === 'bad' ? '✗' : '!';
  const t = document.createElement('span'); t.textContent = text;
  d.append(s, t);
  if (button) { const b = document.createElement('button'); b.type = 'button'; b.textContent = button.label; b.style.marginTop = '0'; b.addEventListener('click', button.onClick); d.append(b); }
  return d;
}

async function checkSetup() {
  const box = $('checks'); box.innerHTML = '';
  const chromeVersion = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || 'unknown';   // Chrome only reports the major version
  box.append(row('ok', `Extension version ${chrome.runtime.getManifest().version} is installed and running in Chrome ${chromeVersion}.`));

  const access = await chrome.permissions.contains({ origins: PF_ORIGINS });
  box.append(access
    ? row('ok', 'Allowed to run on Practice Fusion pages.')
    : row('bad', 'Not allowed to run on Practice Fusion pages (Chrome "Site access" is restricted for this extension, or blocked by your IT policy).',
      { label: 'Grant access', onClick: async () => { await chrome.permissions.request({ origins: PF_ORIGINS }); checkSetup(); } }));

  const tabs = await chrome.tabs.query({ url: PF_ORIGINS });
  if (!tabs.length) {
    box.append(row('warn', 'No Practice Fusion tab is open. Open Practice Fusion, log in, open a patient chart, then click "Check again".'));
    return;
  }
  let running = 0, onChart = 0, visible = 0;
  for (const t of tabs) {
    const r = await chrome.tabs.sendMessage(t.id, { type: 'dff-ping' }).catch(() => null);
    if (r && r.ok) { running++; if (r.onChart) onChart++; if (r.buttonVisible) visible++; }
  }
  if (running < tabs.length) {
    box.append(row('bad', `The button isn't active in ${tabs.length - running} of ${tabs.length} open Practice Fusion tab(s) (they were probably open before the extension was installed or updated).`,
      { label: 'Fix now', onClick: async () => { await chrome.runtime.sendMessage({ type: 'inject-open-tabs' }); setTimeout(checkSetup, 800); } }));
  } else {
    box.append(row('ok', `The button is active in ${running} open Practice Fusion tab(s).`));
  }
  if (running && !onChart) box.append(row('warn', 'None of those tabs shows a patient chart. The button appears only on a chart: Charts → click the patient.'));
  else if (onChart && !visible) box.append(row('warn', 'A chart is open but the button is hidden. Scroll to the top of the chart, or click the extension icon in the toolbar (or press Alt+Shift+F).'));
  else if (visible) box.append(row('ok', 'The "📝 Fill a form" button is showing on the open chart.'));
  box.append(row('ok', 'Tip: on a chart you can also click the toolbar icon (it shows a green "GO" badge) or press Alt+Shift+F.'));
}

// ---------- load / save ----------
(async () => {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  const s = await loadSettings();
  TEXT.forEach(k => { $(k).value = s[k] || ''; });
  $('aiEnabled').checked = !!s.aiEnabled;
  (document.querySelector(`input[name="aiProvider"][value="${s.aiProvider || 'anthropic'}"]`) || document.querySelector('input[name="aiProvider"]')).checked = true;
  showProvider();
  for (const [p, ui] of Object.entries(PICKERS)) {
    const current = s[ui.select === 'model' ? 'model' : 'deepseekModel'];
    if (current) { const o = document.createElement('option'); o.value = current; o.textContent = current; $(ui.select).appendChild(o); $(ui.select).value = current; }
    if (s[ui.key]) loadModels(p, current);
    $(ui.button).addEventListener('click', () => loadModels(p, $(ui.select).value));
  }
  checkSetup();
})();

document.querySelectorAll('input[name="aiProvider"]').forEach(r => r.addEventListener('change', showProvider));
$('recheck').addEventListener('click', checkSetup);
$('save').addEventListener('click', async () => {
  const s = Object.fromEntries(TEXT.map(k => [k, $(k).value.trim()]));
  s.aiEnabled = $('aiEnabled').checked;
  s.aiProvider = document.querySelector('input[name="aiProvider"]:checked')?.value || 'anthropic';
  s.model = $('model').value;
  s.deepseekModel = $('deepseekModel').value;
  await saveSettings(s);
  $('saved').textContent = 'Saved.';
  setTimeout(() => { $('saved').textContent = ''; }, 2500);
});
