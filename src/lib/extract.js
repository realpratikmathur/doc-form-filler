// Reads one patient's chart from Practice Fusion.
//
// IMPORTANT: this function is injected into the Practice Fusion tab with
// chrome.scripting.executeScript({ world: 'MAIN', func: extractChartInPage }), so it must be
// fully self-contained (no imports, no outer variables). It reuses the doctor's existing
// Practice Fusion session (sessionStorage) and calls the same JSON endpoints the EHR screens
// call. Nothing is sent anywhere else.
export async function extractChartInPage(pid) {
  // Errors are returned (not thrown) so the extension page gets a readable message back.
  try {
  const g = k => (sessionStorage.getItem(k) || '').replace(/^"|"$/g, '');
  if (!g('sessionGUID')) throw new Error('NOT_LOGGED_IN');
  const H = { authorization: g('sessionGUID'), 'x-ehr-user-guid': g('userGuid'), 'x-practice-guid': g('practiceGuid'), accept: 'application/json' };
  const get = async u => {
    const r = await fetch(u, { headers: H });
    if (r.status === 401 || r.status === 403) throw new Error('NOT_LOGGED_IN');
    if (!r.ok) throw new Error(`Practice Fusion returned ${r.status} for ${u.split('?')[0]}`);
    return r.json();
  };
  const strip = h => (h || '').replace(/<\/p>|<br\s*\/?>|<\/li>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{2,}/g, '\n').trim();
  const d10 = s => (s ? s.slice(0, 10) : null);
  const VITALS_FLOWSHEET = '1e8c370f-3988-4428-b3ee-090fa5b1dfe6';

  const [pt, dx, meds, al, pmh, sums, fs, practice, users] = await Promise.all([
    get(`/PatientEndpoint/api/v3/patients/${pid}`),
    get(`/ClinicalEndpoint/api/v1/patients/${pid}/diagnoses?includeInactive=true`),
    get(`/ClinicalEndpoint/api/v2/patients/${pid}/medications`),
    get(`/ClinicalEndpoint/api/v3/patients/${pid}/allergies`),
    get(`/ClinicalEndpoint/api/v2/PersonalMedicalHistory/${pid}`),
    get(`/ChartingEndpoint/api/v4/patients/${pid}/transcriptSummaries`),
    get(`/FlowsheetEndpoint/api/v1/patients/${pid}/flowsheetData/${VITALS_FLOWSHEET}?showMetric=false`).catch(() => ({})),
    get('/PracticeEndpoint/api/v1/practice'),
    get('/PracticeEndpoint/api/v1/configuratorpractice/1/users?includeOnlyActiveProviders=false'),
  ]);

  const encounters = [];
  for (const s of (sums.transcriptDisplaySummaries || []).slice(0, 25)) {
    const t = (await get(`/ChartingEndpoint/api/v4/patients/${pid}/transcripts/${s.transcriptGuid}`)).transcript;
    encounters.push({ date: d10(t.dateOfServiceLocal), type: s.transcriptTypeName, signed: s.isSigned, chiefComplaint: t.chiefComplaintNote || '',
      subjective: strip(t.subjectiveNote), objective: strip(t.objectiveNote), assessment: strip(t.assessmentNote), plan: strip(t.planNote), simpleNote: strip(t.simpleNote) });
  }
  encounters.sort((a, b) => a.date.localeCompare(b.date));

  const LOINC = { '8302-2': 'height_in', '3141-9': 'weight_lb', '39156-5': 'bmi', '55284-4': 'bp', '8310-5': 'temp_f', '8867-4': 'pulse', '9279-1': 'resp_rate', '59408-5': 'o2_sat' };
  const vit = {};
  for (const c of fs.seriesDataCollections || []) for (const o of c.seriesData) {
    const k = LOINC[o.code && o.code.code]; if (!k) continue;
    const day = d10(o.eventDateTimeUtc); vit[day] = vit[day] || { date: day };
    vit[day][k] = k === 'bp' ? o.value : Math.round(parseFloat(o.value) * 10) / 10;
  }

  const REL = { CHD: 'Child', GRD: 'Guardian', MTH: 'Mother', FTH: 'Father', SPS: 'Spouse', PAR: 'Parent', CGV: 'Caregiver', SIB: 'Sibling', BRO: 'Brother', SIS: 'Sister', FND: 'Friend', OTH: 'Other' };
  const p = pt.patient;
  const me = users.find(u => u.userGuid === g('userGuid')) || users[0] || {};
  const now = new Date().toISOString();
  return {
    extractedAt: now,
    patientId: pid,
    patient: { firstName: p.firstName, middleName: p.middleName || '', lastName: p.lastName, dob: d10(p.birthDate), sex: p.gender, prn: p.patientRecordNumber,
      ssn: p.socialSecurityNumber || '', address: p.primaryAddress || {}, homePhone: p.homePhone || '', mobilePhone: p.mobilePhone || '', email: p.emailAddress || '', chartNote: p.notes || '' },
    contacts: (pt.patientContacts || []).filter(c => !c.deleted).map(c => ({ firstName: c.firstName, lastName: c.lastName,
      relationship: REL[c.patientContactRelationshipTypeCode] || c.patientContactRelationshipTypeCode || '', phone: c.phoneNumber || '' })),
    provider: { name: [me.firstName, me.lastName].filter(Boolean).join(' '), phone: me.officePhone || practice.practicePhone || '', email: me.email || '',
      practice: practice.practiceName || '', address1: practice.address1 || '', address2: practice.address2 || '', city: practice.city || '', state: practice.state || '', zip: practice.postalCode || '' },
    diagnoses: (dx.patientDiagnoses || []).map(d => ({ icd10: ((d.diagnosisCodes || []).find(c => /icd10/i.test(c.codeSystem)) || {}).code || d.code,
      name: d.name, acuity: d.acuity, active: d.isActive, start: d10(d.startDate), stop: d10(d.stopDate) })),
    medications: (meds.medications || []).map(m => ({ name: m.drugName, sig: (m.sig && m.sig.professionalDescription) || '', start: d10(m.startDateTime), stop: d10(m.stopDateTime),
      active: !m.stopDateTime || m.stopDateTime > now })),
    allergies: (al.patientAllergies || []).map(a => ({ allergen: (a.class && a.class.title) || (a.medication && a.medication.name) || (a.substance && a.substance.title),
      severity: a.allergySeverityTitle, reactions: (a.allergyReactions || []).map(r => r.title), active: a.isActive })),
    noKnownAllergies: !!al.noKnownAllergies,
    history: { majorEvents: pmh.events || '', ongoingProblems: pmh.ongoingMedicalProblems || '', preventiveCare: pmh.preventativeCare || '', social: pmh.socialHistory || '',
      developmental: pmh.developmentalHistory || '', family: pmh.familyHealthHistory || '' },
    vitals: Object.values(vit).sort((a, b) => a.date.localeCompare(b.date)),
    encounters,
  };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}
