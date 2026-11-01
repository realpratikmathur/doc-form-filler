// U.S. DOL Form WH-380-F — Certification of Health Care Provider for Family Member's Serious Health
// Condition (FMLA). The PATIENT is the family member; the EMPLOYEE is the relative who needs leave to
// care for them (e.g. Gloria Bell's son Marcus). Fillable PDF: we fill its own fields (they stay editable).
// Sections I and II (pages 1-2, employer and employee) are left for them; this fills Section III.
import { Filler, fullName, providerInfo, us } from '../lib/pdf.js';

const allText = c => [c.history.social, ...c.encounters.flatMap(e => [e.chiefComplaint, e.subjective, e.assessment, e.plan])].join('\n');
const FMLA = /\bFMLA\b|family (and )?medical leave|WH-380/i;
const CAREGIVER = /caregiver|care for (him|her|the patient)|to care for|\b(son|daughter|husband|wife|spouse|partner)\b.*\b(leave|FMLA)\b|\b(leave|FMLA)\b.*\b(son|daughter|husband|wife|spouse|partner)\b/i;
const CARE_RELATIONS = ['Child', 'Spouse', 'Parent', 'Caregiver', 'Sibling', 'Guardian', 'Mother', 'Father'];

/** The employee requesting leave: the patient's family contact (most likely caregiver first). */
export function caregiverOf(chart) {
  const ranked = [...chart.contacts].sort((a, b) => {
    const ia = CARE_RELATIONS.indexOf(a.relationship), ib = CARE_RELATIONS.indexOf(b.relationship);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return ranked[0] || null;
}

export default {
  id: 'fmla-wh380f',
  title: 'FMLA WH-380-F — family member caring for this patient',
  shortTitle: 'FMLA (WH-380-F)',
  templateFile: 'WH-380-F.pdf',
  sourceUrl: 'https://www.dol.gov/sites/dolgov/files/WHD/legacy/files/WH-380-F.pdf',
  note: 'For a relative who needs leave to care for this patient. Sections I-II are completed by the employer and the employee; this fills Section III (health care provider).',

  suggest(chart) {
    const t = allText(chart);
    if (FMLA.test(t) && CAREGIVER.test(t)) {
      const cg = caregiverOf(chart);
      return `The notes mention FMLA for a family caregiver${cg ? ` (${cg.firstName} ${cg.lastName})` : ''}.`;
    }
    return null;
  },

  aiInstructions: 'This is the U.S. Department of Labor FMLA certification for a FAMILY MEMBER\'s condition: the chart belongs to the patient, and a relative (the employee, one of the [CONTACT_n] people) needs leave to care for the patient. Questions 1-9 are about the patient\'s condition and care needs. Question 10 is about the employee\'s intermittent absences from work to provide care. For yes/no boxes return true only if the chart supports it.',
  aiFields: {
    q2_condition_start: { description: 'Approximate date the patient\'s condition started (MM/DD/YYYY).' },
    q3_duration: { description: 'Best estimate of how long the condition lasted/will last. Max 60 characters.' },
    q4_care_needed: { description: 'Type of care the patient needs from the family member: assistance with basic medical, hygienic, nutritional, safety or transportation needs, physical care, psychological comfort, supervision. Max 380 characters.' },
    q5_inpatient: { type: 'boolean', description: 'Was or will the patient be admitted overnight (hospital, hospice, residential facility incl. inpatient rehab)?' },
    q5_inpatient_status: { enum: ['has been', 'is expected to be'], description: 'If inpatient: has been or is expected to be admitted.' },
    q5_inpatient_dates: { description: 'If inpatient: admission dates. Max 60 characters.' },
    q5_incapacity_plus_treatment: { type: 'boolean', description: 'Patient incapacitated more than 3 consecutive full days plus treatment (visits or a regimen such as prescription medication/therapy)?' },
    q5_incapacity_status: { enum: ['has been', 'is expected to be'], description: 'The patient has been / is expected to be incapacitated >3 days.' },
    q5_incapacity_from: { description: 'Incapacity start date (MM/DD/YYYY).' },
    q5_incapacity_to: { description: 'Incapacity end date (MM/DD/YYYY), only if documented.' },
    q5_seen_status: { enum: ['was', 'will be'], description: 'The patient was / will be seen on the dates listed.' },
    q5_seen_dates: { description: 'Dates of visits for this condition. Max 120 characters.' },
    q5_continuing_treatment: { enum: ['has', 'has not'], description: 'Has the condition resulted in a course of continuing treatment (prescription medication or therapy)?' },
    q5_pregnancy: { type: 'boolean', description: 'Is the condition pregnancy?' },
    q5_delivery_date: { description: 'Expected delivery date if pregnancy (MM/DD/YYYY).' },
    q5_chronic: { type: 'boolean', description: 'Chronic condition requiring treatment visits at least twice a year (e.g. asthma, migraine)?' },
    q5_permanent: { type: 'boolean', description: 'Permanent/long-term incapacity requiring continuing supervision (e.g. Alzheimer\'s, terminal cancer)?' },
    q5_multiple_treatments: { type: 'boolean', description: 'Condition requiring multiple treatments (e.g. chemotherapy, restorative surgery, dialysis)?' },
    q6_medical_facts: { description: 'Brief relevant medical facts: diagnosis, key findings, functional limits, treatments. Max 420 characters.' },
    q7_planned_status: { enum: ['had', 'will have'], description: 'Planned medical treatments (scheduled visits) for the patient: had / will have.' },
    q7_planned_dates: { description: 'Planned treatment/visit dates and schedule. Max 160 characters.' },
    q8_referral_status: { enum: ['was', 'will be'], description: 'The patient was / will be referred to other providers.' },
    q8_nature: { description: 'Nature of the referral treatments, e.g. "Home physical, occupational and speech therapy". Max 70 characters.' },
    q8_begin: { description: 'Referral treatment begin date (MM/DD/YYYY).' },
    q8_end: { description: 'Referral treatment end date (MM/DD/YYYY).' },
    q8_duration: { description: 'Duration/frequency of the referral treatments, e.g. "3 visits/week for 8 weeks". Max 160 characters.' },
    q9_continuous_status: { enum: ['was', 'will be'], description: 'The patient was / will be incapacitated for a continuous period (during which the employee provides care).' },
    q9_begin: { description: 'Continuous period begin date (MM/DD/YYYY).' },
    q9_end: { description: 'Continuous period end date (MM/DD/YYYY), best estimate as documented.' },
    q10_intermittent_status: { enum: ['was', 'is', 'will be'], description: 'Is it medically necessary for the employee to be absent from work intermittently to provide care (e.g. appointments, flare-ups)?' },
    q10_frequency: { description: 'Number of episodes, e.g. "2-3" (only if documented).' },
    q10_frequency_unit: { enum: ['day', 'week', 'month'], description: 'Episodes per day / week / month.' },
    q10_duration: { description: 'Length of each episode, e.g. "1".' },
    q10_duration_unit: { enum: ['hours', 'days'], description: 'Episode length unit.' },
  },

  async fill({ templateBytes, chart, ai = {}, settings }) {
    const f = await Filler.open(templateBytes, this.id);
    f.header = `${this.title} — patient ${fullName(chart.patient)}, DOB ${us(chart.patient.dob)}`;
    const pv = providerInfo(chart, settings);
    const T = (n, v, src, opts) => f.setText(n, v, { source: src, ...opts });
    const A = 'ai', C = 'chart', S = 'settings';
    const yes = v => v === true;
    const cg = caregiverOf(chart);

    // header on pages 2-4 = the EMPLOYEE (family member who needs leave)
    T('Employee Name', cg ? `${cg.firstName} ${cg.lastName}` : '', C, { label: 'Employee name (family member requesting leave)' });
    T('Health Care Providers name Print', pv.nameWithCreds, C, { label: 'Provider name' });
    T('Health Care Providers business address', [pv.practice, pv.street, pv.cityStateZip].filter(Boolean).join(', '), C, { label: 'Provider business address' });
    T('Type of practice  Medical specialty', pv.specialty, S, { label: 'Type of practice / specialty' });
    T('Telephone', pv.phone, C, { label: 'Telephone' });
    T('Fax', pv.fax, S, { label: 'Fax' });
    T('Email', pv.email, C, { label: 'E-mail' });

    T('1 Patients Name', fullName(chart.patient), C, { label: '(1) Patient\'s name' });
    T('2 State the approximate date the condition started or will start', ai.q2_condition_start, A, { label: '(2) Condition start date' });
    T(f.fieldName(/^3 Provide your best estimate/), ai.q3_duration, A, { label: '(3) Expected duration' });
    T(f.fieldName(/^\(4For FMLA to apply/), ai.q4_care_needed, A, { label: '(4) Type of care needed' });

    f.check('Inpatient Care', yes(ai.q5_inpatient), { label: '(5) Inpatient care', source: A });
    T(f.fieldName(/^admitted for an overnight stay/), yes(ai.q5_inpatient) ? ai.q5_inpatient_dates : '', A, { label: '(5) Inpatient dates', optional: !yes(ai.q5_inpatient) });
    f.check(f.fieldName(/^Incapacity plus Treatment/), yes(ai.q5_incapacity_plus_treatment), { label: '(5) Incapacity plus treatment', source: A });
    T('consecutive full calendar days from', ai.q5_incapacity_from, A, { label: '(5) Incapacity from' });
    T('mmddyyyy to_2', ai.q5_incapacity_to, A, { label: '(5) Incapacity to' });
    // These two DOL fields each hold the boxes of two different questions (see Filler.chooseEach).
    f.chooseEach('The patient', [
      { option: yes(ai.q5_inpatient) ? ai.q5_inpatient_status : '', label: '(5) Inpatient: has been / expected', source: A, optional: !yes(ai.q5_inpatient) },
      { option: ai.q5_seen_status, label: '(5) Seen: was / will be', source: A },
    ]);
    f.chooseEach('Due to the condition, the patient', [
      { option: ai.q5_incapacity_status, label: '(5) Incapacitated: has been / expected', source: A },
      { option: ai.q7_planned_status, label: '(7) Planned treatment: had / will have', source: A },
    ]);
    T('enter dates', ai.q5_seen_dates, A, { label: '(5) Visit dates', overflowInto: 'enter dates02' });
    f.choose('The condition', ai.q5_continuing_treatment, { label: '(5) Continuing treatment', source: A });
    f.check('Pregnancy The condition is pregnancy', yes(ai.q5_pregnancy), { label: '(5) Pregnancy', source: A });
    T('List the expected delivery date', yes(ai.q5_pregnancy) ? ai.q5_delivery_date : '', A, { label: '(5) Delivery date', optional: !yes(ai.q5_pregnancy) });
    f.check(f.fieldName(/^Chronic Conditions/), yes(ai.q5_chronic), { label: '(5) Chronic condition', source: A });
    f.check(f.fieldName(/^Permanent or Long Term/), yes(ai.q5_permanent), { label: '(5) Permanent/long-term', source: A });
    f.check(f.fieldName(/^Conditions requiring Multiple/), yes(ai.q5_multiple_treatments), { label: '(5) Multiple treatments', source: A });
    const none = ![ai.q5_inpatient, ai.q5_incapacity_plus_treatment, ai.q5_pregnancy, ai.q5_chronic, ai.q5_permanent, ai.q5_multiple_treatments].some(yes);
    f.check(f.fieldName(/^None of the above/), none && Object.keys(ai).length > 0, { label: '(5) None of the above', source: A });

    T(f.fieldName(/^If needed, briefly describe/), ai.q6_medical_facts, A, { label: '(6) Other medical facts' });
    T(f.fieldName(/on the following date\(s\)1$/), ai.q7_planned_dates, A, { label: '(7) Planned treatment dates', overflowInto: f.fieldName(/on the following date\(s\)2 2$/) });
    f.choose('8Due to the condition, the patient', ai.q8_referral_status, { label: '(8) Referred: was / will be', source: A });
    T('State the nature of such treatments eg cardiologist physical therapy', ai.q8_nature, A, { label: '(8) Nature of referral' });
    T('Provide your best estimate of the beginning date', ai.q8_begin, A, { label: '(8) Referral begin' });
    T('and end date', ai.q8_end, A, { label: '(8) Referral end' });
    T(f.fieldName(/^Provide your best estimate of the duration/), ai.q8_duration, A, { label: '(8) Referral duration' });
    f.choose('9Due to the condition the patient', ai.q9_continuous_status, { label: '(9) Continuous incapacity: was / will be', source: A });
    T('Provide your best estimate of the beginning date_2', ai.q9_begin, A, { label: '(9) Continuous from' });
    T('and end date_2', ai.q9_end, A, { label: '(9) Continuous to' });
    f.choose('10 Due to the condition it', ai.q10_intermittent_status, { label: '(10) Intermittent care: was / is / will be', source: A });
    T('Over the next 6 months episodes of incapacity are estimated to occur', ai.q10_frequency, A, { label: '(10) Episodes (number)' });
    f.choose('times per', ai.q10_frequency_unit, { label: '(10) Episodes per', source: A });
    T('are likely to last approximately', ai.q10_duration, A, { label: '(10) Episode length' });
    f.choose('per episode', ai.q10_duration_unit, { label: '(10) Episode length unit', source: A });
    f.record('Signature and date', '', 'doctor');
    return { bytes: await f.save(), rows: f.rows };
  },
};
