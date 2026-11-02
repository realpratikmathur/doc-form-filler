// DeepSeek provider (OpenAI-format Chat Completions API at https://api.deepseek.com).
// Same contract as the Claude provider in ai.js: it receives only the DE-IDENTIFIED chart and
// returns answers for the form's questions. DeepSeek's JSON Output mode guarantees valid JSON but
// does not enforce a schema, so answers are validated locally by normalizeAnswers().
import { describeFields, normalizeAnswers } from './answers.js';
import { SYSTEM, AiError } from './ai.js';

const BASE = 'https://api.deepseek.com';

async function call(apiKey, path, init = {}) {
  let r;
  try {
    r = await fetch(`${BASE}${path}`, { ...init, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  } catch (e) {
    throw new AiError(`Could not reach DeepSeek: ${e.message}`);
  }
  if (r.ok) return r.json();
  let detail = '';
  try { const j = await r.json(); detail = (j.error && j.error.message) || JSON.stringify(j); } catch { detail = await r.text().catch(() => ''); }
  const why = { 400: 'DeepSeek rejected the request', 401: 'The DeepSeek API key was rejected. Check it on the Settings page.', 402: 'The DeepSeek account has insufficient balance.',
    422: 'DeepSeek rejected the request parameters', 429: 'DeepSeek is rate-limiting this key right now. Wait a minute and try again.',
    500: 'DeepSeek had a server error. Try again.', 503: 'DeepSeek is overloaded right now. Try again shortly.' }[r.status] || `DeepSeek API error ${r.status}`;
  throw new AiError(`${why}${detail && r.status !== 401 ? `: ${detail}` : ''}`);
}

/** Models the key can use (Settings dropdown). */
export async function listDeepSeekModels(apiKey) {
  const j = await call(apiKey, '/models', { method: 'GET' });
  return (j.data || []).map(m => ({ id: m.id, name: m.display_name || m.id }));
}

/** Default: the most capable listed model ("pro"), otherwise the first one. */
export function pickDefaultDeepSeekModel(models) {
  return (models.find(m => /pro/i.test(m.id)) || models[0] || {}).id || '';
}

export async function answerWithDeepSeek({ apiKey, model, form, payload }) {
  if (!apiKey) throw new AiError('No DeepSeek API key is set (Settings page).');
  if (!model) throw new AiError('No DeepSeek model is selected (Settings page).');
  const { lines, example } = describeFields(form.aiFields);
  const system = `${SYSTEM}

Output format: reply with ONE json object and nothing else. It must have exactly these keys:
${lines}

EXAMPLE JSON OUTPUT (shape only, values are placeholders):
${example}`;
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Form: ${form.title}\n${form.aiInstructions || ''}\n\nAnswer every key of the json object from this de-identified chart:\n\n${JSON.stringify(payload)}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 32000,
  };
  // JSON Output can occasionally come back blank; DeepSeek's docs recommend retrying.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const j = await call(apiKey, '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
    const choice = (j.choices || [])[0] || {};
    const text = ((choice.message && choice.message.content) || '').trim();
    if (choice.finish_reason === 'length') throw new AiError('DeepSeek ran out of output space. Try again.');
    if (choice.finish_reason === 'content_filter') throw new AiError('DeepSeek declined this request. Fill the note-based fields by hand.');
    if (!text) continue;
    let raw;
    try { raw = JSON.parse(text); } catch { throw new AiError('DeepSeek returned an answer that was not valid JSON.'); }
    return { answers: normalizeAnswers(form.aiFields, raw), model: j.model || model, usage: j.usage };
  }
  throw new AiError('DeepSeek returned an empty answer twice. Try again.');
}
