(() => {
  const platform = location.hostname === "www.douyin.com" ? "douyin"
    : location.hostname === "www.kuaishou.com" ? "kuaishou" : null;
  if (!platform) return;
  let selectedRoot = null;
  let selectedUrl = null;
  let pickerCleanup = null;
  let observer = null;
  let timer = null;
  let history = new Map();
  let revisions = 0;
  function visible(element) {
    const style = getComputedStyle(element);
    return element.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
  }
  function loadedAvatar(link) {
    // Only images contained in the exact profile link are eligible.
    for (const image of link.querySelectorAll("img")) {
      if (!visible(image) || !image.complete || !image.naturalWidth) continue;
      try {
        const url = new URL(image.currentSrc || image.src, location.href);
        if (url.protocol === "https:") return url.href;
      } catch { /* Ignore malformed/lazy placeholders. */ }
    }
    return "";
  }
  function collect() {
    if (!selectedRoot?.isConnected || selectedUrl !== location.href) {
      throw new Error("请先在当前页面选择关注列表区域；页面切换后必须重新选择。");
    }
    const records = new Map();
    const expected = platform === "douyin" ? /^\/user\/([A-Za-z0-9_-]+)\/?$/ : /^\/profile\/([A-Za-z0-9_-]+)\/?$/;
    const links = [...selectedRoot.querySelectorAll("a[href]")];
    if (selectedRoot.matches("a[href]")) links.unshift(selectedRoot);
    for (const link of links) {
      if (!visible(link)) continue;
      let url;
      try { url = new URL(link.href, location.href); } catch { continue; }
      if (url.protocol !== "https:" || url.hostname !== location.hostname) continue;
      const match = url.pathname.match(expected);
      if (!match) continue;
      const name = (link.innerText || link.getAttribute("title") || link.querySelector("img")?.alt || "").replace(/\s+/g, " ").trim();
      const id = match[1];
      const previous = records.get(id);
      const avatarUrl = loadedAvatar(link);
      if (name.length > 160) continue;
      records.set(id, {
        id, name: previous?.name || name, avatarUrl: previous?.avatarUrl || avatarUrl,
        profileUrl: `${url.origin}${url.pathname.replace(/\/$/, "")}`, platform,
        idType: platform === "douyin" ? "sec_uid" : "profile_id",
        sourceUrl: location.href, observedAt: new Date().toISOString(),
        accountStatus: "unknown", followingVerified: false
      });
    }
    for (const [id, row] of records) {
      if (!row.name) continue;
      history.set(id, { ...row, avatarUrl: row.avatarUrl || history.get(id)?.avatarUrl || "" });
    }
    return { ok: true, platform, records: [...history.values()], revisions, complete: false,
      warnings: ["仅提取所选区域当前已加载且未隐藏的主页链接。未验证它们确为你的关注，须核对所选区域。", "未自动翻页；未承诺完整名单。主页标识不等于可修改的展示账号号。", "昵称来自链接文本；状态、作品统计和取关功能尚未验证。"] };
  }
  function pick(sendResponse) {
    if (pickerCleanup) pickerCleanup();
    const notice = document.createElement("div");
    notice.textContent = "选择关注列表：将鼠标移到列表区域，滚轮上滚扩大选区、下滚缩小；点击确认，Esc 取消。请勿选推荐内容区域。";
    notice.style.cssText = "position:fixed;top:12px;left:10%;width:80%;padding:16px;background:#111;color:white;z-index:2147483647;pointer-events:none;font:16px sans-serif";
    document.documentElement.append(notice);
    let hovered = null, chosen = null, priorOutline = "", depth = 0, done = false;
    function restore() { if (chosen) chosen.style.outline = priorOutline; }
    function highlight() {
      restore(); chosen = hovered;
      for (let n = 0; n < depth && chosen?.parentElement && chosen.parentElement !== document.documentElement; n++) chosen = chosen.parentElement;
      if (chosen) { priorOutline = chosen.style.outline; chosen.style.outline = "3px solid #00aeec"; }
    }
    function move(event) { if (event.target !== hovered) { hovered = event.target; depth = 0; highlight(); } }
    function wheel(event) { event.preventDefault(); depth = Math.max(0, Math.min(12, depth + (event.deltaY < 0 ? 1 : -1))); highlight(); }
    function cleanup() {
      restore(); notice.remove(); clearTimeout(pickerDeadline);
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("wheel", wheel, true);
      pickerCleanup = null;
      if (!done) { done = true; sendResponse({ ok: false, error: "已取消选择区域。" }); }
    }
    function click(event) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!chosen) { hovered = event.target; highlight(); }
      selectedRoot = chosen; selectedUrl = location.href; done = true;
      observer?.disconnect();
      clearTimeout(timer);
      timer = null;
      history = new Map();
      revisions = 0;
      collect();
      observer = new MutationObserver(() => {
        if (timer !== null) return;
        timer = setTimeout(() => {
          timer = null;
          if (!selectedRoot?.isConnected || selectedUrl !== location.href) { observer.disconnect(); return; }
          collect(); revisions++;
        }, 100);
      });
      observer.observe(selectedRoot, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['href', 'src', 'srcset']});
      cleanup(); sendResponse({ ok: true, platform, selected: true });
    }
    function key(event) { if (event.key === "Escape") { event.preventDefault(); cleanup(); } }
    const pickerDeadline = setTimeout(cleanup, 120000);
    pickerCleanup = cleanup;
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("wheel", wheel, { capture: true, passive: false });
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.platform !== platform) return;
    if (message.type === "following-picker") { pick(sendResponse); return true; }
    if (message.type === "following-collect") {
      try { sendResponse(collect()); } catch (error) { sendResponse({ ok: false, error: error.message }); }
    }
  });
})();
