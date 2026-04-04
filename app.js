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
  "Don't let emotions take over. Focus on the game and optimizing my outs.",
  "Be calm and collected throughout the entire match",
  "Acknowledge bad luck and move on",
  "Be gracious to opponent",
  "At end of game, think about decisions I could have done differently",
];

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
  { key: "purple", label: "Purple", color: "#3C3489" },
  { key: "blue",   label: "Blue",   color: "#185FA5" },
  { key: "teal",   label: "Teal",   color: "#0F6E56" },
  { key: "green",  label: "Green",  color: "#3B6D11" },
  { key: "coral",  label: "Coral",  color: "#993C1D" },
  { key: "pink",   label: "Pink",   color: "#993556" },
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
  const avg    = (entries.reduce((s, e) => s + e.goals.filter(Boolean).length, 0) / entries.length).toFixed(1);
  return React.createElement("div", { className: "stats-grid" },
    [
      { label: "Matches",   val: entries.length },
      { label: "Avg goals", val: `${avg}/${goalCount}` },
      { label: "Wins",      val: wins },
      { label: "Losses",    val: losses },
      { label: "Draws",     val: draws },
      { label: "Win rate",  val: entries.length ? `${Math.round(wins / entries.length * 100)}%` : "—" },
    ].map(s => React.createElement("div", { key: s.label, className: "stat-card" },
      React.createElement("div", { className: "stat-val" }, s.val),
      React.createElement("div", { className: "stat-label" }, s.label)
    ))
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
  const score = entry.goals.filter(Boolean).length;
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
        React.createElement(ScorePips, { checked: score, total: entry.goals.length }),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)" } }, `${score}/${entry.goals.length} goals`),
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

function TabBar({ active, onChange }) {
  return React.createElement("div", { className: "tab-bar" },
    TABS.map(t => React.createElement("button", {
      key: t,
      className: `tab-btn ${active === t ? "active" : ""}`,
      onClick: () => onChange(t),
    }, t))
  );
}

// ─── Sliding tab container ────────────────────────────────────────────────────
// All three tab panels are rendered side-by-side in a flex row at 100% width
// each. The visible panel is controlled by translateX on the inner container.
// Touch-move drags the panels live; touchend snaps to the nearest tab.
// The outer div has overflow:hidden to clip the off-screen panels.

