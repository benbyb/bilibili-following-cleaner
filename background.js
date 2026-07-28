chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "open-dashboard") return;

  const params = new URLSearchParams({
    days: String(message.config.days),
    views: String(message.config.views),
    mode: message.config.mode,
    observationDays: String(message.config.observationDays)
  });

  chrome.tabs.create({
    url: `${chrome.runtime.getURL("dashboard.html")}?${params.toString()}`
  }).then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
