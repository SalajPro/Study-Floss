/*
 * Study Floss — shared dashboard UI
 * A single controller that renders the *identical* dashboard (level, timer,
 * stats, goal, weekly chart, achievements, settings) for both the toolbar
 * popup and the on-page floating widget. Both hosts call STUDYFLOSS_UI.create().
 */
(function () {
  "use strict";

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  function dashboardHTML() {
    return `
      <section class="studyfloss-level-card" aria-label="Your level">
        <div class="studyfloss-level-top">
          <div class="studyfloss-level-badge"><span data-el="level-number">1</span></div>
          <div class="studyfloss-level-meta">
            <span data-el="level-title" class="studyfloss-level-title">Freshman</span>
            <span data-el="level-xp" class="studyfloss-level-xp">0 / 100 XP</span>
          </div>
          <div class="studyfloss-streak-chip" title="Daily study streak">
            <span class="studyfloss-streak-flame" aria-hidden="true">🔥</span>
            <span data-el="streak-value">0</span>
          </div>
        </div>
        <div class="studyfloss-xp-track" aria-hidden="true"><div data-el="xp-fill" class="studyfloss-xp-fill"></div></div>
      </section>

      <section class="studyfloss-popup-timer" aria-label="Pomodoro timer">
        <div class="studyfloss-popup-mode-row">
          <span data-el="mode" class="studyfloss-popup-mode">Focus</span>
          <span data-el="running" class="studyfloss-popup-running">Paused</span>
        </div>
        <div class="studyfloss-ring-wrap">
          <svg class="studyfloss-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="studyfloss-ring-track" cx="60" cy="60" r="52"></circle>
            <circle data-el="ring" class="studyfloss-ring-progress" cx="60" cy="60" r="52" transform="rotate(-90 60 60)"></circle>
          </svg>
          <div class="studyfloss-ring-center">
            <div data-el="time" class="studyfloss-popup-time">25:00</div>
            <div data-el="cycle-dots" class="studyfloss-cycle-dots" aria-label="Pomodoro cycle"></div>
          </div>
        </div>
        <input data-el="task" class="studyfloss-task-input" type="text" maxlength="80"
          placeholder="What are you working on?" aria-label="Current task">
        <div class="studyfloss-popup-controls">
          <button data-action="toggle" class="is-primary" type="button">Start</button>
          <button data-action="reset" type="button">Reset</button>
        </div>
        <div class="studyfloss-popup-mode-controls" role="group" aria-label="Timer mode">
          <button data-mode="study" type="button">Focus</button>
          <button data-mode="break" type="button">Break</button>
        </div>
      </section>

      <section class="studyfloss-stat-grid" aria-label="Your stats">
        <div class="studyfloss-stat-card"><span class="studyfloss-stat-icon">⏱️</span><span data-el="stat-today" class="studyfloss-stat-value">0m</span><span class="studyfloss-stat-label">Today</span></div>
        <div class="studyfloss-stat-card"><span class="studyfloss-stat-icon">✅</span><span data-el="stat-sessions" class="studyfloss-stat-value">0</span><span class="studyfloss-stat-label">Sessions</span></div>
        <div class="studyfloss-stat-card"><span class="studyfloss-stat-icon">📚</span><span data-el="stat-total" class="studyfloss-stat-value">0h</span><span class="studyfloss-stat-label">Total focus</span></div>
        <div class="studyfloss-stat-card"><span class="studyfloss-stat-icon">🏅</span><span data-el="stat-best" class="studyfloss-stat-value">0</span><span class="studyfloss-stat-label">Best streak</span></div>
      </section>

      <section class="studyfloss-goal-card" aria-label="Daily goal">
        <div class="studyfloss-goal-head">
          <span class="studyfloss-section-title">Daily goal</span>
          <span data-el="goal-summary" class="studyfloss-goal-summary">0 / 120 min</span>
        </div>
        <div class="studyfloss-goal-track" aria-hidden="true"><div data-el="goal-fill" class="studyfloss-goal-fill"></div></div>
        <p data-el="goal-status" class="studyfloss-goal-status">Start a focus session to make progress.</p>
      </section>

      <section class="studyfloss-chart-card" aria-label="This week">
        <div class="studyfloss-goal-head">
          <span class="studyfloss-section-title">This week</span>
          <span data-el="week-total" class="studyfloss-goal-summary">0h total</span>
        </div>
        <div data-el="week-chart" class="studyfloss-week-chart"></div>
      </section>

      <section class="studyfloss-ach-card" aria-label="Achievements">
        <div class="studyfloss-goal-head">
          <span class="studyfloss-section-title">Achievements</span>
          <span data-el="ach-count" class="studyfloss-goal-summary">0 / 16</span>
        </div>
        <div data-el="ach-grid" class="studyfloss-ach-grid"></div>
      </section>

      <section class="studyfloss-settings" aria-label="Settings">
        <button data-action="toggle-settings" class="studyfloss-settings-toggle" type="button" aria-expanded="false">
          <span>⚙️ Settings</span>
          <span class="studyfloss-settings-chevron" aria-hidden="true">▾</span>
        </button>
        <div data-el="settings-panel" class="studyfloss-settings-panel" hidden>
          <div class="studyfloss-field-grid">
            <label>Focus (min)<input data-el="study-min" type="number" min="1" max="180" step="1"></label>
            <label>Break (min)<input data-el="break-min" type="number" min="1" max="60" step="1"></label>
            <label>Long break (min)<input data-el="longbreak-min" type="number" min="5" max="60" step="1"></label>
            <label>Long break every<input data-el="cycle-len" type="number" min="2" max="8" step="1"></label>
            <label>Daily goal (min)<input data-el="goal-min" type="number" min="10" max="960" step="5"></label>
            <label class="studyfloss-field-select">Theme<select data-el="theme"></select></label>
          </div>
          <label class="studyfloss-field-select">Ambient sound (plays on YouTube)<select data-el="ambient"></select></label>
          <label class="studyfloss-toggle-row">
            <span>Auto-start next timer</span>
            <span class="studyfloss-mini-switch"><input data-el="autostart" type="checkbox"><span class="studyfloss-mini-track" aria-hidden="true"></span></span>
          </label>
          <label class="studyfloss-toggle-row">
            <span>Completion sound</span>
            <span class="studyfloss-mini-switch"><input data-el="sound" type="checkbox"><span class="studyfloss-mini-track" aria-hidden="true"></span></span>
          </label>
          <button data-action="save-settings" class="studyfloss-save-btn" type="button">Save settings</button>
        </div>
      </section>

      <p data-el="quote" class="studyfloss-quote"></p>
    `;
  }

  function create(root, opts) {
    opts = opts || {};
    const ST = window.STUDYFLOSS;
    const accentTarget = opts.accentTarget || root;

    let state = { ...ST.DEFAULTS };
    let stats = ST.defaultStats();
    let loopId = null;
    let taskTimer = null;
    let settingsOpen = false;
    let destroyed = false;

    root.innerHTML = dashboardHTML();
    const q = (name) => root.querySelector(`[data-el="${name}"]`);

    // populate selects
    q("theme").innerHTML = ST.THEMES.map((t) => `<option value="${t}">${ST.THEME_META[t].label}</option>`).join("");
    q("ambient").innerHTML = ST.AMBIENT_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
    q("quote").textContent = ST.randomQuote();
    q("ring").style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

    const storageListener = (changes, area) => {
      if (area !== "local" || destroyed) return;
      let timerChanged = false;
      for (const key of ST.STORAGE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) { state[key] = changes[key].newValue; timerChanged = true; }
      }
      if (timerChanged) { state = ST.deriveTimerState(state); render(); }
      if (Object.prototype.hasOwnProperty.call(changes, ST.STATS_KEY)) {
        stats = ST.normalizeStats(changes[ST.STATS_KEY].newValue);
        render();
      }
    };

    init();

    async function init() {
      state = ST.deriveTimerState(await getStored());
      stats = await ST.getStats();
      bind();
      render();
      chrome.storage.onChanged.addListener(storageListener);
      loopId = window.setInterval(tick, 500);
    }

    async function tick() {
      const before = { ...state };
      state = ST.deriveTimerState(state);
      render();
      const ended = before.timerRunning && (!state.timerRunning || before.timerMode !== state.timerMode);
      if (!ended) return;

      if (opts.onComplete) {
        await opts.onComplete(before);
        state = ST.deriveTimerState(await getStored());
        stats = await ST.getStats();
        render();
        if (opts.onChange) opts.onChange(state);
      } else {
        stats = await ST.getStats();
        render();
      }
    }

    function getStored() {
      return new Promise((resolve) => {
        chrome.storage.local.get(ST.STORAGE_KEYS, (stored) => resolve(ST.normalizeState(stored)));
      });
    }

    function persist(updates) {
      return new Promise((resolve) => chrome.storage.local.set(updates, resolve));
    }

    function persistTimer() {
      return persist({
        timerMode: state.timerMode,
        remainingSeconds: state.remainingSeconds,
        currentTotalSeconds: state.currentTotalSeconds,
        timerRunning: state.timerRunning,
        timerEndsAt: state.timerEndsAt,
        lastUpdatedAt: null
      });
    }

    function bind() {
      root.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (opts.onInteract) opts.onInteract();
        const actionBtn = target.closest("[data-action]");
        if (actionBtn) { handleAction(actionBtn.getAttribute("data-action")); return; }
        const modeBtn = target.closest("[data-mode]");
        if (modeBtn) setMode(modeBtn.getAttribute("data-mode"));
      });

      q("theme").addEventListener("change", async (e) => {
        const next = e.target.value;
        if (!ST.THEMES.includes(next)) return;
        state.selectedTheme = next;
        applyAccent();
        await persist({ selectedTheme: next });
        if (opts.onChange) opts.onChange(state);
      });

      q("ambient").addEventListener("change", async (e) => {
        state.ambientSound = e.target.value;
        await persist({ ambientSound: state.ambientSound });
        if (opts.onChange) opts.onChange(state);
      });

      q("autostart").addEventListener("change", async (e) => {
        state.autoStartNext = e.target.checked;
        await persist({ autoStartNext: state.autoStartNext });
      });

      q("sound").addEventListener("change", async (e) => {
        state.soundEnabled = e.target.checked;
        await persist({ soundEnabled: state.soundEnabled });
      });

      q("task").addEventListener("input", () => {
        window.clearTimeout(taskTimer);
        taskTimer = window.setTimeout(async () => {
          state.currentTask = q("task").value.slice(0, 80);
          await persist({ currentTask: state.currentTask });
        }, 400);
      });
    }

    function handleAction(action) {
      if (action === "toggle-settings") { toggleSettings(); return; }
      if (action === "save-settings") { saveSettings(); return; }
      runTimerAction(action);
    }

    async function runTimerAction(action) {
      state = ST.deriveTimerState(await getStored());
      if (action === "toggle") action = state.timerRunning ? "pause" : "start";

      if (action === "start") {
        if (state.remainingSeconds <= 0) {
          state.remainingSeconds = ST.getDuration(state.timerMode, state);
          state.currentTotalSeconds = state.remainingSeconds;
        }
        if (state.currentTotalSeconds < state.remainingSeconds) state.currentTotalSeconds = state.remainingSeconds;
        state.timerRunning = true;
        state.timerEndsAt = Date.now() + state.remainingSeconds * 1000;
      } else if (action === "pause") {
        state = ST.deriveTimerState(state);
        state.timerRunning = false;
        state.timerEndsAt = null;
      } else if (action === "reset") {
        state.timerRunning = false;
        state.remainingSeconds = ST.getDuration(state.timerMode, state);
        state.currentTotalSeconds = state.remainingSeconds;
        state.timerEndsAt = null;
      } else {
        return;
      }

      await persistTimer();
      render();
      if (opts.onChange) opts.onChange(state);
    }

    async function setMode(mode) {
      if (mode !== "study" && mode !== "break") return;
      const stored = ST.deriveTimerState(await getStored());
      const remaining = ST.getDuration(mode, stored);
      state = { ...stored, timerMode: mode, remainingSeconds: remaining, currentTotalSeconds: remaining, timerRunning: false, timerEndsAt: null };
      await persistTimer();
      render();
      if (opts.onChange) opts.onChange(state);
    }

    function toggleSettings() {
      settingsOpen = !settingsOpen;
      const panel = q("settings-panel");
      const toggle = root.querySelector("[data-action='toggle-settings']");
      panel.hidden = !settingsOpen;
      toggle.setAttribute("aria-expanded", String(settingsOpen));
      toggle.classList.toggle("is-open", settingsOpen);
      if (opts.onLayoutChange) opts.onLayoutChange();
    }

    async function saveSettings() {
      const studyDurationSeconds = ST.clampNumber(q("study-min").value, 1, 180, 25) * 60;
      const breakDurationSeconds = ST.clampNumber(q("break-min").value, 1, 60, 5) * 60;
      const longBreakMinutes = ST.clampNumber(q("longbreak-min").value, 5, 60, 15);
      const sessionsBeforeLongBreak = ST.clampNumber(q("cycle-len").value, 2, 8, 4);
      const dailyGoalMinutes = ST.clampNumber(q("goal-min").value, 10, 960, 120);

      state = ST.deriveTimerState(await getStored());
      Object.assign(state, { studyDurationSeconds, breakDurationSeconds, longBreakMinutes, sessionsBeforeLongBreak, dailyGoalMinutes });
      const updates = { studyDurationSeconds, breakDurationSeconds, longBreakMinutes, sessionsBeforeLongBreak, dailyGoalMinutes };

      if (!state.timerRunning) {
        state.remainingSeconds = ST.getDuration(state.timerMode, state);
        state.currentTotalSeconds = state.remainingSeconds;
        state.timerEndsAt = null;
        updates.remainingSeconds = state.remainingSeconds;
        updates.currentTotalSeconds = state.currentTotalSeconds;
        updates.timerEndsAt = null;
        updates.timerRunning = false;
      }

      await persist(updates);
      const btn = root.querySelector("[data-action='save-settings']");
      if (btn) {
        btn.textContent = "Saved ✓";
        btn.classList.add("is-saved");
        window.setTimeout(() => { btn.textContent = "Save settings"; btn.classList.remove("is-saved"); }, 1400);
      }
      render();
      if (opts.onChange) opts.onChange(state);
    }

    function applyAccent() {
      const meta = ST.THEME_META[state.selectedTheme] || ST.THEME_META.forest;
      accentTarget.style.setProperty("--st-accent", meta.accent);
      accentTarget.style.setProperty("--st-glow", meta.glow);
    }

    function render() {
      if (destroyed) return;
      state = ST.deriveTimerState(state);
      applyAccent();

      const info = ST.levelInfo(stats.xp);
      setText("level-number", info.level);
      setText("level-title", info.title);
      setText("level-xp", `${info.intoLevel} / ${info.span} XP`);
      q("xp-fill").style.width = `${Math.round(info.progress * 100)}%`;
      setText("streak-value", stats.currentStreak);

      setText("mode", state.timerMode === "study" ? "Focus" : "Break");
      const running = q("running");
      running.textContent = state.timerRunning ? "Running" : "Paused";
      running.classList.toggle("is-running", state.timerRunning);
      setText("time", ST.formatTime(state.remainingSeconds));

      const toggleBtn = root.querySelector("[data-action='toggle']");
      if (state.timerRunning) toggleBtn.textContent = "Pause";
      else if (state.remainingSeconds > 0 && state.remainingSeconds < state.currentTotalSeconds) toggleBtn.textContent = "Resume";
      else toggleBtn.textContent = "Start";

      const total = Math.max(1, state.currentTotalSeconds);
      const fraction = Math.max(0, Math.min(1, state.remainingSeconds / total));
      const ring = q("ring");
      ring.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - fraction)}`;
      ring.classList.toggle("is-break", state.timerMode === "break");

      root.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-mode") === state.timerMode));

      const task = q("task");
      if (document.activeElement !== task) task.value = state.currentTask || "";

      renderCycleDots();

      // stats
      const todaySec = ST.todayFocusSeconds(stats);
      setText("stat-today", ST.formatDuration(todaySec));
      setText("stat-sessions", stats.sessionsCompleted);
      setText("stat-total", ST.formatDuration(stats.totalFocusSeconds));
      setText("stat-best", stats.longestStreak);

      const goalSeconds = Math.max(1, state.dailyGoalMinutes * 60);
      setText("goal-summary", `${Math.round(todaySec / 60)} / ${state.dailyGoalMinutes} min`);
      const goalFill = q("goal-fill");
      goalFill.style.width = `${Math.min(100, Math.round((todaySec / goalSeconds) * 100))}%`;
      goalFill.classList.toggle("is-complete", todaySec >= goalSeconds);
      setText("goal-status",
        todaySec >= goalSeconds ? "🎉 Daily goal smashed — incredible focus!"
        : todaySec > 0 ? `${ST.formatDuration(goalSeconds - todaySec)} to reach today's goal.`
        : "Start a focus session to make progress.");

      renderWeekChart();
      renderAchievements();
      renderSettingsFields();
    }

    function renderCycleDots() {
      const n = state.sessionsBeforeLongBreak;
      const done = stats.pomodoroCycle % n;
      const filled = (done === 0 && stats.pomodoroCycle > 0) ? n : done;
      let html = "";
      for (let i = 0; i < n; i++) html += `<span class="studyfloss-cycle-dot${i < filled ? " is-on" : ""}"></span>`;
      q("cycle-dots").innerHTML = html;
    }

    function renderWeekChart() {
      const week = ST.weeklyHistory(stats);
      const max = Math.max(60, ...week.map((d) => d.seconds));
      const total = week.reduce((s, d) => s + d.seconds, 0);
      setText("week-total", `${ST.formatDuration(total)} total`);
      q("week-chart").innerHTML = week.map((d) => {
        const h = Math.max(4, Math.round((d.seconds / max) * 100));
        const has = d.seconds > 0;
        return `<div class="studyfloss-week-col" title="${d.key}: ${ST.formatDuration(d.seconds)}">
            <div class="studyfloss-week-bar-wrap"><div class="studyfloss-week-bar${has ? " has-data" : ""}${d.isToday ? " is-today" : ""}" style="height:${h}%"></div></div>
            <span class="studyfloss-week-label${d.isToday ? " is-today" : ""}">${d.label}</span>
          </div>`;
      }).join("");
    }

    function renderAchievements() {
      const unlocked = ST.ACHIEVEMENTS.filter((a) => stats.achievements[a.id]).length;
      setText("ach-count", `${unlocked} / ${ST.ACHIEVEMENTS.length}`);
      q("ach-grid").innerHTML = ST.ACHIEVEMENTS.map((a) => {
        const on = Boolean(stats.achievements[a.id]);
        return `<div class="studyfloss-ach${on ? " is-unlocked" : ""}" title="${a.title} — ${a.desc}">
            <span class="studyfloss-ach-icon">${on ? a.icon : "🔒"}</span>
            <span class="studyfloss-ach-name">${a.title}</span>
          </div>`;
      }).join("");
    }

    function renderSettingsFields() {
      syncInput("study-min", Math.round(state.studyDurationSeconds / 60));
      syncInput("break-min", Math.round(state.breakDurationSeconds / 60));
      syncInput("longbreak-min", state.longBreakMinutes);
      syncInput("cycle-len", state.sessionsBeforeLongBreak);
      syncInput("goal-min", state.dailyGoalMinutes);
      const theme = q("theme"); if (document.activeElement !== theme) theme.value = state.selectedTheme;
      const ambient = q("ambient"); if (document.activeElement !== ambient) ambient.value = state.ambientSound;
      q("autostart").checked = state.autoStartNext;
      q("sound").checked = state.soundEnabled;
    }

    function syncInput(name, value) {
      const input = q(name);
      if (input && document.activeElement !== input) input.value = String(value);
    }

    function setText(name, value) {
      const el = q(name);
      if (el) el.textContent = String(value);
    }

    function destroy() {
      destroyed = true;
      if (loopId) window.clearInterval(loopId);
      window.clearTimeout(taskTimer);
      chrome.storage.onChanged.removeListener(storageListener);
    }

    return {
      destroy,
      getState: () => state,
      getStats: () => stats,
      async refresh() {
        state = ST.deriveTimerState(await getStored());
        stats = await ST.getStats();
        render();
      }
    };
  }

  window.STUDYFLOSS_UI = { dashboardHTML, create };
})();
