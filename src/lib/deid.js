// De-identify a chart before any of it is sent to an AI model, and re-identify answers locally.
//  - Names (patient, relatives/guardians, employer), street address, phones, email, record numbers
//    and insurance/ID numbers in free text are replaced by tokens like [PATIENT], [CONTACT_1], [ID_1].
//  - Date of birth is replaced by age; every other full date is shifted by a secret random number of
//    days so the model can still reason about intervals without seeing real dates.
// The token map and the shift never leave the doctor's computer.

const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DATE_US = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const pad = n => String(n).padStart(2, '0');

function shiftYMD(y, m, d, days) {
  const t = new Date(Date.UTC(+y, +m - 1, +d) + days * 864e5);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}
export function shiftText(s, days) {
  if (!days) return s;
  return s
    .replace(DATE_ISO, (_, y, m, d) => { const [Y, M, D] = shiftYMD(y, m, d, days); return `${Y}-${pad(M)}-${pad(D)}`; })
    .replace(DATE_US, (_, m, d, y) => { const [Y, M, D] = shiftYMD(y, m, d, days); return `${pad(M)}/${pad(D)}/${Y}`; });
}

const deepMap = (o, f) => Array.isArray(o) ? o.map(x => deepMap(x, f))
  : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deepMap(v, f)])) : f(o);

export function ageOn(dob, onIso) {
  const b = new Date(dob + 'T00:00:00Z'), t = new Date(onIso + 'T00:00:00Z');
  let y = t.getUTCFullYear() - b.getUTCFullYear();
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) y--;
  return y;
}

export function deidentify(chart, { shiftDays, today } = {}) {
  const days = shiftDays ?? ((Math.floor(Math.random() * 61) - 30) || 17);
  const todayIso = today || new Date().toISOString().slice(0, 10);
  const map = {};
  const repl = [];
  const add = (value, token) => {
    const v = value == null ? '' : String(value).trim();
    if (v.length > 1 && !repl.some(([x]) => x === v)) { repl.push([v, token]); if (!map[token]) map[token] = v; }
  };
  const p = chart.patient;
  add(`${p.firstName} ${p.middleName ? p.middleName + ' ' : ''}${p.lastName}`, '[PATIENT]');
  add(`${p.firstName} ${p.lastName}`, '[PATIENT]');
  add(p.lastName, '[PATIENT_LAST]');
  add(p.firstName, '[PATIENT_FIRST]');
  chart.contacts.forEach((c, i) => {
    add(`${c.firstName} ${c.lastName}`, `[CONTACT_${i + 1}]`);
    add(c.firstName, `[CONTACT_${i + 1}_FIRST]`);
    if (c.lastName !== p.lastName) add(c.lastName, `[CONTACT_${i + 1}_LAST]`);
    add(c.phone, `[PHONE_C${i + 1}]`);
  });
  add(p.homePhone, '[PHONE_1]'); add(p.mobilePhone, '[PHONE_2]');
  add(p.email, '[EMAIL]'); add(p.prn, '[MRN]'); add(p.ssn, '[SSN]');
  add(p.address && p.address.streetAddress1, '[STREET]'); add(p.address && p.address.streetAddress2, '[UNIT]');
  const free = JSON.stringify([p.chartNote, chart.history, chart.encounters, chart.contacts]);
  let n = 0;
  for (const m of free.matchAll(/\b(?:\d[A-Z]{2}\d-[A-Z]{2}\d-[A-Z]{2}\d{2}|\d[A-Z0-9]{10}|\d{8,}|\d{3}-\d{2}-\d{4})\b/g)) add(m[0], `[ID_${++n}]`);
  for (const m of free.matchAll(/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g)) add(m[0], `[PHONE_X${++n}]`);
  for (const m of free.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) add(m[0], `[EMAIL_X${++n}]`);
  for (const m of free.matchAll(/employer:\s*([^.;)\n"\\]+)/gi)) add(m[1].trim(), '[EMPLOYER]');
  repl.sort((a, b) => b[0].length - a[0].length);

  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rules = repl.map(([v, t]) => [new RegExp(`(^|[^A-Za-z0-9])${escapeRe(v)}(?=$|[^A-Za-z0-9])`, 'g'), t]);
  const scrub = s => {
    if (typeof s !== 'string') return s;
    for (const [re, t] of rules) s = s.replace(re, (_, pre) => pre + t);
    return shiftText(s, days);
  };
  const payload = deepMap({
    today: todayIso,
    patient: { age: ageOn(p.dob, todayIso), sex: p.sex, chartNote: p.chartNote },
    contacts: chart.contacts.map((c, i) => ({ who: `[CONTACT_${i + 1}]`, relationship: c.relationship })),
    diagnoses: chart.diagnoses, medications: chart.medications, allergies: chart.allergies, noKnownAllergies: chart.noKnownAllergies,
    history: chart.history, vitals: chart.vitals, encounters: chart.encounters,
  }, scrub);

  const text = JSON.stringify(payload);
  const leaks = [...Object.values(map), p.dob].filter(v => v && new RegExp(`(^|[^A-Za-z0-9])${escapeRe(v)}($|[^A-Za-z0-9])`).test(text));
  return { payload, secret: { map, shiftDays: days }, leaks };
}

export function reidentify(obj, { map, shiftDays }) {
  const tokens = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  return deepMap(obj, s => {
    if (typeof s !== 'string') return s;
    s = shiftText(s, -shiftDays);
    for (const [t, v] of tokens) s = s.split(t).join(v);
    return s;
  });
}
