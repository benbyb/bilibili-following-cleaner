// The toolbar opens the browser's own docked panel without navigating the tab.
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})
  .catch(error => console.error("无法启用侧栏入口", error.message));
