// The page the doctor sees after clicking "Fill a form" in Practice Fusion.
import { extractChartInPage } from './lib/extract.js';
import { loadSettings } from './lib/settings.js';
import { answerFormQuestions } from './lib/ai.js';
import { generateForm } from './lib/pipeline.js';
import { FORMS, formById } from './forms/index.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tabId = Number(params.get('tab'));
const patientId = params.get('pid');
let chart, settings, lastPdf;

function status(text, isError = false) {
  $('status').textContent = text;
  $('status').className = isError ? 'error' : '';
  $('status-box').classList.remove('hidden');
}

async function readChart() {
  if (!patientId) {
    status('Open a patient\'s chart in Practice Fusion first (Charts → click the patient), then click the blue "📝 Fill a form" button at the bottom-left of the chart.', true);
    return;
  }
  let injected;
  try {
    [injected] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: extractChartInPage, args: [patientId] });
  } catch (e) {
    status(`Could not read the Practice Fusion tab (${e.message}). Keep the chart tab open and try the button again.`, true);
    return;
  }
  const r = injected && injected.result;
  if (!r || r.error) {
    status(r && r.error === 'NOT_LOGGED_IN'
      ? 'Practice Fusion says you are not logged in (or the session timed out). Log in again in the Practice Fusion tab, open the chart, and click "Fill a form" again.'
      : `Could not read the chart: ${(r && r.error) || 'no response from the Practice Fusion tab'}`, true);
    return;
  }
  chart = r;
  window.__chart = chart; // for automated tests
  const p = chart.patient;
  $('patient-line').textContent = `${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ')} · DOB ${p.dob ? `${p.dob.slice(5, 7)}/${p.dob.slice(8, 10)}/${p.dob.slice(0, 4)}` : '?'} · ${p.sex} · PRN ${p.prn}`;
  $('chart-counts').textContent = `Read from Practice Fusion: ${chart.diagnoses.filter(d => d.active).length} active diagnoses, ${chart.medications.filter(m => m.active).length} active medications, ${chart.allergies.length} ${chart.allergies.length === 1 ? 'allergy' : 'allergies'}, ${chart.encounters.length} visit note${chart.encounters.length === 1 ? '' : 's'}, ${chart.vitals.length} set${chart.vitals.length === 1 ? '' : 's'} of vitals.`;
  $('patient-box').classList.remove('hidden');
  $('status-box').classList.add('hidden');
  renderForms();
}

function renderForms() {
  const list = $('form-list');
  list.innerHTML = '';
  const suggestions = FORMS.map(f => ({ f, why: f.suggest(chart) }));
  suggestions.sort((a, b) => (b.why ? 1 : 0) - (a.why ? 1 : 0));
  suggestions.forEach(({ f, why }, i) => {
    const label = document.createElement('label');
    label.className = 'form-option';
    label.innerHTML = `<input type="radio" name="form" value="${f.id}" ${i === 0 ? 'checked' : ''}><b></b><span class="why"></span><span class="note"></span>`;
    label.querySelector('b').textContent = f.title;
    label.querySelector('.why').textContent = why ? `Suggested: ${why}` : '';
    label.querySelector('.note').textContent = f.note || '';
    list.appendChild(label);
  });
  const aiReady = settings.aiEnabled && settings.anthropicApiKey && settings.model;
  $('ai-note').textContent = aiReady
    ? 'Fields from the visit notes will be drafted by Claude using a de-identified copy of the chart (no names, IDs or real dates).'
    : 'AI is off (no Claude API key in Settings). Fields that come from the visit notes will be left blank for you to type into the PDF.';
  $('form-box').classList.remove('hidden');
}

async function generate() {
  const form = formById(document.querySelector('input[name="form"]:checked').value);
  $('generate').disabled = true;
  $('result-box').classList.add('hidden');
  try {
    const templateBytes = await (await fetch(chrome.runtime.getURL(`forms/${form.templateFile}`))).arrayBuffer();
    const aiReady = settings.aiEnabled && settings.anthropicApiKey && settings.model;
    const askAi = aiReady ? ({ form: fm, payload }) => answerFormQuestions({ apiKey: settings.anthropicApiKey, model: settings.model, form: fm, payload }) : null;
    const res = await generateForm({ form, chart, templateBytes, settings, askAi, onStep: t => { $('progress').textContent = t; } });
    showResult(form, res);
  } catch (e) {
    $('progress').textContent = '';
    status(`Something went wrong while filling the form: ${e.message}`, true);
  } finally {
    $('generate').disabled = false;
  }
}

function showResult(form, { bytes, rows, aiInfo }) {
  $('progress').textContent = '';
  if (lastPdf) URL.revokeObjectURL(lastPdf.url);
  const p = chart.patient;
  const filename = `${form.shortTitle} - ${p.lastName}, ${p.firstName} - DRAFT.pdf`.replace(/[\\/:*?"<>|]/g, '');
  lastPdf = { url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), filename, bytes };
  window.__lastPdf = lastPdf; // for automated tests

  $('ai-result').innerHTML = '';
  const aiLine = document.createElement('span');
  if (aiInfo.used) aiLine.textContent = `Note-based fields drafted by Claude (${aiInfo.model}). They are suggestions; check them against your notes.`;
  else if (aiInfo.error) { aiLine.textContent = `Claude was not used: ${aiInfo.error}`; aiLine.className = 'error'; }
  else aiLine.textContent = 'AI was off; note-based fields are blank.';
  $('ai-result').appendChild(aiLine);

  const missing = rows.filter(r => r.missing);
  const doctor = rows.filter(r => r.source === 'doctor');
  $('missing').innerHTML = '';
  const add = (title, items) => {
    if (!items.length) return;
    const h = document.createElement('p'); h.innerHTML = `<b></b>`; h.querySelector('b').textContent = title;
    const ul = document.createElement('ul');
    items.forEach(r => { const li = document.createElement('li'); li.textContent = r.label; ul.appendChild(li); });
    $('missing').append(h, ul);
  };
  add(`Left blank — not found in the chart (fill in the PDF if they apply): ${missing.length}`, missing);
  add('For you to complete by hand:', doctor);

  const tbody = $('rows').querySelector('tbody');
  tbody.innerHTML = '';
  const SRC = { chart: 'Practice Fusion chart', ai: 'Claude (from notes)', settings: 'Your settings', doctor: 'You' };
  rows.forEach(r => {
    const tr = document.createElement('tr');
    [r.label, r.value || '—', SRC[r.source] || r.source].forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (i === 2) td.className = `src-${r.source}`; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  if (aiInfo.payload) { $('payload').textContent = JSON.stringify(aiInfo.payload, null, 2); $('payload-details').classList.remove('hidden'); }
  else $('payload-details').classList.add('hidden');
  $('result-box').classList.remove('hidden');
  openPdf();
}

function openPdf() { if (lastPdf) chrome.tabs.create({ url: lastPdf.url }); }
function downloadPdf() {
  if (!lastPdf) return;
  const a = document.createElement('a');
  a.href = lastPdf.url; a.download = lastPdf.filename;
  document.body.appendChild(a); a.click(); a.remove();
}

$('generate').addEventListener('click', generate);
$('open-pdf').addEventListener('click', openPdf);
$('download-pdf').addEventListener('click', downloadPdf);

(async () => {
  settings = await loadSettings();
  await readChart();
})();
