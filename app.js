// ─── Firebase ─────────────────────────────────────────────────────────────────

firebase.initializeApp({
  apiKey:            "AIzaSyAuTtqQLcIoyWf2R5ueAd2nY2lFcYEBNWo",
  authDomain:        "food-journal-2f76e.firebaseapp.com",
  projectId:         "food-journal-2f76e",
  storageBucket:     "food-journal-2f76e.firebasestorage.app",
  messagingSenderId: "1005934675076",
  appId:             "1:1005934675076:web:a0b83b77742c368940eed1",
});

const auth = firebase.auth();
const db   = firebase.firestore();


const { useState, useEffect, useRef } = React;

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_GOALS = [
  { id: "g01", text: "Don't let emotions take over. Focus on the game and optimizing my outs.", active: true },
  { id: "g02", text: "Be calm and collected throughout the entire match",                       active: true },
  { id: "g03", text: "Acknowledge bad luck and move on",                                       active: true },
  { id: "g04", text: "Be gracious to opponent",                                                active: true },
  { id: "g05", text: "At end of game, think about decisions I could have done differently",    active: true },
];

/** Generates a unique ID for a new goal. */
function goalId() { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

const DEFAULT_FORMATS = [
  { name: "Duel Commander", active: true },
  { name: "Pauper",         active: true },
  { name: "Legacy",         active: true },
  { name: "Premodern",      active: true },
  { name: "Modern",         active: true },
  { name: "Cube",           active: true },
];

const TABS = ["Daily", "History", "Settings"];

// Shared result styling used by Badge, HistoryTab filter pills, and LogForm.
// `border` is the accent ring color for the selected state on interactive pills.
const RESULT_STYLE = {
  Win:  { background: "#d1fae5", color: "#065f46", border: "#059669" },
  Lose: { background: "#fee2e2", color: "#991b1b", border: "#dc2626" },
  Draw: { background: "#fef9c3", color: "#854d0e", border: "#d97706" },
};

const ACCENT_OPTIONS = [
  { key: "purple",   label: "Purple",   color: "#3C3489" },
  { key: "blue",     label: "Blue",     color: "#185FA5" },
  { key: "teal",     label: "Teal",     color: "#0F6E56" },
  { key: "green",    label: "Green",    color: "#3B6D11" },
  { key: "coral",    label: "Coral",    color: "#993C1D" },
  { key: "pink",     label: "Pink",     color: "#993556" },
  { key: "indigo",   label: "Indigo",   color: "#5B21B6" },
  { key: "amber",    label: "Amber",    color: "#D97706" },
  { key: "red",      label: "Red",      color: "#DC2626" },
  { key: "navy",     label: "Navy",     color: "#1E3A5F" },
  { key: "lime",     label: "Lime",     color: "#4D7C0F" },
  { key: "cyan",     label: "Cyan",     color: "#0E7490" },
  { key: "fuchsia",  label: "Fuchsia",  color: "#86198F" },
  { key: "rust",     label: "Rust",     color: "#7C2D12" },
  { key: "slate",    label: "Slate",    color: "#475569" },
  { key: "graphite", label: "Graphite", color: "#374151" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Returns today's date as a YYYY-MM-DD string in local time. */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/** Returns yesterday's date as a YYYY-MM-DD string. */
function yesterdayStr() {
  return offsetDate(todayStr(), -1);
}

/**
 * Formats a YYYY-MM-DD string for display.
 * Returns "Today", "Yesterday", or a short date like "Apr 2".
 */
function fmtDateShort(str) {
  if (!str) return "";
  if (str === todayStr())     return "Today";
  if (str === yesterdayStr()) return "Yesterday";
  const [, m, d] = str.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+m-1]} ${+d}`;
}

/** Formats a YYYY-MM-DD string as a full date, e.g. "April 2, 2026". */
function fmtDateLong(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[+m-1]} ${+d}, ${y}`;
}

/**
 * Returns a new YYYY-MM-DD string shifted by `days` from `str`.
 * Uses the Date constructor so month/year rollovers are handled correctly.
 */
function offsetDate(str, days) {
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}

/**
 * Derives a Win/Lose/Draw result from game counts.
 * wins > losses → "Win", losses > wins → "Lose", equal → "Draw".
 */
function calcResult(wins, losses) {
  if (wins > losses) return "Win";
  if (losses > wins) return "Lose";
  return "Draw";
}

/**
 * Returns a human-readable relative time string for a Unix timestamp,
 * e.g. "Just now", "3 min ago", "2 hrs ago".
 */
function fmtTimeAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)           return "Just now";
  if (diff < 3600)         return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)        return `${Math.floor(diff / 3600)} hr ago`;
  return fmtDateLong(new Date(ts).toISOString().slice(0, 10));
}

// ─── Test dataset ─────────────────────────────────────────────────────────────

const TEST_MODE_KEY = "mtg-journal-test-mode";

/**
 * Generates an array of fake match entries using the current formats and goals.
 * Each goal gets a randomised hit-probability so the heatmap has realistic spread.
 * Result distribution: ~55% W / ~40% L / ~5% D, spread over the past year.
 */
function generateTestData(formats, goals, count) {
  const n      = count || 200;
  const active = formats.filter(f => f.active).map(f => f.name);
  const gActive = goals.filter(g => g.active);
  if (!active.length) return [];

  // Per-goal hit probability — varies so the heatmap chart looks interesting
  const goalProbs = {};
  gActive.forEach(g => { goalProbs[g.id] = 0.38 + Math.random() * 0.52; });

  const now     = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  const entries = [];

  for (let i = 0; i < n; i++) {
    const ts = now - Math.random() * oneYear;
    const d  = new Date(ts);
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

    const r = Math.random();
    let wins, losses;
    if      (r < 0.55) { wins = 2;   losses = Math.random() < 0.4 ? 1 : 0; }
    else if (r < 0.95) { losses = 2; wins   = Math.random() < 0.4 ? 1 : 0; }
    else               { wins = 1;   losses = 1; }

    const goalMap = {};
    gActive.forEach(g => { goalMap[g.id] = Math.random() < goalProbs[g.id]; });

    entries.push({
      id:     Math.floor(ts) - i,   // -i ensures uniqueness
      date,
      format: active[Math.floor(Math.random() * active.length)],
      result: calcResult(wins, losses),
      wins, losses,
      goals:  goalMap,
      notes:  "",
    });
  }
  return entries;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Loads settings from localStorage, applying data migrations, and falling back
 * to defaults if storage is empty or corrupt.
 *
 * Migrations:
 *   - pre-v1.0: formats were stored as bare strings; converted to { name, active }.
 *   - v1.0.9:   format "DC" renamed to "Duel Commander".
 */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("mtg-journal-settings") || "{}");
    let formats = s.formats || DEFAULT_FORMATS;
    // Migration: pre-v1.0 stored formats as plain strings
    if (formats.length && typeof formats[0] === "string") {
      formats = formats.map(name => ({ name, active: true }));
    }
    // Migration: v1.0.9 renamed "DC" to "Duel Commander"
    formats = formats.map(f => f.name === "DC" ? { ...f, name: "Duel Commander" } : f);
    return {
      formats,
      goals:      s.goals      || DEFAULT_GOALS,
      accent:     s.accent     || "purple",
      darkMode:   s.darkMode   || "auto",
      lastFormat: s.lastFormat || "",
    };
  } catch {
    return { formats: DEFAULT_FORMATS, goals: DEFAULT_GOALS, accent: "purple", darkMode: "auto", lastFormat: "" };
  }
}

/** Persists settings to localStorage. */
function saveSettings(s) {
  localStorage.setItem("mtg-journal-settings", JSON.stringify(s));
}

/**
 * Applies accent color and dark/light/auto mode to the document body via CSS
 * classes. Called on initial load, settings change, and after sheet sync.
 */
function applyTheme(accent, darkMode) {
  const body = document.body;
  body.classList.remove("theme-light", "theme-dark");
  if (darkMode === "light") body.classList.add("theme-light");
  if (darkMode === "dark")  body.classList.add("theme-dark");
  ACCENT_OPTIONS.forEach(a => body.classList.remove(`accent-${a.key}`));
  body.classList.add(`accent-${accent}`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const option = ACCENT_OPTIONS.find(a => a.key === accent) || ACCENT_OPTIONS[0];
    meta.setAttribute("content", option.color);
  }
}

// ─── Local cache ──────────────────────────────────────────────────────────────

const CACHE_KEY = "mtg-journal-entries-cache";

/** Loads the entries cache from localStorage. Returns [] on parse error. */
function cacheLoad() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
}

/** Saves entries to the localStorage cache for offline/fast-startup reads. */
function cacheSave(entries) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entries)); } catch {}
}

// ─── Firestore API ────────────────────────────────────────────────────────────

const entriesCol  = uid => db.collection(`mtg-journal/${uid}/entries`);
const settingsDoc = uid => db.doc(`mtg-journal/${uid}/config/settings`);

