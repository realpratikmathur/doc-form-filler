// End-to-end test in a real Chromium with the built extension loaded, against a Practice Fusion
// TEST account containing the synthetic patients (see dev/seed/).
//
//   PF_EMAIL=... PF_PASSWORD=... npm run e2e
//
// Optional env:
//   PF_PROFILE_DIR   Chrome profile folder to reuse (keeps Practice Fusion's "trust this browser",
//                    so you only enter the texted security code once). Default: .cache/e2e-profile
//   PF_CODE_FILE     If Practice Fusion asks for a security code, the test clicks "Send code" and
//                    waits for you to write the code into this file (default: .cache/pf-code.txt).
//   PF_CODE          A security code you already received (skips sending a new one).
//   HEADED=1         Show the browser window.
//   CHROMIUM_PATH    Chromium executable (default: Playwright's).
//   DOCS=1           Save README screenshots into docs/img/.
// The Claude API is MOCKED here (canned answers from dev/fixtures/ai), so no API key is needed.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { FORMS } from '../src/forms/index.js';
import { cannedAnswers } from './mock-ai.mjs';
import { root, launch, login } from './pf-session.mjs';

const dist = path.join(root, 'dist');
const out = path.join(root, 'dev', 'out');
const docs = path.join(root, 'docs', 'img');
mkdirSync(out, { recursive: true }); if (process.env.DOCS) mkdirSync(docs, { recursive: true });
if (!existsSync(path.join(dist, 'manifest.json'))) { console.error('Run "npm run build" first.'); process.exit(1); }

const CASES = [
  { form: 'fmla-wh380e', patient: ['Angela', 'Brooks'], key: 'angela', expect: ['Angela R Brooks', '10/06/2026'] },
  { form: 'fmla-wh380f', patient: ['Gloria', 'Bell'], key: 'gloria', expect: ['Marcus Bell', 'Gloria M Bell', '09/14/2026'] },
  { form: 'metroaccess-partb', patient: ['Harold', 'Simmons'], key: 'harold', expect: ['Harold T Simmons', 'Furosemide'] },
  { form: 'dds-medeval', patient: ['Darnell', 'Jenkins'], key: 'darnell', expect: ['Darnell J Jenkins', '05/02/1996', 'Loretta Jenkins'] },
];
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failures++; };
const shot = async (page, name, opts = {}) => { if (process.env.DOCS) await page.screenshot({ path: path.join(docs, name), ...opts }); };

const context = await launch({ extensionDir: dist });

// ---- mock the Claude API (models list + messages) and capture what was sent
const sent = [];
await context.route('https://api.anthropic.com/**', async route => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.pathname.startsWith('/v1/models')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ type: 'model', id: 'mock-opus-model', display_name: 'Mock Opus (test)', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'mock-opus-model', last_id: 'mock-opus-model' }) });
  }
  const body = JSON.parse(req.postData());
  const text = body.messages[0].content;
  const payload = JSON.parse(text.slice(text.indexOf('{"today"')));
  const props = Object.keys(body.output_config.format.schema.properties).sort().join();
  const form = FORMS.find(f => Object.keys(f.aiFields).sort().join() === props);
  const c = CASES.find(x => x.form === form.id);
  sent.push({ form: form.id, text, headers: req.headers(), body });
  const answers = cannedAnswers(form.id, c.key, payload);
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(answers) }],
    stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 500 } }) });
});

// ---- extension id
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
console.log(`Extension loaded: ${extId}`);

