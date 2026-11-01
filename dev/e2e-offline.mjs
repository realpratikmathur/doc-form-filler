// Offline end-to-end test of the REAL built extension in Chromium — no Practice Fusion login, no
// security code, no API key. Requests to static.practicefusion.com are answered by a stand-in that
// serves the synthetic fixture charts in Practice Fusion's JSON format; the Claude API is mocked.
//
//   npm run build && npm run e2e:offline
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { FORMS } from '../src/forms/index.js';
import { cannedAnswers } from './mock-ai.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'dev', 'out');
mkdirSync(out, { recursive: true });
if (!existsSync(path.join(dist, 'manifest.json'))) { console.error('Run "npm run build" first.'); process.exit(1); }
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failures++; };

// ---------- fixture charts -> Practice Fusion API responses ----------
const KEYS = ['angela', 'gloria', 'harold', 'darnell'];
const charts = Object.fromEntries(KEYS.map(k => [`00000000-0000-0000-0000-00000000000${KEYS.indexOf(k) + 1}`, JSON.parse(readFileSync(path.join(root, 'dev/fixtures/charts', `${k}.json`), 'utf8'))]));
const REL = { Child: 'CHD', Guardian: 'GRD', Mother: 'MTH', Spouse: 'SPS' };
const LOINC = { height_in: '8302-2', weight_lb: '3141-9', bmi: '39156-5', bp: '55284-4', temp_f: '8310-5', pulse: '8867-4', resp_rate: '9279-1', o2_sat: '59408-5' };
const html = lines => `<div class="pf-rich-text">${String(lines || '').split('\n').map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')}</div>`;
function pfResponse(urlPath) {
  const m = urlPath.match(/([0-9a-f]{8}-[0-9a-f-]{27})/);
  const c = m && charts[m[1]];
  if (urlPath.startsWith('/PracticeEndpoint/api/v1/practice')) return { practiceName: 'Test Practice', address1: '100 test st', address2: '', city: 'Washington', state: 'DC', postalCode: '20001', practicePhone: '2025550100' };
  if (urlPath.startsWith('/PracticeEndpoint/api/v1/configuratorpractice')) return [{ userGuid: 'u1', firstName: 'Test', lastName: 'Doctor', officePhone: '202-555-0100', email: 'doctor@example.com' }];
  if (!c) return null;
  const p = c.patient;
  if (/\/PatientEndpoint\/api\/v3\/patients\/[^/]+$/.test(urlPath)) return { patient: { firstName: p.firstName, middleName: p.middleName, lastName: p.lastName, birthDate: `${p.dob}T00:00:00Z`, gender: p.sex, patientRecordNumber: p.prn,
    socialSecurityNumber: p.ssn, primaryAddress: p.address, homePhone: p.homePhone, mobilePhone: p.mobilePhone, emailAddress: p.email, notes: p.chartNote },
    patientContacts: c.contacts.map(k => ({ firstName: k.firstName, lastName: k.lastName, patientContactRelationshipTypeCode: REL[k.relationship] || 'OTH', phoneNumber: k.phone, deleted: false })) };
  if (/\/diagnoses/.test(urlPath)) return { patientDiagnoses: c.diagnoses.map(d => ({ name: d.name, acuity: d.acuity, isActive: d.active, startDate: d.start && `${d.start}T00:00:00Z`, stopDate: d.stop, diagnosisCodes: [{ code: d.icd10, codeSystem: 'Icd10' }] })) };
  if (/\/medications/.test(urlPath)) return { medications: c.medications.map(x => ({ drugName: x.name, sig: { professionalDescription: x.sig }, startDateTime: x.start && `${x.start}T00:00:00Z`, stopDateTime: x.stop && `${x.stop}T00:00:00Z` })) };
  if (/\/allergies/.test(urlPath)) return { patientAllergies: c.allergies.map(a => ({ class: { title: a.allergen }, allergySeverityTitle: a.severity, allergyReactions: a.reactions.map(t => ({ title: t })), isActive: a.active })), noKnownAllergies: c.noKnownAllergies };
  if (/PersonalMedicalHistory/.test(urlPath)) return { events: c.history.majorEvents, ongoingMedicalProblems: c.history.ongoingProblems, preventativeCare: c.history.preventiveCare, socialHistory: c.history.social, developmentalHistory: c.history.developmental, familyHealthHistory: c.history.family };
  if (/transcriptSummaries/.test(urlPath)) return { transcriptDisplaySummaries: c.encounters.map((e, i) => ({ transcriptGuid: `t${i}`, transcriptTypeName: e.type, isSigned: e.signed })) };
  const t = urlPath.match(/\/transcripts\/t(\d+)$/);
  if (t) { const e = c.encounters[+t[1]]; return { transcript: { dateOfServiceLocal: `${e.date}T00:00:00Z`, chiefComplaintNote: e.chiefComplaint, subjectiveNote: html(e.subjective), objectiveNote: html(e.objective), assessmentNote: html(e.assessment), planNote: html(e.plan), simpleNote: '' } }; }
  if (/flowsheetData/.test(urlPath)) return { seriesDataCollections: Object.entries(LOINC).map(([k, code]) => ({ seriesData: c.vitals.filter(v => v[k] != null).map(v => ({ eventDateTimeUtc: `${v.date}T00:00:00Z`, code: { code }, value: String(v[k]) })) })) };
  return null;
}
const PF_PAGE = `<!doctype html><html><head><title>Practice Fusion (offline stand-in)</title></head><body>
<div style="background:#1fa0e3;color:#fff;padding:12px;font:16px Arial"><h3 data-element="patient-ribbon-patient-name" id="name"></h3>
<div><button data-element="patient-header-actions-menu-dropdown">Actions</button></div></div>
<script>sessionStorage.setItem('sessionGUID','"offline"');sessionStorage.setItem('userGuid','"u1"');sessionStorage.setItem('practiceGuid','"p1"');</script></body></html>`;

