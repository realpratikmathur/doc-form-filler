// Service worker: opens the form-filler page for the Practice Fusion tab the doctor is looking at,
// keeps the toolbar badge in sync, and makes sure the "Fill a form" button is present in Practice
// Fusion tabs that were already open when the extension was installed, updated or enabled.
const CHART_RE = /#\/PF\/charts\/patients\/([0-9a-f-]{36})/i;
const PF_URLS = ['https://*.practicefusion.com/*'];

function openFiller(tabId, patientId, patientName = '') {
  const q = new URLSearchParams({ tab: String(tabId), pid: patientId || '', name: patientName });
  chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?${q}`) });
}

/** Add the button script to one tab (no-op if it is already running there). */
async function injectInto(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (e) {
    return false;   // no access to this tab (e.g. site access restricted) — Settings → Check setup explains
  }
}

/** Add the button to every open Practice Fusion tab. Returns how many tabs now have it. */
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: PF_URLS });
  let n = 0;
  for (const t of tabs) if (await injectInto(t.id)) n++;
  return { tabs: tabs.length, injected: n };
}
self.dffInjectIntoOpenTabs = injectIntoOpenTabs;   // used by tests

function updateBadge(tabId, url) {
  const onChart = CHART_RE.test(url || '');
  chrome.action.setBadgeText({ tabId, text: onChart ? 'GO' : '' });
  if (onChart) chrome.action.setBadgeBackgroundColor({ tabId, color: '#0a7a3d' });
  chrome.action.setTitle({ tabId, title: onChart ? 'Fill a form for this patient (Alt+Shift+F)' : 'Doc Form Filler: open a patient chart in Practice Fusion first' });
}

chrome.runtime.onInstalled.addListener(() => { injectIntoOpenTabs(); });
chrome.runtime.onStartup.addListener(() => { injectIntoOpenTabs(); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.url || info.status === 'complete') updateBadge(tabId, tab.url); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'open-filler' && sender.tab) openFiller(sender.tab.id, msg.patientId, msg.patientName);
  if (msg?.type === 'inject-open-tabs') { injectIntoOpenTabs().then(reply); return true; }
});

// Toolbar icon (and the Alt+Shift+F shortcut, which triggers the same action). Works even if the
// in-page button could not be added: clicking the icon grants this tab access ("activeTab").
chrome.action.onClicked.addListener(async tab => {
  const m = (tab.url || '').match(CHART_RE);
  if (m) injectInto(tab.id);
  openFiller(tab.id, m ? m[1] : '', '');
});
