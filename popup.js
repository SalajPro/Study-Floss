/* Study Floss — popup host (renders the shared dashboard + study-mode chrome) */
(() => {
  const ST = window.STUDYFLOSS;
  const root = document.getElementById("studyfloss-popup");
  const mount = document.getElementById("studyfloss-dash");
  const masterToggle = document.getElementById("study-mode-toggle");
  const masterLabel = document.getElementById("study-mode-label");
  const endBtn = document.getElementById("popup-end-session");
  const statusEl = document.getElementById("popup-status");

  // The dashboard (timer, stats, goal, achievements, settings) is identical to
  // the on-page widget — same module, same markup.
  STUDYFLOSS_UI.create(mount, { accentTarget: root });

  function setStored(updates) {
    return new Promise((resolve) => chrome.storage.local.set(updates, resolve));
  }

  function renderChrome(enabled) {
    masterToggle.checked = enabled;
    masterLabel.textContent = enabled ? "ON" : "OFF";
    statusEl.textContent = enabled
      ? "Study Mode is active on YouTube — distractions are hidden."
      : "Turn on Study Mode, then open YouTube to start focusing.";
  }

  chrome.storage.local.get(["studyModeEnabled"], (s) => renderChrome(Boolean(s.studyModeEnabled)));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (Object.prototype.hasOwnProperty.call(changes, "studyModeEnabled")) {
      renderChrome(Boolean(changes.studyModeEnabled.newValue));
    }
  });

  masterToggle.addEventListener("change", async () => {
    const enabled = masterToggle.checked;
    const updates = { studyModeEnabled: enabled };
    if (!enabled) Object.assign(updates, { timerRunning: false, timerEndsAt: null, lastUpdatedAt: null });
    await setStored(updates);
    notifyTab();
    renderChrome(enabled);
  });

  endBtn.addEventListener("click", async () => {
    await setStored({ studyModeEnabled: false, timerRunning: false, timerEndsAt: null, lastUpdatedAt: null });
    notifyTab();
    renderChrome(false);
  });

  function notifyTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || !/^https:\/\/(www\.)?youtube\.com\//i.test(tab.url || "")) return;
      chrome.tabs.sendMessage(tab.id, { type: "STUDYFLOSS_REFRESH" }, () => chrome.runtime.lastError);
    });
  }
})();
