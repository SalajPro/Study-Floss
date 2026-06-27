/* Study Floss — background service worker */
importScripts("shared.js");

const ST = globalThis.STUDYFLOSS;

chrome.runtime.onInstalled.addListener((details) => {
  const keys = [...ST.STORAGE_KEYS, ST.STATS_KEY];
  chrome.storage.local.get(keys, (stored) => {
    const updates = {};

    for (const [key, value] of Object.entries(ST.DEFAULTS)) {
      if (typeof stored[key] === "undefined") updates[key] = value;
    }

    if (typeof stored[ST.STATS_KEY] === "undefined") {
      updates[ST.STATS_KEY] = ST.defaultStats();
    }

    if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
  });

  if (details && details.reason === "install") {
    chrome.tabs.create({ url: "https://www.youtube.com/" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "STUDYFLOSS_NOTIFY") return;
  try {
    chrome.notifications.create(`studyfloss-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: message.title || "Study Floss",
      message: message.message || "",
      priority: 2,
      silent: false
    });
  } catch (_e) {
    /* notifications may be unavailable; ignore */
  }
});