/** Loads all entries and settings from Firestore for the signed-in user. */
async function firestoreGet(uid) {
  const [snap, sDoc] = await Promise.all([
    entriesCol(uid).get(),
    settingsDoc(uid).get(),
  ]);
  return {
    entries:  snap.docs.map(d => d.data()),
    settings: sDoc.exists ? sDoc.data() : null,
  };
}

/** Creates or overwrites a single entry document. */
async function firestoreUpsert(uid, entry) {
  await entriesCol(uid).doc(String(entry.id)).set(entry);
}

/** Deletes an entry document by id. */
async function firestoreRemove(uid, id) {
  await entriesCol(uid).doc(String(id)).delete();
}

/** Saves the settings document for the signed-in user. */
async function firestoreSaveSettings(uid, s) {
  await settingsDoc(uid).set(s);
}


// ─── Small shared components ──────────────────────────────────────────────────

/** Renders a row of filled/empty dot pips representing goal completion. */
function ScorePips({ checked, total }) {
  return React.createElement("span", { style: { display: "flex", gap: 4, alignItems: "center" } },
    Array.from({ length: total }).map((_, i) =>
      React.createElement("span", { key: i, style: {
        width: 8, height: 8, borderRadius: "50%", display: "inline-block",
        background: i < checked ? "#059669" : "var(--border2)",
      }})
    )
  );
}

/** Colored pill badge for a match result (Win / Lose / Draw). */
function Badge({ label }) {
  const s = RESULT_STYLE[label] || { background: "var(--surface2)", color: "var(--text2)" };
  return React.createElement("span", {
    style: { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em", ...s }
  }, label);
}

function Spinner() {
  return React.createElement("div", { style: { display: "flex", justifyContent: "center", padding: "3rem 0" } },
    React.createElement("div", { className: "spinner" })
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const signIn = () => {
    setLoading(true);
    setError(null);
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(() => {
        setError("Sign-in failed. Please try again.");
        setLoading(false);
      });
  };

  return React.createElement("div", {
    style: {
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", padding: 32, gap: 16,
    }
  },
    React.createElement("h1", { style: { fontSize: 26, fontWeight: 700, color: "var(--text)", margin: 0 } }, "MTG Journal"),
    React.createElement("p", { style: { fontSize: 14, color: "var(--text2)", textAlign: "center", margin: 0 } },
      "Sign in to access your match history."
    ),
    React.createElement("button", {
      className: "btn-primary",
      onClick: signIn,
      disabled: loading,
      style: { fontSize: 15, padding: "12px 28px", marginTop: 8 },
    }, loading ? "Signing in…" : "Sign in with Google"),
    error && React.createElement("p", { style: { color: "#dc2626", fontSize: 13, margin: 0 } }, error)
  );
}

/** Small all-caps section header used throughout the settings tab. */
function SectionLabel({ children }) {
  return React.createElement("div", {
    style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }
  }, children);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/** Summary bar showing match counts, win rate, and average goals for a set of entries. */
function StatsBar({ entries, goalCount }) {
  if (!entries.length) return null;
  const wins   = entries.filter(e => e.result === "Win").length;
  const losses = entries.filter(e => e.result === "Lose").length;
  const draws  = entries.filter(e => e.result === "Draw").length;
  const avg    = (entries.reduce((s, e) => s + Object.values(e.goals && !Array.isArray(e.goals) ? e.goals : {}).filter(Boolean).length, 0) / entries.length).toFixed(1);
  return React.createElement("div", { className: "stats-grid" },
    [
      { label: "Matches",  val: entries.length },
      { label: "Avg goals",val: `${avg}/${goalCount}` },
      { label: "Win rate", val: entries.length ? `${Math.round(wins / entries.length * 100)}%` : "—" },
      { label: "Wins",     val: wins },
      { label: "Losses",   val: losses },
      { label: "Draws",    val: draws },
    ].map(s => React.createElement("div", { key: s.label, className: "stat-card" },
      React.createElement("div", { className: "stat-val" }, s.val),
      React.createElement("div", { className: "stat-label" }, s.label)
    ))
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

/** SVG line sparkline. data = array of numbers; normalises min–max internally. */
function Sparkline({ data, stroke }) {
  if (!data || data.length < 2) return null;
  const W = 300, H = 56, pad = 5;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 0.001;
  const toX = i => (i / (data.length - 1)) * W;
  const toY = v => H - pad - ((v - min) / range) * (H - pad * 2);
  const pts     = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  const color   = stroke || "var(--accent)";
  return React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    style: { width: "100%", height: H, display: "block" },
    preserveAspectRatio: "none",
  },
    React.createElement("polygon", { points: fillPts, fill: color, fillOpacity: 0.12 }),
    React.createElement("polyline", {
      points: pts, fill: "none", stroke: color, strokeWidth: 1.5,
      strokeLinejoin: "round", strokeLinecap: "round",
      style: { vectorEffect: "non-scaling-stroke" },
    })
  );
}

function ChartCard({ title, subtitle, children }) {
  return React.createElement("div", {
    style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px" }
  },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 } },
      React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.07em" } }, title),
      subtitle && React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } }, subtitle),
    ),
    children
  );
}

/**
 * Three charts shown in HistoryTab below the stats grid.
 *   1. Rolling 10-match win rate (line sparkline)
 *   2. Rolling 10-match avg goals per match (line sparkline)
 *   4. Per-goal achievement % (horizontal bar heatmap)
 * Charts 1 & 2 are hidden when fewer than 10 entries are in the filtered set.
 */
