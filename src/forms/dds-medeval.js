// DC Department on Disability Services (DDA) — Medical Evaluation Form (4 pages).
// Flat PDF: we add editable fields on top of the printed blanks. Coordinates are PDF points
// from the bottom-left of each 612 x 792 page.
import { Filler, fullName, providerInfo, us } from '../lib/pdf.js';

const allText = c => [c.history.social, c.history.developmental, ...c.encounters.flatMap(e => [e.chiefComplaint, e.plan])].join('\n');

const ETIOLOGY = { // [page, x, y] of the blank before each label
  'Down Syndrome': [1, 70, 461], 'Fragile X': [1, 70, 447], "Edward's Syndrome": [1, 70, 432], 'Prader Willi': [1, 70, 418],
  'Other genetic Syndrome': [1, 70, 402], 'Fetal Alcohol Syndrome': [1, 70, 387], 'Head Injury': [1, 70, 373],
  Rubella: [1, 263, 461], 'Other Infection': [1, 263, 447], 'Cerebral Palsy': [1, 263, 432], Autism: [1, 263, 418],
  'Febrile Illness-infancy': [1, 263, 402], 'Other/Unknown': [1, 263, 387],
};
const HABITS = { Denied: [2, 250, 335], Tobacco: [2, 328, 335], Alcohol: [2, 408, 335] };
const SUBSTANCE = { Denied: [2, 190, 309], Cocaine: [2, 275, 309], Heroin: [2, 352, 309], PCP: [2, 408, 309], Marijuana: [2, 195, 295], Other: [2, 255, 295] };
const SERVICES = { 'Occupational Therapy': 334, 'Physical Therapy': 319, 'Speech and Language': 305, Nutrition: 291, 'Skilled Nursing': 276,
  'Fitness Training': 262, 'Massage Therapy': 248, Labs: 234, Other: 220 };

