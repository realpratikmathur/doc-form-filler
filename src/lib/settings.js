// Doctor-level settings that Practice Fusion does not store (or that the doctor wants to override).
// Saved in chrome.storage.local on this computer only.
export const DEFAULT_SETTINGS = {
  providerName: '',        // blank = use the name from Practice Fusion
  credentials: 'MD',
  specialty: '',
  licenseNumber: '',       // e.g. "MD12345 / DC"
  npi: '',
  fax: '',
  phoneOverride: '',       // blank = Practice Fusion office phone
  aiEnabled: true,
  anthropicApiKey: '',
  model: '',               // chosen in Options from the live model list
};

export async function loadSettings() {
  const s = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
}
