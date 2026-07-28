function getCookie(name) {
  const prefix = `${name}=`;
  return document.cookie.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "request-csrf-token") return;
  // bili_jct 是网页正常取关请求使用的 CSRF 令牌；不写入扩展存储。
  sendResponse({ token: getCookie("bili_jct") });
});
