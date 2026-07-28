const API_ORIGIN = "https://api.bilibili.com";
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

const elements = {
  ruleSummary: document.querySelector("#rule-summary"),
  status: document.querySelector("#status"),
  progress: document.querySelector("#progress"),
  followingCount: document.querySelector("#following-count"),
  scannedCount: document.querySelector("#scanned-count"),
  candidateCount: document.querySelector("#candidate-count"),
  selectedCount: document.querySelector("#selected-count"),
  results: document.querySelector("#results"),
  empty: document.querySelector("#empty"),
  onlyCandidates: document.querySelector("#only-candidates"),
  onlySelected: document.querySelector("#only-selected"),
  search: document.querySelector("#search"),
  selectAll: document.querySelector("#select-all"),
  selectVisible: document.querySelector("#select-visible"),
  clearSelection: document.querySelector("#clear-selection"),
  rescan: document.querySelector("#rescan"),
  export: document.querySelector("#export"),
  unfollow: document.querySelector("#unfollow")
};

let config = readConfigFromUrl();
let records = [];
let followingCount = 0;
let scanRunning = false;

function readConfigFromUrl() {
  const query = new URLSearchParams(location.search);
  const value = (key, fallback) => query.has(key) ? Number(query.get(key)) : fallback;
  const mode = query.get("mode") === "all" ? "all" : "any";
  return {
    days: clampInteger(value("days", 30), 1, 3650, 30),
    views: clampInteger(value("views", 1000), 0, Number.MAX_SAFE_INTEGER, 1000),
    observationDays: clampInteger(value("observationDays", 7), 0, 365, 7),
    mode
  };
}

function clampInteger(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function setStatus(message, progress = "") {
  elements.status.textContent = message;
  elements.progress.textContent = progress;
}

function updateRuleSummary() {
  const modeText = config.mode === "all" ? "同时满足两项" : "满足任一项";
  elements.ruleSummary.textContent = `规则：超过 ${config.days} 天未投稿；或最近视频播放量低于 ${formatNumber(config.views)}（仅统计发布满 ${config.observationDays} 天的视频）。当前为“${modeText}”。`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(timestamp));
}

function daysSince(timestamp) {
  return (Date.now() - timestamp) / 86_400_000;
}

function getVisibleRecords() {
  const searchTerm = elements.search.value.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (elements.onlyCandidates.checked && !record.candidate) return false;
    if (elements.onlySelected.checked && !record.selected) return false;
    if (!searchTerm) return true;
    const haystack = [record.name, record.mid, record.latest?.title, record.status]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return haystack.includes(searchTerm);
  });
}

function updateSummary() {
  const candidates = records.filter((record) => record.candidate).length;
  const selected = records.filter((record) => record.selected).length;
  elements.followingCount.textContent = followingCount ? formatNumber(followingCount) : "—";
  elements.scannedCount.textContent = formatNumber(records.length);
  elements.candidateCount.textContent = formatNumber(candidates);
  elements.selectedCount.textContent = formatNumber(selected);
  elements.unfollow.disabled = scanRunning || selected === 0;
}

function createLink(text, href, className = "") {
  const link = document.createElement("a");
  link.textContent = text;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  if (className) link.className = className;
  return link;
}

function createBadge(text, className = "") {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = text;
  return badge;
}