function TabSlider({ tab, setTab, setDailyDate, children }) {
  const tabIdx      = TABS.indexOf(tab);
  const sliderRef   = useRef(null);
  const touchRef    = useRef(null);   // { x, y, time, swiping }
  const tabIdxRef   = useRef(tabIdx);
  useEffect(() => { tabIdxRef.current = tabIdx; }, [tabIdx]);

  // Snap to current tab (animated)
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    el.style.transition = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";
    el.style.transform  = `translateX(-${tabIdx * 100}%)`;
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
    const offset = -(tabIdxRef.current * 100) + (dx / el.offsetWidth * 100);
    el.style.transition = "none";
    el.style.transform  = `translateX(${offset}%)`;
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
      el.style.transition = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";
      el.style.transform  = `translateX(-${nextIdx * 100}%)`;
    }
    const nextTab = TABS[nextIdx];
    if (nextTab !== tab) {
      if (nextTab === "Daily") setDailyDate(todayStr());
      setTab(nextTab);
    }
  };

  return React.createElement("div", {
    style: { overflow: "hidden", width: "100%" },
    onTouchStart, onTouchMove, onTouchEnd,
  },
    React.createElement("div", {
      ref: sliderRef,
      style: {
        display: "flex",
        width: "100%",
        transform: `translateX(-${tabIdx * 100}%)`,
        transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
        willChange: "transform",
      },
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
        onChange: e => onChange(e.target.value),
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

function DailyTab({ entries, goals, date, onOpen, onSave, settings, onFormatChange }) {
  const [formKey, setFormKey] = useState(0);
  const dayEntries = entries.filter(e => e.date === date).sort((a, b) => b.id - a.id);

  const handleSave = form => {
    onSave(form);
    setFormKey(k => k + 1);
  };

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement(StatsBar, { entries: dayEntries, goalCount: goals.length }),
    React.createElement(LogForm, {
      key: `${formKey}-${date}`,
      settings,
      defaultDate: date,
      onSave: handleSave,
      onFormatChange,
    }),
    dayEntries.length > 0 && React.createElement("div", {
      style: { borderTop: "1px solid var(--border)", paddingTop: 16 }
    },
      React.createElement(EntryList, { entries: dayEntries, onOpen })
    ),
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ entries, goals, formats, onOpen, onLog }) {
  const [selectedFormats, setSelectedFormats] = useState([]); // active format filter (multi-select)
  const [results,         setResults]         = useState([]); // active result filter (multi-select)
  const [dateFrom,        setDateFrom]        = useState("");
  const [dateTo,          setDateTo]          = useState("");

  const activeNames = formats.filter(f => f.active).map(f => f.name);

  const toggleResult = r => setResults(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleFormat = name => setSelectedFormats(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);

  const filtered = entries.filter(e => {
    if (selectedFormats.length && !selectedFormats.includes(e.format)) return false;
    if (results.length         && !results.includes(e.result))         return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo   && e.date > dateTo)   return false;
    return true;
  }).sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : b.id - a.id);

  const hasFilters = selectedFormats.length || results.length || dateFrom || dateTo;

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },

    // Format filter
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Format"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
        activeNames.map(name => {
          const sel = selectedFormats.includes(name);
          return React.createElement("button", {
            key: name,
            onClick: () => toggleFormat(name),
            style: {
              padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: sel ? "var(--accent-light)" : "var(--surface)",
              color:      sel ? "var(--accent-text)"  : "var(--text2)",
              border:     sel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
              transition: "all 0.12s",
            }
          }, name);
        })
      )
    ),

    // Result filter
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Result"),
      React.createElement("div", { style: { display: "flex", gap: 6 } },
        ["Win", "Lose", "Draw"].map(r => {
          const sel = results.includes(r);
          const s   = RESULT_STYLE[r];
          const style = sel
            ? { background: s.background, color: s.color, border: `1.5px solid ${s.border}` }
            : { background: "var(--surface)", color: "var(--text2)", border: "1px solid var(--border)" };
          return React.createElement("button", {
            key: r,
            onClick: () => toggleResult(r),
            style: { padding: "5px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.12s", ...style }
          }, r);
        })
      )
    ),

    // Date range filter
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Date range"),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
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
        ),
        hasFilters && React.createElement("button", {
          onClick: () => { setSelectedFormats([]); setResults([]); setDateFrom(""); setDateTo(""); },
          style: { fontSize: 12, padding: "5px 10px", color: "var(--text2)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }
        }, "Clear")
      )
    ),

    React.createElement(StatsBar, { entries: filtered, goalCount: goals.length }),
    React.createElement(LogMatchButton, { onClick: onLog }),
    React.createElement(EntryList, { entries: filtered, onOpen }),
  );
}

// ─── Draggable format list ────────────────────────────────────────────────────
// Each row has a drag handle (⠿). Dragging it lifts the row into a floating
// ghost (rendered via portal to escape the TabSlider's CSS transform, which
// would otherwise break position:fixed). The original row turns invisible and
// surrounding rows shift with translateY to show where the item will land.

const ROW_H = 52; // px per row including gap — used to compute ghost position and row shifts

