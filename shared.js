/*
 * Study Floss — shared engine
 * Single source of truth for timer logic, settings, the gamification/stats
 * engine, audio feedback and celebration effects. Loaded in both the popup
 * and the YouTube content script, so everything here is dependency-free and
 * attaches to a single global namespace.
 */
(function () {
  "use strict";

  const THEMES = ["forest", "ocean", "space", "sunset", "rain", "library", "minimal"];

  const THEME_META = {
    forest:  { label: "Forest",   accent: "#22c55e", glow: "rgba(34,197,94,0.45)",  ambient: "forest" },
    ocean:   { label: "Ocean",    accent: "#22d3ee", glow: "rgba(34,211,238,0.45)", ambient: "ocean" },
    space:   { label: "Space",    accent: "#a78bfa", glow: "rgba(167,139,250,0.45)",ambient: "space" },
    sunset:  { label: "Sunset",   accent: "#fb923c", glow: "rgba(251,146,60,0.45)", ambient: "brown" },
    rain:    { label: "Rain",     accent: "#60a5fa", glow: "rgba(96,165,250,0.45)", ambient: "rain" },
    library: { label: "Library",  accent: "#f59e0b", glow: "rgba(245,158,11,0.45)", ambient: "brown" },
    minimal: { label: "Minimal",  accent: "#94a3b8", glow: "rgba(148,163,184,0.4)", ambient: "white" }
  };

  const AMBIENT_OPTIONS = [
    { value: "off",   label: "Off" },
    { value: "rain",  label: "Rain" },
    { value: "ocean", label: "Ocean Waves" },
    { value: "forest",label: "Forest" },
    { value: "brown", label: "Brown Noise" },
    { value: "space", label: "Deep Space" },
    { value: "white", label: "White Noise" }
  ];

  const DEFAULT_DURATIONS = { study: 25 * 60, break: 5 * 60 };

  const DEFAULTS = {
    // timer + focus
    studyModeEnabled: false,
    selectedTheme: "forest",
    timerMode: "study",
    remainingSeconds: 25 * 60,
    currentTotalSeconds: 25 * 60,
    timerRunning: false,
    timerEndsAt: null,
    lastUpdatedAt: null,
    widgetPosition: null,
    quickTogglePosition: null,
    fullscreenTimerPosition: null,
    studyDurationSeconds: 25 * 60,
    breakDurationSeconds: 5 * 60,
    // settings
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    dailyGoalMinutes: 120,
    autoStartNext: false,
    soundEnabled: true,
    ambientSound: "off",
    ambientVolume: 0.5,
    currentTask: ""
  };

  const STORAGE_KEYS = Object.keys(DEFAULTS);
  const STATS_KEY = "studyflossStats";

  const QUOTES = [
    "Small steps every day add up to big results.",
    "Focus is the art of knowing what to ignore.",
    "Discipline is choosing what you want most over what you want now.",
    "The expert in anything was once a beginner.",
    "You don't have to be extreme, just consistent.",
    "Deep work is the superpower of the 21st century.",
    "Done is better than perfect — keep going.",
    "Your future self is watching you right now.",
    "Concentration is the secret of strength.",
    "One focused hour beats a distracted day.",
    "Progress, not perfection.",
    "The pain of discipline weighs ounces; regret weighs tons.",
    "Study now, shine later.",
    "Motivation gets you started. Habit keeps you going.",
    "Every pro was once an amateur who refused to give up."
  ];

  /* ------------------------------------------------------------------ *
   *  Generic helpers
   * ------------------------------------------------------------------ */

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(Math.round(parsed), max));
  }

  function normalizeText(value) {
    return String(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const remainder = String(total % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  // "1h 23m" / "23m" / "45s"
  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${total}s`;
  }

  function dateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function daysBetween(aKey, bKey) {
    const a = new Date(`${aKey}T00:00:00`);
    const b = new Date(`${bKey}T00:00:00`);
    return Math.round((b - a) / 86400000);
  }

  function randomQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  /* ------------------------------------------------------------------ *
   *  Timer state
   * ------------------------------------------------------------------ */

  function getDuration(mode, source) {
    return mode === "break" ? source.breakDurationSeconds : source.studyDurationSeconds;
  }

  function normalizeWidgetPosition(position) {
    if (!position || typeof position !== "object") return null;
    const left = Number(position.left);
    const top = Number(position.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left, top };
  }

  function normalizeState(input) {
    const next = { ...DEFAULTS, ...(input || {}) };

    if (!THEMES.includes(next.selectedTheme)) next.selectedTheme = DEFAULTS.selectedTheme;
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_DURATIONS, next.timerMode)) {
      next.timerMode = DEFAULTS.timerMode;
    }

    next.studyDurationSeconds = clampNumber(next.studyDurationSeconds, 60, 180 * 60, DEFAULT_DURATIONS.study);
    next.breakDurationSeconds = clampNumber(next.breakDurationSeconds, 60, 60 * 60, DEFAULT_DURATIONS.break);
    next.longBreakMinutes = clampNumber(next.longBreakMinutes, 5, 60, DEFAULTS.longBreakMinutes);
    next.sessionsBeforeLongBreak = clampNumber(next.sessionsBeforeLongBreak, 2, 8, DEFAULTS.sessionsBeforeLongBreak);
    next.dailyGoalMinutes = clampNumber(next.dailyGoalMinutes, 10, 16 * 60, DEFAULTS.dailyGoalMinutes);

    const duration = getDuration(next.timerMode, next);
    const maxInterval = Math.max(duration, next.longBreakMinutes * 60);
    const parsedSeconds = Number(next.remainingSeconds);
    next.remainingSeconds = Number.isFinite(parsedSeconds)
      ? Math.max(0, Math.min(Math.round(parsedSeconds), maxInterval))
      : duration;

    next.currentTotalSeconds = clampNumber(next.currentTotalSeconds, 60, maxInterval, duration);
    if (next.currentTotalSeconds < next.remainingSeconds) next.currentTotalSeconds = next.remainingSeconds;

    next.studyModeEnabled = Boolean(next.studyModeEnabled);
    next.timerRunning = Boolean(next.timerRunning);
    next.autoStartNext = Boolean(next.autoStartNext);
    next.soundEnabled = Boolean(next.soundEnabled);
    next.ambientVolume = clampNumber(next.ambientVolume * 100, 0, 100, 50) / 100;
    if (!AMBIENT_OPTIONS.some((o) => o.value === next.ambientSound)) next.ambientSound = "off";
    next.currentTask = String(next.currentTask || "").slice(0, 80);

    next.timerEndsAt = Number.isFinite(Number(next.timerEndsAt)) ? Number(next.timerEndsAt) : null;
    next.lastUpdatedAt = Number.isFinite(Number(next.lastUpdatedAt)) ? Number(next.lastUpdatedAt) : null;
    next.widgetPosition = normalizeWidgetPosition(next.widgetPosition);
    next.quickTogglePosition = normalizeWidgetPosition(next.quickTogglePosition);
    next.fullscreenTimerPosition = normalizeWidgetPosition(next.fullscreenTimerPosition);

    if (next.timerRunning && !next.timerEndsAt && next.lastUpdatedAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - next.lastUpdatedAt) / 1000));
      const migratedRemaining = Math.max(0, next.remainingSeconds - elapsed);
      next.remainingSeconds = migratedRemaining || duration;
      next.timerEndsAt = Date.now() + next.remainingSeconds * 1000;
    }

    if (next.timerRunning && !next.timerEndsAt) {
      next.timerEndsAt = Date.now() + next.remainingSeconds * 1000;
    }

    return next;
  }

  // Pure derivation of "what the timer reads right now". When a running timer
  // crosses zero it flips mode and loads the next duration (paused).
  function deriveTimerState(input) {
    const next = normalizeState(input);
    if (!next.timerRunning || !next.timerEndsAt) return next;

    const remaining = Math.ceil((next.timerEndsAt - Date.now()) / 1000);
    next.remainingSeconds = Math.max(0, remaining);

    if (next.remainingSeconds <= 0) {
      next.timerRunning = false;
      next.timerEndsAt = null;
      next.lastUpdatedAt = null;
      next.timerMode = next.timerMode === "study" ? "break" : "study";
      next.remainingSeconds = getDuration(next.timerMode, next);
      next.currentTotalSeconds = next.remainingSeconds;
    }

    return next;
  }

  /* ------------------------------------------------------------------ *
   *  Gamification / stats engine
   * ------------------------------------------------------------------ */

  function defaultStats() {
    return {
      version: 2,
      totalFocusSeconds: 0,
      sessionsCompleted: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      xp: 0,
      pomodoroCycle: 0,        // completed focus sessions toward next long break
      bestDaySeconds: 0,
      bestDayDate: null,
      history: {},             // { "YYYY-MM-DD": seconds }
      achievements: {},        // { id: unlockedTimestamp }
      lastSessionKey: null     // dedupe guard for completion events
    };
  }

  function normalizeStats(raw) {
    const base = defaultStats();
    if (!raw || typeof raw !== "object") return base;
    const s = { ...base, ...raw };
    s.totalFocusSeconds = Math.max(0, Number(s.totalFocusSeconds) || 0);
    s.sessionsCompleted = Math.max(0, Number(s.sessionsCompleted) || 0);
    s.currentStreak = Math.max(0, Number(s.currentStreak) || 0);
    s.longestStreak = Math.max(0, Number(s.longestStreak) || 0);
    s.xp = Math.max(0, Number(s.xp) || 0);
    s.pomodoroCycle = Math.max(0, Number(s.pomodoroCycle) || 0);
    s.bestDaySeconds = Math.max(0, Number(s.bestDaySeconds) || 0);
    s.history = (s.history && typeof s.history === "object") ? s.history : {};
    s.achievements = (s.achievements && typeof s.achievements === "object") ? s.achievements : {};
    return s;
  }

  // Level curve: total XP needed to *reach* level L is 50 * L * (L - 1).
  // L1:0, L2:100, L3:300, L4:600, L5:1000, L6:1500 ...
  function xpToReach(level) {
    return 50 * level * (level - 1);
  }

  function levelInfo(xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (xpToReach(level + 1) <= safeXp) level += 1;
    const currentFloor = xpToReach(level);
    const nextFloor = xpToReach(level + 1);
    const intoLevel = safeXp - currentFloor;
    const span = nextFloor - currentFloor;
    return {
      level,
      xp: safeXp,
      intoLevel,
      span,
      toNext: Math.max(0, nextFloor - safeXp),
      progress: span > 0 ? Math.min(1, intoLevel / span) : 1,
      title: levelTitle(level)
    };
  }

  function levelTitle(level) {
    if (level >= 40) return "Enlightened";
    if (level >= 30) return "Grandmaster";
    if (level >= 22) return "Sage";
    if (level >= 16) return "Professor";
    if (level >= 11) return "Scholar";
    if (level >= 7) return "Honors Student";
    if (level >= 4) return "Apprentice";
    if (level >= 2) return "Student";
    return "Freshman";
  }

  function todayFocusSeconds(stats) {
    return Math.max(0, Number(stats.history[dateKey()]) || 0);
  }

  // Returns last 7 days (oldest -> newest) of { key, label, seconds }.
  function weeklyHistory(stats) {
    const out = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = dateKey(d);
      out.push({
        key,
        label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
        seconds: Math.max(0, Number(stats.history[key]) || 0),
        isToday: i === 0
      });
    }
    return out;
  }

  const ACHIEVEMENTS = [
    { id: "first_focus", icon: "🌱", title: "First Focus",   desc: "Complete your first focus session.",        test: (s) => s.sessionsCompleted >= 1 },
    { id: "warming_up",  icon: "🔆", title: "Warming Up",    desc: "Complete 5 focus sessions.",                 test: (s) => s.sessionsCompleted >= 5 },
    { id: "in_the_zone", icon: "🎯", title: "In The Zone",   desc: "Complete 25 focus sessions.",                test: (s) => s.sessionsCompleted >= 25 },
    { id: "centurion",   icon: "💯", title: "Centurion",     desc: "Complete 100 focus sessions.",               test: (s) => s.sessionsCompleted >= 100 },
    { id: "first_hour",  icon: "⏳", title: "Hour One",      desc: "Reach 1 hour of total focus.",               test: (s) => s.totalFocusSeconds >= 3600 },
    { id: "ten_hours",   icon: "⚡", title: "Power Hours",   desc: "Reach 10 hours of total focus.",             test: (s) => s.totalFocusSeconds >= 36000 },
    { id: "fifty_hours", icon: "🏆", title: "Scholar",       desc: "Reach 50 hours of total focus.",             test: (s) => s.totalFocusSeconds >= 180000 },
    { id: "deep_work",   icon: "🧠", title: "Deep Work",     desc: "Finish a single 50+ minute session.",        test: (s, c) => c.sessionSeconds >= 3000 },
    { id: "streak_3",    icon: "🔥", title: "On a Roll",     desc: "Keep a 3-day study streak.",                 test: (s) => s.currentStreak >= 3 },
    { id: "streak_7",    icon: "🔥", title: "Unstoppable",   desc: "Keep a 7-day study streak.",                 test: (s) => s.currentStreak >= 7 },
    { id: "streak_30",   icon: "🌟", title: "Iron Will",     desc: "Keep a 30-day study streak.",                test: (s) => s.currentStreak >= 30 },
    { id: "early_bird",  icon: "🌅", title: "Early Bird",    desc: "Finish a session before 8 AM.",              test: (s, c) => c.hour < 8 },
    { id: "night_owl",   icon: "🦉", title: "Night Owl",     desc: "Finish a session after 10 PM.",              test: (s, c) => c.hour >= 22 },
    { id: "goal_crusher",icon: "✅", title: "Goal Crusher",  desc: "Hit your daily focus goal.",                 test: (s, c) => c.todaySeconds >= c.dailyGoalSeconds },
    { id: "level_5",     icon: "🎓", title: "Honor Roll",    desc: "Reach level 5.",                             test: (s) => levelInfo(s.xp).level >= 5 },
    { id: "level_10",    icon: "👑", title: "Dean's List",   desc: "Reach level 10.",                            test: (s) => levelInfo(s.xp).level >= 10 }
  ];

  function getStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STATS_KEY], (stored) => {
        resolve(normalizeStats(stored[STATS_KEY]));
      });
    });
  }

  function saveStats(stats) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STATS_KEY]: stats }, resolve);
    });
  }

  function xpForSession(durationSeconds, stats) {
    const minutes = durationSeconds / 60;
    const base = 10 + Math.round(minutes * 2);
    const streakBonus = Math.min(50, Math.max(0, (stats.currentStreak - 1)) * 5);
    return base + streakBonus;
  }

  // Records a completed focus session. Idempotent: a repeated key is ignored,
  // so multiple YouTube tabs / the popup can call this without double-counting.
  async function recordCompletedFocusSession({ sessionKey, sessionSeconds, dailyGoalMinutes, now }) {
    const stats = normalizeStats(await rawStats());
    const key = String(sessionKey || Date.now());
    if (stats.lastSessionKey === key) {
      return { stats, unlocked: [], leveledUp: false, duplicate: true };
    }

    const when = now ? new Date(now) : new Date();
    const today = dateKey(when);
    const duration = Math.max(0, Math.round(sessionSeconds));
    const prevLevel = levelInfo(stats.xp).level;

    // streak
    if (stats.lastStudyDate !== today) {
      if (stats.lastStudyDate) {
        const gap = daysBetween(stats.lastStudyDate, today);
        stats.currentStreak = gap === 1 ? stats.currentStreak + 1 : 1;
      } else {
        stats.currentStreak = 1;
      }
      stats.lastStudyDate = today;
    } else if (stats.currentStreak === 0) {
      stats.currentStreak = 1;
    }
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);

    stats.totalFocusSeconds += duration;
    stats.sessionsCompleted += 1;
    stats.pomodoroCycle += 1;
    stats.history[today] = (Number(stats.history[today]) || 0) + duration;
    stats.xp += xpForSession(duration, stats);
    stats.lastSessionKey = key;

    if (stats.history[today] > stats.bestDaySeconds) {
      stats.bestDaySeconds = stats.history[today];
      stats.bestDayDate = today;
    }

    pruneHistory(stats);

    const context = {
      sessionSeconds: duration,
      hour: when.getHours(),
      todaySeconds: stats.history[today],
      dailyGoalSeconds: Math.max(1, (Number(dailyGoalMinutes) || 120) * 60)
    };

    const unlocked = [];
    for (const ach of ACHIEVEMENTS) {
      if (!stats.achievements[ach.id] && ach.test(stats, context)) {
        stats.achievements[ach.id] = Date.now();
        unlocked.push(ach);
      }
    }

    await saveStats(stats);
    const leveledUp = levelInfo(stats.xp).level > prevLevel;
    return { stats, unlocked, leveledUp, duplicate: false };
  }

  function rawStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STATS_KEY], (stored) => resolve(stored[STATS_KEY]));
    });
  }

  // Keep history bounded to the last ~120 days.
  function pruneHistory(stats) {
    const keys = Object.keys(stats.history);
    if (keys.length <= 120) return;
    const cutoff = dateKey(new Date(Date.now() - 120 * 86400000));
    for (const k of keys) {
      if (k < cutoff) delete stats.history[k];
    }
  }

  function nextBreakIsLong(stats, sessionsBeforeLongBreak) {
    const n = Math.max(2, Number(sessionsBeforeLongBreak) || 4);
    return stats.pomodoroCycle > 0 && stats.pomodoroCycle % n === 0;
  }

  /* ------------------------------------------------------------------ *
   *  Audio — procedural chimes + ambient soundscapes (no asset files)
   * ------------------------------------------------------------------ */

  let audioCtx = null;
  function ensureAudioContext() {
    if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined") return null;
    if (!audioCtx) {
      const Ctx = typeof AudioContext !== "undefined" ? AudioContext : webkitAudioContext;
      try { audioCtx = new Ctx(); } catch (_e) { return null; }
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  // Create/resume the AudioContext from inside a user gesture so later
  // (non-gesture) chimes are allowed to play.
  function unlockAudio() {
    return ensureAudioContext();
  }

  function playChime(kind = "complete", volume = 0.5) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(ctx.destination);

    let notes;
    if (kind === "break") notes = [523.25, 392.0, 329.63];               // descending, gentle
    else if (kind === "levelup") notes = [523.25, 659.25, 783.99, 1046.5];// sparkly arpeggio
    else notes = [523.25, 659.25, 783.99];                               // C-E-G complete

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      const dur = kind === "levelup" ? 0.5 : 0.6;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.6, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  }

  function createNoiseBuffer(ctx, type) {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (type === "brown") {
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // Returns a controller: { setSound(type), setVolume(v), stop() }
  function createAmbientPlayer() {
    let nodes = null;
    let current = "off";
    let volume = 0.5;

    function teardown() {
      if (!nodes) return;
      try { nodes.source.stop(); } catch (_e) {}
      try { nodes.master.disconnect(); } catch (_e) {}
      if (nodes.lfo) { try { nodes.lfo.stop(); } catch (_e) {} }
      nodes = null;
    }

    function build(type) {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      teardown();

      const noiseType = (type === "brown" || type === "ocean" || type === "forest" || type === "space") ? "brown" : "white";
      const source = ctx.createBufferSource();
      source.buffer = createNoiseBuffer(ctx, noiseType);
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      const master = ctx.createGain();
      master.gain.value = 0;

      let lfo = null;
      let lfoGain = null;

      switch (type) {
        case "rain":
          filter.type = "highpass";
          filter.frequency.value = 1000;
          break;
        case "ocean":
          filter.type = "lowpass";
          filter.frequency.value = 600;
          lfo = ctx.createOscillator();
          lfoGain = ctx.createGain();
          lfo.frequency.value = 0.12;       // slow wave swell
          lfoGain.gain.value = 0.5;
          lfo.connect(lfoGain);
          lfoGain.connect(master.gain);
          break;
        case "forest":
          filter.type = "lowpass";
          filter.frequency.value = 900;
          break;
        case "space":
          filter.type = "lowpass";
          filter.frequency.value = 220;
          break;
        case "white":
          filter.type = "bandpass";
          filter.frequency.value = 1200;
          filter.Q.value = 0.4;
          break;
        case "brown":
        default:
          filter.type = "lowpass";
          filter.frequency.value = 500;
          break;
      }

      source.connect(filter);
      filter.connect(master);
      master.connect(ctx.destination);
      source.start();
      if (lfo) lfo.start();

      const target = targetGainFor(type) * volume;
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.6);
      nodes = { source, filter, master, lfo };
    }

    function targetGainFor(type) {
      if (type === "space") return 0.5;
      if (type === "brown" || type === "ocean") return 0.35;
      if (type === "rain") return 0.3;
      return 0.25;
    }

    return {
      setSound(type) {
        if (type === current && nodes) return;
        current = type;
        if (!type || type === "off") { fadeOutAndStop(); return; }
        build(type);
      },
      setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (nodes) {
          const ctx = ensureAudioContext();
          nodes.master.gain.setTargetAtTime(targetGainFor(current) * volume, ctx.currentTime, 0.2);
        }
      },
      stop() { current = "off"; fadeOutAndStop(); }
    };

    function fadeOutAndStop() {
      if (!nodes) return;
      const ctx = ensureAudioContext();
      if (ctx) nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      const dying = nodes;
      nodes = null;
      setTimeout(() => {
        try { dying.source.stop(); } catch (_e) {}
        try { dying.master.disconnect(); } catch (_e) {}
        if (dying.lfo) { try { dying.lfo.stop(); } catch (_e) {} }
      }, 900);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Confetti celebration (canvas, no dependencies)
   * ------------------------------------------------------------------ */

  function celebrate(options = {}) {
    if (typeof document === "undefined") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const colors = options.colors || ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa"];
    const count = options.count || 130;
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width = window.innerWidth * dpr;
    const H = canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const originX = (options.originX != null ? options.originX : 0.5) * window.innerWidth;
    const originY = (options.originY != null ? options.originY : 0.42) * window.innerHeight;

    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const power = 6 + Math.random() * 11;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power - 6,
        size: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 1
      });
    }

    let raf;
    const start = performance.now();
    function frame(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = false;
      for (const p of particles) {
        p.vy += 0.32;          // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 2600);
        if (p.life > 0 && p.y < window.innerHeight + 40) alive = true;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive && elapsed < 3000) {
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        canvas.remove();
      }
    }
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   *  Toast notifications (shared DOM helper)
   * ------------------------------------------------------------------ */

  function showToast({ icon = "✨", title = "", message = "", duration = 4200 } = {}) {
    if (typeof document === "undefined" || !document.body) return;
    let stack = document.getElementById("studyfloss-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "studyfloss-toast-stack";
      document.body.appendChild(stack);
    }

    const toast = document.createElement("div");
    toast.className = "studyfloss-toast";
    toast.innerHTML = `
      <span class="studyfloss-toast-icon" aria-hidden="true"></span>
      <span class="studyfloss-toast-body">
        <span class="studyfloss-toast-title"></span>
        <span class="studyfloss-toast-message"></span>
      </span>
    `;
    toast.querySelector(".studyfloss-toast-icon").textContent = icon;
    toast.querySelector(".studyfloss-toast-title").textContent = title;
    const msgEl = toast.querySelector(".studyfloss-toast-message");
    if (message) msgEl.textContent = message; else msgEl.remove();

    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));

    const remove = () => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 320);
    };
    setTimeout(remove, duration);
    toast.addEventListener("click", remove);
  }

  /* ------------------------------------------------------------------ *
   *  Export
   * ------------------------------------------------------------------ */

  const STUDYFLOSS = {
    THEMES,
    THEME_META,
    AMBIENT_OPTIONS,
    DEFAULT_DURATIONS,
    DEFAULTS,
    STORAGE_KEYS,
    STATS_KEY,
    QUOTES,
    ACHIEVEMENTS,
    // helpers
    clampNumber,
    normalizeText,
    formatTime,
    formatDuration,
    dateKey,
    daysBetween,
    randomQuote,
    // timer
    getDuration,
    normalizeWidgetPosition,
    normalizeState,
    deriveTimerState,
    // stats
    defaultStats,
    normalizeStats,
    levelInfo,
    levelTitle,
    todayFocusSeconds,
    weeklyHistory,
    getStats,
    saveStats,
    xpForSession,
    recordCompletedFocusSession,
    nextBreakIsLong,
    // feedback
    unlockAudio,
    playChime,
    createAmbientPlayer,
    celebrate,
    showToast
  };

  if (typeof globalThis !== "undefined") globalThis.STUDYFLOSS = STUDYFLOSS;
  if (typeof window !== "undefined") window.STUDYFLOSS = STUDYFLOSS;
})();