function renderResults() {
  const visibleRecords = getVisibleRecords();
  elements.results.replaceChildren();
  elements.empty.hidden = visibleRecords.length > 0;
  elements.empty.textContent = records.length
    ? "没有符合当前显示条件的记录。"
    : "尚无结果。点击“重新扫描”开始。";

  for (const record of visibleRecords) {
    const row = document.createElement("tr");
    const checkboxCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(record.selected);
    checkbox.disabled = !record.candidate || Boolean(record.unfollowResult);
    checkbox.setAttribute("aria-label", `选择 ${record.name}`);
    checkbox.addEventListener("change", () => {
      record.selected = checkbox.checked;
      saveSnapshot();
      updateSummary();
      updateSelectAllState();
    });
    checkboxCell.append(checkbox);
    row.append(checkboxCell);

    const profileCell = document.createElement("td");
    const profile = document.createElement("div");
    profile.className = "profile";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = (record.name || "?").slice(0, 1);
    if (record.face) {
      const image = document.createElement("img");
      image.src = record.face.replace(/^http:/, "https:");
      image.alt = "";
      image.addEventListener("error", () => image.remove());
      avatar.replaceChildren(image);
    }
    const profileText = document.createElement("div");
    profileText.append(createLink(record.name || `UID ${record.mid}`, `https://space.bilibili.com/${record.mid}`));
    const uid = document.createElement("div");
    uid.className = "uid";
    uid.textContent = `UID: ${record.mid}`;
    profileText.append(uid);
    profile.append(avatar, profileText);
    profileCell.append(profile);
    row.append(profileCell);

    const videoCell = document.createElement("td");
    if (record.latest?.url) {
      videoCell.append(createLink(record.latest.title || "未命名视频", record.latest.url, "video-link"));
    } else {
      videoCell.textContent = "—";
    }
    row.append(videoCell);

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(record.latest?.publishedAt);
    if (record.latest?.publishedAt) {
      const detail = document.createElement("div");
      detail.className = "muted";
      detail.textContent = `约 ${Math.floor(daysSince(record.latest.publishedAt))} 天前`;
      dateCell.append(detail);
    }
    row.append(dateCell);

    const viewsCell = document.createElement("td");
    viewsCell.textContent = record.latest ? formatNumber(record.latest.views) : "—";
    row.append(viewsCell);

    const reasonCell = document.createElement("td");
    const reasons = document.createElement("div");
    reasons.className = "reasons";
    if (record.reasons.length) {
      record.reasons.forEach((reason) => reasons.append(createBadge(reason)));
    } else {
      reasons.append(createBadge(record.status || "未命中", "status"));
    }
    reasonCell.append(reasons);
    row.append(reasonCell);

    const resultCell = document.createElement("td");
    if (record.unfollowResult?.ok) {
      resultCell.append(createBadge("已取关", "success"));
    } else if (record.unfollowResult?.error) {
      resultCell.append(createBadge(`失败：${record.unfollowResult.error}`, "failure"));
    } else {
      resultCell.append(createBadge("未操作", "status"));
    }
    row.append(resultCell);
    elements.results.append(row);
  }

  updateSummary();
  updateSelectAllState();
}

function updateSelectAllState() {
  const selectable = getVisibleRecords().filter((record) => record.candidate && !record.unfollowResult);
  elements.selectAll.checked = selectable.length > 0 && selectable.every((record) => record.selected);
  elements.selectAll.indeterminate = selectable.some((record) => record.selected) && !elements.selectAll.checked;
  elements.selectAll.disabled = selectable.length === 0;
}

function saveSnapshot() {
  const snapshot = { config, followingCount, records, savedAt: new Date().toISOString() };
  chrome.storage.local.set({ lastScan: snapshot }).catch(() => {});
}

async function loadSnapshot() {
  const { lastScan } = await chrome.storage.local.get("lastScan");
  if (!lastScan?.records?.length) return;
  config = lastScan.config || config;
  followingCount = lastScan.followingCount || 0;
  records = lastScan.records;
  updateRuleSummary();
  setStatus(`已载入本机上次扫描结果（${formatDate(Date.parse(lastScan.savedAt))}）。`);
  renderResults();
}

