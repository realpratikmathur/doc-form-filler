// Test double for the Claude call: returns canned answers (dev/fixtures/ai/<form>.<patient>.json),
// shifted into the same date space as the de-identified payload it receives.
import { readFileSync } from 'node:fs';
import { shiftText } from '../src/lib/deid.js';

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const shiftDeep = (o, d) => Array.isArray(o) ? o.map(x => shiftDeep(x, d)) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shiftDeep(v, d)])) : typeof o === 'string' ? shiftText(o, d) : o;

export function cannedAnswers(formId, patientKey, payload, realToday = new Date().toISOString().slice(0, 10)) {
  const url = new URL(`./fixtures/ai/${formId}.${patientKey}.json`, import.meta.url);
  const answers = JSON.parse(readFileSync(url, 'utf8'));
  return shiftDeep(answers, dayDiff(payload.today, realToday));   // payload.today is shifted by the secret offset
}
