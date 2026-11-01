// Service worker: opens the form-filler page for the Practice Fusion tab the doctor is looking at.
const CHART_RE = /#\/PF\/charts\/patients\/([0-9a-f-]{36})/i;

function openFiller(tabId, patientId, patientName = '') {
  const q = new URLSearchParams({ tab: String(tabId), pid: patientId || '', name: patientName });
  chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?${q}`) });
}

// "Fill a form" button inside Practice Fusion
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'open-filler' && sender.tab) openFiller(sender.tab.id, msg.patientId, msg.patientName);
});

// Toolbar icon (puzzle-piece menu / pinned icon)
chrome.action.onClicked.addListener(tab => {
  const m = (tab.url || '').match(CHART_RE);
  openFiller(tab.id, m ? m[1] : '', '');
});