async function fetchApi(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json, text/plain, */*", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）。`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(data.message || `接口返回错误 ${data.code}。`);
  return data.data;
}

async function getNavigation() {
  const data = await fetchApi("/x/web-interface/nav");
  if (!data.isLogin || !data.mid) throw new Error("未检测到 B 站登录状态。请先登录 B 站后再扫描。");
  return data;
}

async function getFollowings(mid) {
  const all = [];
  const seen = new Set();
  let page = 1;
  while (page <= 200) {
    setStatus("正在读取关注列表…", `第 ${page} 页`);
    const data = await fetchApi(`/x/relation/followings?vmid=${encodeURIComponent(mid)}&pn=${page}&ps=50&order=desc&order_type=attention`);
    const list = Array.isArray(data.list) ? data.list : [];
    for (const item of list) {
      const itemMid = Number(item.mid);
      if (itemMid && !seen.has(itemMid)) {
        seen.add(itemMid);
        all.push({ mid: itemMid, name: item.uname || item.name || `UID ${itemMid}`, face: item.face || "" });
      }
    }
    if (!list.length || list.length < 50) break;
    page += 1;
    await wait(120);
  }
  if (!all.length) throw new Error("未读取到关注列表。可能是页面数据格式已变化，或当前登录状态不可用。");
  return all;
}

function getMixinKey(original) {
  return MIXIN_KEY_ENC_TAB.map((index) => original[index]).join("").slice(0, 32);
}

function getImageKey(url) {
  const filename = url?.split("/").pop() || "";
  return filename.split(".")[0];
}

function encodeWbi(params, mixinKey) {
  const cleanParams = Object.fromEntries(
    Object.entries({ ...params, wts: Math.round(Date.now() / 1000) })
      .map(([key, value]) => [key, String(value).replace(/[!'()*]/g, "")])
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const query = new URLSearchParams(cleanParams).toString();
  return `${query}&w_rid=${md5(`${query}${mixinKey}`)}`;
}

async function getLatestVideo(mid, mixinKey) {
  const query = encodeWbi({
    mid,
    pn: 1,
    ps: 1,
    order: "pubdate",
    platform: "web",
    web_location: 1550101
  }, mixinKey);
  const data = await fetchApi(`/x/space/wbi/arc/search?${query}`);
  const video = data?.list?.vlist?.[0];
  if (!video) return null;
  const bvid = video.bvid || "";
  return {
    title: video.title || "未命名视频",
    publishedAt: Number(video.created) * 1000,
    views: Number(video.play) || 0,
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : `https://space.bilibili.com/${mid}/upload/video`
  };
}

function buildRecord(following, latest, status = "") {
  const reasons = [];
  if (latest) {
    if (daysSince(latest.publishedAt) >= config.days) {
      reasons.push(`超过 ${config.days} 天未投稿`);
    }
    if (daysSince(latest.publishedAt) >= config.observationDays && latest.views < config.views) {
      reasons.push(`播放量低于 ${formatNumber(config.views)}`);
    }
  }
  const candidate = config.mode === "all" ? reasons.length === 2 : reasons.length > 0;
  return {
    ...following,
    latest,
    reasons,
    candidate,
    selected: candidate,
    status: status || (latest ? "未命中" : "未发现可识别的普通视频，需人工查看"),
    scannedAt: new Date().toISOString()
  };
}

async function startScan() {
  if (scanRunning) return;
  scanRunning = true;
  records = [];
  followingCount = 0;
  updateRuleSummary();
  renderResults();
  elements.rescan.disabled = true;
  elements.export.disabled = true;
  elements.unfollow.disabled = true;

  try {
    setStatus("正在确认登录状态…");
    const navigation = await getNavigation();
    const followings = await getFollowings(navigation.mid);
    followingCount = followings.length;
    renderResults();

    const imgKey = getImageKey(navigation.wbi_img?.img_url);
    const subKey = getImageKey(navigation.wbi_img?.sub_url);
    const mixinKey = getMixinKey(`${imgKey}${subKey}`);
    if (mixinKey.length !== 32) throw new Error("无法取得视频数据签名材料。请刷新 B 站页面后重试。");

    for (let index = 0; index < followings.length; index += 1) {
      const following = followings[index];
      setStatus("正在扫描最近投稿…", `${index + 1} / ${followings.length}：${following.name}`);
      try {
        const latest = await getLatestVideo(following.mid, mixinKey);
        records.push(buildRecord(following, latest));
      } catch (error) {
        records.push(buildRecord(following, null, `读取失败：${shortError(error)}`));
      }
      if ((index + 1) % 10 === 0 || index === followings.length - 1) {
        saveSnapshot();
        renderResults();
      } else {
        updateSummary();
      }
      // 顺序读取，避免并发堆积；这不是绕过平台限制的机制。
      await wait(450);
    }
    saveSnapshot();
    setStatus("扫描完成。请在取关前逐项核对候选账号。", `共扫描 ${records.length} 个关注账号`);
  } catch (error) {
    setStatus(`扫描未完成：${shortError(error)}`);
  } finally {
    scanRunning = false;
    elements.rescan.disabled = false;
    elements.export.disabled = records.length === 0;
    renderResults();
  }
}

function shortError(error) {
  const message = error?.message || "未知错误";
  return message.length > 70 ? `${message.slice(0, 70)}…` : message;
}

async function requestCsrfToken() {
  const tabs = await chrome.tabs.query({});
  const biliTabs = tabs.filter((tab) => {
    try {
      const host = new URL(tab.url).hostname;
      return host === "bilibili.com" || host.endsWith(".bilibili.com");
    } catch {
      return false;
    }
  }).sort((left, right) => Number(Boolean(right.active)) - Number(Boolean(left.active)));
  if (!biliTabs.length) throw new Error("请先打开一个已登录的 B 站网页标签，再执行取关。");
  const response = await chrome.tabs.sendMessage(biliTabs[0].id, { type: "request-csrf-token" });
  if (!response?.token) throw new Error("无法读取操作令牌。请刷新已登录的 B 站网页后重试。");
  return response.token;
}

async function unfollowOne(mid, csrfToken) {
  const body = new URLSearchParams({ fid: String(mid), act: "2", re_src: "11", csrf: csrfToken });
  return fetchApi("/x/relation/modify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString()
  });
}

async function unfollowSelected() {
  const selected = records.filter((record) => record.selected && record.candidate && !record.unfollowResult);
  if (!selected.length) return;
  const firstConfirmation = window.confirm(
    `将对 ${selected.length} 个已勾选账号执行取关。\n\n请确认你已逐项核对主页、最近视频和命中原因。操作结果会写入本机日志。`
  );
  if (!firstConfirmation) return;
  const expected = `取关 ${selected.length}`;
  const confirmationText = window.prompt(`为避免误操作，请输入“${expected}”后继续：`);
  if (confirmationText !== expected) {
    setStatus("已取消取关：二次确认文字不匹配。");
    return;
  }

  let csrfToken;
  try {
    csrfToken = await requestCsrfToken();
  } catch (error) {
    setStatus(`未开始取关：${shortError(error)}`);
    return;
  }

  elements.unfollow.disabled = true;
  elements.rescan.disabled = true;
  for (let index = 0; index < selected.length; index += 1) {
    const record = selected[index];
    setStatus("正在逐项取关…", `${index + 1} / ${selected.length}：${record.name}`);
    try {
      await unfollowOne(record.mid, csrfToken);
      record.unfollowResult = { ok: true, at: new Date().toISOString() };
      record.selected = false;
    } catch (error) {
      record.unfollowResult = { ok: false, error: shortError(error), at: new Date().toISOString() };
    }
    saveSnapshot();
    renderResults();
    await wait(900);
  }
  setStatus("取关流程已结束。请查看每一项结果；失败项不会自动重试。", `本次尝试 ${selected.length} 项`);
  elements.rescan.disabled = false;
  renderResults();
}

function exportCsv() {
  if (!records.length) return;
  const rows = [["UID", "昵称", "主页", "最近视频", "视频链接", "发布时间", "播放量", "命中原因", "读取状态", "取关结果", "扫描时间"]];
  for (const record of records) {
    rows.push([
      record.mid,
      record.name,
      `https://space.bilibili.com/${record.mid}`,
      record.latest?.title || "",
      record.latest?.url || "",
      record.latest?.publishedAt ? new Date(record.latest.publishedAt).toISOString() : "",
      record.latest?.views ?? "",
      record.reasons.join("；"),
      record.status,
      record.unfollowResult?.ok ? "已取关" : (record.unfollowResult?.error ? `失败：${record.unfollowResult.error}` : "未操作"),
      record.scannedAt
    ]);
  }
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `bilibili-following-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function md5(input) {
  const source = new TextEncoder().encode(input);
  const bitLength = source.length * 8;
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const lengthView = new DataView(bytes.buffer);
  lengthView.setUint32(paddedLength - 8, bitLength >>> 0, true);
  lengthView.setUint32(paddedLength - 4, Math.floor(bitLength / 0x1_0000_0000), true);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) | 0);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => lengthView.getInt32(offset + index * 4, true));
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    for (let index = 0; index < 64; index += 1) {
      let f;
      let g;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const nextD = d;
      d = c;
      c = b;
      const rotated = leftRotate((a + f + constants[index] + words[g]) | 0, shifts[index]);
      b = (b + rotated) | 0;
      a = nextD;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
  }
  return [h0, h1, h2, h3].map(toLittleEndianHex).join("");
}

function leftRotate(value, amount) {
  return (value << amount) | (value >>> (32 - amount));
}

function toLittleEndianHex(value) {
  return [0, 8, 16, 24].map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0")).join("");
}

elements.onlyCandidates.addEventListener("change", renderResults);
elements.onlySelected.addEventListener("change", renderResults);
elements.search.addEventListener("input", renderResults);
elements.selectAll.addEventListener("change", () => {
  const checked = elements.selectAll.checked;
  getVisibleRecords().filter((record) => record.candidate && !record.unfollowResult)
    .forEach((record) => { record.selected = checked; });
  saveSnapshot();
  renderResults();
});
elements.selectVisible.addEventListener("click", () => {
  getVisibleRecords().filter((record) => record.candidate && !record.unfollowResult)
    .forEach((record) => { record.selected = true; });
  saveSnapshot();
  renderResults();
});
elements.clearSelection.addEventListener("click", () => {
  records.forEach((record) => { record.selected = false; });
  saveSnapshot();
  renderResults();
});
elements.rescan.addEventListener("click", () => {
  if (!scanRunning && (!records.length || window.confirm("重新扫描会覆盖当前列表中的勾选状态。是否继续？"))) startScan();
});
elements.export.addEventListener("click", exportCsv);
elements.unfollow.addEventListener("click", unfollowSelected);

updateRuleSummary();
renderResults();
if (new URLSearchParams(location.search).has("days")) {
  startScan();
} else {
  loadSnapshot().catch((error) => setStatus(`无法载入本机结果：${shortError(error)}`));
}
