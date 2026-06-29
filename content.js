(() => {
  const ST = window.STUDYFLOSS;
  const { deriveTimerState, normalizeState, getDuration, THEME_META, levelInfo } = ST;

  const FOCUS_CLASS = "studyfloss-focus-mode";
  const FULLSCREEN_CLASS = "studyfloss-video-fullscreen";
  const WIDGET_ID = "studyfloss-timer";
  const QUICK_TOGGLE_ID = "studyfloss-quick-toggle";
  const PROMPT_BACKDROP_ID = "studyfloss-prompt-backdrop";
  const PROMPT_DISMISSED_KEY = "studyflossPromptDismissed";

  let pstate = { ...ST.DEFAULTS };          // lightweight page-side state (focus mode + ambient)
  let controller = null;                    // shared dashboard controller (when study mode on)
  let ambient = null;
  let navFallbackId = null;

  initialize();

  async function initialize() {
    await waitForDocument();
    pstate = deriveTimerState(await getStored());

    // Credit a focus session that finished while the tab wasn't actively
    // ticking (closed/backgrounded, or started from the popup). Deduped.
    if (pstate.studyModeEnabled) await maybeCatchUpCompletion(pstate);

    if (pstate.studyModeEnabled) enableStudyMode();
    else { ensureQuickToggleButton(); maybeShowStudyPrompt(); }

    setupStorageSync();
    setupNavigationSync();
    setupMessageSync();
    setupFullscreenSync();

    const prime = () => ST.unlockAudio();
    document.addEventListener("pointerdown", prime, { once: true, capture: true });
    document.addEventListener("keydown", prime, { once: true, capture: true });
  }

  function waitForDocument() {
    if (document.body) return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }

  function getStored() {
    return new Promise((resolve) => {
      chrome.storage.local.get(ST.STORAGE_KEYS, (stored) => resolve(normalizeState(stored)));
    });
  }

  function persist(updates) {
    return new Promise((resolve) => chrome.storage.local.set(updates, resolve));
  }

  /* ---------------- study mode on/off ---------------- */

  function setupStorageSync() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      let changed = false;
      for (const key of ST.STORAGE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) { pstate[key] = changes[key].newValue; changed = true; }
      }
      if (!changed) return;
      pstate = deriveTimerState(pstate);

      if (Object.prototype.hasOwnProperty.call(changes, "studyModeEnabled")) {
        if (changes.studyModeEnabled.newValue === false) markPromptDismissed();
        if (pstate.studyModeEnabled) enableStudyMode();
        else disableStudyMode();
      }
      syncAmbient();
    });
  }

  function setupNavigationSync() {
    window.addEventListener("yt-navigate-finish", () => {
      if (pstate.studyModeEnabled) ensureTimerWidget();
      else { ensureQuickToggleButton(); maybeShowStudyPrompt(); }
    });

    // Cheap presence check — re-create the widget/button if a YouTube re-render
    // ever removed it. No page-content mutation here, so nothing can loop.
    navFallbackId = window.setInterval(() => {
      if (pstate.studyModeEnabled) ensureTimerWidget();
      else ensureQuickToggleButton();
    }, 3000);
  }

  function setupMessageSync() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "STUDYFLOSS_REFRESH") return false;
      getStored().then((stored) => {
        pstate = deriveTimerState(stored);
        if (pstate.studyModeEnabled) enableStudyMode();
        else disableStudyMode();
        syncAmbient();
        sendResponse({ ok: true });
      }).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    });
  }

  function setupFullscreenSync() {
    document.addEventListener("fullscreenchange", () => syncFullscreenHost());
  }

  async function setStudyMode(enabled) {
    pstate = deriveTimerState({ ...pstate, studyModeEnabled: enabled });
    if (!enabled) { markPromptDismissed(); pstate.timerRunning = false; pstate.timerEndsAt = null; }
    else clearPromptDismissed();

    await persist({
      studyModeEnabled: enabled,
      timerRunning: pstate.timerRunning,
      timerEndsAt: pstate.timerEndsAt,
      lastUpdatedAt: null
    });

    if (enabled) enableStudyMode();
    else disableStudyMode();
  }

  function enableStudyMode() {
    document.documentElement.classList.add(FOCUS_CLASS);
    if (document.body) document.body.classList.add(FOCUS_CLASS);
    removeStudyPrompt();
    removeQuickToggleButton();
    ensureTimerWidget();
    syncAmbient();
  }

  function disableStudyMode() {
    document.documentElement.classList.remove(FOCUS_CLASS);
    if (document.body) document.body.classList.remove(FOCUS_CLASS, FULLSCREEN_CLASS);
    removeTimerWidget();
    ensureQuickToggleButton();
    if (ambient) ambient.setSound("off");
  }

  /* ---------------- onboarding prompt + quick toggle ---------------- */

  function maybeShowStudyPrompt() {
    if (sessionStorage.getItem(PROMPT_DISMISSED_KEY) === "true") return;
    if (document.getElementById(PROMPT_BACKDROP_ID) || !document.body) return;

    const backdrop = document.createElement("div");
    backdrop.id = PROMPT_BACKDROP_ID;
    backdrop.innerHTML = `
      <section id="studyfloss-prompt-card" role="dialog" aria-modal="true" aria-labelledby="studyfloss-prompt-title">
        <div class="studyfloss-prompt-mark" aria-hidden="true">
          <span class="studyfloss-brand-ring"></span>
          <span class="studyfloss-brand-play"></span>
        </div>
        <h2 id="studyfloss-prompt-title">Enter the focus zone?</h2>
        <p>Hide Shorts, recommendations, comments &amp; the home feed, then start your Pomodoro.</p>
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

  function removeStudyPrompt() { document.getElementById(PROMPT_BACKDROP_ID)?.remove(); }
  function markPromptDismissed() { sessionStorage.setItem(PROMPT_DISMISSED_KEY, "true"); }
  function clearPromptDismissed() { sessionStorage.removeItem(PROMPT_DISMISSED_KEY); }

  function ensureQuickToggleButton() {
    if (pstate.studyModeEnabled || document.getElementById(QUICK_TOGGLE_ID) || !document.body) return;

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
    setupDragging(button, button, {
      onEnd: (rect) => persist({ quickTogglePosition: { left: Math.round(rect.left), top: Math.round(rect.top) } }),
      margin: 12
    });
    button.addEventListener("click", async () => {
      if (button.dataset.suppressClick === "true") return;
      ST.unlockAudio();
      clearPromptDismissed();
      removeStudyPrompt();
      await setStudyMode(true);
    });
    document.body.appendChild(button);
    if (pstate.quickTogglePosition) moveFloatingElement(button, pstate.quickTogglePosition.left, pstate.quickTogglePosition.top, 12);
  }

  function removeQuickToggleButton() { document.getElementById(QUICK_TOGGLE_ID)?.remove(); }

  /* ---------------- the floating widget (hosts the shared dashboard) ---------------- */

  function ensureTimerWidget() {
    if (document.getElementById(WIDGET_ID)) { syncFullscreenHost(); return; }
    if (!document.body) return;

    const widget = document.createElement("aside");
    widget.id = WIDGET_ID;
    widget.setAttribute("aria-label", "Study Floss timer and dashboard");
    widget.innerHTML = `
      <div class="studyfloss-widget-topline" data-drag-handle title="Drag Study Floss">
        <div class="studyfloss-widget-brand">
          <span class="studyfloss-widget-logo" aria-hidden="true">
            <span class="studyfloss-brand-ring"></span>
            <span class="studyfloss-brand-play"></span>
          </span>
          <span class="studyfloss-widget-brand-title">Study Floss</span>
        </div>
        <button type="button" class="studyfloss-widget-end" data-end>End</button>
      </div>
      <div class="studyfloss-widget-dash"></div>
    `;

    document.body.appendChild(widget);

    widget.querySelector("[data-end]").addEventListener("click", () => setStudyMode(false));

    const mount = widget.querySelector(".studyfloss-widget-dash");
    controller = STUDYFLOSS_UI.create(mount, {
      accentTarget: widget,
      onInteract: () => ST.unlockAudio(),
      onChange: () => syncAmbient(),
      onComplete: handleSessionComplete,
      onLayoutChange: () => reclampWidget(widget)
    });

    // Drag by the header or the timer card (buttons/inputs still work).
    setupDragging(widget, widget.querySelector(".studyfloss-widget-topline"), { onEnd: persistWidgetPosition, margin: 12 });
    const timerCard = mount.querySelector(".studyfloss-popup-timer");
    if (timerCard) setupDragging(widget, timerCard, { onEnd: persistWidgetPosition, margin: 12 });

    syncFullscreenHost();
    applyWidgetPosition(widget);
  }

  function removeTimerWidget() {
    if (controller) { controller.destroy(); controller = null; }
    document.getElementById(WIDGET_ID)?.remove();
  }

  function persistWidgetPosition(rect) {
    const position = { left: Math.round(rect.left), top: Math.round(rect.top) };
    if (document.fullscreenElement) { pstate.fullscreenTimerPosition = position; persist({ fullscreenTimerPosition: position }); }
    else { pstate.widgetPosition = position; persist({ widgetPosition: position }); }
  }

  /* ---------------- completion (page is the authority) ---------------- */

  async function handleSessionComplete(before) {
    const settings = await getStored();

    if (before.timerMode === "study") {
      const sessionKey = String(before.timerEndsAt || Date.now());
      const result = await ST.recordCompletedFocusSession({
        sessionKey,
        sessionSeconds: before.currentTotalSeconds,
        dailyGoalMinutes: settings.dailyGoalMinutes,
        now: Date.now()
      });

      let breakSeconds = getDuration("break", settings);
      if (!result.duplicate && ST.nextBreakIsLong(result.stats, settings.sessionsBeforeLongBreak)) {
        breakSeconds = settings.longBreakMinutes * 60;
      }
      const running = settings.autoStartNext;
      await persist({
        timerMode: "break",
        remainingSeconds: breakSeconds,
        currentTotalSeconds: breakSeconds,
        timerRunning: running,
        timerEndsAt: running ? Date.now() + breakSeconds * 1000 : null,
        lastUpdatedAt: null
      });

      if (!result.duplicate) {
        const xpGain = ST.xpForSession(before.currentTotalSeconds, result.stats);
        if (settings.soundEnabled) ST.playChime("complete", 0.5);
        const meta = THEME_META[settings.selectedTheme] || THEME_META.forest;
        ST.celebrate({ colors: [meta.accent, "#ffffff", "#fbbf24", "#34d399", "#60a5fa"] });
        ST.showToast({ icon: "🎉", title: "Focus complete!", message: `+${xpGain} XP · streak ${result.stats.currentStreak} 🔥`, duration: 4600 });
        for (const ach of result.unlocked) {
          ST.showToast({ icon: ach.icon, title: "Achievement unlocked!", message: ach.title, duration: 5200 });
        }
        if (result.leveledUp) {
          const info = levelInfo(result.stats.xp);
          if (settings.soundEnabled) ST.playChime("levelup", 0.5);
          ST.showToast({ icon: "🎓", title: `Level ${info.level} — ${info.title}!`, message: "Keep the momentum going.", duration: 5200 });
        }
        notifyDesktop("Focus session complete! 🎉", `Great work. +${xpGain} XP earned. Time for a break.`);
      }
    } else {
      const studySeconds = getDuration("study", settings);
      const running = settings.autoStartNext;
      await persist({
        timerMode: "study",
        remainingSeconds: studySeconds,
        currentTotalSeconds: studySeconds,
        timerRunning: running,
        timerEndsAt: running ? Date.now() + studySeconds * 1000 : null,
        lastUpdatedAt: null
      });
      if (settings.soundEnabled) ST.playChime("break", 0.4);
      ST.showToast({ icon: "📚", title: "Break's over", message: "Ready for another focus session?", duration: 4200 });
      notifyDesktop("Break finished", "Ready to focus again?");
    }
  }

  async function maybeCatchUpCompletion(stored) {
    if (!stored.timerRunning || stored.timerMode !== "study") return;
    if (!stored.timerEndsAt || stored.timerEndsAt > Date.now()) return;
    const sessionKey = String(stored.timerEndsAt);
    const current = await ST.getStats();
    if (current.lastSessionKey === sessionKey) return;
    await ST.recordCompletedFocusSession({
      sessionKey,
      sessionSeconds: stored.currentTotalSeconds,
      dailyGoalMinutes: stored.dailyGoalMinutes,
      now: stored.timerEndsAt
    });
  }

  function notifyDesktop(title, message) {
    if (document.visibilityState === "visible") return;
    try {
      chrome.runtime.sendMessage({ type: "STUDYFLOSS_NOTIFY", title, message }, () => chrome.runtime.lastError);
    } catch (_e) { /* ignore */ }
  }

  /* ---------------- ambient sound ---------------- */

  function syncAmbient() {
    const play = pstate.studyModeEnabled && pstate.timerMode === "study" &&
      pstate.timerRunning && pstate.ambientSound && pstate.ambientSound !== "off";
    if (play) {
      if (!ambient) ambient = ST.createAmbientPlayer();
      ambient.setVolume(pstate.ambientVolume);
      ambient.setSound(pstate.ambientSound);
    } else if (ambient) {
      ambient.setSound("off");
    }
  }

  /* ---------------- dragging + positioning ---------------- */

  function setupDragging(target, handle, options) {
    const margin = options.margin || 12;
    let drag = null;

    handle.addEventListener("pointerdown", (event) => {
      // When dragging a container by a sub-handle, ignore clicks on interactive
      // controls. When the handle *is* the draggable element (quick toggle),
      // always allow the drag.
      if (handle !== target && event.target instanceof HTMLElement &&
          event.target.closest("button, select, input, a, textarea")) return;
      const rect = target.getBoundingClientRect();
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
      target.classList.add("is-dragging");
      try { handle.setPointerCapture(event.pointerId); } catch (_e) { /* ignore */ }
      if (handle !== target) event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      moveFloatingElement(target, drag.left + dx, drag.top + dy, document.fullscreenElement ? 24 : margin);
    });

    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const moved = drag.moved;
      drag = null;
      target.classList.remove("is-dragging");
      if (options.onEnd) options.onEnd(target.getBoundingClientRect());
      if (moved && target === handle) {
        target.dataset.suppressClick = "true";
        window.setTimeout(() => { target.dataset.suppressClick = "false"; }, 180);
      }
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function moveFloatingElement(element, left, top, margin) {
    const rect = element.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    element.style.left = `${Math.min(Math.max(margin, left), maxLeft)}px`;
    element.style.top = `${Math.min(Math.max(margin, top), maxTop)}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function applyWidgetPosition(widget) {
    if (document.fullscreenElement || !pstate.widgetPosition) return;
    moveFloatingElement(widget, pstate.widgetPosition.left, pstate.widgetPosition.top, 12);
  }

  function reclampWidget(widget) {
    if (document.fullscreenElement || !widget.style.top) return;
    const rect = widget.getBoundingClientRect();
    moveFloatingElement(widget, rect.left, rect.top, 12);
  }

  function syncFullscreenHost() {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;
    const fs = document.fullscreenElement;
    if (document.body) document.body.classList.toggle(FULLSCREEN_CLASS, Boolean(fs));
    widget.classList.toggle("is-fullscreen-timer", Boolean(fs));

    if (fs && !fs.contains(widget)) {
      fs.appendChild(widget);
      resetPosition(widget);
      if (pstate.fullscreenTimerPosition) moveFloatingElement(widget, pstate.fullscreenTimerPosition.left, pstate.fullscreenTimerPosition.top, 24);
      return;
    }
    if (fs) {
      if (pstate.fullscreenTimerPosition) moveFloatingElement(widget, pstate.fullscreenTimerPosition.left, pstate.fullscreenTimerPosition.top, 24);
      return;
    }
    if (!fs && widget.parentElement !== document.body) {
      document.body.appendChild(widget);
      if (pstate.widgetPosition) applyWidgetPosition(widget);
      else resetPosition(widget);
    }
  }

  function resetPosition(element) {
    element.style.left = "";
    element.style.top = "";
    element.style.right = "";
    element.style.bottom = "";
  }

  window.addEventListener("resize", () => {
    const widget = document.getElementById(WIDGET_ID);
    if (widget && !document.fullscreenElement) applyWidgetPosition(widget);
    const quick = document.getElementById(QUICK_TOGGLE_ID);
    if (quick && pstate.quickTogglePosition) moveFloatingElement(quick, pstate.quickTogglePosition.left, pstate.quickTogglePosition.top, 12);
  });

  window.addEventListener("beforeunload", () => {
    if (navFallbackId) window.clearInterval(navFallbackId);
    if (controller) controller.destroy();
    if (ambient) ambient.stop();
  });
})();
