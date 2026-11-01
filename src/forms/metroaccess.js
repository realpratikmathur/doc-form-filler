// WMATA MetroAccess application, Part B (Health Care Provider Certification), pages 5-8.
// Part B is NOT a fillable PDF, so we add new editable fields on top of the printed blanks.
// Coordinates are PDF points from the bottom-left of the page (612 x 792), measured from the
// May 2024 revision (form 50.295 05/24).
import { Filler, fullName, providerInfo, us } from '../lib/pdf.js';

const allText = c => [c.history.social, ...c.encounters.flatMap(e => [e.chiefComplaint, e.plan])].join('\n');

// "q" checkbox glyphs printed on the form: [page, x, y]
const BOX = {
  htnYes: [6, 350, 744], htnNo: [6, 395, 744],
  szYes: [6, 106, 640], szNo: [6, 152, 640], szNA: [6, 191, 640],
  pcaYes: [6, 60, 588], pcaNo: [6, 106, 588],
  aidsYes: [6, 464, 553], aidsNo: [6, 509, 553],
  'Manual Wheelchair': [6, 155, 518], 'Support Cane': [6, 276, 518], 'Portable Oxygen': [6, 371, 518],
  'Power Wheelchair or Scooter': [6, 54, 502], Crutches: [6, 225, 502], Walker: [6, 297, 502], 'White Cane': [6, 359, 502], Other: [6, 54, 485],
  shortTerm: [6, 54, 432], longTerm: [6, 54, 415],
  preventYes: [6, 276, 362], preventNo: [6, 323, 362],
  medYes: [6, 54, 192], medNo: [6, 100, 192], medNA: [6, 139, 192],
  tempYes: [7, 63, 670], tempNo: [7, 109, 670],
  iceYes: [7, 63, 516], iceNo: [7, 109, 516],
  airYes: [7, 466, 379], airNo: [7, 513, 379],
};
const AIDS = ['Manual Wheelchair', 'Support Cane', 'Portable Oxygen', 'Power Wheelchair or Scooter', 'Crutches', 'Walker', 'White Cane', 'Other'];

