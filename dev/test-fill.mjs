// Offline test: fills every form from the synthetic fixture charts (with and without AI) and checks
// that (1) nothing identifying reaches the AI, (2) the AI schema is valid for structured outputs,
// (3) values land in the PDF with real dates restored, and (4) every output field is EDITABLE.
// Run: npm run build && npm test     (writes PDFs to dev/out/)
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { FORMS } from '../src/forms/index.js';
import { generateForm } from '../src/lib/pipeline.js';
import { toSchema } from '../src/lib/ai.js';
import { cannedAnswers } from './mock-ai.mjs';

const CASES = [['fmla-wh380e', 'angela'], ['metroaccess-partb', 'harold'], ['dds-medeval', 'darnell']];
const SETTINGS = { credentials: 'MD', specialty: 'Internal Medicine', licenseNumber: 'MD-0000000 / DC (example)', npi: '', fax: '(301) 555-0100', providerName: '', phoneOverride: '' };
const here = new URL('.', import.meta.url);
const out = new URL('./out/', here);
mkdirSync(out, { recursive: true });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

function checkSchema(schema, path = 'root') {
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) throw new Error(`${path}: additionalProperties must be false`);
    const keys = Object.keys(schema.properties || {});
    if (keys.some(k => !schema.required.includes(k))) throw new Error(`${path}: every property must be required`);
    keys.forEach(k => checkSchema(schema.properties[k], `${path}.${k}`));
  }
  for (const sub of schema.anyOf || []) checkSchema(sub, path);
  if (schema.items) checkSchema(schema.items, `${path}[]`);
  for (const bad of ['minimum', 'maximum', 'minLength', 'maxLength']) if (bad in schema) throw new Error(`${path}: ${bad} not supported`);
}

for (const [formId, key] of CASES) {
  const form = FORMS.find(f => f.id === formId);
  const chart = JSON.parse(readFileSync(new URL(`./fixtures/charts/${key}.json`, here), 'utf8'));
  const tpl = new URL(`../.cache/forms/${form.templateFile}`, here);
  if (!existsSync(tpl)) { console.error(`Missing ${tpl.pathname} — run "npm run build" first.`); process.exit(1); }
  const templateBytes = readFileSync(tpl);
  console.log(`\n${form.shortTitle} — ${chart.patient.firstName} ${chart.patient.lastName}`);

  // schema + fixture keys
  try { checkSchema(toSchema(form.aiFields)); ok(true, 'AI JSON schema meets structured-output rules'); } catch (e) { ok(false, e.message); }
  const fixtureKeys = Object.keys(JSON.parse(readFileSync(new URL(`./fixtures/ai/${formId}.${key}.json`, here), 'utf8')));
  const schemaKeys = Object.keys(form.aiFields);
  ok(fixtureKeys.sort().join() === schemaKeys.sort().join(), 'fixture answers cover exactly the schema fields');
  ok(form.suggest(chart), `form is suggested for this chart ("${form.suggest(chart)}")`);

  for (const mode of ['ai', 'no-ai']) {
    let sentPayload = null;
    const askAi = mode === 'ai' ? async ({ payload }) => { sentPayload = payload; return { answers: cannedAnswers(formId, key, payload), model: 'mock' }; } : null;
    const { bytes, rows, aiInfo } = await generateForm({ form, chart, templateBytes, settings: SETTINGS, askAi });
    writeFileSync(new URL(`${formId}-${key}-${mode}.pdf`, out), bytes);

    if (mode === 'ai') {
      const text = JSON.stringify(sentPayload);
      const p = chart.patient;
      const identifiers = [p.firstName, p.lastName, p.dob, p.prn, p.email, p.homePhone, p.mobilePhone, p.address.streetAddress1, ...chart.contacts.flatMap(c => [c.firstName, c.lastName, c.phone])].filter(Boolean);
      const leaked = identifiers.filter(v => new RegExp(`(^|[^A-Za-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`).test(text));
      ok(aiInfo.used && !leaked.length, `payload sent to AI contains no identifiers${leaked.length ? ` (LEAKED: ${leaked.join(', ')})` : ''}`);
      ok(!/Medicaid ID: \d|MBI: \d/.test(text), 'insurance numbers are tokenized');
    }

    // Re-open the PDF: fields must exist, be editable, and hold the expected values.
    const pdf = await PDFDocument.load(bytes);
    const fields = pdf.getForm().getFields();
    const readOnly = fields.filter(fl => fl.isReadOnly());
    ok(fields.length > 20 && readOnly.length === 0, `[${mode}] ${fields.length} form fields, all editable`);
    const values = rows.filter(r => r.value).length;
    ok(values >= rows.length * (mode === 'ai' ? 0.75 : 0.25), `[${mode}] ${values} of ${rows.length} entries filled; ${rows.filter(r => r.missing).length} left blank for review`);
    // prove editability: change a text field and save again
    const tf = fields.find(fl => fl.constructor.name === 'PDFTextField');
    tf.setText('edited by doctor'); const again = await PDFDocument.load(await pdf.save());
    ok(again.getForm().getTextField(tf.getName()).getText() === 'edited by doctor', `[${mode}] a field was edited and re-saved`);
    if (mode === 'ai') {
      const all = rows.map(r => r.value).join(' | ');
      const expect = { 'fmla-wh380e': ['Angela R Brooks', '10/06/2026', '11/30/2026', '10/26/2026'], 'metroaccess-partb': ['Harold T Simmons', 'Walker; Portable Oxygen', 'Long-Term'],
        'dds-medeval': ['Darnell J Jenkins', '05/02/1996', 'Loretta Jenkins', '10/20/2026', '10/22/2026', '61 in', '118/76'] }[formId];
      const missingVals = expect.filter(v => !all.includes(v));
      ok(!missingVals.length, `real names and real dates restored in the PDF${missingVals.length ? ` (missing: ${missingVals.join(', ')})` : ''}`);
    }
  }
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed. PDFs in dev/out/');
process.exit(failures ? 1 : 0);
