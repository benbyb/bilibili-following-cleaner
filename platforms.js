/* Read-only adapters. Profile URL identifiers are not display handles. */
globalThis.PlatformAdapters = Object.freeze({
  definitions: Object.freeze({
    douyin: { label: "抖音", home: "https://www.douyin.com/", idType: "主页标识（sec_uid，非抖音号）" },
    kuaishou: { label: "快手", home: "https://www.kuaishou.com/", idType: "主页标识（非已验证的数字 UID）" }
  }),
  async pick(tabId, platform) {
    return this.request(tabId, { type: "following-picker", platform });
  },
  async collect(tabId, platform) {
    return this.request(tabId, { type: "following-collect", platform });
  },
  async request(tabId, message) {
    if (!this.definitions[message.platform]) throw new Error("不支持的平台。");
    let result;
    try { result = await chrome.tabs.sendMessage(tabId, message); }
    catch { throw new Error("无法连接页面。更新扩展后，请刷新目标网页，再重新选择关注列表区域。"); }
    if (!result?.ok) throw new Error(result?.error || "页面没有返回有效结果。");
    return result;
  }
});