function FormatList({ formats, onChange, onRename }) {
  const [editing,  setEditing]  = useState(null); // index of the row being renamed
  const [editVal,  setEditVal]  = useState("");
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

  const commitEdit = (i) => {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== formats[i].name) {
      onChange(formats.map((f, j) => j === i ? { ...f, name: trimmed } : f));
      // Notify parent so it can propagate the rename to existing entries
      if (onRename) onRename(formats[i].name, trimmed);
    }
    setEditing(null);
  };

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
      React.createElement("span", { style: { flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text)" } }, ghostFmt.name),
      React.createElement("span", { style: {
        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
        background: ghostFmt.active ? "var(--accent-light)" : "var(--surface2)",
        color:      ghostFmt.active ? "var(--accent-text)"  : "var(--text3)",
      } }, ghostFmt.active ? "Active" : "Hidden")
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

          editing === i
            ? React.createElement("input", {
                autoFocus: true,
                value: editVal,
                onChange: e => setEditVal(e.target.value),
                onBlur:   () => commitEdit(i),
                onKeyDown: e => { if (e.key === "Enter") commitEdit(i); if (e.key === "Escape") setEditing(null); },
                style: { flex: 1, fontSize: 14, padding: "2px 6px" },
              })
            : React.createElement("span", {
                style: {
                  flex: 1, fontSize: 14, cursor: "text",
                  color: f.active ? "var(--text)" : "var(--text3)",
                  textDecoration: f.active ? "none" : "line-through",
                },
                onClick: () => { setEditing(i); setEditVal(f.name); },
              }, f.name),

          React.createElement("button", {
            onClick: () => toggleActive(i),
            style: {
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: f.active ? "var(--accent-light)" : "var(--surface2)",
              color:      f.active ? "var(--accent-text)"  : "var(--text3)",
              border: "none", cursor: "pointer", flexShrink: 0,
            }
          }, f.active ? "Active" : "Hidden"),

          React.createElement("button", {
            onClick: () => remove(i),
            title: "Delete",
            style: { background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }
          }, "×")
        );
      })
    )
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ settings, onSave, onFormatRename, lastSynced, uid, user }) {
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

  const setGoal = (i, v) => setGoals(goals.map((g, j) => j === i ? v : g));


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
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        goals.map((g, i) =>
          React.createElement("div", { key: i, style: { display: "flex", alignItems: "flex-start", gap: 8 } },
            React.createElement("span", { style: { fontSize: 13, color: "var(--text2)", fontWeight: 600, minWidth: 20, paddingTop: 10 } }, `${i+1}.`),
            React.createElement("textarea", {
              value: g, rows: 2,
              onChange: e => setGoal(i, e.target.value),
              style: { flex: 1, fontSize: 13, resize: "vertical" },
            })
          )
        )
      ),
      React.createElement("button", {
        onClick: () => { if (window.confirm("Reset goals to defaults?")) setGoals(DEFAULT_GOALS); },
        style: { marginTop: 8, fontSize: 12, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }
      }, "Reset to defaults")
    ),

    React.createElement("div", null,
      React.createElement(SectionLabel, null, "Accent color"),
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
function LogForm({ initial, settings, defaultDate, onSave, onCancel, isEdit, onFormatChange }) {
  const activeFormats = settings.formats.filter(f => f.active).map(f => f.name);
  const goals = settings.goals;

  // Pick default format: existing format when editing, else last-used if still
  // active, else first active format.
  const defaultFormat = initial
    ? initial.format
    : (activeFormats.includes(settings.lastFormat) ? settings.lastFormat : activeFormats[0] || "");

  // Normalize saved goal booleans to match the current goals list length.
  const normalizeGoals = (saved, count) =>
    [...saved, ...Array(Math.max(0, count - saved.length)).fill(false)].slice(0, count);

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
    ? { ...initial, goals: normalizeGoals(initial.goals, goals.length), wins: defaultWins, losses: defaultLosses }
    : { date: defaultDate || todayStr(), format: defaultFormat, notes: "", goals: Array(goals.length).fill(false), wins: 0, losses: 0 }
  );
  const [validationError, setValidationError] = useState("");

  const result = calcResult(form.wins, form.losses);

  const toggle = i => {
    // Use functional form to avoid reading stale form.goals from closure
    setForm(f => {
      const g = [...f.goals];
      g[i] = !g[i];
      return { ...f, goals: g };
    });
  };

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    // Side-effect: persist the selected format as the new default for future entries
    if (k === "format") onFormatChange(v);
    if (k === "date") setValidationError("");
  };

  const score = form.goals.filter(Boolean).length;

  const handleSave = () => {
    if (!form.date) { setValidationError("Please select a date."); return; }
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
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)" } }, `${score}/${goals.length}`)
      ),
      goals.map((g, i) =>
        React.createElement("label", {
          key: i, className: "goal-row",
          onClick: () => toggle(i),
        },
          React.createElement("span", {
            className: `checkbox ${form.goals[i] ? "checked" : ""}`,
          },
            form.goals[i] && React.createElement("svg", { width: 10, height: 8, viewBox: "0 0 10 8", fill: "none" },
              React.createElement("path", { d: "M1 4l3 3 5-6", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })
            )
          ),
          React.createElement("span", {
            style: { fontSize: 14, lineHeight: 1.5, color: form.goals[i] ? "var(--text)" : "var(--text2)" },
          }, g)
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
    // Spacer so content doesn't hide behind the fixed action bar
    React.createElement("div", { style: { height: 72 } }),

    ReactDOM.createPortal(
      React.createElement("div", {
        style: {
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "var(--surface)", borderTop: "1px solid var(--border)",
          padding: `12px 16px calc(12px + env(safe-area-inset-bottom, 0px))`,
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
  const score = entry.goals.filter(Boolean).length;
  // If the current goals list length doesn't match the entry's saved goals, fall
  // back to DEFAULT_GOALS labels so the checkmarks still display with some text.
  // This can happen if goals were added or removed in Settings after the entry
  // was logged. The goal boolean values (checked/unchecked) are always correct.
  const displayGoals = goals.length === entry.goals.length ? goals : DEFAULT_GOALS;
  const hasScore = entry.wins != null && entry.losses != null;
  const s = RESULT_STYLE[entry.result] || { background: "var(--surface2)", color: "var(--text2)" };
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
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)" } }, `${score}/${entry.goals.length}`)
      ),
      displayGoals.map((g, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 } },
          entry.goals[i]
            ? React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 18 18", style: { flexShrink: 0, marginTop: 2 } },
                React.createElement("circle", { cx: 9, cy: 9, r: 9, fill: "#059669" }),
                React.createElement("path", { d: "M5 9l3 3 5-5", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })
              )
            : React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 18 18", style: { flexShrink: 0, marginTop: 2 } },
                React.createElement("circle", { cx: 9, cy: 9, r: 8.5, fill: "none", stroke: "var(--border2)", strokeWidth: 1 })
              ),
          React.createElement("span", { style: { fontSize: 14, color: entry.goals[i] ? "var(--text)" : "var(--text3)", lineHeight: 1.5 } }, g)
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

  // On mount: apply theme, show cached data immediately if available, then sync
  // from the sheet in the background and merge any sheet settings.
  useEffect(() => {
    applyTheme(settings.accent, settings.darkMode);
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
    view === "tabs" && React.createElement(React.Fragment, null,

      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "MTG Journal"),
          React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", fontWeight: 500 } }, "v1.1.1"),
        ),
        tab === "Daily" && React.createElement(DateNav, { date: dailyDate, onChange: setDailyDate })
      ),

      React.createElement(TabBar, { active: tab, onChange: changeTab }),

      loading
        ? React.createElement(Spinner)
        : React.createElement(TabSlider, { tab, setTab: changeTab, setDailyDate },
            React.createElement("div", { style: { minWidth: "100%", width: "100%", padding: "0 8px" } },
              React.createElement(DailyTab, {
                entries, goals, date: dailyDate, settings,
                onOpen: entry => { setSelected(entry); setView("detail"); },
                onSave: saveNew,
                onFormatChange: handleFormatChange,
              })
            ),
            React.createElement("div", { style: { minWidth: "100%", width: "100%", padding: "0 8px" } },
              React.createElement(HistoryTab, {
                entries, goals, formats,
                onOpen: entry => { setSelected(entry); setView("detail"); },
                onLog:  () => setView("log"),
              })
            ),
            React.createElement("div", { style: { minWidth: "100%", width: "100%", padding: "0 8px" } },
              React.createElement(SettingsTab, {
                settings,
                onSave: s => setSettings(s),
                onFormatRename: handleFormatRename,
                lastSynced,
                uid,
                user,
              })
            )
          )
    ),


    // ── Entry detail ──
    view === "detail" && selected && React.createElement(DetailView, {
      entry: selected, goals,
      onBack:   () => { setSelected(null); setView("tabs"); },
      onEdit:   () => setView("edit"),
      onDelete: deleteEntry,
    }),

    // ── Edit entry ──
    view === "edit" && selected && React.createElement(React.Fragment, null,
      React.createElement("div", { style: { marginBottom: 20 } },
        React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "Edit entry")
      ),
      React.createElement(LogForm, {
        initial: selected, settings, isEdit: true,
        onSave: saveEdit, onCancel: () => setView("detail"),
        onFormatChange: handleFormatChange,
      })
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
