(() => {
  const ST = window.STUDYFLOSS;
  const {
    DEFAULTS, STORAGE_KEYS, THEMES, THEME_META, AMBIENT_OPTIONS,
    deriveTimerState, normalizeState, getDuration, formatTime,
    levelInfo, normalizeText, clampNumber
  } = ST;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  const PROMPT_DISMISSED_KEY = "studyflossPromptDismissed";
  const FOCUS_CLASS = "studyfloss-focus-mode";
  const FULLSCREEN_CLASS = "studyfloss-video-fullscreen";
  const DISTRACTION_CLASS = "studyfloss-distraction";
  const SHORTS_CLASS = "studyfloss-shorts-result";
  const NON_STUDY_CLASS = "studyfloss-non-study-result";
  const QUICK_TOGGLE_ID = "studyfloss-quick-toggle";

  // Search-result cards we classify as study / non-study (study mode + /results only).
  const RESULT_SELECTOR =
    "ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-renderer, " +
    "ytd-radio-renderer, ytd-movie-renderer, ytd-rich-item-renderer";

  const STUDY_KEYWORD_DICTIONARY = {
    coreSubjects: [
      "math", "mathematics", "algebra", "geometry", "trigonometry", "calculus",
      "precalculus", "statistics", "probability", "arithmetic", "number theory",
      "linear algebra", "differential equations", "discrete math", "physics",
      "chemistry", "organic chemistry", "biochemistry", "biology", "botany",
      "zoology", "genetics", "ecology", "anatomy", "physiology", "microbiology",
      "earth science", "geology", "astronomy", "environmental science", "science"
    ],
    humanities: [
      "history", "geography", "civics", "political science", "economics",
      "sociology", "psychology", "philosophy", "literature", "english",
      "grammar", "writing", "essay", "poetry", "world history", "art history",
      "research", "anthropology", "linguistics"
    ],
    technology: [
      "computer science", "programming", "coding", "software engineering",
      "web development", "app development", "data structures", "algorithms",
      "python", "javascript", "typescript", "java tutorial", "c++", "c sharp",
      "sql", "database", "machine learning", "deep learning", "data science",
      "artificial intelligence", "cybersecurity", "networking", "cloud computing",
      "operating systems", "git tutorial", "linux tutorial", "excel tutorial"
    ],
    examsAndSchool: [
      "exam", "test prep", "revision", "study guide", "practice problems",
      "past paper", "sample paper", "question paper", "worksheet", "homework",
      "assignment", "lecture", "lesson", "tutorial", "course", "class",
      "chapter", "unit", "notes", "explained", "explanation", "problem set",
      "solutions", "mock test", "quiz", "sat", "act", "gre", "gmat", "ielts",
      "toefl", "ap calculus", "ap physics", "ap chemistry", "ap biology",
      "ib math", "ib physics", "ib chemistry", "gcse", "a level", "neet",
      "jee", "gate", "upsc", "cbse", "icse", "ncert", "grade", "university",
      "college", "school"
    ],
    learningSkills: [
      "study", "studying", "learn", "learning", "memorize", "flashcards",
      "mind map", "active recall", "spaced repetition", "pomodoro",
      "productivity for students", "focus music", "lofi study",
      "library ambience", "study with me", "white noise", "rain sounds study",
      "concentration", "reading", "book summary", "academic", "teacher",
      "professor", "educational"
    ],
    languages: [
      "spanish lesson", "french lesson", "german lesson", "japanese lesson",
      "korean lesson", "english lesson", "hindi grammar", "sanskrit",
      "language learning", "vocabulary", "pronunciation"
    ],
    professional: [
      "accounting", "finance course", "business studies", "marketing course",
      "management lesson", "medical lecture", "nursing", "law lecture",
      "engineering", "mechanical engineering", "electrical engineering",
      "civil engineering", "electronics", "architecture", "design theory"
    ]
  };

  const STUDY_KEYWORDS = Object.values(STUDY_KEYWORD_DICTIONARY).flat().map(normalizeText);

  const BROAD_STUDY_KEYWORDS = new Set([
    "class", "school", "college", "grade", "teacher", "student", "students", "university"
  ].map(normalizeText));

  const STRONG_STUDY_KEYWORDS = STUDY_KEYWORDS.filter((keyword) => !BROAD_STUDY_KEYWORDS.has(keyword));

  const DISTRACTION_KEYWORDS = [
    "day in my life", "vlog", "prank", "funny", "meme", "memes", "roast",
    "reaction", "challenge", "dance", "song", "music video", "gaming",
    "minecraft", "free fire", "bgmi", "movie", "trailer", "web series",
    "drama", "comedy", "gossip", "viral", "reels", "status", "grwm",
    "lifestyle", "couple", "dating", "crush", "entertainment", "unboxing",
    "asmr eating", "mukbang"
  ].map(normalizeText);

  let state = { ...DEFAULTS };
  let stats = ST.defaultStats();
  let timerIntervalId = null;
  let navigationFallbackId = null;
  let observer = null;
  let refreshQueued = false;
  let ambient = null;

  initialize();

  async function initialize() {
    await waitForDocument();
    const stored = await getStoredState();
    stats = await ST.getStats();

    // If a focus session finished while no tab was actively ticking (tab
    // closed/backgrounded, or started from the popup), credit it now so
    // streaks/XP/achievements still count. Deduped by session key.
    if (stored.studyModeEnabled) await maybeCatchUpCompletion(stored);

    state = deriveTimerState(stored);

    if (state.studyModeEnabled) {
      enableStudyMode();
      await persistTimerState();
    } else {
      disableStudyMode();
      maybeShowStudyPrompt();
    }

    setupStorageSync();
    setupNavigationSync();
    setupMessageSync();
    setupFullscreenSync();

    // Prime the audio context on the first page interaction so completion
    // chimes are allowed to play later (browsers gate audio behind a gesture).
    const prime = () => ST.unlockAudio();
    document.addEventListener("pointerdown", prime, { once: true, capture: true });
    document.addEventListener("keydown", prime, { once: true, capture: true });
  }

  function waitForDocument() {
    if (document.body) return Promise.resolve();
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  function getStoredState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS, (stored) => resolve(normalizeState(stored)));
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

  function ensureAmbient() {
    if (!ambient) ambient = ST.createAmbientPlayer();
    return ambient;
  }

  function syncAmbient() {
    const shouldPlay = state.studyModeEnabled && state.timerMode === "study" &&
      state.timerRunning && state.ambientSound && state.ambientSound !== "off";
    if (shouldPlay) {
      const player = ensureAmbient();
      player.setVolume(state.ambientVolume);
      player.setSound(state.ambientSound);
    } else if (ambient) {
      ambient.setSound("off");
    }
  }

  function setupStorageSync() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      let changed = false;
      for (const key of STORAGE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          state[key] = changes[key].newValue;
          changed = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(changes, ST.STATS_KEY)) {
        stats = ST.normalizeStats(changes[ST.STATS_KEY].newValue);
        renderTimer();
      }

      if (!changed) return;

      if (
        Object.prototype.hasOwnProperty.call(changes, "studyModeEnabled") &&
        changes.studyModeEnabled.newValue === false
      ) {
        markPromptDismissed();
      }

      state = deriveTimerState(state);

      if (state.studyModeEnabled) enableStudyMode();
      else disableStudyMode();

      renderTimer();
      syncAmbient();
    });
  }

  function setupNavigationSync() {
    window.addEventListener("yt-navigate-finish", () => {
      if (state.studyModeEnabled) {
        // New page/search → drop stale classifications and re-evaluate once.
        resetSearchFilter();
        refreshStudyModeUI();
      } else {
        ensureQuickToggleButton();
        maybeShowStudyPrompt();
      }
    });

    observer = new MutationObserver((mutations) => {
      if (!state.studyModeEnabled) return;
      if (mutations.every(isOwnedMutation)) return;
      scheduleStudyModeRefresh();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Light safety net for lazily injected content; everything below is
    // incremental + mark-once, so a repeat pass is essentially free.
    navigationFallbackId = window.setInterval(() => {
      if (state.studyModeEnabled) refreshStudyModeUI();
    }, 5000);
  }

  function setupMessageSync() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !message.type) return false;

      if (message.type === "STUDYFLOSS_REFRESH") {
        Promise.all([getStoredState(), ST.getStats()])
          .then(([stored, freshStats]) => {
            state = deriveTimerState(stored);
            stats = freshStats;
            if (state.studyModeEnabled) enableStudyMode();
            else disableStudyMode();
            renderTimer();
            syncAmbient();
            sendResponse({ ok: true });
          })
          .catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      }

      return false;
    });
  }

  function setupFullscreenSync() {
    document.addEventListener("fullscreenchange", () => {
      syncFullscreenHost();
      renderTimer();
    });
  }

  async function setStudyMode(enabled) {
    state = deriveTimerState({ ...state, studyModeEnabled: enabled });

    if (!enabled) {
      markPromptDismissed();
      state.timerRunning = false;
      state.timerEndsAt = null;
      state.lastUpdatedAt = null;
    } else {
      clearPromptDismissed();
    }

    await persistState({
      studyModeEnabled: state.studyModeEnabled,
      timerMode: state.timerMode,
      remainingSeconds: state.remainingSeconds,
      currentTotalSeconds: state.currentTotalSeconds,
      timerRunning: state.timerRunning,
      timerEndsAt: state.timerEndsAt,
      lastUpdatedAt: null
    });

    if (enabled) enableStudyMode();
    else disableStudyMode();
  }

  function enableStudyMode() {
    document.documentElement.classList.add(FOCUS_CLASS);
    document.body.classList.add(FOCUS_CLASS);
    removeStudyPrompt();
    removeQuickToggleButton();
    ensureTimerWidget();
    startLocalTimerLoop();
    refreshStudyModeUI();
    syncAmbient();
  }

  function disableStudyMode() {
    document.documentElement.classList.remove(FOCUS_CLASS);
    if (document.body) document.body.classList.remove(FOCUS_CLASS, FULLSCREEN_CLASS);

    document.querySelectorAll(`.${DISTRACTION_CLASS}, .${SHORTS_CLASS}, .${NON_STUDY_CLASS}`).forEach((element) => {
      element.classList.remove(DISTRACTION_CLASS, SHORTS_CLASS, NON_STUDY_CLASS);
    });
    clearFilterMarkers();

    removeTimerWidget();
    ensureQuickToggleButton();
    stopLocalTimerLoop();
    if (ambient) ambient.setSound("off");
  }

  function maybeShowStudyPrompt() {
    if (sessionStorage.getItem(PROMPT_DISMISSED_KEY) === "true") return;
    if (document.getElementById("studyfloss-prompt-backdrop")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "studyfloss-prompt-backdrop";
    backdrop.innerHTML = `
      <section id="studyfloss-prompt-card" role="dialog" aria-modal="true" aria-labelledby="studyfloss-prompt-title">
        <div class="studyfloss-prompt-mark" aria-hidden="true">
          <span class="studyfloss-brand-ring"></span>
          <span class="studyfloss-brand-play"></span>
        </div>
        <h2 id="studyfloss-prompt-title">Enter the focus zone?</h2>
        <p>Hide Shorts, recommendations, comments &amp; the home feed, filter search to study videos, then start your Pomodoro.</p>
        <div class="studyfloss-prompt-actions">
          <button id="studyfloss-prompt-yes" type="button">Start focusing</button>
          <button id="studyfloss-prompt-no" type="button">Not now</button>
        </div>
        <p class="studyfloss-prompt-foot">Toggle it anytime from the Study Floss button.</p>
      </section>
    `;

    document.body.appendChild(backdrop);

    document.getElementById("studyfloss-prompt-yes").addEventListener("click", async () => {
      ST.unlockAudio();
      clearPromptDismissed();
      await setStudyMode(true);
    });

    document.getElementById("studyfloss-prompt-no").addEventListener("click", () => {
      markPromptDismissed();
      removeStudyPrompt();
      ensureQuickToggleButton();
    });
  }

  function removeStudyPrompt() {
    document.getElementById("studyfloss-prompt-backdrop")?.remove();
  }

  function markPromptDismissed() {
    sessionStorage.setItem(PROMPT_DISMISSED_KEY, "true");
  }

  function clearPromptDismissed() {
    sessionStorage.removeItem(PROMPT_DISMISSED_KEY);
  }

  function ensureQuickToggleButton() {
    if (state.studyModeEnabled || document.getElementById(QUICK_TOGGLE_ID)) return;

    const button = document.createElement("button");
    button.id = QUICK_TOGGLE_ID;
    button.type = "button";
    button.title = "Start Study Mode";
    button.setAttribute("aria-label", "Start Study Mode");
    button.innerHTML = `
      <span class="studyfloss-quick-toggle-pulse" aria-hidden="true"></span>
      <span class="studyfloss-quick-toggle-glyph" aria-hidden="true">
        <span class="studyfloss-brand-ring"></span>
        <span class="studyfloss-brand-play"></span>
      </span>
    `;

    setupQuickToggleDragging(button);
    button.addEventListener("click", async () => {
      if (button.dataset.suppressClick === "true") return;
      ST.unlockAudio();
      clearPromptDismissed();
      removeStudyPrompt();
      await setStudyMode(true);
    });

    document.body.appendChild(button);
    applyQuickTogglePosition(button);
  }

  function removeQuickToggleButton() {
    document.getElementById(QUICK_TOGGLE_ID)?.remove();
  }

  function setupQuickToggleDragging(button) {
    let drag = null;

    button.addEventListener("pointerdown", (event) => {
      const rect = button.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      button.classList.add("is-dragging");
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
      moveFloatingElement(button, drag.left + deltaX, drag.top + deltaY, 12);
    });

    const finishDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const wasMoved = drag.moved;
      drag = null;
      button.classList.remove("is-dragging");
      const rect = button.getBoundingClientRect();
      state.quickTogglePosition = { left: Math.round(rect.left), top: Math.round(rect.top) };
      persistState({ quickTogglePosition: state.quickTogglePosition });
      if (wasMoved) {
        button.dataset.suppressClick = "true";
        window.setTimeout(() => { button.dataset.suppressClick = "false"; }, 180);
      }
    };

    button.addEventListener("pointerup", finishDrag);
    button.addEventListener("pointercancel", finishDrag);
  }

  function applyQuickTogglePosition(button) {
    if (!state.quickTogglePosition) return;
    moveFloatingElement(button, state.quickTogglePosition.left, state.quickTogglePosition.top, 12);
  }

  function ensureTimerWidget() {
    if (document.getElementById("studyfloss-timer")) {
      syncFullscreenHost();
      renderTimer();
      return;
    }

    const widget = document.createElement("aside");
    widget.id = "studyfloss-timer";
    widget.setAttribute("aria-label", "Study Floss Pomodoro timer");
    widget.innerHTML = `
      <div class="studyfloss-widget-topline" data-drag-handle title="Drag Study Floss timer">
        <div class="studyfloss-widget-brand">
          <span class="studyfloss-widget-logo" aria-hidden="true">
            <span class="studyfloss-brand-ring"></span>
            <span class="studyfloss-brand-play"></span>
          </span>
          <div class="studyfloss-widget-brand-text">
            <span>Study Floss</span>
            <span id="studyfloss-widget-level" class="studyfloss-widget-level">Lv 1</span>
          </div>
        </div>
        <div class="studyfloss-widget-session">
          <span id="studyfloss-widget-streak" class="studyfloss-widget-streak" title="Day streak">🔥 0</span>
          <button type="button" data-action="toggle-settings" class="studyfloss-widget-settings-button" aria-expanded="false" aria-label="Timer settings">⚙</button>
          <button type="button" data-action="end" class="studyfloss-widget-end">End</button>
        </div>
      </div>

      <div class="studyfloss-widget-mode" role="group" aria-label="Timer mode">
        <button type="button" data-mode="study">Focus</button>
        <button type="button" data-mode="break">Break</button>
      </div>

      <div class="studyfloss-widget-ring-wrap" data-drag-handle>
        <svg class="studyfloss-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="studyfloss-ring-track" cx="60" cy="60" r="52"></circle>
          <circle id="studyfloss-widget-ring" class="studyfloss-ring-progress" cx="60" cy="60" r="52" transform="rotate(-90 60 60)"></circle>
        </svg>
        <div class="studyfloss-ring-center">
          <div id="studyfloss-widget-time" class="studyfloss-widget-time">25:00</div>
          <div id="studyfloss-widget-status" class="studyfloss-widget-status-text">Focus</div>
          <div id="studyfloss-widget-cycle" class="studyfloss-cycle-dots"></div>
        </div>
      </div>

      <div class="studyfloss-widget-controls">
        <button type="button" data-action="toggle" class="is-primary">Start</button>
        <button type="button" data-action="reset">Reset</button>
      </div>

      <div class="studyfloss-widget-meta">
        <div class="studyfloss-widget-meta-item">
          <span id="studyfloss-widget-today" class="studyfloss-widget-meta-value">0m</span>
          <span class="studyfloss-widget-meta-label">today</span>
        </div>
        <div class="studyfloss-widget-meta-item">
          <span id="studyfloss-widget-goal" class="studyfloss-widget-meta-value">0%</span>
          <span class="studyfloss-widget-meta-label">of goal</span>
        </div>
        <div class="studyfloss-widget-meta-item">
          <span id="studyfloss-widget-sessions" class="studyfloss-widget-meta-value">0</span>
          <span class="studyfloss-widget-meta-label">sessions</span>
        </div>
      </div>

      <div id="studyfloss-widget-settings-panel" class="studyfloss-settings-panel" hidden>
        <div class="studyfloss-field-grid">
          <label for="studyfloss-w-study">Focus (min)
            <input id="studyfloss-w-study" type="number" min="1" max="180" step="1"></label>
          <label for="studyfloss-w-break">Break (min)
            <input id="studyfloss-w-break" type="number" min="1" max="60" step="1"></label>
          <label for="studyfloss-w-longbreak">Long break (min)
            <input id="studyfloss-w-longbreak" type="number" min="5" max="60" step="1"></label>
          <label for="studyfloss-w-cycle">Long break every
            <input id="studyfloss-w-cycle" type="number" min="2" max="8" step="1"></label>
          <label for="studyfloss-w-goal">Daily goal (min)
            <input id="studyfloss-w-goal" type="number" min="10" max="960" step="5"></label>
          <label class="studyfloss-field-select" for="studyfloss-theme-select">Theme
            <select id="studyfloss-theme-select"></select></label>
        </div>
        <label class="studyfloss-field-select" for="studyfloss-ambient-select">Ambient sound
          <select id="studyfloss-ambient-select"></select></label>
        <label class="studyfloss-toggle-row">
          <span>Auto-start next timer</span>
          <span class="studyfloss-mini-switch">
            <input id="studyfloss-w-autostart" type="checkbox">
            <span class="studyfloss-mini-track" aria-hidden="true"></span>
          </span>
        </label>
        <label class="studyfloss-toggle-row">
          <span>Completion sound</span>
          <span class="studyfloss-mini-switch">
            <input id="studyfloss-w-sound" type="checkbox">
            <span class="studyfloss-mini-track" aria-hidden="true"></span>
          </span>
        </label>
        <button type="button" data-action="save-settings" class="studyfloss-save-btn">Apply settings</button>
      </div>
    `;

    const themeSelect = widget.querySelector("#studyfloss-theme-select");
    themeSelect.innerHTML = THEMES.map((t) => `<option value="${t}">${THEME_META[t].label}</option>`).join("");
    const ambientSelect = widget.querySelector("#studyfloss-ambient-select");
    ambientSelect.innerHTML = AMBIENT_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");

    widget.addEventListener("click", (event) => {
      ST.unlockAudio();
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const actionButton = target.closest("[data-action]");
      if (actionButton) {
        runTimerAction(actionButton.getAttribute("data-action"));
        return;
      }
      const modeButton = target.closest("[data-mode]");
      if (modeButton) setTimerMode(modeButton.getAttribute("data-mode"));
    });

    themeSelect.addEventListener("change", (event) => {
      const nextTheme = event.target.value;
      if (THEMES.includes(nextTheme)) {
        state.selectedTheme = nextTheme;
        persistState({ selectedTheme: nextTheme });
        renderTimer();
      }
    });

    ambientSelect.addEventListener("change", (event) => {
      state.ambientSound = event.target.value;
      persistState({ ambientSound: state.ambientSound });
      syncAmbient();
    });

    widget.querySelector("#studyfloss-w-autostart").addEventListener("change", (event) => {
      state.autoStartNext = event.target.checked;
      persistState({ autoStartNext: state.autoStartNext });
    });

    widget.querySelector("#studyfloss-w-sound").addEventListener("change", (event) => {
      state.soundEnabled = event.target.checked;
      persistState({ soundEnabled: state.soundEnabled });
    });

    setupWidgetDragging(widget);
    document.body.appendChild(widget);
    syncFullscreenHost();
    applyWidgetPosition(widget);
    renderTimer();
  }

  function removeTimerWidget() {
    document.getElementById("studyfloss-timer")?.remove();
  }

  function setupWidgetDragging(widget) {
    const handles = Array.from(widget.querySelectorAll("[data-drag-handle]"));
    if (handles.length === 0) return;

    let drag = null;

    for (const handle of handles) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button, select, input, a")) return;
        const rect = widget.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top
        };
        widget.classList.add("is-dragging");
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      handle.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        moveWidget(widget, drag.left + event.clientX - drag.startX, drag.top + event.clientY - drag.startY);
      });

      const finishDrag = (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag = null;
        widget.classList.remove("is-dragging");
        const rect = widget.getBoundingClientRect();
        const position = { left: Math.round(rect.left), top: Math.round(rect.top) };
        if (document.fullscreenElement) {
          state.fullscreenTimerPosition = position;
          persistState({ fullscreenTimerPosition: position });
        } else {
          state.widgetPosition = position;
          persistState({ widgetPosition: position });
        }
      };

      handle.addEventListener("pointerup", finishDrag);
      handle.addEventListener("pointercancel", finishDrag);
    }
  }

  function applyWidgetPosition(widget) {
    if (document.fullscreenElement || !state.widgetPosition) return;
    moveWidget(widget, state.widgetPosition.left, state.widgetPosition.top);
  }

  function moveWidget(widget, left, top) {
    moveFloatingElement(widget, left, top, document.fullscreenElement ? 24 : 12);
  }

  function applyFullscreenTimerPosition(widget) {
    if (!document.fullscreenElement || !state.fullscreenTimerPosition) return;
    moveWidget(widget, state.fullscreenTimerPosition.left, state.fullscreenTimerPosition.top);
  }

  function moveFloatingElement(element, left, top, margin) {
    const rect = element.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const clampedLeft = Math.min(Math.max(margin, left), maxLeft);
    const clampedTop = Math.min(Math.max(margin, top), maxTop);
    element.style.left = `${clampedLeft}px`;
    element.style.top = `${clampedTop}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function syncFullscreenHost() {
    const widget = document.getElementById("studyfloss-timer");
    if (!widget) return;

    const fullscreenElement = document.fullscreenElement;
    document.body.classList.toggle(FULLSCREEN_CLASS, Boolean(fullscreenElement));
    widget.classList.toggle("is-fullscreen-timer", Boolean(fullscreenElement));

    if (fullscreenElement && !fullscreenElement.contains(widget)) {
      fullscreenElement.appendChild(widget);
      resetFloatingPosition(widget);
      applyFullscreenTimerPosition(widget);
      return;
    }

    if (fullscreenElement) {
      applyFullscreenTimerPosition(widget);
      return;
    }

    if (!fullscreenElement && widget.parentElement !== document.body) {
      document.body.appendChild(widget);
      if (state.widgetPosition) applyWidgetPosition(widget);
      else resetFloatingPosition(widget);
    }
  }

  function resetFloatingPosition(element) {
    element.style.left = "";
    element.style.top = "";
    element.style.right = "";
    element.style.bottom = "";
  }

  async function runTimerAction(action) {
    state = deriveTimerState(await getStoredState());

    if (action === "end") { await setStudyMode(false); return; }
    if (action === "toggle-settings") { toggleWidgetSettings(); return; }
    if (action === "save-settings") { await saveWidgetSettings(); return; }

    // Single play/pause button.
    if (action === "toggle") action = state.timerRunning ? "pause" : "start";

    if (action === "start") {
      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = getDuration(state.timerMode, state);
        state.currentTotalSeconds = state.remainingSeconds;
      }
      if (state.currentTotalSeconds < state.remainingSeconds) state.currentTotalSeconds = state.remainingSeconds;
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
      state.remainingSeconds = getDuration(state.timerMode, state);
      state.currentTotalSeconds = state.remainingSeconds;
      state.timerEndsAt = null;
    }

    await persistTimerState();
    renderTimer();
    startLocalTimerLoop();
    syncAmbient();
  }

  function toggleWidgetSettings() {
    const widget = document.getElementById("studyfloss-timer");
    if (!widget) return;
    const panel = widget.querySelector("#studyfloss-widget-settings-panel");
    const toggle = widget.querySelector("[data-action='toggle-settings']");
    if (!panel || !toggle) return;
    const nextOpen = panel.hidden;
    panel.hidden = !nextOpen;
    toggle.setAttribute("aria-expanded", String(nextOpen));
    toggle.classList.toggle("is-open", nextOpen);
    renderTimer();

    // If the widget was dragged to an explicit position, re-clamp it so the
    // taller settings panel can't push content below the viewport.
    if (!document.fullscreenElement && widget.style.top) {
      const rect = widget.getBoundingClientRect();
      moveWidget(widget, rect.left, rect.top);
    }
  }

  async function saveWidgetSettings() {
    const widget = document.getElementById("studyfloss-timer");
    if (!widget) return;

    const read = (sel) => widget.querySelector(sel);
    const studyDurationSeconds = clampNumber(read("#studyfloss-w-study").value, 1, 180, 25) * 60;
    const breakDurationSeconds = clampNumber(read("#studyfloss-w-break").value, 1, 60, 5) * 60;
    const longBreakMinutes = clampNumber(read("#studyfloss-w-longbreak").value, 5, 60, 15);
    const sessionsBeforeLongBreak = clampNumber(read("#studyfloss-w-cycle").value, 2, 8, 4);
    const dailyGoalMinutes = clampNumber(read("#studyfloss-w-goal").value, 10, 960, 120);

    state = deriveTimerState(await getStoredState());
    Object.assign(state, {
      studyDurationSeconds, breakDurationSeconds, longBreakMinutes,
      sessionsBeforeLongBreak, dailyGoalMinutes
    });

    const updates = {
      studyDurationSeconds, breakDurationSeconds, longBreakMinutes,
      sessionsBeforeLongBreak, dailyGoalMinutes
    };

    if (!state.timerRunning) {
      state.remainingSeconds = getDuration(state.timerMode, state);
      state.currentTotalSeconds = state.remainingSeconds;
      state.timerEndsAt = null;
      updates.remainingSeconds = state.remainingSeconds;
      updates.currentTotalSeconds = state.currentTotalSeconds;
      updates.timerEndsAt = null;
      updates.timerRunning = false;
    }

    await persistState(updates);
    flashApplied(widget);
    renderTimer();
  }

  function flashApplied(widget) {
    const button = widget.querySelector("[data-action='save-settings']");
    if (!button) return;
    button.textContent = "Saved ✓";
    button.classList.add("is-saved");
    window.setTimeout(() => {
      button.textContent = "Apply settings";
      button.classList.remove("is-saved");
    }, 1300);
  }

  async function setTimerMode(mode) {
    if (mode !== "study" && mode !== "break") return;
    const stored = deriveTimerState(await getStoredState());
    const remaining = getDuration(mode, stored);
    state = {
      ...stored,
      timerMode: mode,
      remainingSeconds: remaining,
      currentTotalSeconds: remaining,
      timerRunning: false,
      timerEndsAt: null
    };
    await persistTimerState();
    renderTimer();
    syncAmbient();
  }

  function startLocalTimerLoop() {
    if (timerIntervalId) return;
    timerIntervalId = window.setInterval(async () => {
      const before = { ...state };
      state = deriveTimerState(state);
      renderTimer();

      const sessionEnded = before.timerRunning &&
        (!state.timerRunning || before.timerMode !== state.timerMode);

      if (sessionEnded) await handleSessionComplete(before);
    }, 500);
  }

  function stopLocalTimerLoop() {
    if (timerIntervalId) {
      window.clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  async function maybeCatchUpCompletion(stored) {
    if (!stored.timerRunning || stored.timerMode !== "study") return;
    if (!stored.timerEndsAt || stored.timerEndsAt > Date.now()) return;

    const sessionKey = String(stored.timerEndsAt);
    if (stats.lastSessionKey === sessionKey) return;

    const result = await ST.recordCompletedFocusSession({
      sessionKey,
      sessionSeconds: stored.currentTotalSeconds,
      dailyGoalMinutes: stored.dailyGoalMinutes,
      now: stored.timerEndsAt
    });
    stats = result.stats;
  }

  async function handleSessionComplete(before) {
    const completedMode = before.timerMode;
    const sessionSeconds = completedMode === "study" ? before.currentTotalSeconds : 0;
    const sessionKey = String(before.timerEndsAt || Date.now());

    if (completedMode === "study") {
      const result = await ST.recordCompletedFocusSession({
        sessionKey,
        sessionSeconds,
        dailyGoalMinutes: state.dailyGoalMinutes,
        now: Date.now()
      });
      stats = result.stats;

      if (!result.duplicate) {
        const xpGain = ST.xpForSession(sessionSeconds, stats);
        celebrateFocus(xpGain);

        if (ST.nextBreakIsLong(stats, state.sessionsBeforeLongBreak)) {
          const longSeconds = state.longBreakMinutes * 60;
          state.timerMode = "break";
          state.remainingSeconds = longSeconds;
          state.currentTotalSeconds = longSeconds;
        }

        for (const ach of result.unlocked) {
          ST.showToast({ icon: ach.icon, title: "Achievement unlocked!", message: ach.title, duration: 5200 });
        }
        if (result.leveledUp) {
          const info = levelInfo(stats.xp);
          if (state.soundEnabled) ST.playChime("levelup", 0.5);
          ST.showToast({ icon: "🎓", title: `Level ${info.level} — ${info.title}!`, message: "Keep the momentum going.", duration: 5200 });
        }
        notifyDesktop("Focus session complete! 🎉", `Great work. +${xpGain} XP earned. Time for a break.`);
      }
    } else {
      if (state.soundEnabled) ST.playChime("break", 0.4);
      ST.showToast({ icon: "📚", title: "Break's over", message: "Ready for another focus session?", duration: 4200 });
      notifyDesktop("Break finished", "Ready to focus again?");
    }

    if (state.autoStartNext) {
      state.timerRunning = true;
      state.timerEndsAt = Date.now() + state.remainingSeconds * 1000;
    }

    await persistTimerState();
    renderTimer();
    syncAmbient();
  }

  function celebrateFocus(xpGain) {
    const meta = THEME_META[state.selectedTheme] || THEME_META.forest;
    ST.celebrate({ colors: [meta.accent, "#ffffff", "#fbbf24", "#34d399", "#60a5fa"] });
    if (state.soundEnabled) ST.playChime("complete", 0.5);
    ST.showToast({ icon: "🎉", title: "Focus complete!", message: `+${xpGain} XP · streak ${stats.currentStreak} 🔥`, duration: 4600 });
  }

  function notifyDesktop(title, message) {
    if (document.visibilityState === "visible") return;
    try {
      chrome.runtime.sendMessage({ type: "STUDYFLOSS_NOTIFY", title, message }, () => chrome.runtime.lastError);
    } catch (_e) { /* ignore */ }
  }

  function renderTimer() {
    const widget = document.getElementById("studyfloss-timer");
    if (!widget) return;

    state = deriveTimerState(state);
    syncFullscreenHost();

    const meta = THEME_META[state.selectedTheme] || THEME_META.forest;
    widget.style.setProperty("--st-accent", meta.accent);
    widget.style.setProperty("--st-glow", meta.glow);
    for (const theme of THEMES) widget.classList.remove(`studyfloss-theme-${theme}`);
    widget.classList.add(`studyfloss-theme-${state.selectedTheme}`);
    widget.classList.toggle("is-break", state.timerMode === "break");

    const q = (sel) => widget.querySelector(sel);
    const time = q("#studyfloss-widget-time");
    const statusText = q("#studyfloss-widget-status");
    const ring = q("#studyfloss-widget-ring");
    const themeSelect = q("#studyfloss-theme-select");
    const ambientSelect = q("#studyfloss-ambient-select");
    const modeButtons = widget.querySelectorAll("[data-mode]");
    const toggleButton = q("[data-action='toggle']");
    const levelEl = q("#studyfloss-widget-level");
    const streakEl = q("#studyfloss-widget-streak");
    const cycleEl = q("#studyfloss-widget-cycle");
    const todayEl = q("#studyfloss-widget-today");
    const goalEl = q("#studyfloss-widget-goal");
    const sessionsEl = q("#studyfloss-widget-sessions");

    if (time) time.textContent = formatTime(state.remainingSeconds);
    if (statusText) statusText.textContent = state.timerMode === "study"
      ? (state.timerRunning ? "Focusing" : "Focus")
      : (state.timerRunning ? "On break" : "Break");

    if (toggleButton) {
      if (state.timerRunning) toggleButton.textContent = "Pause";
      else if (state.remainingSeconds > 0 && state.remainingSeconds < state.currentTotalSeconds) toggleButton.textContent = "Resume";
      else toggleButton.textContent = "Start";
    }

    if (ring) {
      const total = Math.max(1, state.currentTotalSeconds);
      const fraction = Math.max(0, Math.min(1, state.remainingSeconds / total));
      ring.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
      ring.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - fraction)}`;
    }

    if (themeSelect && document.activeElement !== themeSelect) themeSelect.value = state.selectedTheme;
    if (ambientSelect && document.activeElement !== ambientSelect) ambientSelect.value = state.ambientSound;

    syncSettingInput(q("#studyfloss-w-study"), Math.round(state.studyDurationSeconds / 60));
    syncSettingInput(q("#studyfloss-w-break"), Math.round(state.breakDurationSeconds / 60));
    syncSettingInput(q("#studyfloss-w-longbreak"), state.longBreakMinutes);
    syncSettingInput(q("#studyfloss-w-cycle"), state.sessionsBeforeLongBreak);
    syncSettingInput(q("#studyfloss-w-goal"), state.dailyGoalMinutes);
    const autostartInput = q("#studyfloss-w-autostart");
    const soundInput = q("#studyfloss-w-sound");
    if (autostartInput) autostartInput.checked = state.autoStartNext;
    if (soundInput) soundInput.checked = state.soundEnabled;

    if (levelEl) levelEl.textContent = `Lv ${levelInfo(stats.xp).level}`;
    if (streakEl) streakEl.textContent = `🔥 ${stats.currentStreak}`;

    const todaySeconds = ST.todayFocusSeconds(stats);
    if (todayEl) todayEl.textContent = ST.formatDuration(todaySeconds);
    if (goalEl) {
      const goalSeconds = Math.max(1, state.dailyGoalMinutes * 60);
      goalEl.textContent = `${Math.min(100, Math.round((todaySeconds / goalSeconds) * 100))}%`;
    }
    if (sessionsEl) sessionsEl.textContent = String(stats.sessionsCompleted);

    if (cycleEl) {
      const n = state.sessionsBeforeLongBreak;
      const done = stats.pomodoroCycle % n;
      const filled = (done === 0 && stats.pomodoroCycle > 0) ? n : done;
      let html = "";
      for (let i = 0; i < n; i++) html += `<span class="studyfloss-cycle-dot${i < filled ? " is-on" : ""}"></span>`;
      cycleEl.innerHTML = html;
    }

    modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-mode") === state.timerMode);
    });
  }

  function syncSettingInput(input, value) {
    if (input && document.activeElement !== input) input.value = String(value);
  }

  /* ---------------- distraction + search filtering ---------------- */

  function refreshStudyModeUI() {
    ensureTimerWidget();
    markShortsSurfaces();
    filterSearchResults();
  }

  function scheduleStudyModeRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    window.setTimeout(() => {
      refreshQueued = false;
      ensureTimerWidget();
      markShortsSurfaces();
      filterSearchResults();
    }, 500);
  }

  // Most distraction hiding (home feed, recommendations, comments) is static
  // CSS keyed on `.studyfloss-focus-mode`. Shorts surfaces are content-based,
  // so we tag them here. Mark-once → repeated passes do no DOM work.
  function markShortsSurfaces() {
    if (!state.studyModeEnabled || !document.body) return;

    const candidates = [
      ...safelyQuery("a[href^='/shorts/'], a[title='Shorts']"),
      ...safelyQuery("ytd-reel-shelf-renderer, ytd-reel-item-renderer, ytd-reel-video-renderer"),
      ...safelyQuery("ytd-shelf-renderer, ytd-item-section-renderer, ytd-horizontal-card-list-renderer, yt-horizontal-list-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer")
    ];

    for (const candidate of candidates) {
      if (!hasShortsSignal(candidate)) continue;
      const target = getShortsHideTarget(candidate);
      if (target && !shouldKeepElement(target) && !target.classList.contains(SHORTS_CLASS)) {
        target.classList.add(SHORTS_CLASS, DISTRACTION_CLASS);
      }
    }
  }

  // On the search results page, hide videos that aren't study-related. Each
  // card is classified exactly once (data-sf-checked) and hidden via a CSS
  // class — no re-processing, no injected cards, so the page never "reloads".
  function filterSearchResults() {
    if (!state.studyModeEnabled || location.pathname !== "/results") return;

    for (const card of safelyQuery(RESULT_SELECTOR)) {
      if (card.dataset.sfChecked === "1") continue;
      card.dataset.sfChecked = "1";

      if (shouldKeepElement(card) || card.classList.contains(SHORTS_CLASS)) continue;

      const text = normalizeText(`${card.textContent || ""} ${collectLinks(card)}`);
      if (!matchesStudyKeyword(text)) card.classList.add(NON_STUDY_CLASS);
    }
  }

  function resetSearchFilter() {
    document.querySelectorAll(`.${NON_STUDY_CLASS}`).forEach((el) => el.classList.remove(NON_STUDY_CLASS));
    clearFilterMarkers();
  }

  function clearFilterMarkers() {
    document.querySelectorAll("[data-sf-checked]").forEach((el) => { delete el.dataset.sfChecked; });
  }

  function matchesStudyKeyword(text) {
    const hasStrong = STRONG_STUDY_KEYWORDS.some((keyword) => text.includes(keyword));
    const hasBroad = STUDY_KEYWORDS.some((keyword) => text.includes(keyword));
    if (!hasStrong && !hasBroad) return false;
    if (!hasStrong && DISTRACTION_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
    return true;
  }

  function collectLinks(element) {
    return Array.from(element.querySelectorAll("a[href]"))
      .map((link) => `${link.getAttribute("href") || ""} ${link.getAttribute("title") || ""}`)
      .join(" ");
  }

  function getShortsHideTarget(element) {
    const shelf = element.closest([
      "ytd-reel-shelf-renderer",
      "ytd-rich-section-renderer",
      "ytd-rich-shelf-renderer",
      "ytd-shelf-renderer",
      "ytd-horizontal-card-list-renderer",
      "yt-horizontal-list-renderer"
    ].join(","));
    if (shelf) return shelf;

    return getShortsItemSection(element) || element.closest([
      "ytd-reel-item-renderer",
      "ytd-reel-video-renderer",
      "ytd-video-renderer",
      "ytd-rich-item-renderer",
      "ytd-grid-video-renderer"
    ].join(",")) || element;
  }

  function getShortsItemSection(element) {
    const section = element.closest("ytd-item-section-renderer");
    if (!section) return null;
    return hasShortsHeading(section) || countShortsLinks(section) > 1 ? section : null;
  }

  function hasShortsSignal(element) {
    return Boolean(
      element.matches("ytd-reel-shelf-renderer, ytd-reel-item-renderer, ytd-reel-video-renderer") ||
      element.matches("a[href^='/shorts/'], a[title='Shorts']") ||
      element.querySelector("a[href^='/shorts/'], a[title='Shorts']") ||
      hasShortsHeading(element)
    );
  }

  function hasShortsHeading(element) {
    return Array.from(element.querySelectorAll("#title, h2, h3, yt-formatted-string, span"))
      .some((node) => normalizeText(node.textContent || "") === "shorts");
  }

  function countShortsLinks(element) {
    return element.querySelectorAll("a[href^='/shorts/']").length;
  }

  function shouldKeepElement(element) {
    return Boolean(
      element.closest("#movie_player, ytd-player, #player, #primary-inner, ytd-playlist-panel-renderer") ||
      element.closest("#studyfloss-timer, #studyfloss-prompt-backdrop")
    );
  }

  function isOwnedMutation(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return Boolean(target && target.closest("#studyfloss-timer, #studyfloss-prompt-backdrop, #studyfloss-toast-stack"));
  }

  function safelyQuery(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  window.addEventListener("resize", () => {
    const widget = document.getElementById("studyfloss-timer");
    if (widget) {
      if (document.fullscreenElement) applyFullscreenTimerPosition(widget);
      else applyWidgetPosition(widget);
    }
    const quickToggle = document.getElementById(QUICK_TOGGLE_ID);
    if (quickToggle) applyQuickTogglePosition(quickToggle);
  });

  window.addEventListener("beforeunload", () => {
    if (state.timerRunning) {
      state = deriveTimerState(state);
      chrome.storage.local.set({
        remainingSeconds: state.remainingSeconds,
        timerEndsAt: state.timerEndsAt,
        lastUpdatedAt: null
      });
    }
    if (observer) observer.disconnect();
    if (navigationFallbackId) window.clearInterval(navigationFallbackId);
    if (ambient) ambient.stop();
  });
})();