export default {
  id: 'dds-medeval',
  title: 'DC DDS / DDA — Medical Evaluation Form',
  shortTitle: 'DC DDS Medical Evaluation',
  templateFile: 'DDS-Medical-Evaluation.pdf',
  sourceUrl: 'https://dds.dc.gov/sites/default/files/dc/sites/dds/publication/attachments/Medical%20Evaluation%20Form.pdf',
  note: 'Uses the most recent visit\'s vitals and exam. Attach the full lab report as the form asks.',

  suggest(chart) {
    const t = allText(chart);
    if (/\bDDS\b|\bDDA\b|ICF\/?I(I)?DD?|intellectual disabilit|developmental disabilit/i.test(t) || chart.diagnoses.some(d => /^(F7[0-9]|Q90|F84)/.test(d.icd10 || ''))) return 'Chart shows an intellectual/developmental disability or mentions DDS/ICF.';
    return null;
  },

  aiInstructions: 'This is the DC Department on Disability Services medical evaluation (annual physical / intake). Use the MOST RECENT physical-exam visit. Split the documented exam into the form\'s body systems; return null for systems not examined.',
  aiFields: {
    date_of_evaluation: { description: 'Date of the most recent physical exam visit (MM/DD/YYYY).' },
    accompanied_by: { description: 'Who accompanied the patient, e.g. "[CONTACT_1] (mother/legal guardian)". Max 45 characters.' },
    etiology_checks: { type: 'array', itemsEnum: Object.keys(ETIOLOGY), description: 'Causes associated with the intellectual/developmental disability that the chart documents.' },
    etiology_other: { description: 'If Other/Unknown: what. Max 40 characters.' },
    ppd_result: { description: 'Most recent TB test (PPD/QuantiFERON/chest X-ray) and result, e.g. "PPD 0 mm, negative". Max 45 characters.' },
    ppd_date: { description: 'Date of that TB test result (MM/DD/YYYY).' },
    mammogram: { description: 'Mammogram/sonogram result, or "N/A" for males. Max 40 characters.' },
    mammogram_date: { description: 'Mammogram date (MM/DD/YYYY).' },
    hepB_vaccinated: { enum: ['Yes', 'No'], description: 'Vaccinated against hepatitis B?' },
    hepB_date: { description: 'Year/date of hepatitis B vaccination. Max 12 characters.' },
    developmental_history: { description: 'Developmental history including when the disability was first noted and IQ testing. Max 330 characters.' },
    hpi: { description: 'Current complaints / history of present illness. Max 330 characters.' },
    past_history: { description: 'Significant past medical history incl. hospitalizations and surgeries with years. Max 330 characters.' },
    habits: { type: 'array', itemsEnum: Object.keys(HABITS), description: 'Habits: Denied, or Tobacco/Alcohol if used.' },
    substance: { type: 'array', itemsEnum: Object.keys(SUBSTANCE), description: 'Substance use: Denied, or the substances used.' },
    social_history: { description: 'Social history (living situation, day program, supports). Max 300 characters.' },
    sexual_history: { description: 'Sexual history. Max 200 characters.' },
    environmental: { description: 'Environmental concerns relevant to health (safety, supervision needs). Max 300 characters.' },
    exam_general: { description: 'General appearance / anomalies. Max 110 characters.' },
    exam_head_eyes_neck: { description: 'Head, eyes, neck. Max 100 characters.' },
    exam_ent: { description: 'Ear, nose, mouth, throat. Max 90 characters.' },
    exam_chest: { description: 'Chest wall / breasts / lungs. Max 90 characters.' },
    exam_heart: { description: 'Heart. Max 40 characters.' },
    exam_peripheral: { description: 'Peripheral vascular. Max 45 characters.' },
    exam_abdomen: { description: 'Abdomen including scars. Max 90 characters.' },
    exam_female_gu: { description: 'Female GU findings, or "N/A" for males. Max 80 characters.' },
    exam_male_gu: { description: 'Male GU findings (penis, scrotum, testes), or "N/A" for females. Max 90 characters.' },
    exam_prostate_done: { enum: ['Yes', 'No'], description: 'Was a prostate exam done (males)?' },
    exam_skin: { description: 'Skin and nails. Max 100 characters.' },
    exam_extremities: { description: 'Extremities. Max 100 characters.' },
    exam_lymph: { description: 'Lymphatics. Max 100 characters.' },
    exam_neuro: { description: 'Neurological incl. cranial nerves, balance, strength. Max 200 characters.' },
    lab_cbc: { description: 'CBC result summary. Max 45 characters.' },
    lab_cmp: { description: 'CMP result summary. Max 45 characters.' },
    lab_ua: { description: 'Urinalysis result. Max 40 characters.' },
    lab_vdrl: { description: 'VDRL/RPR result. Max 40 characters.' },
    lab_hbsag: { description: 'HBsAg result (and anti-HBs if present). Max 45 characters.' },
    lab_cholesterol: { description: 'Lipid results. Max 45 characters.' },
    lab_other: { description: 'Other relevant labs (TSH, drug levels, A1c). Max 55 characters.' },
    recommendations: { type: 'array', description: 'Up to 4 specific recommendations/plans from the note, each max 90 characters.' },
    services: { type: 'array', itemsEnum: Object.keys(SERVICES), description: 'Recommended clinical services documented in the plan (Labs if periodic labs ordered).' },
    services_labs: { description: 'If Labs: which/how often. Max 35 characters.' },
    services_other: { description: 'If Other service: what. Max 35 characters.' },
  },

  async fill({ templateBytes, chart, ai = {}, settings }) {
    const f = await Filler.open(templateBytes, this.id);
    f.header = `${this.title} — ${fullName(chart.patient)}, DOB ${us(chart.patient.dob)}`;
    const pv = providerInfo(chart, settings);
    const A = 'ai', C = 'chart', S = 'settings';
    const h = chart.history;
    const lastVisit = chart.encounters[chart.encounters.length - 1];
    // When AI is off, fall back to chart text where the chart has a matching section.
    const pick = (aiVal, chartVal) => (aiVal != null && aiVal !== '' ? [aiVal, A] : chartVal ? [chartVal, C] : [aiVal, A]);
    const T = (p, x, y, w, hgt, label, [v, src], opts = {}) => f.addText(p, x, y, w, hgt, v, { label, source: src, ...opts });
    const L = (p, baselines, label, [v, src]) => f.addLines(p, 34, baselines, 524, v, { label, source: src, size: 8.5 });
    const checks = (label, map, chosen, source) => {
      const set = new Set(chosen || []);
      for (const [k, [p, x, y]] of Object.entries(map)) f.addCheck(p, x, y, set.has(k), { label: `${label}: ${k}`, source, recordAs: false });
      f.record(label, [...set], source);
    };
    const guardian = chart.contacts.find(c => /guardian/i.test(c.relationship));

    // ---- page 1
    T(1, 76, 604, 160, 14, 'Name', [fullName(chart.patient), C]);
    T(1, 364, 604, 112, 14, 'Date of evaluation', pick(ai.date_of_evaluation, lastVisit && us(lastVisit.date)));
    T(1, 76, 576, 160, 14, 'DOB', [us(chart.patient.dob), C]);
    T(1, 350, 576, 128, 14, 'Accompanied by', [ai.accompanied_by, A]);
    T(1, 76, 548, 160, 14, 'SSN', [chart.patient.ssn, C]);
    T(1, 320, 548, 158, 14, 'Guardian', [guardian ? `${guardian.firstName} ${guardian.lastName} ${guardian.phone}`.trim() : '', C]);
    // The chart's own coded diagnosis counts even if the AI step is off or returns nothing.
    const fromChart = chart.diagnoses.some(d => d.active && /^Q90/.test(d.icd10 || '')) ? ['Down Syndrome'] : [];
    const etiology = [...new Set([...(ai.etiology_checks || []), ...fromChart])];
    checks('Etiology of disability', ETIOLOGY, etiology, (ai.etiology_checks || []).length ? A : C);
    T(1, 376, 383, 100, 13, 'Etiology: other/unknown', [ai.etiology_other, A], { optional: !(ai.etiology_checks || []).includes('Other/Unknown') });
    const dx = chart.diagnoses.filter(d => d.active).map(d => `${d.name.split(/,| \(/)[0]} (${d.icd10})`);
    [[82, 304], [82, 290], [82, 275], [306, 304], [306, 290], [306, 275]].forEach(([x, y], i) => T(1, x, y, i < 3 ? 184 : 230, 13, `Known diagnosis ${i + 1}`, [dx[i] || '', C], { size: 8.5, optional: i > 0 }));
    const abbr = s => String(s || '').replace(/Take (\d+) (tablet|capsule)s? by mouth/i, (_, n, f) => `${n} ${f === 'tablet' ? 'tab' : 'cap'} PO`)
      .replace(/twice daily/i, 'BID').replace(/three times daily/i, 'TID').replace(/once daily/i, 'daily')
      .replace(/every morning on an empty stomach/i, 'qAM, empty stomach').replace(/at bedtime/i, 'qHS').replace(/ as needed/i, ' PRN');
    const meds = chart.medications.filter(m => m.active).map(m => `${m.name.replace(/ Oral (Tablet|Capsule)/, '').replace(/\b(MG|MCG|ML|UT|UNIT)\b/g, u => u.toLowerCase())} - ${abbr(m.sig)}`);
    [214, 199, 185, 171, 156].forEach((y, i) => T(1, 82, y - 4, 184, 13, `Medication ${i + 1}`, [meds[i] || '', C], { size: 8, optional: true, minSize: 6 }));
    [214, 199, 185, 171, 156].forEach((y, i) => T(1, 310, y - 4, 226, 13, `Medication ${i + 6}`, [meds[i + 5] || '', C], { size: 8, optional: true, minSize: 6 }));
    if (meds.length > 10) f.record('Medications beyond 10 (attach list)', meds.slice(10), C);

    // ---- page 2
    const allergies = chart.allergies.filter(a => a.active).map(a => `${a.allergen}${a.reactions.length ? ` (${a.reactions.join(', ')})` : ''}`).join('; ');
    T(2, 158, 669, 240, 14, 'Allergies', [allergies, C]);
    f.addCheck(2, 470, 671, !allergies && chart.noKnownAllergies, { label: 'Allergies: None', source: C });
    T(2, 230, 631, 160, 14, 'Chest X-ray or PPD result', [ai.ppd_result, A]);
    T(2, 456, 631, 74, 14, 'PPD date', [ai.ppd_date, A]);
    T(2, 246, 594, 140, 14, 'Mammogram/sonogram results', [ai.mammogram, A]);
    T(2, 456, 594, 74, 14, 'Mammogram date', [ai.mammogram_date, A], { optional: !ai.mammogram || /n\/?a/i.test(ai.mammogram) });
    f.addCheck(2, 238, 559, ai.hepB_vaccinated === 'Yes', { label: 'Hep B vaccinated: Yes', source: A, recordAs: false });
    f.addCheck(2, 310, 559, ai.hepB_vaccinated === 'No', { label: 'Hep B vaccinated: No', source: A, recordAs: false });
    f.record('Vaccinated against hepatitis B', ai.hepB_vaccinated, A);
    T(2, 456, 557, 74, 14, 'Hep B vaccination date', [ai.hepB_date, A]);
    L(2, [520, 505, 490], 'Developmental history', pick(ai.developmental_history, h.developmental));
    L(2, [449, 434], 'Current complaints / HPI', pick(ai.hpi, lastVisit && lastVisit.subjective));
    L(2, [389, 374, 359], 'Significant past medical history', pick(ai.past_history, h.majorEvents));
    checks('Habits', HABITS, ai.habits, A);
    checks('Substance abuse', SUBSTANCE, ai.substance, A);
    L(2, [254, 240, 226], 'Social history', pick(ai.social_history, h.social));
    L(2, [185, 171, 157], 'Sexual history', [ai.sexual_history, A]);
    L(2, [116, 102, 88], 'Environmental concerns', [ai.environmental, A]);

    // ---- page 3 (vitals from the Practice Fusion flowsheet of the most recent visit)
    const v = chart.vitals.length ? chart.vitals[chart.vitals.length - 1] : {};
    const unit = (x, u) => (x == null || x === '' ? '' : `${x} ${u}`);
    T(3, 66, 638, 80, 14, 'Height', [unit(v.height_in ?? [...chart.vitals].reverse().find(x => x.height_in)?.height_in, 'in'), C]);
    T(3, 224, 638, 100, 14, 'Blood pressure', [v.bp, C]);
    T(3, 392, 638, 120, 14, 'Temperature', [unit(v.temp_f, 'F'), C]);
    T(3, 69, 610, 76, 14, 'Weight', [unit(v.weight_lb, 'lb'), C]);
    T(3, 177, 610, 140, 14, 'Pulse', [unit(v.pulse, '/min'), C]);
    T(3, 412, 610, 100, 14, 'Respiratory rate', [unit(v.resp_rate, '/min'), C]);
    T(3, 188, 588, 380, 14, 'General appearance / anomalies', [ai.exam_general, A], { size: 8.5 });
    T(3, 120, 566, 440, 14, 'Head, eyes, neck', [ai.exam_head_eyes_neck, A], { size: 8.5 });
    T(3, 158, 537, 400, 14, 'Ear, nose, mouth, throat', [ai.exam_ent, A], { size: 8.5 });
    T(3, 126, 509, 430, 14, 'Chest wall / breasts', [ai.exam_chest, A], { size: 8.5 });
    T(3, 163, 481, 140, 14, 'Heart', [ai.exam_heart, A], { size: 8.5 });
    T(3, 360, 481, 195, 14, 'Peripheral', [ai.exam_peripheral, A], { size: 8.5 });
    T(3, 165, 453, 390, 14, 'Abdomen', [ai.exam_abdomen, A], { size: 8.5 });
    T(3, 176, 380, 380, 14, 'Female GU', [ai.exam_female_gu, A], { size: 8.5 });
    T(3, 173, 293, 385, 14, 'Male GU', [ai.exam_male_gu, A], { size: 8.5 });
    f.addCheck(3, 198, 252, ai.exam_prostate_done === 'Yes', { label: 'Prostate done: Yes', source: A, recordAs: false });
    f.addCheck(3, 390, 252, ai.exam_prostate_done === 'No', { label: 'Prostate done: No', source: A, recordAs: false });
    f.record('Prostate exam done', ai.exam_prostate_done, A);
    T(3, 108, 215, 450, 14, 'Skin and nails', [ai.exam_skin, A], { size: 8.5 });
    T(3, 93, 190, 465, 14, 'Extremities', [ai.exam_extremities, A], { size: 8.5 });
    T(3, 94, 164, 465, 14, 'Lymphatics', [ai.exam_lymph, A], { size: 8.5 });
    L(3, [125, 112], 'Neurological', [ai.exam_neuro, A]);

    // ---- page 4
    T(4, 106, 661, 180, 12, 'Lab: CBC', [ai.lab_cbc, A], { size: 8 });
    T(4, 108, 647, 178, 12, 'Lab: CMP', [ai.lab_cmp, A], { size: 8 });
    T(4, 104, 633, 182, 12, 'Lab: U/A', [ai.lab_ua, A], { size: 8 });
    T(4, 115, 618, 172, 12, 'Lab: VDRL', [ai.lab_vdrl, A], { size: 8 });
    T(4, 346, 661, 210, 12, 'Lab: HBsAg', [ai.lab_hbsag, A], { size: 8 });
    T(4, 367, 647, 190, 12, 'Lab: Cholesterol', [ai.lab_cholesterol, A], { size: 8 });
    T(4, 339, 626, 218, 20, 'Lab: Other', [ai.lab_other, A], { size: 8 });
    [[80, 555], [80, 541], [80, 526], [80, 512], [310, 555], [310, 541], [310, 526], [310, 512]].forEach(([x, y], i) => T(4, x, y, i < 4 ? 212 : 236, 13, `Diagnosis ${i + 1}`, [dx[i] || '', C], { size: 8.5, optional: i > 0 }));
    const recs = ai.recommendations || [];
    [459, 437, 415, 393].forEach((y, i) => T(4, 80, y - 2, 476, 15, `Recommendation ${i + 1}`, [recs[i] || '', A], { size: 8.5, optional: i > 0 }));
    const services = ai.services || [];
    for (const [k, y] of Object.entries(SERVICES)) f.addCheck(4, 67, y, services.includes(k), { label: `Service: ${k}`, source: A, recordAs: false });
    f.record('Recommended clinical services', services, A);
    T(4, 116, 232, 198, 13, 'Service: labs (which)', [ai.services_labs, A], { size: 8.5, optional: !services.includes('Labs') });
    T(4, 140, 218, 175, 13, 'Service: other (what)', [ai.services_other, A], { size: 8.5, optional: !services.includes('Other') });
    T(4, 54, 186, 200, 14, 'Medical provider name', [pv.nameWithCreds, C]);
    f.addText(4, 462, 186, 74, 14, '', { label: 'Date (when signed)', source: 'doctor' });
    T(4, 143, 145, 320, 14, 'Provider address', [[pv.practice, pv.street, pv.cityStateZip].filter(Boolean).join(', '), C], { size: 8.5 });
    T(4, 143, 116, 215, 14, 'Provider telephone', [pv.phone, C]);
    T(4, 143, 86, 220, 14, 'Provider fax', [pv.fax, S]);
    f.record('Signature', '', 'doctor');
    return { bytes: await f.save(), rows: f.rows };
  },
};
