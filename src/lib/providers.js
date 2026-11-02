// Which AI drafts the note-based answers. Both providers receive only the de-identified chart.
import { answerFormQuestions, listModels as listClaudeModels, pickDefaultModel as pickDefaultClaude } from './ai.js';
import { answerWithDeepSeek, listDeepSeekModels, pickDefaultDeepSeekModel } from './deepseek.js';

export const PROVIDERS = {
  anthropic: { name: 'Claude (Anthropic)', short: 'Claude', keyField: 'anthropicApiKey', modelField: 'model',
    listModels: listClaudeModels, pickDefault: pickDefaultClaude, answer: answerFormQuestions },
  deepseek: { name: 'DeepSeek', short: 'DeepSeek', keyField: 'deepseekApiKey', modelField: 'deepseekModel',
    listModels: listDeepSeekModels, pickDefault: pickDefaultDeepSeekModel, answer: answerWithDeepSeek },
};

/** The configured provider, or null when AI drafting is off or not set up. */
export function activeProvider(settings) {
  const p = PROVIDERS[settings.aiProvider] || PROVIDERS.anthropic;
  if (!settings.aiEnabled || !settings[p.keyField] || !settings[p.modelField]) return null;
  return {
    ...p,
    ask: ({ form, payload }) => p.answer({ apiKey: settings[p.keyField], model: settings[p.modelField], form, payload }),
  };
}