// ---- log in to Practice Fusion
const pf = context.pages()[0] || await context.newPage();
await login(pf, { onLoginPage: p => shot(p, '01-pf-login.png') });
ok(/#\/PF\//.test(pf.url()), `logged in to Practice Fusion (${pf.url().split('#')[1]})`);

// ---- settings: AI on with a (fake) key, model chosen from the (mocked) live list
const opt = await context.newPage();
await opt.goto(`chrome-extension://${extId}/options.html`);
await opt.fill('#credentials', 'MD');
await opt.fill('#specialty', 'Internal Medicine');
await opt.fill('#licenseNumber', 'MD-0000000 / DC (example)');
await opt.fill('#fax', '(202) 555-0100');
await opt.fill('#anthropicApiKey', 'sk-ant-test-not-a-real-key');
await opt.click('#load-models');
await opt.waitForFunction(() => /Key works/.test(document.getElementById('model-status').textContent), null, { timeout: 15000 });
await opt.check('#aiEnabled');
await opt.click('#save');
await opt.waitForTimeout(500);
await shot(opt, '06-settings.png', { fullPage: true });
ok(true, 'settings saved (AI on, model loaded from Models API)');
await opt.close();

for (const c of CASES) {
  console.log(`\n${c.form} — ${c.patient.join(' ')}`);
  // open the chart: Charts → patient
  await pf.bringToFront();
  await pf.evaluate(() => { location.hash = '#/PF/charts/list/all/recent'; });
  await pf.waitForTimeout(4000);
  await pf.getByText(c.patient[1], { exact: true }).first().click();
  const btn = pf.locator('#dff-fill-form-button');
  await btn.waitFor({ timeout: 20000 });
  await pf.waitForTimeout(3000);
  ok(await btn.isVisible(), '"Fill a form" button appears on the open chart');
  if (c.key === 'angela') await shot(pf, '02-pf-chart-button.png');

  const [app] = await Promise.all([context.waitForEvent('page'), btn.click()]);
  await app.waitForSelector('#form-box:not(.hidden)', { timeout: 30000 });
  const patientLine = await app.textContent('#patient-line');
  ok(patientLine.includes(c.patient[0]) && patientLine.includes(c.patient[1]), `filler page read the chart: "${patientLine}"`);
  const firstForm = await app.getAttribute('input[name="form"]:checked', 'value');
  ok(firstForm === c.form, `"${c.form}" is the pre-selected (suggested) form`);
  if (c.key === 'angela') await shot(app, '03-filler-choose-form.png', { fullPage: true });

  await app.check(`input[name="form"][value="${c.form}"]`);
  const pdfTab = context.waitForEvent('page', { timeout: 60000 });
  await app.click('#generate');
  await app.waitForSelector('#result-box:not(.hidden)', { timeout: 60000 });
  const viewer = await pdfTab;
  ok(viewer.url().startsWith('blob:chrome-extension://'), 'PDF opened automatically in a new tab');
  const aiLine = await app.textContent('#ai-result');
  ok(/drafted by Claude/.test(aiLine), `AI step ran: "${aiLine.trim()}"`);
  // what left the computer
  const req = sent.filter(s => s.form === c.form).pop();
  const leaked = [c.patient[0], c.patient[1], ...c.expect.filter(v => /\d{2}\/\d{2}\/\d{4}/.test(v))].filter(v => req.text.includes(v));
  ok(!leaked.length, `request to Claude had no patient names or real dates${leaked.length ? ` (LEAKED ${leaked})` : ''}`);
  ok(req.headers['anthropic-dangerous-direct-browser-access'] === 'true' && req.body.output_config.format.type === 'json_schema', 'request used the SDK browser mode + JSON-schema structured output');
  if (c.key === 'angela') await shot(app, '04-filler-result.png', { fullPage: true });
  if (c.key === 'harold' && process.env.DOCS) {
    try { // README screenshot of page 6 (opened the same way the extension opens PDFs)
      const [v6] = await Promise.all([context.waitForEvent('page'), app.evaluate(() => chrome.tabs.create({ url: `${window.__lastPdf.url}#page=6&zoom=110` }))]);
      await v6.waitForTimeout(6000);
      await shot(v6, '05-pdf-editable.png');
      await v6.close();
    } catch (e) { console.log(`  (docs screenshot skipped: ${e.message.split('\n')[0]})`); }
  }
  await viewer.close();

  const file = path.join(out, `e2e-${c.form}.pdf`);
  await app.evaluate(() => { window.__lastDownloadId = null; });
  await app.click('#download-pdf');
  const done = await app.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      const id = window.__lastDownloadId;
      if (id != null) { const [d] = await chrome.downloads.search({ id }); if (d && d.state !== 'in_progress') return { state: d.state, filename: d.filename, bytes: d.fileSize, error: d.error }; }
      await new Promise(r => setTimeout(r, 250));
    }
    return { state: 'timeout' };
  });
  ok(done.state === 'complete' && done.bytes > 100000, `"Download PDF" saved ${path.basename(done.filename || '')} (${done.state}${done.error ? `, ${done.error}` : ''})`);
  if (done.state === 'complete') writeFileSync(file, readFileSync(done.filename));
  else { // still check the PDF itself
    const b64 = await app.evaluate(async () => { const buf = new Uint8Array(await (await fetch(window.__lastPdf.url)).arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); });
    writeFileSync(file, Buffer.from(b64, 'base64'));
  }
  const pdf = await PDFDocument.load(readFileSync(file));
  const fields = pdf.getForm().getFields();
  const values = fields.map(f => (f.getText ? f.getText() : '') || '').join(' | ');
  ok(fields.length > 50 && fields.every(f => !f.isReadOnly()), `generated PDF has ${fields.length} fields, all editable`);
  ok(c.expect.every(v => values.includes(v)), `PDF contains ${c.expect.join(', ')}`);
  await app.close();
}

// ---- AI off: structured fields only
console.log('\nAI turned off');
const opt2 = await context.newPage();
await opt2.goto(`chrome-extension://${extId}/options.html`);
await opt2.uncheck('#aiEnabled'); await opt2.click('#save'); await opt2.waitForTimeout(300); await opt2.close();
await pf.bringToFront();
await pf.evaluate(() => { location.hash = '#/PF/charts/list/all/recent'; });
await pf.waitForTimeout(3000);
await pf.getByText('Brooks', { exact: true }).first().click();
await pf.locator('#dff-fill-form-button').waitFor();
await pf.waitForTimeout(2000);
const [app2] = await Promise.all([context.waitForEvent('page'), pf.click('#dff-fill-form-button')]);
await app2.waitForSelector('#form-box:not(.hidden)');
const before = sent.length;
const pdfTab2 = context.waitForEvent('page', { timeout: 60000 });
await app2.click('#generate');
await app2.waitForSelector('#result-box:not(.hidden)');
await (await pdfTab2).close();
ok(sent.length === before, 'nothing was sent to Claude');
ok(/AI was off/.test(await app2.textContent('#ai-result')), 'page says note-based fields are blank');
ok(/AI drafting is off/.test(await app2.textContent('#ai-note')), 'warning about AI being off is shown before generating');
const blanks = await app2.locator('#missing li').count();
ok(blanks > 10, `${blanks} fields listed as "left blank" for the doctor`);

await context.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nEnd-to-end: all checks passed.');
process.exit(failures ? 1 : 0);
