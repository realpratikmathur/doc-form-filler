import { loadSettings, saveSettings } from './lib/settings.js';
import { listModels, pickDefaultModel } from './lib/ai.js';

const $ = id => document.getElementById(id);
const TEXT = ['credentials', 'specialty', 'licenseNumber', 'npi', 'fax', 'providerName', 'phoneOverride', 'anthropicApiKey'];

async function loadModels(selected) {
  const key = $('anthropicApiKey').value.trim();
  if (!key) { $('model-status').textContent = 'Enter the API key first.'; return; }
  $('model-status').textContent = 'Loading models…';
  try {
    const models = await listModels(key);
    const sel = $('model');
    sel.innerHTML = '';
    for (const m of models) { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.name} (${m.id})`; sel.appendChild(o); }
    sel.value = selected && models.some(m => m.id === selected) ? selected : pickDefaultModel(models);
    $('model-status').textContent = `Key works. ${models.length} models available.`;
  } catch (e) {
    $('model-status').textContent = `Could not list models: ${e.message}`;
  }
}

(async () => {
  const s = await loadSettings();
  TEXT.forEach(k => { $(k).value = s[k] || ''; });
  $('aiEnabled').checked = !!s.aiEnabled;
  if (s.model) { const o = document.createElement('option'); o.value = s.model; o.textContent = s.model; $('model').appendChild(o); $('model').value = s.model; }
  if (s.anthropicApiKey) loadModels(s.model);
})();

$('load-models').addEventListener('click', () => loadModels($('model').value));
$('save').addEventListener('click', async () => {
  const s = Object.fromEntries(TEXT.map(k => [k, $(k).value.trim()]));
  s.aiEnabled = $('aiEnabled').checked;
  s.model = $('model').value;
  await saveSettings(s);
  $('saved').textContent = 'Saved.';
  setTimeout(() => { $('saved').textContent = ''; }, 2500);
});
