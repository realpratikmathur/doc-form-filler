// The only place anything leaves the doctor's computer: one Claude API call per form, carrying the
// DE-IDENTIFIED chart (see deid.js) and the form's question list. Answers come back as JSON that
// matches the form's schema; they are re-identified locally before being written to the PDF.
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You help a physician complete paperwork (disability, leave, and transportation forms) from the patient's chart.
The physician reviews and signs every form, so accuracy matters more than completeness.

Rules:
- Use only facts documented in the chart JSON. If the chart does not document an answer, return null for that field. Never guess or invent dates, frequencies, or findings.
- Identifiers were removed. Tokens such as [PATIENT], [CONTACT_1], [EMPLOYER], [ID_1] stand for real values: copy them exactly when you need to refer to that person or thing.
- All dates in the chart have been shifted by the same unknown offset. Use dates exactly as they appear in the chart and compute intervals from them; never adjust them toward real calendar dates. Write dates as MM/DD/YYYY.
- Write short, plain clinical phrases suitable for a form box. Respect the length guidance in each field description.
- Base functional statements (what the patient cannot do) on what the notes describe, not on general expectations for the diagnosis.`;

export function makeClient(apiKey) {
  // Runs inside the extension page on the doctor's computer; the key is stored only in this browser profile.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

/** List models the key can use, newest first (Options page dropdown). */
export async function listModels(apiKey) {
  const client = makeClient(apiKey);
  const out = [];
  for await (const m of client.models.list({ limit: 100 })) out.push({ id: m.id, name: m.display_name });
  return out;
}

/** Default model when the doctor hasn't picked one: the newest Opus-family model on the account. */
export function pickDefaultModel(models) {
  return (models.find(m => /opus/i.test(m.id)) || models[0] || {}).id || '';
}

export function toSchema(fields) {
  // Every field is nullable so the model can say "not documented" instead of guessing.
  const properties = {};
  for (const [k, f] of Object.entries(fields)) {
    const base = f.enum ? { type: 'string', enum: f.enum } : f.type === 'array' ? { type: 'array', items: { type: 'string', ...(f.itemsEnum ? { enum: f.itemsEnum } : {}) } } : { type: f.type || 'string' };
    properties[k] = { anyOf: [base, { type: 'null' }], description: f.description };
  }
  return { type: 'object', properties, required: Object.keys(fields), additionalProperties: false };
}

export class AiError extends Error {}

/**
 * Ask Claude to answer a form's note-based questions from the de-identified chart.
 * @returns {Promise<{answers: object, model: string, usage: object}>}
 */
export async function answerFormQuestions({ apiKey, model, form, payload }) {
  if (!apiKey) throw new AiError('No Anthropic API key is set (Options page).');
  if (!model) throw new AiError('No Claude model is selected (Options page).');
  const client = makeClient(apiKey);
  const supportsFallback = /opus|fable/i.test(model);
  const request = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: toSchema(form.aiFields) } },
    messages: [{
      role: 'user',
      content: `Form: ${form.title}\n${form.aiInstructions || ''}\n\nAnswer every field of the JSON schema from this de-identified chart:\n\n${JSON.stringify(payload)}`,
    }],
  };
  if (supportsFallback) Object.assign(request, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });

  let response;
  try {
    response = supportsFallback ? await client.beta.messages.create(request) : await client.messages.create(request);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiError('The Anthropic API key was rejected. Check it on the Options page.');
    if (error instanceof Anthropic.PermissionDeniedError) throw new AiError('This API key is not allowed to use the selected model.');
    if (error instanceof Anthropic.NotFoundError) throw new AiError(`Model "${model}" was not found. Pick another on the Options page.`);
    if (error instanceof Anthropic.RateLimitError) throw new AiError('Claude is rate-limiting this key right now. Wait a minute and try again.');
    if (error instanceof Anthropic.BadRequestError) throw new AiError(`Claude rejected the request: ${error.message}`);
    if (error instanceof Anthropic.APIError) throw new AiError(`Claude API error ${error.status ?? ''}: ${error.message}`);
    throw new AiError(`Could not reach Claude: ${error.message}`);
  }
  if (response.stop_reason === 'refusal') throw new AiError('Claude declined this request. Fill the note-based fields by hand.');
  if (response.stop_reason === 'max_tokens') throw new AiError('Claude ran out of output space. Try again.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let answers;
  try { answers = JSON.parse(text); } catch { throw new AiError('Claude returned an answer that was not valid JSON.'); }
  return { answers, model: response.model, usage: response.usage };
}
