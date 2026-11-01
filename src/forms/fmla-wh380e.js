// U.S. DOL Form WH-380-E — Certification of Health Care Provider for Employee's Serious Health
// Condition (FMLA). Fillable PDF: we fill its own fields, which stay editable.
import { Filler, fullName, providerInfo, us } from '../lib/pdf.js';

const allText = c => [c.history.social, ...c.encounters.flatMap(e => [e.chiefComplaint, e.subjective, e.assessment, e.plan])].join('\n');

export default {
  id: 'fmla-wh380e',
  title: 'FMLA WH-380-E — employee\'s own serious health condition',
  shortTitle: 'FMLA (WH-380-E)',
  templateFile: 'WH-380-E.pdf',
  sourceUrl: 'https://www.dol.gov/sites/dolgov/files/WHD/legacy/files/WH-380-E.pdf',
  note: 'Section I is completed by the employer; this fills Section II (health care provider).',

  suggest(chart) {
    const t = allText(chart);
    const caregiverCase = /caregiver|to care for|care for (him|her|his|the patient)/i.test(t);
    if (/\bFMLA\b|family (and )?medical leave|WH-380/i.test(t) && !caregiverCase) return 'The notes mention FMLA paperwork.';
    if (/off work|unable to work|return to work/i.test(t) && !caregiverCase) return 'The notes mention time off work.';
    return null;
  },

  aiInstructions: 'This is the U.S. Department of Labor FMLA certification for the patient\'s OWN condition. Answer as the treating physician would, from the chart. For yes/no boxes return true only if the chart supports it.',
  aiFields: {
    q1_condition_start: { description: 'Approximate date the condition started (MM/DD/YYYY).' },
    q2_duration: { description: 'Best estimate of how long the condition lasted/will last, e.g. "About 3 months (MM/DD/YYYY to MM/DD/YYYY)". Max 60 characters.' },
    q3_inpatient: { type: 'boolean', description: 'Was or will the patient be admitted overnight (hospital, hospice, residential facility) for this condition?' },
    q3_inpatient_status: { enum: ['has been', 'is expected to be'], description: 'If inpatient: has been or is expected to be admitted.' },
    q3_inpatient_dates: { description: 'If inpatient: admission date(s). Max 50 characters.' },
    q3_incapacity_plus_treatment: { type: 'boolean', description: 'Incapacity of more than 3 consecutive full days plus treatment (visits or a regimen such as prescription medication/therapy)?' },
    q3_incapacity_status: { enum: ['has been', 'is expected to be'], description: 'The patient has been / is expected to be incapacitated >3 days.' },
    q3_incapacity_from: { description: 'Incapacity start date (MM/DD/YYYY).' },
    q3_incapacity_to: { description: 'Incapacity end date (MM/DD/YYYY), best estimate.' },
    q3_seen_status: { enum: ['was', 'will be'], description: 'The patient was / will be seen on the dates listed.' },
    q3_seen_dates: { description: 'Dates of visits for this condition, e.g. "10/07/2026 and 10/21/2026; follow-up in about 4 weeks". Max 120 characters.' },
    q3_continuing_treatment: { enum: ['has', 'has not'], description: 'Has the condition resulted in a course of continuing treatment (prescription medication other than OTC, or therapy requiring special equipment)?' },
    q3_pregnancy: { type: 'boolean', description: 'Is the condition pregnancy?' },
    q3_delivery_date: { description: 'Expected delivery date if pregnancy (MM/DD/YYYY).' },
    q3_chronic: { type: 'boolean', description: 'Chronic condition requiring treatment visits at least twice a year (e.g. asthma, migraine)?' },
    q3_permanent: { type: 'boolean', description: 'Permanent/long-term condition requiring continuing supervision (e.g. Alzheimer\'s, terminal cancer)?' },
    q3_multiple_treatments: { type: 'boolean', description: 'Condition requiring multiple treatments (e.g. chemotherapy, restorative surgery, dialysis)?' },
    q4_medical_facts: { description: 'Brief relevant medical facts: key findings/imaging, functional limits, treatments. Max 420 characters.' },
    q5_planned_status: { enum: ['had', 'will have'], description: 'Planned medical treatments (scheduled visits): had / will have.' },
    q5_planned_dates: { description: 'Planned treatment/visit dates and schedule. Max 160 characters.' },
    q6_referral_status: { enum: ['was', 'will be'], description: 'Was / will be referred to other providers.' },
    q6_nature: { description: 'Nature of the referral treatments, e.g. "Physical therapy; orthopedic spine surgery". Max 70 characters.' },
    q6_begin: { description: 'Referral treatment begin date (MM/DD/YYYY).' },
    q6_end: { description: 'Referral treatment end date (MM/DD/YYYY).' },
    q6_duration: { description: 'Duration of referral treatments incl. recovery, e.g. "PT 2 visits/week for 6 weeks, ~1.5 h each". Max 160 characters.' },
    q7_reduced_from: { description: 'Reduced work schedule from (MM/DD/YYYY), only if documented.' },
    q7_reduced_to: { description: 'Reduced work schedule to (MM/DD/YYYY).' },
    q7_reduced_schedule: { description: 'Reduced schedule the employee can work, e.g. "4 hours/day, up to 20 hours/week; no lifting over 20 lb". Max 110 characters.' },
    q8_continuous_status: { enum: ['was', 'will be'], description: 'Continuous incapacity: was / will be.' },
    q8_begin: { description: 'Continuous incapacity begin date (MM/DD/YYYY).' },
    q8_end: { description: 'Continuous incapacity end date (MM/DD/YYYY).' },
    q9_intermittent_status: { enum: ['was', 'is', 'will be'], description: 'Intermittent absence (flare-ups): was / is / will be medically necessary.' },
    q9_frequency: { description: 'Number of episodes, e.g. "2" (only if documented).' },
    q9_frequency_unit: { enum: ['day', 'week', 'month'], description: 'Episodes per day / week / month.' },
    q9_duration: { description: 'Length of each episode, e.g. "1-2".' },
    q9_duration_unit: { enum: ['hours', 'days'], description: 'Episode length unit.' },
    q10_status: { enum: ['was not able', 'is not able', 'will not be able'], description: 'Ability to perform essential job functions.' },
    q10_functions: { description: 'At least one essential job function the employee cannot perform, from the documented occupation. Max 200 characters.' },
  },

  async fill({ templateBytes, chart, ai = {}, settings }) {
    const f = await Filler.open(templateBytes, this.id);
    f.header = `${this.title} — ${fullName(chart.patient)}, DOB ${us(chart.patient.dob)}`;
    const pv = providerInfo(chart, settings);
    const T = (n, v, src, opts) => f.setText(n, v, { source: src, ...opts });
    const A = 'ai', C = 'chart', S = 'settings';
    const yes = v => v === true;

    T('Employee Name', fullName(chart.patient), C, { label: 'Employee name' });
    T('Health Care Providers name Print', pv.nameWithCreds, C, { label: 'Provider name' });
    T('Health Care Providers business address', [pv.practice, pv.street, pv.cityStateZip].filter(Boolean).join(', '), C, { label: 'Provider business address' });
    T('Type of practice  Medical specialty', pv.specialty, S, { label: 'Type of practice / specialty' });
    T('Telephone', pv.phone, C, { label: 'Telephone' });
    T('Fax', pv.fax, S, { label: 'Fax' });
    T('Email', pv.email, C, { label: 'E-mail' });

    T('1 State the approximate date the condition started or will start', ai.q1_condition_start, A, { label: '(1) Condition start date' });
    T('2 Provide your best estimate of how long the condition lasted or will last', ai.q2_duration, A, { label: '(2) Expected duration' });
    f.check('3Inpatient Care', yes(ai.q3_inpatient), { label: '(3) Inpatient care', source: A });
    f.choose('The patient', yes(ai.q3_inpatient) ? ai.q3_inpatient_status : null, { label: '(3) Inpatient: has been / expected', source: A, optional: !yes(ai.q3_inpatient) });
    T(f.fieldName(/^admitted for an overnight stay/), yes(ai.q3_inpatient) ? ai.q3_inpatient_dates : '', A, { label: '(3) Inpatient dates', optional: !yes(ai.q3_inpatient) });
    f.check('Incapacity plus Treatment', yes(ai.q3_incapacity_plus_treatment), { label: '(3) Incapacity plus treatment', source: A });
    f.choose('Due to the condition, the patient', ai.q3_incapacity_status, { label: '(3) Incapacitated: has been / expected', source: A });
    T('consecutive full calendar days from', ai.q3_incapacity_from, A, { label: '(3) Incapacity from' });
    T('mmddyyyy to_2', ai.q3_incapacity_to, A, { label: '(3) Incapacity to' });
    f.choose('The patient2', ai.q3_seen_status, { label: '(3) Seen: was / will be', source: A });
    T('will be seen on the following dates', ai.q3_seen_dates, A, { label: '(3) Visit dates', overflowInto: 'will be seen on the following dates2' });
    f.choose('The condition', ai.q3_continuing_treatment, { label: '(3) Continuing treatment', source: A });
    f.check('Pregnancy The condition is pregnancy', yes(ai.q3_pregnancy), { label: '(3) Pregnancy', source: A });
    T('List the expected delivery date', yes(ai.q3_pregnancy) ? ai.q3_delivery_date : '', A, { label: '(3) Delivery date', optional: !yes(ai.q3_pregnancy) });
    f.check(f.fieldName(/asthma, migraine/), yes(ai.q3_chronic), { label: '(3) Chronic condition', source: A });
    f.check(f.fieldName(/Alzheimer/), yes(ai.q3_permanent), { label: '(3) Permanent/long-term', source: A });
    f.check(f.fieldName(/chemotherapy/), yes(ai.q3_multiple_treatments), { label: '(3) Multiple treatments', source: A });
    const none = ![ai.q3_inpatient, ai.q3_incapacity_plus_treatment, ai.q3_pregnancy, ai.q3_chronic, ai.q3_permanent, ai.q3_multiple_treatments].some(yes);
    f.check(f.fieldName(/^None of the above/), none && Object.keys(ai).length > 0, { label: '(3) None of the above', source: A });

    T(f.fieldName(/^If needed, briefly describe/), ai.q4_medical_facts, A, { label: '(4) Other medical facts' });
    f.choose('Due to the condition the patient', ai.q5_planned_status, { label: '(5) Planned treatment: had / will have', source: A });
    T('planned medical treatment(s) (scheduled medical visits)1', ai.q5_planned_dates, A, { label: '(5) Planned treatment dates', overflowInto: 'planned medical treatment(s) (scheduled medical visits)2' });
    f.choose('6Due to the condition the patient', ai.q6_referral_status === 'will be' ? 'will have' : ai.q6_referral_status, { label: '(6) Referred: was / will be', source: A });
    T('State the nature of such treatments eg cardiologist physical therapy', ai.q6_nature, A, { label: '(6) Nature of referral' });
    T('Provide your best estimate of the beginning date', ai.q6_begin, A, { label: '(6) Referral begin' });
    T('end date (mm/dd/yyyy)', ai.q6_end, A, { label: '(6) Referral end' });
    T(f.fieldName(/^Provide your best estimate of the duration/), ai.q6_duration, A, { label: '(6) Referral duration' });
    T('Provide your best estimate of the reduced schedule the employee is able to work From', ai.q7_reduced_from, A, { label: '(7) Reduced schedule from' });
    T('to (mm/dd/yyyy)', ai.q7_reduced_to, A, { label: '(7) Reduced schedule to' });
    T('Enter when the employee is able to work eg 5 hoursday up to 25 hours a week', ai.q7_reduced_schedule, A, { label: '(7) Reduced schedule' });
    f.choose('8Due to the condition the patient', ai.q8_continuous_status, { label: '(8) Continuous incapacity: was / will be', source: A });
    T('Provide your best estimate of the beginning date_2', ai.q8_begin, A, { label: '(8) Continuous from' });
    T('mmddyyyy and end date_2', ai.q8_end, A, { label: '(8) Continuous to' });
    f.choose('9Due to the condition, it', ai.q9_intermittent_status, { label: '(9) Intermittent: was / is / will be', source: A });
    T('Over the next 6 months episodes of incapacity are estimated to occur', ai.q9_frequency, A, { label: '(9) Episodes (number)' });
    f.choose('times per', ai.q9_frequency_unit, { label: '(9) Episodes per', source: A });
    T('are likely to last approximately', ai.q9_duration, A, { label: '(9) Episode length' });
    f.choose('per episode', ai.q9_duration_unit, { label: '(9) Episode length unit', source: A });
    f.choose('10 Due to the condition the employee', ai.q10_status, { label: '(10) Job functions: not able', source: A });
    T('Identify at least one essential job function the employee is not able to perform:', ai.q10_functions, A, { label: '(10) Essential job functions' });
    f.record('Signature and date', '', 'doctor');
    return { bytes: await f.save(), rows: f.rows };
  },
};
