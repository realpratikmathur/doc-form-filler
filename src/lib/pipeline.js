// chart -> (de-identify -> Claude -> re-identify) -> filled, editable PDF
import { deidentify, reidentify } from './deid.js';

/**
 * @param {object} p
 * @param {object} p.form           form module from src/forms
 * @param {object} p.chart          output of extractChartInPage
 * @param {ArrayBuffer|Uint8Array} p.templateBytes  blank PDF
 * @param {object} p.settings       doctor settings
 * @param {Function} [p.askAi]      async ({form, payload}) => {answers, model}; omit to skip AI
 * @param {Function} [p.onStep]     progress callback(text)
 */
export async function generateForm({ form, chart, templateBytes, settings, askAi, onStep = () => {} }) {
  let ai = {};
  const aiInfo = { used: false, model: null, error: null, payload: null };
  if (askAi) {
    onStep('Removing names, IDs and real dates from the chart…');
    const { payload, secret, leaks } = deidentify(chart);
    aiInfo.payload = payload;
    if (leaks.length) {
      aiInfo.error = 'An identifier was still present after de-identification, so nothing was sent to Claude. Note-based fields are left blank.';
    } else {
      onStep('Asking Claude to answer the note-based questions (de-identified data only)…');
      try {
        const r = await askAi({ form, payload });
        ai = reidentify(r.answers, secret);
        Object.assign(aiInfo, { used: true, model: r.model });
      } catch (e) {
        aiInfo.error = e.message;
      }
    }
  }
  onStep('Filling the PDF…');
  const { bytes, rows } = await form.fill({ templateBytes, chart, ai, settings });
  return { bytes, rows, aiInfo };
}