export default {
  id: 'metroaccess-partb',
  title: 'WMATA MetroAccess — Part B, Health Care Provider Certification',
  shortTitle: 'MetroAccess (Part B)',
  templateFile: 'MetroAccess-Application.pdf',
  sourceUrl: 'https://www.wmata.com/content/dam/wmata-com/migrated-assets/service/accessibility/metro-access/upload/metroaccessapplicationfillable_accessible_hq_05-24.pdf',
  note: 'Part A (pages 1-4) is completed by the patient; this fills Part B (pages 5-8).',

  suggest(chart) {
    const t = allText(chart);
    if (/MetroAccess|paratransit/i.test(t)) return 'The notes mention MetroAccess / paratransit.';
    return null;
  },

  aiInstructions: 'This is the WMATA MetroAccess paratransit eligibility certification. Describe the FUNCTIONAL impact on using fixed-route bus and rail, based on the notes.',
  aiFields: {
    q10_bp_limit: { description: 'BP reading the applicant can safely do the functional assessment below, only if documented, e.g. "180/110". Max 90 characters.' },
    q11_seizure: { enum: ['Yes', 'No', 'N/A'], description: 'If seizure disorder: tonic-clonic seizure within the past 4 months? N/A if no seizure disorder.' },
    q12_pca: { enum: ['Yes', 'No'], description: 'Does the applicant require a Personal Care Attendant on public transportation?' },
    q13_mobility_aids: { enum: ['Yes', 'No'], description: 'Does the applicant require any mobility aid?' },
    q14_aids: { type: 'array', itemsEnum: AIDS, description: 'Mobility aids used (Walker includes rollator).' },
    q14_other: { description: 'If "Other" aid: what. Max 40 characters.' },
    q15_duration: { enum: ['Short-Term', 'Long-Term'], description: 'Short-term (likely to improve within a year) or long-term (little expectation of improvement).' },
    q16_prevents: { enum: ['Yes', 'No'], description: 'Does the disability prevent independent use of accessible Metrobus/Metrorail for some or all trips?' },
    q16_how: { description: 'HOW the condition prevents independent travel: walking distance, standing tolerance, oxygen, falls, cognition, etc. Max 480 characters.' },
    q17_side_effects: { enum: ['Yes', 'No', 'N/A'], description: 'Do medication side effects significantly hinder independent riding?' },
    q17_explain: { description: 'If yes: which medication and how. Max 300 characters.' },
    q18_temperature: { enum: ['Yes', 'No'], description: 'Do temperature extremes affect ability to ride?' },
    q18_explain: { description: 'If yes: effect and extent. Max 300 characters.' },
    q19_ice_snow: { enum: ['Yes', 'No'], description: 'Do ice and/or snow affect ability to ride?' },
    q19_explain: { description: 'If yes: effect and extent. Max 300 characters.' },
    q20_air_quality: { enum: ['Yes', 'No'], description: 'Does poor air quality affect ability to ride?' },
    q20_explain: { description: 'If yes: effect and extent (for asthma, note systemic meds or rescue inhaler use frequency). Max 320 characters.' },
    q21_other: { description: 'Other disability-related factors affecting ability to ride. Max 320 characters.' },
  },

  async fill({ templateBytes, chart, ai = {}, settings }) {
    const f = await Filler.open(templateBytes, this.id);
    f.header = `${this.title} — ${fullName(chart.patient)}, DOB ${us(chart.patient.dob)}`;
    const pv = providerInfo(chart, settings);
    const A = 'ai', C = 'chart', S = 'settings';
    // a Yes/No group = one editable checkbox per printed box, the matching one checked
    const group = (label, options, value, source) => {
      options.forEach(([opt, key]) => { const [p, x, y] = BOX[key]; f.addCheck(p, x - 0.5, y + 0.5, value === opt, { label: `${label}: ${opt}`, source, recordAs: false }); });
      f.record(label, value || '', source);
    };
    const name = fullName(chart.patient);

    // page 5 — applicant name + provider identity
    f.form.getTextField("Applicant's Name: HIPAA").setText(name);
    f.record('HIPAA authorization: applicant name', name, C);
    f.addText(5, 50, 409, 200, 14, name, { label: '(Applicant\'s name) is being referred', source: C });
    f.addText(5, 266, 364, 300, 14, pv.nameWithCreds, { label: '1. Name of health care provider', source: C });
    f.addText(5, 98, 330, 250, 14, pv.phone, { label: '2. Phone', source: C });
    f.addText(5, 202, 296, 360, 14, pv.license, { label: '3. License number / state', source: S });
    f.addText(5, 180, 262, 380, 14, pv.street, { label: '4. Street address & suite', source: C });
    f.addText(5, 135, 228, 420, 14, pv.cityStateZip, { label: '5. City, state, ZIP', source: C });
    f.addText(5, 131, 195, 420, 14, pv.specialty, { label: '6. Specialization', source: S });
    const dx = chart.diagnoses.filter(d => d.active).map(d => `${d.name} (ICD-10 ${d.icd10})`).join('; ');
    f.addText(5, 58, 136, 500, 27, dx, { label: '7. Diagnoses and codes', source: C, size: 8.5 });

    // page 6
    const htn = chart.diagnoses.some(d => d.active && /^I1[0-6]/.test(d.icd10 || '')) ? 'Yes' : 'No';
    group('9. Treating for hypertension', [['Yes', 'htnYes'], ['No', 'htnNo']], htn, C);
    f.addText(6, 58, 672, 500, 28, ai.q10_bp_limit, { label: '10. BP limit for functional assessment', source: A });
    const hasSeizureDx = chart.diagnoses.some(d => d.active && /^(G40|R56)/.test(d.icd10 || ''));
    group('11. Tonic-clonic seizure in past 4 months', [['Yes', 'szYes'], ['No', 'szNo'], ['N/A', 'szNA']], hasSeizureDx ? ai.q11_seizure : 'N/A', hasSeizureDx ? A : C);
    group('12. Requires personal care attendant', [['Yes', 'pcaYes'], ['No', 'pcaNo']], ai.q12_pca, A);
    group('13. Requires mobility aids', [['Yes', 'aidsYes'], ['No', 'aidsNo']], ai.q13_mobility_aids, A);
    const aids = ai.q14_aids || [];
    AIDS.forEach(a => { const [p, x, y] = BOX[a]; f.addCheck(p, x - 0.5, y + 0.5, aids.includes(a), { label: `14. Aid: ${a}`, source: A, recordAs: false }); });
    f.record('14. Mobility aids', aids, A);
    f.addText(6, 98, 481, 200, 13, aids.includes('Other') ? ai.q14_other : '', { label: '14. Other aid', source: A, optional: !aids.includes('Other') });
    group('15. Expected duration (initial the box)', [['Short-Term', 'shortTerm'], ['Long-Term', 'longTerm']], ai.q15_duration, A);
    group('16. Prevents independent use of bus/rail', [['Yes', 'preventYes'], ['No', 'preventNo']], ai.q16_prevents, A);
    f.addText(6, 58, 236, 500, 84, ai.q16_how, { label: '16. How the condition affects travel', source: A });
    group('17. Medication side effects hinder riding', [['Yes', 'medYes'], ['No', 'medNo'], ['N/A', 'medNA']], ai.q17_side_effects, A);
    f.addText(6, 58, 60, 500, 92, ai.q17_explain, { label: '17. Side effects explained', source: A, optional: ai.q17_side_effects !== 'Yes' });

    // page 7 — environmental factors
    group('18. Temperature extremes', [['Yes', 'tempYes'], ['No', 'tempNo']], ai.q18_temperature, A);
    f.addText(7, 66, 548, 494, 98, ai.q18_explain, { label: '18. Temperature explained', source: A, optional: ai.q18_temperature !== 'Yes' });
    group('19. Ice / snow', [['Yes', 'iceYes'], ['No', 'iceNo']], ai.q19_ice_snow, A);
    f.addText(7, 66, 394, 494, 96, ai.q19_explain, { label: '19. Ice/snow explained', source: A, optional: ai.q19_ice_snow !== 'Yes' });
    group('20. Poor air quality', [['Yes', 'airYes'], ['No', 'airNo']], ai.q20_air_quality, A);
    f.addText(7, 66, 200, 494, 104, ai.q20_explain, { label: '20. Air quality explained', source: A, optional: ai.q20_air_quality !== 'Yes' });
    f.addText(7, 66, 40, 494, 126, ai.q21_other, { label: '21. Other factors', source: A });

    // page 8 — signature page
    f.addText(8, 106, 617, 300, 14, pv.nameWithCreds, { label: 'Printed name', source: C });
    f.addText(8, 462, 617, 100, 14, '', { label: 'Date (when signed)', source: 'doctor' });
    f.record('Original hand signature', '', 'doctor');
    return { bytes: await f.save(), rows: f.rows };
  },
};
