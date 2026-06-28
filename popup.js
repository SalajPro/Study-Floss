/* Study Floss — popup dashboard controller */
(() => {
  const ST = window.STUDYFLOSS;
  const {
    DEFAULTS, STORAGE_KEYS, THEMES, THEME_META, AMBIENT_OPTIONS,
    ACHIEVEMENTS, deriveTimerState, formatTime, formatDuration,
    levelInfo, weeklyHistory, todayFocusSeconds, clampNumber, randomQuote
  } = ST;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  let state = { ...DEFAULTS };
  let stats = ST.defaultStats();
  let renderIntervalId = null;
  let settingsOpen = false;
  let taskSaveTimer = null;

  const el = {
    masterToggle: id("study-mode-toggle"),
    toggleLabel: id("study-mode-label"),
    levelNumber: id("popup-level-number"),
    levelTitle: id("popup-level-title"),
    levelXp: id("popup-level-xp"),
    xpFill: id("popup-xp-fill"),
    streakValue: id("popup-streak-value"),
    mode: id("popup-mode"),
    running: id("popup-running"),
    ringProgress: id("popup-ring-progress"),
    time: id("popup-time"),
    cycleDots: id("popup-cycle-dots"),
    task: id("popup-task"),
    toggle: id("popup-toggle"),
    reset: id("popup-reset"),
    studyMode: id("popup-study-mode"),
    breakMode: id("popup-break-mode"),
    statToday: id("popup-stat-today"),
    statSessions: id("popup-stat-sessions"),
    statTotal: id("popup-stat-total"),
    statBest: id("popup-stat-best"),
    goalSummary: id("popup-goal-summary"),
    goalFill: id("popup-goal-fill"),
    goalStatus: id("popup-goal-status"),
    weekTotal: id("popup-week-total"),
    weekChart: id("popup-week-chart"),
    achCount: id("popup-ach-count"),
    achGrid: id("popup-ach-grid"),
    settingsToggle: id("popup-settings-toggle"),
    settingsPanel: id("popup-settings-panel"),
    studyMinutes: id("popup-study-minutes"),
    breakMinutes: id("popup-break-minutes"),
    longBreakMinutes: id("popup-longbreak-minutes"),
    cycleLength: id("popup-cycle-length"),
    goalMinutes: id("popup-goal-minutes"),
    theme: id("popup-theme"),
    ambient: id("popup-ambient"),
    autostart: id("popup-autostart"),
    sound: id("popup-sound"),
    saveSettings: id("popup-save-settings"),
    quote: id("popup-quote"),
    endSession: id("popup-end-session"),
    status: id("popup-status")
  };

  function id(value) { return document.getElementById(value); }

  init();

  async function init() {
    populateSelectOptions();
    el.ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    el.quote.textContent = randomQuote();

    state = deriveTimerState(await getStored());
    stats = await ST.getStats();
    await persistTimerState();
    renderAll();
    bindEvents();
    setupStorageSync();

    renderIntervalId = window.setInterval(async () => {
      const previous = { ...state };
      state = deriveTimerState(state);
      renderTimer();
      // The YouTube content script owns session-completion (stats, long breaks,
      // auto-start). When a transition happens here, just refresh the display.
      if (previous.timerRunning && (!state.timerRunning || previous.timerMode !== state.timerMode)) {
        stats = await ST.getStats();
        renderStats();
      }
    }, 500);
  }

  function populateSelectOptions() {
    el.theme.innerHTML = THEMES
      .map((t) => `<option value="${t}">${THEME_META[t].label}</option>`)
      .join("");
    el.ambient.innerHTML = AMBIENT_OPTIONS
      .map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join("");
  }

  function bindEvents() {
    el.masterToggle.addEventListener("change", async () => {
      if (el.masterToggle.checked) {
        state.studyModeEnabled = true;
        await persistState({ studyModeEnabled: true });
      } else {
        await endStudyMode();
      }
      notifyActiveYouTubeTab();
      renderAll();
    });

    el.toggle.addEventListener("click", () => runTimerAction("toggle"));
    el.reset.addEventListener("click", () => runTimerAction("reset"));
    el.endSession.addEventListener("click", () => endStudyMode());

    el.studyMode.addEventListener("click", () => setTimerMode("study"));
    el.breakMode.addEventListener("click", () => setTimerMode("break"));

    el.settingsToggle.addEventListener("click", () => {
      settingsOpen = !settingsOpen;
      el.settingsPanel.hidden = !settingsOpen;
      el.settingsToggle.setAttribute("aria-expanded", String(settingsOpen));
      el.settingsToggle.classList.toggle("is-open", settingsOpen);
    });

    el.saveSettings.addEventListener("click", () => saveSettings());

    el.theme.addEventListener("change", async () => {
      const next = el.theme.value;
      if (!THEMES.includes(next)) return;
      state.selectedTheme = next;
      applyAccent();
      await persistState({ selectedTheme: next });
      notifyActiveYouTubeTab();
    });

    el.ambient.addEventListener("change", async () => {
      state.ambientSound = el.ambient.value;
      await persistState({ ambientSound: state.ambientSound });
      notifyActiveYouTubeTab();
    });

    el.autostart.addEventListener("change", async () => {
      state.autoStartNext = el.autostart.checked;
      await persistState({ autoStartNext: state.autoStartNext });
    });

    el.sound.addEventListener("change", async () => {
      state.soundEnabled = el.sound.checked;
      await persistState({ soundEnabled: state.soundEnabled });
    });

    el.task.addEventListener("input", () => {
      window.clearTimeout(taskSaveTimer);
      taskSaveTimer = window.setTimeout(async () => {
        state.currentTask = el.task.value.slice(0, 80);
        await persistState({ currentTask: state.currentTask });
        notifyActiveYouTubeTab();
      }, 400);
    });
  }

  function setupStorageSync() {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local") return;

      let timerChanged = false;
      for (const key of STORAGE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          state[key] = changes[key].newValue;
          timerChanged = true;
        }
      }
      if (timerChanged) {
        state = deriveTimerState(state);
        renderTimer();
        renderSettings();
        renderHeader();
      }

      if (Object.prototype.hasOwnProperty.call(changes, ST.STATS_KEY)) {
        stats = ST.normalizeStats(changes[ST.STATS_KEY].newValue);
        renderStats();
      }
    });
  }

  function getStored() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS, (stored) => resolve(ST.normalizeState(stored)));
    });
  }

  function persistState(updates) {
    return new Promise((resolve) => chrome.storage.local.set(updates, resolve));
  }

  function persistTimerState() {
    return persistState({
      timerMode: state.timerMode,
      remainingSeconds: state.remainingSeconds,
      currentTotalSeconds: state.currentTotalSeconds,
      timerRunning: state.timerRunning,
      timerEndsAt: state.timerEndsAt,
      lastUpdatedAt: null
    });
  }

  async function runTimerAction(action) {
    state = deriveTimerState(await getStored());

    if (action === "toggle") action = state.timerRunning ? "pause" : "start";

    if (action === "start") {
      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = ST.getDuration(state.timerMode, state);
        state.currentTotalSeconds = state.remainingSeconds;
      }
      if (state.currentTotalSeconds < state.remainingSeconds) {
        state.currentTotalSeconds = state.remainingSeconds;
      }
      state.timerRunning = true;
      state.timerEndsAt = Date.now() + state.remainingSeconds * 1000;
    }

    if (action === "pause") {
      state = deriveTimerState(state);
      state.timerRunning = false;
      state.timerEndsAt = null;
    }

    if (action === "reset") {
      state.timerRunning = false;
      state.remainingSeconds = ST.getDuration(state.timerMode, state);
      state.currentTotalSeconds = state.remainingSeconds;
      state.timerEndsAt = null;
    }

    await persistTimerState();
    notifyActiveYouTubeTab();
    renderTimer();
  }

  async function setTimerMode(mode) {
    if (mode !== "study" && mode !== "break") return;
    const stored = deriveTimerState(await getStored());
    const remaining = ST.getDuration(mode, stored);
    state = {
      ...stored,
      timerMode: mode,
      remainingSeconds: remaining,
      currentTotalSeconds: remaining,
      timerRunning: false,
      timerEndsAt: null
    };
    await persistTimerState();
    notifyActiveYouTubeTab();
    renderTimer();
  }

  async function saveSettings() {
    const studyDurationSeconds = clampMin(el.studyMinutes.value, 1, 180, 25) * 60;
    const breakDurationSeconds = clampMin(el.breakMinutes.value, 1, 60, 5) * 60;
    const longBreakMinutes = clampMin(el.longBreakMinutes.value, 5, 60, 15);
    const sessionsBeforeLongBreak = clampMin(el.cycleLength.value, 2, 8, 4);
    const dailyGoalMinutes = clampMin(el.goalMinutes.value, 10, 960, 120);

    state = deriveTimerState(await getStored());
    Object.assign(state, {
      studyDurationSeconds, breakDurationSeconds, longBreakMinutes,
      sessionsBeforeLongBreak, dailyGoalMinutes
    });

    const updates = {
      studyDurationSeconds, breakDurationSeconds, longBreakMinutes,
      sessionsBeforeLongBreak, dailyGoalMinutes
    };

    if (!state.timerRunning) {
      state.remainingSeconds = ST.getDuration(state.timerMode, state);
      state.currentTotalSeconds = state.remainingSeconds;
      state.timerEndsAt = null;
      updates.remainingSeconds = state.remainingSeconds;
      updates.currentTotalSeconds = state.currentTotalSeconds;
      updates.timerEndsAt = null;
      updates.timerRunning = false;
    }

    await persistState(updates);
    notifyActiveYouTubeTab();
    flashSaved();
    renderAll();
  }

  function flashSaved() {
    el.saveSettings.textContent = "Saved ✓";
    el.saveSettings.classList.add("is-saved");
    window.setTimeout(() => {
      el.saveSettings.textContent = "Save settings";
      el.saveSettings.classList.remove("is-saved");
    }, 1400);
  }

  function clampMin(value, min, max, fallback) {
    return clampNumber(value, min, max, fallback);
  }

  async function endStudyMode() {
    state = deriveTimerState(await getStored());
    state.studyModeEnabled = false;
    state.timerRunning = false;
    state.timerEndsAt = null;
    await persistState({
      studyModeEnabled: false,
      timerRunning: false,
      timerEndsAt: null,
      lastUpdatedAt: null
    });
    notifyActiveYouTubeTab();
    renderAll();
  }

  /* ---------------- rendering ---------------- */

  function renderAll() {
    renderHeader();
    renderTimer();
    renderStats();
    renderSettings();
    applyAccent();
  }

  function applyAccent() {
    const meta = THEME_META[state.selectedTheme] || THEME_META.forest;
    const root = document.getElementById("studyfloss-popup");
    if (!root) return;
    root.style.setProperty("--st-accent", meta.accent);
    root.style.setProperty("--st-glow", meta.glow);
  }

  function renderHeader() {
    el.masterToggle.checked = state.studyModeEnabled;
    el.toggleLabel.textContent = state.studyModeEnabled ? "ON" : "OFF";

    const info = levelInfo(stats.xp);
    el.levelNumber.textContent = String(info.level);
    el.levelTitle.textContent = info.title;
    el.levelXp.textContent = `${info.intoLevel} / ${info.span} XP`;
    el.xpFill.style.width = `${Math.round(info.progress * 100)}%`;
    el.streakValue.textContent = String(stats.currentStreak);
  }

  function renderTimer() {
    el.mode.textContent = state.timerMode === "study" ? "Focus" : "Break";
    el.running.textContent = state.timerRunning ? "Running" : "Paused";
    el.running.classList.toggle("is-running", state.timerRunning);
    el.time.textContent = formatTime(state.remainingSeconds);

    if (state.timerRunning) el.toggle.textContent = "Pause";
    else if (state.remainingSeconds > 0 && state.remainingSeconds < state.currentTotalSeconds) el.toggle.textContent = "Resume";
    else el.toggle.textContent = "Start";

    const total = Math.max(1, state.currentTotalSeconds);
    const fraction = Math.max(0, Math.min(1, state.remainingSeconds / total));
    el.ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - fraction)}`;
    el.ringProgress.classList.toggle("is-break", state.timerMode === "break");

    el.studyMode.classList.toggle("is-active", state.timerMode === "study");
    el.breakMode.classList.toggle("is-active", state.timerMode === "break");

    if (document.activeElement !== el.task) el.task.value = state.currentTask || "";

    renderCycleDots();
  }

  function renderCycleDots() {
    const n = state.sessionsBeforeLongBreak;
    const done = stats.pomodoroCycle % n;
    const filled = (done === 0 && stats.pomodoroCycle > 0) ? n : done;
    let html = "";
    for (let i = 0; i < n; i++) {
      html += `<span class="studyfloss-cycle-dot${i < filled ? " is-on" : ""}"></span>`;
    }
    el.cycleDots.innerHTML = html;
  }

  function renderStats() {
    renderHeader();
    el.statToday.textContent = formatDuration(todayFocusSeconds(stats));
    el.statSessions.textContent = String(stats.sessionsCompleted);
    el.statTotal.textContent = formatDuration(stats.totalFocusSeconds);
    el.statBest.textContent = String(stats.longestStreak);

    // daily goal
    const goalSeconds = Math.max(1, state.dailyGoalMinutes * 60);
    const today = todayFocusSeconds(stats);
    const pct = Math.min(100, Math.round((today / goalSeconds) * 100));
    el.goalSummary.textContent = `${Math.round(today / 60)} / ${state.dailyGoalMinutes} min`;
    el.goalFill.style.width = `${pct}%`;
    el.goalFill.classList.toggle("is-complete", today >= goalSeconds);
    if (today >= goalSeconds) {
      el.goalStatus.textContent = "🎉 Daily goal smashed — incredible focus!";
    } else if (today > 0) {
      el.goalStatus.textContent = `${formatDuration(goalSeconds - today)} to reach today's goal.`;
    } else {
      el.goalStatus.textContent = "Start a focus session to make progress.";
    }

    renderWeekChart();
    renderAchievements();
  }

  function renderWeekChart() {
    const week = weeklyHistory(stats);
    const max = Math.max(60, ...week.map((d) => d.seconds));
    const weekTotal = week.reduce((sum, d) => sum + d.seconds, 0);
    el.weekTotal.textContent = `${formatDuration(weekTotal)} total`;
    el.weekChart.innerHTML = week
      .map((d) => {
        const h = Math.max(4, Math.round((d.seconds / max) * 100));
        const has = d.seconds > 0;
        return `
          <div class="studyfloss-week-col" title="${d.key}: ${formatDuration(d.seconds)}">
            <div class="studyfloss-week-bar-wrap">
              <div class="studyfloss-week-bar${has ? " has-data" : ""}${d.isToday ? " is-today" : ""}" style="height:${h}%"></div>
            </div>
            <span class="studyfloss-week-label${d.isToday ? " is-today" : ""}">${d.label}</span>
          </div>`;
      })
      .join("");
  }

  function renderAchievements() {
    const unlockedCount = ACHIEVEMENTS.filter((a) => stats.achievements[a.id]).length;
    el.achCount.textContent = `${unlockedCount} / ${ACHIEVEMENTS.length}`;
    el.achGrid.innerHTML = ACHIEVEMENTS
      .map((a) => {
        const unlocked = Boolean(stats.achievements[a.id]);
        return `
          <div class="studyfloss-ach${unlocked ? " is-unlocked" : ""}" title="${a.title} — ${a.desc}">
            <span class="studyfloss-ach-icon">${unlocked ? a.icon : "🔒"}</span>
            <span class="studyfloss-ach-name">${a.title}</span>
          </div>`;
      })
      .join("");
  }

  function renderSettings() {
    if (document.activeElement !== el.studyMinutes) el.studyMinutes.value = String(Math.round(state.studyDurationSeconds / 60));
    if (document.activeElement !== el.breakMinutes) el.breakMinutes.value = String(Math.round(state.breakDurationSeconds / 60));
    if (document.activeElement !== el.longBreakMinutes) el.longBreakMinutes.value = String(state.longBreakMinutes);
    if (document.activeElement !== el.cycleLength) el.cycleLength.value = String(state.sessionsBeforeLongBreak);
    if (document.activeElement !== el.goalMinutes) el.goalMinutes.value = String(state.dailyGoalMinutes);
    el.theme.value = state.selectedTheme;
    el.ambient.value = state.ambientSound;
    el.autostart.checked = state.autoStartNext;
    el.sound.checked = state.soundEnabled;

    el.status.textContent = state.studyModeEnabled
      ? "Study Mode is active on YouTube. Distractions are hidden and search is filtered."
      : "Open YouTube and turn on Study Mode to start focusing.";
  }

  function notifyActiveYouTubeTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || !isYouTubeUrl(tab.url || "")) return;
      chrome.tabs.sendMessage(tab.id, { type: "STUDYFLOSS_REFRESH" }, () => chrome.runtime.lastError);
    });
  }

  function isYouTubeUrl(url) {
    return /^https:\/\/(www\.)?youtube\.com\//i.test(url);
  }

  window.addEventListener("unload", () => {
    if (renderIntervalId) window.clearInterval(renderIntervalId);
  });
})();
