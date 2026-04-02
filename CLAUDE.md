# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A PWA (Progressive Web App) for logging Magic: The Gathering matches. Data is stored in a Google Sheet via a Google Apps Script web app. The frontend is plain HTML + CSS + React (UMD, no build step). There is no package.json, no bundler, no transpilation.

## Deployment

**Frontend:** Hosted on GitHub Pages. Deploy by pushing to `main`. The service worker (`sw.js`) caches all static assets under the key `mtg-journal-v2`. When `app.js` or other assets change, users on the PWA may serve a stale cached version until the service worker updates. There is no way to force-bust the cache from code; users can clear site data manually.

**Backend:** `Code.gs` runs as a Google Apps Script web app. After any change to `Code.gs`, a **new deployment version must be created** in the Apps Script editor (Deploy → Manage deployments → edit → New version). The deployed URL never changes, but the old code keeps running until redeployed.

## Architecture

### No build step

`app.js` is vanilla JS with React loaded from unpkg CDN (`React` and `ReactDOM` are globals). All components use `React.createElement(...)` — no JSX. Changes to `app.js` take effect immediately in a browser that isn't caching via the service worker.

### Data flow

```
Google Sheet (source of truth)
    ↕ via Apps Script web app (Code.gs)
app.js — apiGet() / apiPost()
    ↕
localStorage cache (fast startup + offline)
    ↕
React state (App component)
```

All mutations are **optimistic local-first**: state + cache update synchronously, then the sheet syncs in the background. If the sync fails, an error banner is shown but the local change is kept.

`apiGet()` returns `{ entries, settings }`. `apiPost()` accepts actions: `create`, `update`, `delete`, `saveSettings`. POST uses `Content-Type: text/plain` (not `application/json`) to avoid CORS preflight — Google Apps Script blocks cross-origin preflight requests.

### Settings

Settings (formats, goals, accent color, dark mode) live in two places: `localStorage` (fast) and the Settings sheet tab (cross-device sync). On load, sheet settings overwrite local ones. `SettingsTab` auto-saves to both on every change.

### State management

All app state lives in the `App` component. There is no global store. `SettingsTab` holds local copies of `formats`, `goals`, `accent`, `darkMode` and syncs them up via `onSave` callback.

### Service worker / PWA caching

`sw.js` uses a cache-first strategy with background network refresh. When deploying new versions of `app.js`, the version string in `app.js` (displayed in the header as e.g. `v1.0.15`) is the easiest way to confirm a device has picked up the new build. The cache name (`mtg-journal-v2`) only needs to change if you need to invalidate all cached assets for everyone.

## Entry schema

Each entry has these fields (as stored in the Google Sheet and in localStorage):

| Field | Type | Notes |
|---|---|---|
| `id` | string | Timestamp-based unique ID |
| `date` | string | `YYYY-MM-DD` |
| `format` | string | Matches a name in the formats settings list |
| `result` | string | `"Win"`, `"Lose"`, or `"Draw"` — auto-calculated from wins/losses |
| `notes` | string | Free text |
| `goals` | boolean[] | Length 5, corresponds to goals list in settings |
| `wins` | number \| null | 0, 1, or 2; `null` on legacy entries that predate this field |
| `losses` | number \| null | 0, 1, or 2; `null` on legacy entries that predate this field |

**Result calculation:** `calcResult(wins, losses)` — wins > losses → `"Win"`, losses > wins → `"Lose"`, equal → `"Draw"`. Result is always derived; never stored independently.

**Legacy entries** (before wins/losses were added) have `wins === null`. Components check `entry.wins != null` to decide whether to show the `wins/losses` breakdown. `LogForm` infers default win/loss values when editing a legacy entry: Win → 2/0, Lose → 0/2, Draw → 1/1.

**Sheet columns:** `id, date, format, result, notes, g1–g5, wins, losses` (12 total). The `wins`/`losses` columns were appended at the end so older rows without them remain valid.

## Key conventions

- **Version string:** Every meaningful change to `app.js` should bump the version label near the bottom of the `App` component render (`"v1.0.x"`).
- **RESULT_STYLE:** The single source of truth for Win/Lose/Draw colors. Do not create local result-color objects in components.
- **FormatList keys:** Use `f.name` as the React key (not array index) — format names are enforced unique.
- **Portal pattern:** Any `position: fixed` element rendered inside the `TabSlider` must use `ReactDOM.createPortal(..., document.body)` because the slider's CSS `transform` breaks fixed positioning for descendants.
- **Redeploying Code.gs:** Required after any backend change. The client handles old (array-only) and new (`{ entries, settings }`) response shapes for backwards compatibility.
- **Format rename propagation:** When a format name is changed in settings, `handleFormatRename` in `App` confirms with the user, updates all affected entries in state/cache, then background-syncs each affected entry to the sheet.
