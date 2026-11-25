const fields = {
  days: document.querySelector("#days"),
  views: document.querySelector("#views"),
  observationDays: document.querySelector("#observation-days"),
  mode: document.querySelector("#mode")
};
const errorElement = document.querySelector("#error");

async function restoreConfig() {
  const { config } = await chrome.storage.local.get("config");
  if (!config) return;
  fields.days.value = config.days ?? 30;
  fields.views.value = config.views ?? 1000;
  fields.observationDays.value = config.observationDays ?? 7;
  fields.mode.value = config.mode ?? "any";
}

function readConfig() {
  const config = {
    days: Number(fields.days.value),
    views: Number(fields.views.value),
    observationDays: Number(fields.observationDays.value),
    mode: fields.mode.value
  };
  if (!Number.isInteger(config.days) || config.days < 1 || config.days > 3650) {
    throw new Error("未投稿天数须为 1–3650 的整数。");
  }
  if (!Number.isInteger(config.views) || config.views < 0) {
    throw new Error("播放量阈值须为不小于 0 的整数。");
  }
  if (!Number.isInteger(config.observationDays) || config.observationDays < 0 || config.observationDays > 365) {
    throw new Error("播放量观察期须为 0–365 的整数。");
  }
  return config;
}

document.querySelector("#open-dashboard").addEventListener("click", async () => {
  errorElement.textContent = "";
  try {
    const config = readConfig();
    await chrome.storage.local.set({ config });
    const response = await chrome.runtime.sendMessage({ type: "open-dashboard", config });
    if (!response?.ok) throw new Error(response?.error || "无法打开扫描页。");
    window.close();
  } catch (error) {
    errorElement.textContent = error.message || "参数无效。";
  }
});

restoreConfig().catch(() => {});
document.querySelector('#restore').onclick = () => chrome.tabs.create({url: chrome.runtime.getURL('dashboard.html')});
document.querySelector('#list-only').addEventListener('click', () => {
  chrome.tabs.create({url: chrome.runtime.getURL('dashboard.html') + '?days=30&listOnly=1'});
});
document.querySelector('#other-platforms').addEventListener('click', () => {
  chrome.tabs.create({url: chrome.runtime.getURL('platforms.html')});
});
