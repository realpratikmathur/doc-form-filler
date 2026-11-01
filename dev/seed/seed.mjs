// Creates the synthetic (FAKE) test patients from dev/seed/patients.mjs in a Practice Fusion TEST
// account, using the same JSON calls the Practice Fusion screens make. Safe to re-run: anything that
// already exists (patient, diagnosis, medication, allergy, visit on that date) is skipped.
//
//   PF_EMAIL=... PF_PASSWORD=... node dev/seed/seed.mjs [patientKey]
//
// Never point this at a practice with real patients.
import PATIENTS from './patients.mjs';
import { launch, login, pfApi } from '../pf-session.mjs';

const only = process.argv[2];
const OFFICE_VISIT = '9381cfbf-373b-418e-812c-e44b97835be4';   // "Office Visit" encounter type (SNOMED 185349003)
const VITALS_FLOWSHEET = '1e8c370f-3988-4428-b3ee-090fa5b1dfe6';
const VITALS = {
  height_in: { s: 'b93647ab-9a2f-4006-ba72-720d551eaeb9', t: 'a56b701a-3fd3-48f8-ba8e-716f9f8aba70', loinc: '8302-2', u: '[in_i]' },
  weight_lb: { s: '18959d9e-fe5b-4087-b591-abcff9c1d436', t: 'dba559de-576e-47d8-b9b1-fdd8d58e932b', loinc: '3141-9', u: '[lb_av]' },
  bp: { s: '09566ba2-1945-4b6b-a0bd-72a732ee06fa', t: 'da78a814-9715-473b-b1f7-3645dabd487a', loinc: '55284-4', u: 'mm[Hg]' },
  temp_f: { s: 'dcbd9fcb-d862-46f8-a88b-fdebe051d0b0', t: '539d2e68-1faa-463e-ab71-adcce1a10054', loinc: '8310-5', u: '[degF]' },
  pulse: { s: 'b38d3922-52f8-434e-b0cf-5ea339fdddba', t: '6f419492-226f-47b7-ace4-686b2a3387f4', loinc: '8867-4', u: '{beats}/min' },
  rr: { s: 'fc07e055-d884-4739-b223-cd410c4f8c84', t: '160f3ac4-3d93-4f29-8266-0b3afc9b2609', loinc: '9279-1', u: '{breaths}/min' },
  o2: { s: '40aaa2b2-75ac-4a13-a17b-c26af67e1e06', t: 'c0a2e089-8e56-4eb7-8359-c82d4d09487c', loinc: '59408-5', u: '%' },
};
const iso = d => `${d}T00:00:00.000Z`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = lines => `<div class="pf-rich-text">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;

const context = await launch();
const page = context.pages()[0] || await context.newPage();
if (!await login(page)) throw new Error('Could not log in to Practice Fusion');
const api = pfApi(page);
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what} failed ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`); return r; };
const provider = await page.evaluate(() => sessionStorage.getItem('providerGuid').replace(/"/g, ''));
const facility = (await api('GET', '/PracticeEndpoint/api/v1/practice')).body.facilityGuid;
const reactions = (await api('GET', '/ClinicalEndpoint/api/v3/allergyreactions')).body.allergyReactions;

for (const P of PATIENTS.filter(p => !only || p.key === only)) {
  const d = P.demo;
  console.log(`\n=== ${d.first} ${d.last} (${P.forms.join('; ')})`);
  const search = async () => ((await api('POST', '/PatientEndpoint/api/v3/patients/search', { firstName: d.first, lastName: d.last, birthDate: d.dob })).body.patients || [])[0]?.patientPracticeGuid;
  let pid = await search();
  if (!pid) {
    must(await api('PUT', '/PatientEndpoint/api/v3/patients', {
      patient: { birthDate: d.dob, emailAddress: d.email, firstName: d.first, middleName: d.middle, lastName: d.last, gender: d.sex, isActive: true,
        isUserOfEmail: true, isUserOfMobilePhone: !!d.mobile, mobilePhone: d.mobile || '', mobilePhoneCountry: 'USA', homePhone: d.home || '', notes: d.notes || '',
        ethnicities: ['0a306a4e-6217-4a50-a47f-888c53c9b193'], races: ['f051a797-87bf-468f-99e3-217f2b5eb6dc'], raceOptions: [], birthSequence: 1, isMultipleBirth: false,
        primaryAddress: { city: d.city, country: '', moveInDate: '', moveOutDate: '', notes: '', postalCode: d.zip, state: d.state, streetAddress1: d.addr1, streetAddress2: d.addr2 || '' },
        previousAddress: { city: '', country: '', moveInDate: '', moveOutDate: '', notes: '', postalCode: '', state: '', streetAddress1: '', streetAddress2: '' } },
      patientPreferences: { medicationHistoryConsentPreference: '2', preferredPharmacy: null }, patientContacts: [],
      patientSocialHistory: { raceEthnicity: [] }, generateNewPatientRecordNumber: true,
    }), 'create patient');
    pid = await search();
    await api('POST', '/BillingEndpoint/api/v1/PatientBillingInformation', { PaymentType: 'Self Pay', Guarantor: null, patientPracticeGuid: pid, PatientId: pid });
    console.log('created patient', pid);
  } else console.log('patient exists', pid);

  // diagnoses
  const haveDx = (await api('GET', `/ClinicalEndpoint/api/v1/patients/${pid}/diagnoses?includeInactive=true`)).body.patientDiagnoses || [];
  const haveCodes = new Set(haveDx.flatMap(x => x.diagnosisCodes.map(c => c.code)));
  for (const dx of P.dx) {
    if (haveCodes.has(dx.code)) continue;
    const s = (await api('GET', `/ClinicalEndpoint/api/v4/diagnosisSearchResults?searchTerm=${encodeURIComponent(dx.code)}&mappedToCodeSystem=snomed&mappedToCodeSystem=icd9`)).body.matches || [];
    const m = s.find(x => x.diagnosisCodes.some(c => c.codeSystem === 'Icd10' && c.code === dx.code)) || s[0];
    if (!m) { console.log('!! no diagnosis match', dx.code); continue; }
    const r = await api('POST', `/ClinicalEndpoint/api/v1/patients/${pid}/diagnoses`, { acuity: dx.acuity, code: null,
      diagnosisCodes: m.diagnosisCodes.filter(c => c.codeSystem).filter((c, i, a) => a.findIndex(x => x.codeSystem === c.codeSystem) === i).map(c => ({ code: c.code, codeSystem: c.codeSystem.toUpperCase(), description: c.description })),
      isActive: true, isAcute: dx.acuity === 'Acute', isTerminal: false, name: m.preferredTerm || m.term, patientPracticeGuid: pid, startDate: iso(dx.start), stopDate: null,
      patientMedicationList: null, transcriptDiagnoses: [{ comment: null, sortOrder: null, transcriptGuid: null }] });
    console.log('dx', dx.code, r.status);
  }

  // medications
  const haveMeds = ((await api('GET', `/ClinicalEndpoint/api/v2/patients/${pid}/medications`)).body.medications || []).map(x => x.drugName.toLowerCase());
  for (const med of P.meds) {
    const s = (await api('GET', `/ClinicalEndpoint/api/v2/Drugs/Search?searchCriteria=${encodeURIComponent(med.search)}&locationCode=DC`)).body || [];
    const m = s.find(x => x.drugName.toLowerCase() === med.drug.toLowerCase()) || s.find(x => !x.isObsolete && /Oral Tablet|Oral Capsule|Inhal/.test(x.drugName)) || s[0];
    if (!m) { console.log('!! no drug match', med.search); continue; }
    if (haveMeds.includes(m.drugName.toLowerCase())) continue;
    const r = await api('POST', `/ClinicalEndpoint/api/v2/patients/${pid}/medications`, { controlledSubstanceSchedule: +m.controlledSubstanceSchedule || 0, createdByProviderGuid: null,
      createdDateTimeUtc: null, diagnosisGuid: null, doseForm: m.doseForm, doseQuantity: null, doseUnitNcitCode: null, doseQuantityUnit: null, drugName: m.drugName, genericName: m.genericName,
      isCompoundMedication: false, isGeneric: false, isMedicalSupply: false, isPending: false, lastModifiedProviderGuid: null, lastModifiedDateTimeUtc: null, medicationComment: null,
      medicationDiscontinuedReason: null, medicationGuid: null, ndc: m.ndc, patientPracticeGuid: pid, productStrength: m.productStrength, providerGuid: provider, route: m.route,
      rxNormCui: m.rxNormCui, sig: { patientDescription: med.sig, professionalDescription: med.sig }, source: null, startDateTime: `${med.start}T00:00:00Z`,
      stopDateTime: med.stop ? `${med.stop}T00:00:00Z` : null, tradeDisplayName: null, tradeName: m.tradeName, transcriptGuid: null, userGuid: null, intent: null });
    console.log('med', m.drugName, r.status);
  }

  // allergies
  const haveAl = ((await api('GET', `/ClinicalEndpoint/api/v3/patients/${pid}/allergies`)).body.patientAllergies || []).map(a => (a.class?.title || a.medication?.name || a.substance?.title || '').toLowerCase());
  for (const al of P.allergies) {
    if (haveAl.includes(al.title.toLowerCase())) continue;
    const s = (await api('GET', `/ClinicalEndpoint/api/v3/allergens/search?searchTerm=${encodeURIComponent(al.title)}&ver=3`)).body.allergens || [];
    const m = s.find(x => x.name.toLowerCase() === al.title.toLowerCase()) || s[0];
    const rx = reactions.find(x => x.title === al.reaction);
    const body = { patientPracticeGuid: pid, allergySeverityTitle: al.severity, onsetDate: null, onsetType: al.onset, comments: null, isActive: true, drugInteractionAlert: false,
      allergyReactions: rx ? [{ title: rx.title, reactionGroupTitle: rx.reactionGroupTitle, displaySequence: rx.displaySequence }] : [] };
    if (m.allergenType === 'Class') Object.assign(body, { allergenSubstanceType: 'Class', class: { title: m.name, isIngredient: m.isIngredient, rxNormCui: m.rxNormCui } });
    else Object.assign(body, { allergenSubstanceType: 'Medication', medication: { name: m.name, ndc: m.ndc, rxNormCui: m.rxNormCui, rollupRxNormCui: m.rollupRxNormCui } });
    console.log('allergy', m.name, (await api('POST', `/ClinicalEndpoint/api/v3/patients/${pid}/allergies`, body)).status);
  }

  // past medical / social / developmental history (free text)
  const pmh = (await api('GET', `/ClinicalEndpoint/api/v2/PersonalMedicalHistory/${pid}`)).body;
  must(await api('PUT', `/ClinicalEndpoint/api/v2/PersonalMedicalHistory/${pid}`, { ...pmh, patientPracticeGuid: pid, ...P.pmh }), 'history');

  // visits (SOAP notes) + vitals
  const summaries = (await api('GET', `/ChartingEndpoint/api/v4/patients/${pid}/transcriptSummaries`)).body.transcriptDisplaySummaries || [];
  for (const E of P.encounters) {
    let tid = summaries.find(x => x.dateOfServiceLocal.startsWith(E.date))?.transcriptGuid;
    if (!tid) {
      const r = must(await api('POST', `/ChartingEndpoint/api/v4/patients/${pid}/transcripts`, { encounterTypeEncounterEventTypeGuid: OFFICE_VISIT, facilityGuid: facility, dateOfServiceLocal: iso(E.date) }), 'create visit');
      tid = r.body?.transcriptGuid || r.body?.transcript?.transcriptGuid || (typeof r.body === 'string' ? r.body.replace(/"/g, '') : null);
      if (!tid) tid = ((await api('GET', `/ChartingEndpoint/api/v4/patients/${pid}/transcriptSummaries`)).body.transcriptDisplaySummaries || []).find(x => x.dateOfServiceLocal.startsWith(E.date))?.transcriptGuid;
    }
    must(await api('PATCH', `/ChartingEndpoint/api/v4/patients/${pid}/transcripts/${tid}`, { chiefComplaintNote: E.cc }), 'chief complaint');
    must(await api('PATCH', `/ChartingEndpoint/api/v4/patients/${pid}/transcripts/${tid}`, { subjectiveNote: rich(E.s), objectiveNote: rich(E.o), assessmentNote: rich(E.a), planNote: rich(E.p) }), 'note');
    const fs = (await api('GET', `/FlowsheetEndpoint/api/v1/patients/${pid}/flowsheetData/${VITALS_FLOWSHEET}?showMetric=false`)).body;
    const existing = (fs.seriesDataCollections || []).flatMap(c => c.seriesData.map(o => ({ ...o, seriesDefinitionGuid: c.seriesDefinitionGuid }))).filter(o => o.transcriptGuid === tid && o.isEditable);
    const ops = [];
    for (const [k, v] of Object.entries(E.vitals)) {
      const ex = existing.find(o => o.seriesDefinitionGuid === VITALS[k].s);
      if (ex && ex.value === String(v)) continue;
      ops.push({ ...(ex || {}), seriesDefinitionGuid: VITALS[k].s, observationTypeGuid: VITALS[k].t, eventGuid: tid, transcriptGuid: tid, eventDateTimeUtc: `${E.date}T00:00:00Z`,
        recordedByProviderGuid: provider, code: { codeSystem: 'LOINC', code: VITALS[k].loinc }, value: String(v), units: VITALS[k].u, properties: [], operationType: ex ? 'Update' : 'Insert' });
    }
    if (ops.length) must(await api('PUT', `/FlowsheetEndpoint/api/v1/patients/${pid}/flowsheetData/`, ops), 'vitals');
    console.log('visit', E.date, 'note + vitals saved');
  }

  // next of kin / guardian: entered through the Profile screen (Edit all → Add next of kin)
  for (const c of P.contacts || []) {
    const pt = (await api('GET', `/PatientEndpoint/api/v3/patients/${pid}`)).body;
    if ((pt.patientContacts || []).some(x => x.firstName === c.first && x.lastName === c.last)) continue;
    await page.evaluate(id => { location.hash = `#/PF/charts/patients/${id}/profile`; }, pid);
    await page.waitForTimeout(7000);
    await page.click('[data-element="btn-edit-all-profile"]'); await page.waitForTimeout(2000);
    await page.click('[data-element="add-next-of-kin-1"]'); await page.waitForTimeout(1500);
    await page.fill('[data-element="nok-1-first-name"]', c.first);
    await page.fill('[data-element="nok-1-last-name"]', c.last);
    const pickOption = text => page.evaluate(t => { const el = [...document.querySelectorAll('.ember-tether li, [role=option], .ember-tether a')].find(e => e.offsetParent && e.innerText.trim() === t); if (el) (el.querySelector('a') || el).click(); return !!el; }, text);
    await page.click('[data-element="nok-1-relation-dropdown"]'); await page.waitForTimeout(800);
    await pickOption(c.relationship === 'Son' ? 'Child' : c.relationship === 'Mother' ? 'Guardian' : c.relationship);
    await page.fill('[data-element="nok-1-phone"]', c.phone);
    await page.click('[data-element="nok-1-phone-type-dropdown"]'); await page.waitForTimeout(600);
    await pickOption('Cellular');
    await page.click('[data-element="btn-save-profile"]'); await page.waitForTimeout(5000);
    console.log('next of kin', c.first, c.last);
  }
}
await context.close();
console.log('\nDone.');