function ChartsSection({ entries, goals }) {
  if (!entries.length) return null;

  const sorted     = [...entries].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
  const activeGoals = goals.filter(g => g.active);
  const WINDOW     = 10;

  // Chart 1 — rolling win rate
  let rollingWR = null;
  if (sorted.length >= WINDOW) {
    rollingWR = [];
    for (let i = WINDOW - 1; i < sorted.length; i++) {
      const w = sorted.slice(i - WINDOW + 1, i + 1);
      rollingWR.push(w.filter(e => e.result === "Win").length / WINDOW);
    }
  }

  // Chart 2 — rolling avg goals/match
  let rollingGoals = null;
  if (sorted.length >= WINDOW && activeGoals.length) {
    const vals = sorted.map(e => {
      const g = e.goals && !Array.isArray(e.goals) ? e.goals : {};
      return Object.values(g).filter(Boolean).length / activeGoals.length;
    });
    rollingGoals = [];
    for (let i = WINDOW - 1; i < sorted.length; i++) {
      const w = vals.slice(i - WINDOW + 1, i + 1);
      rollingGoals.push(w.reduce((s, v) => s + v, 0) / WINDOW);
    }
  }

  // Chart 4 — goal achievement heatmap
  const heatmap = activeGoals.map(goal => {
    const relevant = entries.filter(e => {
      const g = e.goals && !Array.isArray(e.goals) ? e.goals : {};
      return goal.id in g;
    });
    const pct = relevant.length ? relevant.filter(e => e.goals[goal.id]).length / relevant.length : 0;
    return { goal, pct };
  }); // order follows settings, no sort

  const recentWR = rollingWR ? `${Math.round(rollingWR[rollingWR.length - 1] * 100)}% recent` : null;
  const recentGoals = rollingGoals ? `${Math.round(rollingGoals[rollingGoals.length - 1] * activeGoals.length * 10) / 10} / ${activeGoals.length} recent` : null;

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 } },

    rollingGoals && React.createElement(ChartCard, { title: "Goals per match", subtitle: `10-match rolling • ${recentGoals}` },
      React.createElement(Sparkline, { data: rollingGoals })
    ),

    rollingWR && React.createElement(ChartCard, { title: "Win rate trend", subtitle: `10-match rolling • ${recentWR}` },
      React.createElement(Sparkline, { data: rollingWR, stroke: "#059669" })
    ),

    heatmap.length > 0 && React.createElement(ChartCard, { title: "Goal achievement", subtitle: `${entries.length} match${entries.length !== 1 ? "es" : ""}` },
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7 } },
        heatmap.map(({ goal, pct }) =>
          React.createElement("div", { key: goal.id, style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", {
              style: { fontSize: 12, color: "var(--text2)", width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              title: goal.text,
            }, goal.text),
            React.createElement("div", { style: { flex: 1, height: 7, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" } },
              React.createElement("div", { style: { width: `${pct * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 4, transition: "width 0.5s ease" } })
            ),
            React.createElement("span", { style: { fontSize: 12, color: "var(--text2)", width: 30, textAlign: "right", flexShrink: 0 } },
              `${Math.round(pct * 100)}%`
            )
          )
        )
      )
    ),
  );
}

// ─── Log match button ─────────────────────────────────────────────────────────

function LogMatchButton({ onClick }) {
  return React.createElement("button", { className: "log-match-btn", onClick },
    React.createElement("span", { className: "log-match-plus" }, "+"),
    "Log a match"
  );
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function EntryCard({ entry, onOpen }) {
  const entryGoals = entry.goals && !Array.isArray(entry.goals) ? entry.goals : {};
  const score = Object.values(entryGoals).filter(Boolean).length;
  const total = Object.keys(entryGoals).length;
  // Show "Win - 2/1" for entries with wins/losses data; plain badge for legacy entries.
  const hasScore = entry.wins != null && entry.losses != null;
  const resultLabel = hasScore ? `${entry.result} — ${entry.wins}/${entry.losses}` : entry.result;
  const s = RESULT_STYLE[entry.result] || { background: "var(--surface2)", color: "var(--text2)" };
  return React.createElement("div", { onClick: () => onOpen(entry), className: "entry-card" },
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" } },
        React.createElement("span", { style: { fontWeight: 600, fontSize: 14, color: "var(--text)" } }, entry.format),
        entry.result && React.createElement("span", {
          style: { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em", ...s }
        }, resultLabel),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)", marginLeft: "auto" } }, fmtDateLong(entry.date))
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement(ScorePips, { checked: score, total }),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)" } }, `${score}/${total} goals`),
        entry.notes && React.createElement("span", {
          style: { fontSize: 12, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }
        }, `— ${entry.notes}`)
      )
    ),
    React.createElement("span", { style: { fontSize: 18, color: "var(--text3)", flexShrink: 0 } }, "›")
  );
}

function EntryList({ entries, onOpen }) {
  if (!entries.length) return React.createElement("div", { className: "empty-state" }, "No entries here yet.");
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
    entries.map(e => React.createElement(EntryCard, { key: e.id, entry: e, onOpen }))
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
// The active-tab indicator is a separate absolutely-positioned bar that slides
// imperatively (via indicatorRef) to follow swipe gestures in real time.

function TabBar({ active, onChange, indicatorRef }) {
  const tabIdx = TABS.indexOf(active);
  return React.createElement("div", { className: "tab-bar", style: { position: "relative" } },
    TABS.map(t => React.createElement("button", {
      key: t,
      className: `tab-btn ${active === t ? "active" : ""}`,
      onClick: () => onChange(t),
    }, t)),
    React.createElement("div", {
      ref: indicatorRef,
      style: {
        position: "absolute", bottom: 0, left: 0,
        width: `${100 / TABS.length}%`, height: 2,
        background: "var(--accent)",
        transform: `translateX(${tabIdx * 100}%)`,
        transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1), background 0.25s",
        willChange: "transform",
        borderRadius: "1px 1px 0 0",
        pointerEvents: "none",
      }
    })
  );
}

// ─── Sliding tab container ────────────────────────────────────────────────────
// All three tab panels are rendered side-by-side in a flex row at 100% width
// each. The visible panel is controlled by translateX on the inner container.
// Touch-move drags the panels live; touchend snaps to the nearest tab.
// The outer div has overflow:hidden to clip the off-screen panels.

function TabSlider({ tab, setTab, setDailyDate, indicatorRef, children }) {
  const tabIdx      = TABS.indexOf(tab);
  const sliderRef   = useRef(null);
  const touchRef    = useRef(null);   // { x, y, time, swiping }
  const tabIdxRef   = useRef(tabIdx);
  useEffect(() => { tabIdxRef.current = tabIdx; }, [tabIdx]);

  const EASE = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";

  const setIndicator = (pos, animate) => {
    const ind = indicatorRef?.current;
    if (!ind) return;
    const clamped = Math.max(0, Math.min(TABS.length - 1, pos));
    ind.style.transition = animate ? EASE : "none";
    ind.style.transform  = `translateX(${clamped * 100}%)`;
  };

  // Snap to current tab (animated) — also snaps the indicator
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    el.style.transition = EASE;
    el.style.transform  = `translateX(-${tabIdx * 100}%)`;
    setIndicator(tabIdx, true);
  }, [tabIdx]);

  const onTouchStart = e => {
    const x = e.touches[0].clientX;
    // Ignore touches starting within 20px of either edge — that's the Android
    // system back-gesture zone and we don't want to intercept it.
    if (x < 20 || x > window.innerWidth - 20) return;
    touchRef.current = { x, y: e.touches[0].clientY, time: Date.now(), swiping: false };
  };

  const onTouchMove = e => {
    const t = touchRef.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    // Only activate horizontal swipe if clearly more horizontal than vertical
    if (!t.swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) t.swiping = true;
    if (!t.swiping) return;
    const el = sliderRef.current;
    if (!el) return;
    const fraction = dx / el.offsetWidth;
    const offset   = -(tabIdxRef.current * 100) + (fraction * 100);
    el.style.transition = "none";
    el.style.transform  = `translateX(${offset}%)`;
    setIndicator(tabIdxRef.current - fraction, false);
  };

  const onTouchEnd = e => {
    const t = touchRef.current;
    if (!t || !t.swiping) { touchRef.current = null; return; }
    touchRef.current = null;
    const dx = e.changedTouches[0].clientX - t.x;
    const dt = Date.now() - t.time;
    // A flick is a fast short swipe or a longer slow drag
    const isFlick = Math.abs(dx) > 40 || (Math.abs(dx) > 20 && dt < 250);
    let nextIdx = tabIdxRef.current;
    if (isFlick) nextIdx = dx < 0 ? Math.min(TABS.length - 1, nextIdx + 1) : Math.max(0, nextIdx - 1);
    const el = sliderRef.current;
    if (el) {
      el.style.transition = EASE;
      el.style.transform  = `translateX(-${nextIdx * 100}%)`;
    }
    setIndicator(nextIdx, true);
    const nextTab = TABS[nextIdx];
    if (nextTab !== tab) {
      if (nextTab === "Daily") setDailyDate(todayStr());
      setTab(nextTab);
    }
  };

  return React.createElement("div", {
    style: { overflow: "hidden", width: "100%", flex: 1, minHeight: 0 },
    onTouchStart, onTouchMove, onTouchEnd,
  },
    React.createElement("div", {
      ref: sliderRef,
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        transform: `translateX(-${tabIdx * 100}%)`,
        transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
        willChange: "transform",
      },
    }, children)
  );
}

// ─── Scroll panel ─────────────────────────────────────────────────────────────
// Wraps a scrollable tab panel with pull-to-refresh and bottom-overscroll bounce.
// PTR: drag down at top ≥ 64px → location.reload().
// Bounce: at bottom, try to scroll further → brief spring animation on content.

function ScrollPanel({ children, style }) {
  const elRef    = useRef(null);
  const innerRef = useRef(null);
  const ptrRef   = useRef(null);

  useEffect(() => {
    const el    = elRef.current;
    const inner = innerRef.current;
    const ptr   = ptrRef.current;
    if (!el || !inner || !ptr) return;

    const PTR_THRESHOLD = 64;
    const SPRING = 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)';
    let startX = 0, startY = 0, startTop = 0, mode = null, pullY = 0;
    let bottomHitY = null; // clientY at which bottom boundary was first hit

    const stretchScale = overdrag => 1 + Math.sqrt(Math.max(0, overdrag)) * 0.006;

    const springBack = () => {
      inner.style.transition = SPRING;
      inner.style.transform  = '';
      setTimeout(() => { inner.style.transition = ''; }, 400);
    };

    const onTouchStart = e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTop = el.scrollTop;
      mode = null; pullY = 0; bottomHitY = null;
    };

    const onTouchMove = e => {
      const currentY = e.touches[0].clientY;
      const dy  = currentY - startY;
      const adx = Math.abs(e.touches[0].clientX - startX);
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 1;

      // Determine mode on first decisive move
      if (mode === null && (Math.abs(dy) > 8 || adx > 8)) {
        const ptrCandidate = startTop === 0 && dy > 0 && Math.abs(dy) >= adx;
        mode = ptrCandidate ? 'ptr' : 'scroll';
      }

      if (mode === 'ptr') {
        e.preventDefault();
        pullY = Math.min(dy * 0.45, 80);
        inner.style.transform = `translateY(${pullY}px)`;
        ptr.style.transform   = `translateY(${pullY - 44}px)`;
        ptr.style.opacity     = String(Math.min(pullY / PTR_THRESHOLD, 1));
        ptr.textContent       = pullY >= PTR_THRESHOLD ? '↑ Release to refresh' : '↓ Pull to refresh';
        return;
      }

      // Reactive bottom stretch — live during drag
      if (atBottom && dy < 0) {
        if (bottomHitY === null) bottomHitY = currentY; // record where bottom was first hit
        const overdrag = bottomHitY - currentY;         // px dragged past bottom
        inner.style.transition = 'none';
        inner.style.transform  = `scaleY(${stretchScale(overdrag).toFixed(5)})`;
      } else if (bottomHitY !== null) {
        // Scrolled back up off the bottom boundary mid-gesture — spring back immediately
        bottomHitY = null;
        springBack();
      }
    };

    const onTouchEnd = () => {
      if (mode === 'ptr') {
        if (pullY >= PTR_THRESHOLD) {
          ptr.textContent = 'Refreshing…';
          setTimeout(() => location.reload(), 400);
        } else {
          inner.style.transition = 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)';
          ptr.style.transition   = 'transform 0.3s, opacity 0.3s';
          inner.style.transform  = '';
          ptr.style.transform    = 'translateY(-44px)';
          ptr.style.opacity      = '0';
          setTimeout(() => { inner.style.transition = ''; ptr.style.transition = ''; }, 300);
        }
      } else if (bottomHitY !== null) {
        springBack();
        bottomHitY = null;
      }
      mode = null; pullY = 0;
    };

    // Wheel stretch (trackpad / desktop mouse wheel)
    let wheelAccum = 0, wheelTimer = null;
    const onWheel = e => {
      if (e.deltaY <= 0) { wheelAccum = 0; return; }
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 1;
      if (!atBottom) { wheelAccum = 0; return; }
      wheelAccum = Math.min(wheelAccum + e.deltaY * 0.4, 60);
      inner.style.transition = 'none';
      inner.style.transform  = `scaleY(${stretchScale(wheelAccum).toFixed(5)})`;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        springBack();
        wheelAccum = 0;
      }, 80);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    el.addEventListener('wheel',      onWheel,      { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
      el.removeEventListener('wheel',      onWheel);
      clearTimeout(wheelTimer);
    };
  }, []);

  return React.createElement("div", {
    ref: elRef,
    style: { position: "relative", overflowY: "auto", WebkitOverflowScrolling: "touch", ...style },
  },
    React.createElement("div", {
      ref: ptrRef,
      style: {
        position: "absolute", top: 0, left: 0, right: 0, height: 44,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, color: "var(--text2)",
        transform: "translateY(-44px)", opacity: 0,
        pointerEvents: "none", userSelect: "none", zIndex: 10,
      }
    }),
    React.createElement("div", {
      ref: innerRef,
      style: { transformOrigin: "center bottom" },
    }, children)
  );
}

// ─── Compact date nav (header area) ──────────────────────────────────────────

function DateNav({ date, onChange }) {
  const atLatest = date >= todayStr(); // true when already at today or beyond
  const inputRef = React.useRef(null);
  return React.createElement("div", { className: "date-nav-compact" },
    React.createElement("button", {
      className: "date-nav-arrow",
      onClick: () => onChange(offsetDate(date, -1)),
    }, "‹"),
    React.createElement("div", {
      style: { position: "relative", cursor: "pointer" },
      onClick: () => inputRef.current && inputRef.current.showPicker && inputRef.current.showPicker(),
    },
      React.createElement("span", { className: "date-nav-label" }, fmtDateShort(date)),
      React.createElement("input", {
        ref: inputRef,
        type: "date",
        value: date,
        max: todayStr(),
        onChange: e => { if (e.target.value) onChange(e.target.value); },
        style: {
          position: "absolute", inset: 0, opacity: 0,
          width: "100%", height: "100%", cursor: "pointer",
          border: "none", padding: 0,
        },
      })
    ),
    React.createElement("button", {
      className: "date-nav-arrow",
      onClick: () => onChange(offsetDate(date, 1)),
      disabled: atLatest,
      style: { opacity: atLatest ? 0.3 : 1 },
    }, "›")
  );
}

// ─── Daily tab ────────────────────────────────────────────────────────────────
// The log form is always visible inline. After each save, formKey increments
// which remounts LogForm with fresh state. Changing the date also resets the
// form so the default date stays in sync with the day navigator.

function DailyTab({ entries, goals, date, onOpen, onSave, settings, onFormatChange, isActive }) {
  const [formKey, setFormKey] = useState(0);
  const dayEntries = entries.filter(e => e.date === date).sort((a, b) => b.id - a.id);

  const handleSave = form => {
    onSave(form);
    setFormKey(k => k + 1);
  };

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement(LogForm, {
      key: `${formKey}-${date}`,
      settings,
      defaultDate: date,
      onSave: handleSave,
      onFormatChange,
      isActive,
    }),
    dayEntries.length > 0 && React.createElement("div", {
      style: { borderTop: "1px solid var(--border)", paddingTop: 16 }
    },
      React.createElement(EntryList, { entries: dayEntries, onOpen })
    ),
    // Spacer so the last item isn't hidden behind the fixed Log Entry bar
    React.createElement("div", { style: { height: 72 } }),
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

// Date range presets. "custom" reveals the start/end date pickers.
const DATE_PRESETS = ["All time", "Today", "7 days", "30 days", "Custom"];

function HistoryTab({ entries, goals, formats, onOpen }) {
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [results,         setResults]         = useState([]);
  const [datePreset,      setDatePreset]      = useState("All time");
  const [dateFrom,        setDateFrom]        = useState("");
  const [dateTo,          setDateTo]          = useState("");

  const activeNames = formats.filter(f => f.active).map(f => f.name);

  const toggleResult = r => setResults(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleFormat = name => setSelectedFormats(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);

  // Derive the effective date bounds from the selected preset
  const effectiveDateFrom = () => {
    if (datePreset === "Today")   return todayStr();
    if (datePreset === "7 days")  return offsetDate(todayStr(), -6);
    if (datePreset === "30 days") return offsetDate(todayStr(), -29);
    if (datePreset === "Custom")  return dateFrom;
    return ""; // All time
  };
  const effectiveDateTo = () => {
    if (datePreset === "Today")  return todayStr();
    if (datePreset === "7 days" || datePreset === "30 days") return todayStr();
    if (datePreset === "Custom") return dateTo;
    return "";
  };

  const from = effectiveDateFrom();
  const to   = effectiveDateTo();

  const filtered = entries.filter(e => {
    if (selectedFormats.length && !selectedFormats.includes(e.format)) return false;
    if (results.length         && !results.includes(e.result))         return false;
    if (from && e.date < from) return false;
    if (to   && e.date > to)   return false;
    return true;
  }).sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : b.id - a.id);

  const hasFilters = selectedFormats.length || results.length || datePreset !== "All time";

  const clearFilters = () => {
    setSelectedFormats([]); setResults([]);
    setDatePreset("All time"); setDateFrom(""); setDateTo("");
  };

  // Shared pill style used by all three filter rows
  const pill = (label, active, onClick, colorStyle) => React.createElement("button", {
    key: label, onClick,
    style: {
      padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
      cursor: "pointer", transition: "all 0.12s",
      ...(active
        ? (colorStyle || { background: "var(--accent-light)", color: "var(--accent-text)", border: "1.5px solid var(--accent)" })
        : { background: "var(--surface)", color: "var(--text2)", border: "1px solid var(--border)" }),
    }
  }, label);

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },

    // Format filter
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Format"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
        activeNames.map(name => pill(name, selectedFormats.includes(name), () => toggleFormat(name)))
      )
    ),

    // Result filter
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Result"),
      React.createElement("div", { style: { display: "flex", gap: 6 } },
        ["Win", "Lose", "Draw"].map(r => {
          const sel = results.includes(r);
          const s   = RESULT_STYLE[r];
          return pill(r, sel, () => toggleResult(r),
            sel ? { background: s.background, color: s.color, border: `1.5px solid ${s.border}` } : null
          );
        })
      )
    ),

    // Date range filter
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Date range"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
        DATE_PRESETS.map(p => pill(p, datePreset === p, () => setDatePreset(p)))
      ),
      // Custom date pickers — only shown when Custom is selected
      datePreset === "Custom" && React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 8 } },
        React.createElement("div", { style: { position: "relative", flex: 1 } },
          React.createElement("input", {
            type: "date", value: dateFrom,
            onChange: e => { setDateFrom(e.target.value); if (!dateTo) setDateTo(e.target.value); },
            style: { width: "100%", colorScheme: "normal" },
          }),
          !dateFrom && React.createElement("span", {
            style: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text3)", pointerEvents: "none" }
          }, "Start")
        ),
        React.createElement("span", { style: { color: "var(--text3)", fontSize: 13, flexShrink: 0 } }, "→"),
        React.createElement("div", { style: { position: "relative", flex: 1 } },
          React.createElement("input", {
            type: "date", value: dateTo, onChange: e => setDateTo(e.target.value),
            style: { width: "100%", colorScheme: "normal" },
          }),
          !dateTo && React.createElement("span", {
            style: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text3)", pointerEvents: "none" }
          }, "End")
        )
      )
    ),

    // Clear filters — full-width row, only shown when any filter is active
    hasFilters && React.createElement("button", {
      onClick: clearFilters,
      style: {
        width: "100%", padding: "8px", fontSize: 13, color: "var(--text2)",
        background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
        cursor: "pointer",
      }
    }, "Clear filters"),

    React.createElement(StatsBar, { entries: filtered, goalCount: goals.length }),
    React.createElement(ChartsSection, { entries: filtered, goals }),
    React.createElement(EntryList, { entries: filtered, onOpen }),
  );
}

// ─── Draggable format list ────────────────────────────────────────────────────
// Each row has a drag handle (⠿). Dragging it lifts the row into a floating
// ghost (rendered via portal to escape the TabSlider's CSS transform, which
// would otherwise break position:fixed). The original row turns invisible and
// surrounding rows shift with translateY to show where the item will land.

const ROW_H = 52; // px per row including gap — used to compute ghost position and row shifts

function ToggleSwitch({ checked, onChange }) {
  return React.createElement("button", {
    onClick: onChange,
    style: {
      position: "relative", display: "inline-flex", alignItems: "center",
      width: 36, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
      flexShrink: 0, padding: 0,
      background: checked ? "var(--accent)" : "var(--border)",
      transition: "background 0.2s",
    }
  },
    React.createElement("span", {
      style: {
        position: "absolute",
        left: checked ? 16 : 2,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }
    })
  );
}

function FormatList({ formats, onChange, onRename }) {
  const [dragging, setDragging] = useState(null); // index of the row being dragged
  const [dragY,    setDragY]    = useState(0);    // current cursor Y (viewport coords)
  const [overIdx,  setOverIdx]  = useState(null); // index the dragged item would land on
  const listRef    = useRef(null);
  // Refs mirror state so touch event handlers (which close over stale state) can
  // still read the current values without needing to be re-registered.
  const draggingRef = useRef(null);
  const overIdxRef  = useRef(null);

  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { overIdxRef.current  = overIdx;  }, [overIdx]);

  /** Returns the index the dragged row should land on given a viewport Y. */
  const getOverIdx = (clientY) => {
    if (!listRef.current) return 0;
    const rows = [...listRef.current.querySelectorAll("[data-fmt-row]")];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  };

  const startDrag = (clientY, i) => { setDragging(i); setDragY(clientY); setOverIdx(i); };
  const moveDrag  = (clientY)    => { if (draggingRef.current === null) return; setDragY(clientY); setOverIdx(getOverIdx(clientY)); };
  const endDrag   = ()           => {
    const from = draggingRef.current;
    const to   = overIdxRef.current;
    if (from !== null && to !== null && from !== to) {
      const arr = [...formats];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      onChange(arr);
    }
    setDragging(null); setOverIdx(null);
  };

  /**
   * Returns the translateY offset (px) for row `i` while a drag is in progress.
   * Rows between the drag origin and the current hover target slide to make room.
   */
  const getShift = (i) => {
    if (dragging === null || overIdx === null || i === dragging) return 0;
    if (dragging < overIdx) {
      if (i > dragging && i <= overIdx) return -ROW_H;
    } else {
      if (i >= overIdx && i < dragging) return ROW_H;
    }
    return 0;
  };

  const toggleActive = (i) => onChange(formats.map((f, j) => j === i ? { ...f, active: !f.active } : f));
  const remove       = (i) => onChange(formats.filter((_, j) => j !== i));

  // Tracks the name when an input is focused so onRename fires only on actual change.
  const focusedNameRef = useRef("");

  const ghostFmt = dragging !== null ? formats[dragging] : null;

  return React.createElement("div", { style: { position: "relative" } },

    // Ghost row: floats at the cursor, rendered via portal so it escapes the
    // TabSlider's CSS transform (which breaks position:fixed for descendants).
    ghostFmt && ReactDOM.createPortal(React.createElement("div", {
      style: {
        position: "fixed",
        left: "50%",
        top: dragY - ROW_H / 2,
        transform: "translateX(-50%)",
        zIndex: 1000,
        width: listRef.current ? listRef.current.offsetWidth : 280,
        background: "var(--surface)",
        border: "2px solid var(--accent)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        display: "flex", alignItems: "center", gap: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
        pointerEvents: "none",
        opacity: 0.97,
      }
    },
      React.createElement("span", { style: { fontSize: 18, color: "var(--accent-text)", flexShrink: 0, lineHeight: 1 } }, "⠿"),
      React.createElement("span", { style: { flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text)" } }, ghostFmt.name)
    ), document.body),

    React.createElement("div", {
      ref: listRef,
      style: { display: "flex", flexDirection: "column", gap: 6 },
      onMouseMove:  e => moveDrag(e.clientY),
      onMouseUp:    endDrag,
      onMouseLeave: dragging !== null ? endDrag : undefined,
    },
      formats.map((f, i) => {
        const isDragged = dragging === i;
        const shift = getShift(i);
        // key: f.name (not index) so React correctly reconciles rows after
        // reorder/delete and doesn't assign edit state to the wrong row.
        return React.createElement("div", {
          key: f.name,
          "data-fmt-row": true,
          style: {
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            display: "flex", alignItems: "center", gap: 10,
            opacity: isDragged ? 0 : 1,
            transform: `translateY(${shift}px)`,
            transition: isDragged ? "opacity 0.1s" : "transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.1s",
            userSelect: "none",
            willChange: "transform",
          }
        },
          React.createElement("span", {
            style: { fontSize: 18, color: "var(--text3)", cursor: "grab", flexShrink: 0, lineHeight: 1, touchAction: "none" },
            onMouseDown:  e => { e.preventDefault(); startDrag(e.clientY, i); },
            onTouchStart: e => { e.preventDefault(); e.stopPropagation(); startDrag(e.touches[0].clientY, i); },
            onTouchMove:  e => { e.preventDefault(); e.stopPropagation(); moveDrag(e.touches[0].clientY); },
            onTouchEnd:   e => { e.stopPropagation(); endDrag(); },
          }, "⠿"),

          React.createElement("input", {
            value: f.name,
            onChange: e => onChange(formats.map((fmt, j) => j === i ? { ...fmt, name: e.target.value } : fmt)),
            onFocus: () => { focusedNameRef.current = f.name; },
            onBlur: e => {
              const trimmed = e.target.value.trim();
              const old = focusedNameRef.current;
              if (!trimmed) {
                onChange(formats.map((fmt, j) => j === i ? { ...fmt, name: old } : fmt));
              } else if (trimmed !== old && onRename) {
                onRename(old, trimmed);
              }
            },
            onKeyDown: e => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); },
            style: {
              flex: 1, fontSize: 14,
              color: f.active ? "var(--text)" : "var(--text3)",
              textDecoration: f.active ? "none" : "line-through",
            },
          }),

          React.createElement(ToggleSwitch, { checked: f.active, onChange: () => toggleActive(i) }),

          React.createElement("button", {
            onClick: () => { if (window.confirm(`Delete "${f.name}"?`)) remove(i); },
            title: "Delete",
            style: { background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }
          }, "×")
        );
      })
    )
  );
}

// ─── Goal list ────────────────────────────────────────────────────────────────
// Draggable, editable list of goal objects { id, text, active }.
// Modeled after FormatList — same portal pattern for drag ghost.

const GOAL_ROW_H = 82; // approximate px per row — used for shift animation

function GoalList({ goals, onChange }) {
  const [dragging, setDragging] = useState(null);
  const [dragY,    setDragY]    = useState(0);
  const [overIdx,  setOverIdx]  = useState(null);
  const listRef    = useRef(null);
  const draggingRef = useRef(null);
  const overIdxRef  = useRef(null);

  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { overIdxRef.current  = overIdx;  }, [overIdx]);

  const getOverIdx = clientY => {
    if (!listRef.current) return 0;
    const rows = [...listRef.current.querySelectorAll("[data-goal-row]")];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  };

  const startDrag = (clientY, i) => { setDragging(i); setDragY(clientY); setOverIdx(i); };
  const moveDrag  = clientY => { if (draggingRef.current === null) return; setDragY(clientY); setOverIdx(getOverIdx(clientY)); };
  const endDrag   = () => {
    const from = draggingRef.current, to = overIdxRef.current;
    if (from !== null && to !== null && from !== to) {
      const arr = [...goals];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      onChange(arr);
    }
    setDragging(null); setOverIdx(null);
  };

  const getShift = i => {
    if (dragging === null || overIdx === null || i === dragging) return 0;
    if (dragging < overIdx) { if (i > dragging && i <= overIdx) return -GOAL_ROW_H; }
    else                    { if (i >= overIdx && i < dragging) return GOAL_ROW_H; }
    return 0;
  };

  const toggleActive = i => onChange(goals.map((g, j) => j === i ? { ...g, active: !g.active } : g));
  const remove       = i => { if (window.confirm("Delete this goal?")) onChange(goals.filter((_, j) => j !== i)); };
  const setText      = (i, v) => onChange(goals.map((g, j) => j === i ? { ...g, text: v } : g));

  const ghostGoal = dragging !== null ? goals[dragging] : null;

  return React.createElement("div", { style: { position: "relative" } },

    ghostGoal && ReactDOM.createPortal(React.createElement("div", {
      style: {
        position: "fixed", left: "50%", top: dragY - GOAL_ROW_H / 2,
        transform: "translateX(-50%)", zIndex: 1000,
        width: listRef.current ? listRef.current.offsetWidth : 280,
        background: "var(--surface)", border: "2px solid var(--accent)",
        borderRadius: "var(--radius-sm)", padding: "10px 12px",
        display: "flex", alignItems: "flex-start", gap: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,0.22)", pointerEvents: "none", opacity: 0.97,
      }
    },
      React.createElement("span", { style: { fontSize: 18, color: "var(--accent-text)", flexShrink: 0, lineHeight: 1.4 } }, "⠿"),
      React.createElement("span", { style: { flex: 1, fontSize: 13, color: "var(--text)", lineHeight: 1.5 } }, ghostGoal.text || React.createElement("em", null, "empty"))
    ), document.body),

    React.createElement("div", {
      ref: listRef,
      style: { display: "flex", flexDirection: "column", gap: 6 },
      onMouseMove: e => moveDrag(e.clientY),
      onMouseUp: endDrag,
      onMouseLeave: dragging !== null ? endDrag : undefined,
    },
      goals.map((g, i) => {
        const isDragged = dragging === i;
        return React.createElement("div", {
          key: g.id,
          "data-goal-row": true,
          style: {
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "8px 10px",
            display: "flex", alignItems: "flex-start", gap: 8,
            opacity: isDragged ? 0 : 1,
            transform: `translateY(${getShift(i)}px)`,
            transition: isDragged ? "opacity 0.1s" : "transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.1s",
            userSelect: "none", willChange: "transform",
          }
        },
          React.createElement("span", {
            style: { fontSize: 18, color: "var(--text3)", cursor: "grab", flexShrink: 0, lineHeight: 1.6, touchAction: "none" },
            onMouseDown:  e => { e.preventDefault(); startDrag(e.clientY, i); },
            onTouchStart: e => { e.preventDefault(); e.stopPropagation(); startDrag(e.touches[0].clientY, i); },
            onTouchMove:  e => { e.preventDefault(); e.stopPropagation(); moveDrag(e.touches[0].clientY); },
            onTouchEnd:   e => { e.stopPropagation(); endDrag(); },
          }, "⠿"),
          React.createElement("textarea", {
            value: g.text, rows: 2,
            onChange: e => setText(i, e.target.value),
            style: {
              flex: 1, fontSize: 13, resize: "vertical", userSelect: "text",
              color: g.active ? "var(--text)" : "var(--text3)",
            },
          }),
          React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0, alignSelf: "center" } },
            React.createElement(ToggleSwitch, { checked: g.active, onChange: () => toggleActive(i) }),
            React.createElement("button", {
              onClick: () => remove(i),
              style: { background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 20, lineHeight: 1, padding: "2px 4px", textAlign: "center" }
            }, "×")
          )
        );
      })
    )
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ settings, onSave, onFormatRename, lastSynced, uid, user, testMode, onTestMode }) {
  const [formats,       setFormats]       = useState(settings.formats);
  const [goals,         setGoals]         = useState(settings.goals);
  const [accent,        setAccent]        = useState(settings.accent);
  const [darkMode,      setDarkMode]      = useState(settings.darkMode);
  const [newFmt,        setNewFmt]        = useState("");
  const mounted = useRef(false);

  useEffect(() => { applyTheme(accent, darkMode); }, [accent, darkMode]);

  // Auto-save to localStorage and Firestore whenever any setting changes.
  // Skips the initial mount so we don't overwrite settings that just loaded.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const s = { ...settings, formats, goals, accent, darkMode };
    saveSettings(s);
    onSave(s);
    firestoreSaveSettings(uid, s).catch(() => {});
  }, [formats, goals, accent, darkMode]);

  const addFormat = () => {
    const v = newFmt.trim();
    if (v && !formats.find(f => f.name === v)) {
      setFormats([...formats, { name: v, active: true }]);
      setNewFmt("");
    }
  };

  const addGoal = () => setGoals([...goals, { id: goalId(), text: "", active: true }]);


  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 28 } },

    React.createElement("div", null,
      React.createElement(SectionLabel, null, "Formats"),
      React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginBottom: 10 } },
        "Drag ⠿ to reorder • tap name to rename • toggle Active/Hidden"
      ),
      React.createElement(FormatList, { formats, onChange: setFormats, onRename: onFormatRename }),
      React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
        React.createElement("input", {
          type: "text", placeholder: "Add format…", value: newFmt,
          onChange: e => setNewFmt(e.target.value),
          onKeyDown: e => { if (e.key === "Enter") addFormat(); },
          style: { flex: 1, fontSize: 13 },
        }),
        React.createElement("button", { className: "btn-primary", onClick: addFormat }, "Add")
      ),
      React.createElement("button", {
        onClick: () => { if (window.confirm("Reset formats to defaults?")) setFormats(DEFAULT_FORMATS); },
        style: { marginTop: 8, fontSize: 12, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }
      }, "Reset to defaults")
    ),

    React.createElement("div", null,
      React.createElement(SectionLabel, null, "Mental game goals"),
      React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginBottom: 10 } },
        "Drag ⠿ to reorder • edit text inline • toggle Active/Hidden"
      ),
      React.createElement(GoalList, { goals, onChange: setGoals }),
      React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
        React.createElement("button", { className: "btn-primary", onClick: addGoal }, "+ Add goal"),
        React.createElement("button", {
          onClick: () => { if (window.confirm("Reset goals to defaults?")) setGoals(DEFAULT_GOALS); },
          style: { fontSize: 12, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }
        }, "Reset to defaults")
      )
    ),

    React.createElement("div", null,
      React.createElement(SectionLabel, null, `Accent color — ${ACCENT_OPTIONS.find(a => a.key === accent)?.label || ""}`),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } },
        ACCENT_OPTIONS.map(a =>
          React.createElement("button", {
            key: a.key, onClick: () => setAccent(a.key), title: a.label,
            style: {
              width: 36, height: 36, borderRadius: "50%", background: a.color,
              border: "3px solid transparent", cursor: "pointer", padding: 0,
              boxShadow: accent === a.key ? `0 0 0 2px var(--bg), 0 0 0 4px ${a.color}` : "none",
              transition: "box-shadow 0.15s",
            }
          })
        )
      )
    ),

    React.createElement("div", null,
      React.createElement(SectionLabel, null, "Appearance"),
      React.createElement("div", { className: "mode-toggle" },
        ["auto", "light", "dark"].map(m =>
          React.createElement("button", {
            key: m,
            className: `mode-btn ${darkMode === m ? "active" : ""}`,
            onClick: () => setDarkMode(m),
          }, m.charAt(0).toUpperCase() + m.slice(1))
        )
      )
    ),

    React.createElement("div", null,
      React.createElement(SectionLabel, null, "Account"),
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        React.createElement("span", { style: { fontSize: 13, color: "var(--text2)" } }, user?.email || ""),
        React.createElement("button", {
          className: "btn-ghost",
          onClick: () => auth.signOut(),
          style: { fontSize: 13 },
        }, "Sign out")
      ),
      lastSynced && React.createElement("div", { style: { marginTop: 6, fontSize: 12, color: "var(--text3)" } },
        `Last loaded from cloud: ${fmtTimeAgo(lastSynced)}`
      )
    ),

    React.createElement("div", null,
      React.createElement(SectionLabel, null, "Test mode"),
      React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginBottom: 10 } },
        "Load ~200 generated entries to preview stats and charts. Your real data is untouched."
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        React.createElement("span", { style: { fontSize: 13, color: testMode ? "#D97706" : "var(--text2)", fontWeight: testMode ? 600 : 400 } },
          testMode ? "Active — showing generated data" : "Inactive"
        ),
        React.createElement(ToggleSwitch, {
          checked: !!testMode,
          onChange: () => {
            if (testMode) {
              onTestMode(false, null);
            } else {
              onTestMode(true, generateTestData(formats, goals, 200));
            }
          },
        })
      )
    ),

  );
}

// ─── Log form ─────────────────────────────────────────────────────────────────

/**
 * Used for both new entries and edits. When `initial` is provided the form
 * is pre-populated. Goal booleans are normalized to the current goals list
 * length (padded with false or truncated) in case the user has changed their
 * goals since the entry was first saved.
 *
 * Result is derived automatically from wins/losses via calcResult().
 * For legacy entries being edited (no stored wins/losses), sensible defaults
 * are inferred from the stored result string.
 */
function LogForm({ initial, settings, defaultDate, onSave, onCancel, isEdit, onFormatChange, isActive = true }) {
  const activeFormats = settings.formats.filter(f => f.active).map(f => f.name);
  const activeGoals   = settings.goals.filter(g => g.active);

  // Pick default format: existing format when editing, else last-used if still
  // active, else first active format.
  const defaultFormat = initial
    ? initial.format
    : (activeFormats.includes(settings.lastFormat) ? settings.lastFormat : activeFormats[0] || "");

  // Build initial goals map from active goals, seeding from any saved values.
  const initGoalsMap = () => {
    const map = {};
    activeGoals.forEach(g => { map[g.id] = initial?.goals?.[g.id] ?? false; });
    return map;
  };

  // For legacy entries (no wins/losses stored), infer sensible defaults from
  // the stored result so the calculated result matches after editing.
  const defaultWins   = initial?.wins   != null ? initial.wins
    : initial?.result === "Win"  ? 2
    : initial?.result === "Lose" ? 0
    : 1;
  const defaultLosses = initial?.losses != null ? initial.losses
    : initial?.result === "Win"  ? 0
    : initial?.result === "Lose" ? 2
    : 1;

  const [form, setForm] = useState(initial
    ? { ...initial, goals: initGoalsMap(), wins: defaultWins, losses: defaultLosses }
    : { date: defaultDate || todayStr(), format: defaultFormat, notes: "", goals: initGoalsMap(), wins: 0, losses: 0 }
  );
  const [validationError, setValidationError] = useState("");

  const result = calcResult(form.wins, form.losses);

  const toggle = id => {
    setForm(f => ({ ...f, goals: { ...f.goals, [id]: !f.goals[id] } }));
  };

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    // Side-effect: persist the selected format as the new default for future entries
    if (k === "format") onFormatChange(v);
    if (k === "date") setValidationError("");
  };

  const score = Object.values(form.goals).filter(Boolean).length;

  const handleSave = () => {
    if (!form.date) { setValidationError("Please select a date."); return; }
    if (form.wins === 0 && form.losses === 0) { setValidationError("Select a result — wins and losses can't both be 0."); return; }
    onSave({ ...form, result });
  };

  // Style for the wins/losses selector buttons.
  // 2-2 is not a valid score: disable the 2 button when the other side is already 2.
  const gameBtn = (field, val) => {
    const otherField = field === "wins" ? "losses" : "wins";
    const disabled = val === 2 && form[otherField] === 2;
    const active = form[field] === val;
    return React.createElement("button", {
      key: val,
      disabled,
      onClick: () => set(field, val),
      style: {
        flex: 1, padding: "10px 0", fontWeight: 600, fontSize: 16,
        borderRadius: "var(--radius-sm)",
        border: active ? `2px solid var(--accent)` : "1.5px solid var(--border)",
        background: active ? "var(--accent-light)" : "var(--surface)",
        color: active ? "var(--accent-text)" : "var(--text2)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "all 0.12s",
      }
    }, String(val));
  };

  const resultStyle = RESULT_STYLE[result] || { background: "var(--surface2)", color: "var(--text2)" };

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
      React.createElement("div", { className: "field" },
        React.createElement("label", null, "Format"),
        React.createElement("select", { value: form.format, onChange: e => set("format", e.target.value) },
          activeFormats.map(f => React.createElement("option", { key: f }, f))
        )
      ),
      React.createElement("div", { className: "field" },
        React.createElement("label", null, "Date"),
        React.createElement("input", {
          type: "date", value: form.date,
          max: todayStr(),
          onKeyDown: e => e.preventDefault(),
          onChange: e => { if (e.target.value) set("date", e.target.value); },
        })
      )
    ),

    // Wins / Losses selectors
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
      React.createElement("div", { className: "field" },
        React.createElement("label", null, "Wins"),
        React.createElement("div", { style: { display: "flex", gap: 6 } },
          [0, 1, 2].map(v => gameBtn("wins", v))
        )
      ),
      React.createElement("div", { className: "field" },
        React.createElement("label", null, "Losses"),
        React.createElement("div", { style: { display: "flex", gap: 6 } },
          [0, 1, 2].map(v => gameBtn("losses", v))
        )
      )
    ),

    // Auto-calculated result display
    React.createElement("div", { className: "field" },
      React.createElement("label", null, "Result"),
      React.createElement("div", { style: { display: "flex", alignItems: "center" } },
        React.createElement("span", {
          style: {
            fontSize: 14, fontWeight: 600, padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            ...resultStyle,
          }
        }, `${result} — ${form.wins}/${form.losses}`)
      )
    ),

    React.createElement("div", { className: "goals-box" },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
        React.createElement("span", { style: { fontWeight: 600, fontSize: 14, color: "var(--text)" } }, "Mental game goals"),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)" } }, `${score}/${activeGoals.length}`)
      ),
      activeGoals.map(g =>
        React.createElement("label", {
          key: g.id, className: "goal-row",
          onClick: () => toggle(g.id),
        },
          React.createElement("span", {
            className: `checkbox ${form.goals[g.id] ? "checked" : ""}`,
          },
            form.goals[g.id] && React.createElement("svg", { width: 10, height: 8, viewBox: "0 0 10 8", fill: "none" },
              React.createElement("path", { d: "M1 4l3 3 5-6", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })
            )
          ),
          React.createElement("span", {
            style: { fontSize: 14, lineHeight: 1.5, color: form.goals[g.id] ? "var(--text)" : "var(--text2)" },
          }, g.text)
        )
      )
    ),
    React.createElement("div", { className: "field" },
      React.createElement("label", null, "Notes"),
      React.createElement("textarea", {
        value: form.notes,
        onChange: e => set("notes", e.target.value),
        placeholder: "Deck played, notable moments, things to remember...",
        rows: 3,
      })
    ),

    ReactDOM.createPortal(
      React.createElement("div", {
        style: {
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "var(--surface)", borderTop: "1px solid var(--border)",
          padding: `12px 16px calc(12px + env(safe-area-inset-bottom, 0px))`,
          transform: isActive ? "translateY(0)" : "translateY(110%)",
          transition: "transform 0.55s cubic-bezier(0.32,0.72,0,1)",
        }
      },
        React.createElement("div", {
          style: { maxWidth: 560, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }
        },
          validationError && React.createElement("span", {
            style: { flex: 1, fontSize: 13, color: "#dc2626" }
          }, validationError),
          onCancel && React.createElement("button", { className: "btn-ghost", onClick: onCancel, style: { flex: validationError ? "none" : 1 } }, "Cancel"),
          React.createElement("button", {
            className: "btn-primary", onClick: handleSave,
            style: { flex: onCancel ? 2 : 1 },
          }, isEdit ? "Save changes" : "Log entry")
        )
      ),
      document.body
    )
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({ entry, goals, onEdit, onDelete, onBack }) {
  const entryGoals = entry.goals && !Array.isArray(entry.goals) ? entry.goals : {};
  const score = Object.values(entryGoals).filter(Boolean).length;
  const total = Object.keys(entryGoals).length;
  const hasScore = entry.wins != null && entry.losses != null;
  const s = RESULT_STYLE[entry.result] || { background: "var(--surface2)", color: "var(--text2)" };
  // Show goals that exist in current settings; fall back to all entry goal IDs if none match.
  const displayGoals = goals.filter(g => g.id in entryGoals);
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
      React.createElement("button", { className: "btn-ghost", onClick: onBack, style: { fontSize: 13 } }, "‹ Back"),
      React.createElement("span", { style: { fontWeight: 600, fontSize: 15, flex: 1, color: "var(--text)" } }, `${entry.format} — ${fmtDateLong(entry.date)}`),
      entry.result && React.createElement("span", {
        style: { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em", ...s }
      }, hasScore ? `${entry.result} — ${entry.wins}/${entry.losses}` : entry.result)
    ),
    React.createElement("div", { className: "goals-box" },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 12 } },
        React.createElement("span", { style: { fontWeight: 600, fontSize: 14, color: "var(--text)" } }, "Mental game goals"),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)" } }, `${score}/${total}`)
      ),
      displayGoals.map(g =>
        React.createElement("div", { key: g.id, style: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 } },
          entryGoals[g.id]
            ? React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 18 18", style: { flexShrink: 0, marginTop: 2 } },
                React.createElement("circle", { cx: 9, cy: 9, r: 9, fill: "#059669" }),
                React.createElement("path", { d: "M5 9l3 3 5-5", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })
              )
            : React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 18 18", style: { flexShrink: 0, marginTop: 2 } },
                React.createElement("circle", { cx: 9, cy: 9, r: 8.5, fill: "none", stroke: "var(--border2)", strokeWidth: 1 })
              ),
          React.createElement("span", { style: { fontSize: 14, color: entryGoals[g.id] ? "var(--text)" : "var(--text3)", lineHeight: 1.5 } }, g.text)
        )
      )
    ),
    entry.notes && React.createElement("div", { className: "notes-box" },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" } }, "Notes"),
      React.createElement("p", { style: { margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text)" } }, entry.notes)
    ),
    React.createElement("div", { style: { display: "flex", gap: 10, justifyContent: "flex-end" } },
      React.createElement("button", { className: "btn-danger", onClick: onDelete }, "Delete"),
      React.createElement("button", { className: "btn-ghost",  onClick: onEdit  }, "Edit")
    )
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App({ uid, user }) {
  const [settings,    setSettings]    = useState(loadSettings);
  const [entries,     setEntries]     = useState(() => cacheLoad().sort((a, b) => b.id - a.id));
  const [tab,         setTab]         = useState("Daily");
  const [view,        setView]        = useState("tabs");  // "tabs" | "log" | "detail" | "edit"
  const [dailyDate,   setDailyDate]   = useState(todayStr);
  const [selected,    setSelected]    = useState(null);   // the entry open in detail/edit view
  const [loading,     setLoading]     = useState(true);   // true only on first load when cache is empty
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastSynced,  setLastSynced]  = useState(null);   // Unix timestamp of last successful sync
  const [testMode,    setTestMode]    = useState(() => localStorage.getItem(TEST_MODE_KEY) === "true");
  const indicatorRef = useRef(null);

  // Android back gesture: push a history entry when entering a detail/form view
  // so the device back button navigates within the app instead of leaving it.
  useEffect(() => {
    if (view !== "tabs") history.pushState({ appView: view }, "");
  }, [view]);

  useEffect(() => {
    const handler = () => {
      if      (view === "log")    setView("tabs");
      else if (view === "edit")   setView("detail");
      else if (view === "detail") { setSelected(null); setView("tabs"); }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [view]);

  /** Updates entries in React state and the localStorage cache atomically. */
  const setAndCache = updated => { setEntries(updated); cacheSave(updated); };

  /** Toggles test mode on/off. When enabling, `data` is the generated entries array. */
  const handleTestMode = (enable, data) => {
    if (enable) {
      const sorted = data.sort((a, b) => b.id - a.id);
      cacheSave(sorted);
      setEntries(sorted);
      localStorage.setItem(TEST_MODE_KEY, "true");
      setTestMode(true);
    } else {
      localStorage.removeItem(TEST_MODE_KEY);
      setTestMode(false);
      setSyncing(true);
      firestoreGet(uid)
        .then(({ entries: d }) => {
          const sorted = d.map(e => ({ ...e, date: String(e.date).slice(0, 10) })).sort((a, b) => b.id - a.id);
          setAndCache(sorted);
        })
        .catch(() => {})
        .finally(() => setSyncing(false));
    }
  };

  // On mount: apply theme, show cached data immediately if available, then sync
  // from the sheet in the background and merge any sheet settings.
  // Skips Firestore sync when test mode is active.
  useEffect(() => {
    applyTheme(settings.accent, settings.darkMode);
    if (localStorage.getItem(TEST_MODE_KEY) === "true") { setLoading(false); return; }
    const hasCached = cacheLoad().length > 0;
    if (hasCached) setLoading(false);
    setSyncing(true);
    firestoreGet(uid)
      .then(({ entries: data, settings: cloudSettings }) => {
        const sorted = data
          .map(e => ({ ...e, date: String(e.date).slice(0, 10) }))
          .sort((a, b) => b.id - a.id);
        setAndCache(sorted);
        if (cloudSettings) {
          const merged = { ...loadSettings(), ...cloudSettings };
          saveSettings(merged);
          setSettings(merged);
          applyTheme(merged.accent, merged.darkMode);
        }
        setLastSynced(Date.now());
      })
      .catch(() => {
        if (!hasCached) setError("Couldn't load entries from Firestore.");
      })
      .finally(() => { setLoading(false); setSyncing(false); });
  }, []);

  const changeTab = t => {
    if (t === "Daily") setDailyDate(todayStr());
    setTab(t);
  };

  /** Persists the last-used format so new entries default to it. */
  const handleFormatChange = fmt => {
    const updated = { ...settings, lastFormat: fmt };
    saveSettings(updated);
    setSettings(updated);
  };

  /**
   * Propagates a format rename to all existing entries.
   * Called from SettingsTab → FormatList when a format name changes.
   * Shows a confirmation if any entries would be affected.
   */
  const handleFormatRename = (oldName, newName) => {
    const affected = entries.filter(e => e.format === oldName);
    if (!affected.length) return;
    if (!window.confirm(`Update ${affected.length} existing ${affected.length === 1 ? "entry" : "entries"} from "${oldName}" to "${newName}"?`)) return;
    const updated = entries.map(e => e.format === oldName ? { ...e, format: newName } : e);
    setAndCache(updated);
    // Background sync each affected entry
    affected.forEach(e => {
      firestoreUpsert(uid, { ...e, format: newName }).catch(() => {});
    });
  };

  // ── Data mutations (optimistic local-first) ───────────────────────────────
  // Each mutation updates local state + cache immediately, then fires the sheet
  // sync in the background. A visible error is shown if the sync fails, but the
  // local change is kept — it will be in sync after the next successful apiGet.

  const saveNew = async form => {
    setError(null);
    const entry = { ...form, id: Date.now() };
    setAndCache([entry, ...entries]);
    setView("tabs");
    firestoreUpsert(uid, entry).catch(() => {
      setError("Saved locally but Firestore sync failed.");
    });
  };

  const saveEdit = async form => {
    setError(null);
    const updated = { ...form, id: selected.id };
    setAndCache(entries.map(e => e.id === selected.id ? updated : e));
    setSelected(updated);
    setView("detail");
    firestoreUpsert(uid, updated).catch(() => {
      setError("Saved locally but Firestore sync failed.");
    });
  };

  const deleteEntry = async () => {
    setError(null);
    const id = selected.id;
    setAndCache(entries.filter(e => e.id !== id));
    setSelected(null);
    setView("tabs");
    firestoreRemove(uid, id).catch(() => {
      setError("Deleted locally but Firestore sync failed.");
    });
  };

  const { formats, goals } = settings;

  return React.createElement("div", { className: "app" },

    error && React.createElement("div", { className: "error-banner" },
      error,
      React.createElement("button", {
        onClick: () => setError(null),
        style: { marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit", padding: 0 }
      }, "×")
    ),

    // Syncing indicator — portal so it's always visible regardless of current view
    ReactDOM.createPortal(
      React.createElement("div", {
        style: {
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 20, padding: "5px 14px",
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "var(--text3)",
          pointerEvents: "none", zIndex: 999,
          opacity: syncing ? 1 : 0,
          transition: "opacity 0.3s",
        }
      },
        React.createElement("span", { className: "sync-dot" }),
        "syncing"
      ),
      document.body
    ),

    // ── Tabs view ──
    view === "tabs" && React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 } },

      testMode && React.createElement("div", {
        style: {
          background: "#D97706", color: "#fff", fontSize: 12, fontWeight: 600,
          textAlign: "center", padding: "5px 12px", borderRadius: "var(--radius-sm)",
          marginBottom: 10, letterSpacing: "0.03em",
        }
      }, "TEST DATA — not your real matches"),

      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "MTG Journal"),
          React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", fontWeight: 500 } }, "v1.1.16"),
        ),
        React.createElement(DateNav, { date: dailyDate, onChange: setDailyDate })
      ),

      React.createElement(TabBar, { active: tab, onChange: changeTab, indicatorRef }),

      loading
        ? React.createElement(Spinner)
        : React.createElement(TabSlider, { tab, setTab: changeTab, setDailyDate, indicatorRef },
            React.createElement(ScrollPanel, { style: { minWidth: "100%", width: "100%", height: "100%", padding: "0 8px env(safe-area-inset-bottom, 16px)" } },
              React.createElement(DailyTab, {
                entries, goals, date: dailyDate, settings,
                isActive: tab === "Daily",
                onOpen: entry => { setSelected(entry); setView("detail"); },
                onSave: saveNew,
                onFormatChange: handleFormatChange,
              })
            ),
            React.createElement(ScrollPanel, { style: { minWidth: "100%", width: "100%", height: "100%", padding: "0 8px env(safe-area-inset-bottom, 16px)" } },
              React.createElement(HistoryTab, {
                entries, goals, formats,
                onOpen: entry => { setSelected(entry); setView("detail"); },
              })
            ),
            React.createElement(ScrollPanel, { style: { minWidth: "100%", width: "100%", height: "100%", padding: "0 8px env(safe-area-inset-bottom, 16px)" } },
              React.createElement(SettingsTab, {
                settings,
                onSave: s => setSettings(s),
                onFormatRename: handleFormatRename,
                lastSynced,
                uid,
                user,
                testMode,
                onTestMode: handleTestMode,
              })
            )
          )
    ),


    // ── Entry detail ──
    view === "detail" && selected && React.createElement("div", { style: { flex: 1, overflowY: "auto", minHeight: 0, padding: "0 0 env(safe-area-inset-bottom, 16px)" } },
      React.createElement(DetailView, {
        entry: selected, goals,
        onBack:   () => { setSelected(null); setView("tabs"); },
        onEdit:   () => setView("edit"),
        onDelete: deleteEntry,
      })
    ),

    // ── Edit entry ──
    view === "edit" && selected && React.createElement("div", { style: { flex: 1, overflowY: "auto", minHeight: 0, padding: "0 0 env(safe-area-inset-bottom, 16px)" } },
      React.createElement("div", { style: { marginBottom: 20 } },
        React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "Edit entry")
      ),
      React.createElement(LogForm, {
        initial: selected, settings, isEdit: true, isActive: true,
        onSave: saveEdit, onCancel: () => setView("detail"),
        onFormatChange: handleFormatChange,
      }),
      React.createElement("div", { style: { height: 72 } })
    )
  );
}

// ─── Root — auth gate ─────────────────────────────────────────────────────────
// Resolves auth state before rendering anything. Shows a spinner while Firebase
// checks the session, LoginScreen if not signed in, App if signed in.

function Root() {
  const [user, setUser] = useState(undefined); // undefined=loading, null=signed out, object=signed in

  useEffect(() => {
    return auth.onAuthStateChanged(u => setUser(u));
  }, []);

  if (user === undefined) {
    return React.createElement("div", {
      style: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }
    }, React.createElement("div", { className: "spinner" }));
  }

  if (!user) return React.createElement(LoginScreen);

  return React.createElement(App, { uid: user.uid, user });
}

ReactDOM.render(React.createElement(Root), document.getElementById("root"));