const context = await chromium.launchPersistentContext('', {
  headless: !process.env.HEADED, channel: 'chromium', executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`], viewport: { width: 1280, height: 860 },
});
await context.route('https://static.practicefusion.com/**', route => {
  const u = new URL(route.request().url());
  if (u.pathname.startsWith('/apps/ehr/')) return route.fulfill({ status: 200, contentType: 'text/html', body: PF_PAGE });
  const body = pfResponse(u.pathname);
  return body ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: '' });
});
const sent = [];
await context.route('https://api.anthropic.com/**', async route => {
  const req = route.request();
  if (new URL(req.url()).pathname.startsWith('/v1/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ type: 'model', id: 'mock-opus-model', display_name: 'Mock Opus (test)', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'mock-opus-model', last_id: 'mock-opus-model' }) });
  const body = JSON.parse(req.postData());
  const text = body.messages[0].content;
  const payload = JSON.parse(text.slice(text.indexOf('{"today"')));
  const form = FORMS.find(f => Object.keys(f.aiFields).sort().join() === Object.keys(body.output_config.format.schema.properties).sort().join());
  const key = { 'fmla-wh380e': 'angela', 'fmla-wh380f': 'gloria', 'metroaccess-partb': 'harold', 'dds-medeval': 'darnell' }[form.id];
  sent.push({ form: form.id, schema: body.output_config.format.schema, text });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: body.model,
    content: [{ type: 'text', text: JSON.stringify(cannedAnswers(form.id, key, payload)) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
});

let [sw] = context.serviceWorkers(); if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const pageErrors = [];
context.on('page', p => p.on('pageerror', e => pageErrors.push(`${p.url().slice(0, 60)}: ${e.message}`)));

async function openFiller(pid) {
  const pf = await context.newPage();
  pf.on('pageerror', e => pageErrors.push(`PF: ${e.message}`));
  await pf.goto(`https://static.practicefusion.com/apps/ehr/index.html#/PF/charts/patients/${pid}/summary`);
  const btn = pf.locator('#dff-fill-form-button');
  await btn.waitFor({ timeout: 10000 });
  const [app] = await Promise.all([context.waitForEvent('page'), btn.click()]);
  await app.waitForSelector('#form-box:not(.hidden), #status.error', { timeout: 20000 });
  return { pf, app };
}
async function setAi(on) {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  if (on) {
    await opt.fill('#anthropicApiKey', 'sk-ant-test-not-a-real-key');
    await opt.click('#load-models');
    await opt.waitForFunction(() => /Key works/.test(document.getElementById('model-status').textContent), null, { timeout: 15000 });
    await opt.check('#aiEnabled');
  } else await opt.uncheck('#aiEnabled');
  await opt.click('#save'); await opt.waitForTimeout(300); await opt.close();
}

await setAi(true);
const EXPECT = { 'fmla-wh380e': ['Angela R Brooks', '10/06/2026'], 'fmla-wh380f': ['Marcus Bell', 'Gloria M Bell', '09/14/2026'], 'metroaccess-partb': ['Harold T Simmons', 'Furosemide'], 'dds-medeval': ['Darnell J Jenkins', 'Loretta Jenkins'] };
for (const [pid, chart] of Object.entries(charts)) {
  const want = FORMS.find(f => f.suggest(chart));
  console.log(`\n${chart.patient.firstName} ${chart.patient.lastName}`);
  const { pf, app } = await openFiller(pid);
  const checked = await app.getAttribute('input[name="form"]:checked', 'value').catch(() => null);
  ok(checked === want.id, `suggested form pre-selected: ${checked}`);
  const pdfTab = context.waitForEvent('page', { timeout: 30000 });
  await app.click('#generate');
  await app.waitForSelector('#result-box:not(.hidden)', { timeout: 30000 });
  await (await pdfTab).close();
  ok(/drafted by Claude/.test(await app.textContent('#ai-result')), 'AI step ran');
  const req = sent.filter(s => s.form === want.id).pop();
  ok(!JSON.stringify(req.schema).includes('anyOf'), 'request schema has no nullable (union) fields');
  ok(![chart.patient.firstName, chart.patient.lastName, chart.patient.dob].some(v => req.text.includes(v)), 'no patient identifiers sent');
  const b64 = await app.evaluate(async () => { const buf = new Uint8Array(await (await fetch(window.__lastPdf.url)).arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); });
  const bytes = Buffer.from(b64, 'base64'); writeFileSync(path.join(out, `offline-${want.id}.pdf`), bytes);
  const pdf = await PDFDocument.load(bytes);
  const values = pdf.getForm().getFields().map(f => (f.getText ? f.getText() : '') || '').join(' | ');
  ok(EXPECT[want.id].every(v => values.includes(v)), `PDF contains ${EXPECT[want.id].join(', ')}`);
  const settingsNotice = await app.locator('#missing .notice').count();
  ok(settingsNotice === 1, 'result lists the missing Settings details separately');
  await app.close(); await pf.close();
}

console.log('\nChart with no matching form, and AI off');
await setAi(false);
const pid0 = Object.keys(charts)[0];
const saved = charts[pid0];
charts[pid0] = { ...saved, encounters: saved.encounters.map(e => ({ ...e, chiefComplaint: 'Follow-up', subjective: 'Doing well.', assessment: 'Stable.', plan: 'Return in 3 months.' })), history: { ...saved.history, social: 'Lives with family.' } };
const { pf, app } = await openFiller(pid0);
ok(await app.locator('input[name="form"]:checked').count() === 0, 'no form pre-selected when none matches');
ok(await app.isDisabled('#generate'), 'Generate is disabled until a form is chosen');
ok(/No form matched/.test(await app.textContent('#form-list')), 'page says no form matched');
ok(/AI drafting is off/.test(await app.textContent('#ai-note')), 'AI-off notice shown');
await app.check('input[name="form"][value="metroaccess-partb"]');
ok(!(await app.isDisabled('#generate')), 'Generate enabled after choosing a form');
await app.close(); await pf.close();
charts[pid0] = saved;

ok(!pageErrors.length, `no JavaScript errors${pageErrors.length ? `: ${pageErrors.join(' / ')}` : ''}`);
await context.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nOffline end-to-end: all checks passed.');
process.exit(failures ? 1 : 0);
