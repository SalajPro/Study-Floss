<div align="center">

<img src="icons/icon128.png" width="96" height="96" alt="Study Floss logo" />

# Study Floss — Focus Mode for YouTube

**Turn YouTube into a focused study zone.** Block the distractions, run a smart Pomodoro timer, build streaks, earn XP, and stay addicted to focus — not the feed.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Chrome](https://img.shields.io/badge/Chrome-supported-success?logo=googlechrome&logoColor=white)](#-install-on-chrome)
[![Edge](https://img.shields.io/badge/Edge-supported-success?logo=microsoftedge&logoColor=white)](#-install-on-microsoft-edge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![No tracking](https://img.shields.io/badge/Privacy-100%25%20local-brightgreen)](#-privacy)

</div>

---

## ✨ What it does

YouTube is built to keep you scrolling. Study Floss flips it into a calm, single-purpose study tool — and adds the kind of progress loops that actually keep you coming back to **study**, not to the feed.

### Focus
- 🚫 **Distraction blocking** — hides Shorts, the home feed, the up-next/recommendation rail, comments, and trending while Study Mode is on.

- 🎬 **Floating timer widget** — a draggable Pomodoro timer that lives on top of YouTube and even follows you into fullscreen video.

### Stay motivated
- ⏱️ **Smart Pomodoro** — configurable focus/break lengths, automatic **long breaks** after a set number of sessions, and optional auto-start.
- 🔥 **Daily streaks** — keep your study streak alive day after day.
- ⭐ **XP & levels** — every completed focus session earns XP; level up from *Freshman* all the way to *Enlightened*.
- 🎯 **Daily goals** — set a target and watch the progress bar fill.
- 🏅 **16 achievements** — unlock badges for sessions, hours, streaks, deep work, early-bird/night-owl runs and more.
- 📊 **Stats dashboard** — today's focus, total focus, sessions, best streak, and a 7-day activity chart.
- 🎉 **Celebrations** — confetti + a gentle chime + an XP toast every time you finish a focus block.

### Make it yours
- 🎨 **7 themes** — Forest, Ocean, Space, Sunset, Rain, Library, Minimal (each recolors the whole UI).
- 🔊 **Ambient soundscapes** — Rain, Ocean Waves, Forest, Brown/White noise and Deep Space, generated in-browser (no audio files, no streaming).
- 🖥️ **Desktop notifications** when a session ends and the tab isn't focused.

---

## 📦 Install

Study Floss isn't on the web stores yet — you install it as an **unpacked extension** (developer mode). It works the same on any Chromium browser.

### 1. Get the code
Download this repository as a ZIP and extract it, **or** clone it:

```bash
git clone https://github.com/SalajPro/Study-Floss.git
```

You should end up with a folder containing `manifest.json` at its root.

### 🟦 Install on Chrome
1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the `Study-Floss` folder (the one with `manifest.json`).
5. Pin Study Floss to the toolbar via the puzzle-piece icon, then open YouTube.

### 🟩 Install on Microsoft Edge
1. Open `edge://extensions`.
2. Toggle **Developer mode** on (bottom-left).
3. Click **Load unpacked**.
4. Select the `Study-Floss` folder (the one with `manifest.json`).
5. Pin it from the extensions menu, then open YouTube. 

> [!NOTE]
> Study Floss uses **Manifest V3**, so it also works on Brave, Opera, Vivaldi and other Chromium-based browsers via the same "Load unpacked" flow.

### Updating
Pull the latest code (or re-download), then click the **reload** ↻ icon on the Study Floss card in `chrome://extensions` / `edge://extensions` and refresh your YouTube tab.

---

## 🚀 Usage

1. Open **YouTube**. A floating Study Floss button appears (or a one-time "Enter the focus zone?" prompt).
2. Click it to turn on **Study Mode** — distractions disappear and the timer widget appears.
3. Hit **Start** to begin a focus session. The ring counts down; finish it to earn XP, grow your streak, and trigger a celebration.
4. Take the break when it offers one (every few sessions becomes a longer break).
5. Click the **Study Floss toolbar icon** anytime to open the full dashboard — stats, streak, level, daily goal, weekly chart, achievements and all settings.
6. Click **End** on the widget (or toggle off in the popup) to return YouTube to normal.

**Tips**
- Drag the timer by its header or the ring to reposition it; it remembers where you put it.
- The widget stays visible (and draggable) even when a video is fullscreen.
- Set your focus/break lengths, long-break cadence, daily goal, theme, ambient sound and auto-start in **Settings**.

---

## 🔒 Privacy

Study Floss is **100% local and offline**.

- No accounts, no servers, no analytics, no tracking.
- All your settings and stats live in your browser's local extension storage (`chrome.storage.local`) and never leave your device.
- It only runs on `youtube.com`. It does not read or modify any other site.
- Permissions used: `storage` (save your settings/stats), `activeTab` (talk to the YouTube tab), `notifications` (optional session-complete alerts).

Uninstalling the extension removes all of its data.

---

## 🤝 Contributing

Contributions are welcome! This is a small, dependency-free codebase that's easy to hack on.

1. Fork the repo and create a branch: `git checkout -b my-feature`.
2. Make your change (no build needed — just edit the files).
3. Load the unpacked extension and test on YouTube (reload the extension after each change).
4. Keep the existing code style; run a quick `node --check <file>.js` on any JS you touch.
5. Open a pull request describing what you changed and why.

Ideas / good first issues: more themes, additional ambient sounds, keyboard shortcuts, an options page, data export/import, and localization.

---

<div align="center">
Made for everyone who opened YouTube "just to study". Now you actually will. 💪
</div>
