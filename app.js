const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwVknQwEWTp9P4WLvo9aREu3Ft_Jtvi61EmCM0NDfTGUHSQUjiy-nZNJHplTj2Xhd5ZUg/exec";

const { useState, useEffect, useRef } = React;

const DEFAULT_GOALS = [
  "Don't let emotions take over. Focus on the game and optimizing my outs.",
  "Be calm and collected throughout the entire match",
  "Acknowledge bad luck and move on",
  "Be gracious to opponent",
  "At end of game, think about decisions I could have done differently",
];

const DEFAULT_FORMATS = [
  { name: "DC",        active: true },
  { name: "Pauper",    active: true },
  { name: "Legacy",    active: true },
  { name: "Premodern", active: true },
  { name: "Modern",    active: true },
  { name: "Cube",      active: true },
];

const RESULTS = ["Win", "Lose", "Draw"];
const TABS = ["Daily", "History", "Settings"];

const RESULT_STYLE = {
  Win:  { background: "#d1fae5", color: "#065f46" },
  Lose: { background: "#fee2e2", color: "#991b1b" },
  Draw: { background: "#fef9c3", color: "#854d0e" },
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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function yesterdayStr() {
  return offsetDate(todayStr(), -1);
}

function fmtDateShort(str) {
  if (!str) return "";
  const today = todayStr();
  const yesterday = yesterdayStr();
  if (str === today)     return "Today";
  if (str === yesterday) return "Yesterday";
  const [y, m, d] = str.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+m-1]} ${+d}`;
}

function offsetDate(str, days) {
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}

function haptic() {
  try {
    const result = navigator.vibrate ? navigator.vibrate(200) : "API missing";
    console.log("[haptic]", result, "vibrate available:", !!navigator.vibrate);
  } catch(e) { console.log("[haptic] error", e); }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("mtg-journal-settings") || "{}");
    let formats = s.formats || DEFAULT_FORMATS;
    if (formats.length && typeof formats[0] === "string") {
      formats = formats.map(name => ({ name, active: true }));
    }
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

function saveSettings(s) {
  localStorage.setItem("mtg-journal-settings", JSON.stringify(s));
}

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

function cacheLoad() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
}

function cacheSave(entries) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entries)); } catch {}
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiGet() {
  const res = await fetch(SCRIPT_URL);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

// ─── Small shared components ──────────────────────────────────────────────────

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

function SectionLabel({ children }) {
  return React.createElement("div", {
    style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }
  }, children);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

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
  return React.createElement("div", { onClick: () => onOpen(entry), className: "entry-card" },
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" } },
        React.createElement("span", { style: { fontWeight: 600, fontSize: 14, color: "var(--text)" } }, entry.format),
        entry.result && React.createElement(Badge, { label: entry.result }),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text2)", marginLeft: "auto" } }, entry.date)
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
// Mirrors the food-tracker approach: all panels laid out side-by-side in a flex
// row, viewport moved with translateX. Touch-move drags live; touchend snaps.

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
    if (x < 20 || x > window.innerWidth - 20) return; // ignore edge swipes (Android back)
    touchRef.current = { x, y: e.touches[0].clientY, time: Date.now(), swiping: false };
  };

  const onTouchMove = e => {
    const t = touchRef.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
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
    const isFlick = Math.abs(dx) > 40 || (Math.abs(dx) > 20 && dt < 250);
    let nextIdx = tabIdxRef.current;
    if (isFlick) nextIdx = dx < 0 ? Math.min(TABS.length - 1, nextIdx + 1) : Math.max(0, nextIdx - 1);
    // Always animate the snap
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
  const isToday = date === todayStr();
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
      disabled: isToday,
      style: { opacity: isToday ? 0.3 : 1 },
    }, "›")
  );
}

// ─── Daily tab ────────────────────────────────────────────────────────────────

function DailyTab({ entries, goals, date, onOpen, onLog }) {
  const dayEntries = entries.filter(e => e.date === date).sort((a, b) => b.id - a.id);
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement(StatsBar, { entries: dayEntries, goalCount: goals.length }),
    React.createElement(LogMatchButton, { onClick: onLog }),
    React.createElement(EntryList, { entries: dayEntries, onOpen }),
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ entries, goals, formats, onOpen, onLog }) {
  const [fmts,     setFmts]     = useState([]); // multi-select: array of names
  const [results,  setResults]  = useState([]); // multi-select
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const activeNames = formats.filter(f => f.active).map(f => f.name);

  const toggleResult = r => { setResults(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]); };
  const toggleFmt = name => {
    setFmts(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
  };

  const filtered = entries.filter(e => {
    if (fmts.length && !fmts.includes(e.format)) return false;
    if (results.length && !results.includes(e.result)) return false;
    if (dateFrom && e.date   <  dateFrom)         return false;
    if (dateTo   && e.date   >  dateTo)           return false;
    return true;
  }).sort((a, b) => b.id - a.id);

  const hasFilters = fmts.length || results.length || dateFrom || dateTo;

  const RESULT_PILL = {
    Win:  { sel: { background: "#d1fae5", color: "#065f46", border: "1.5px solid #059669" } },
    Lose: { sel: { background: "#fee2e2", color: "#991b1b", border: "1.5px solid #dc2626" } },
    Draw: { sel: { background: "#fef9c3", color: "#854d0e", border: "1.5px solid #d97706" } },
  };

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },

    // Format multi-select pills
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Format"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
        activeNames.map(name => {
          const sel = fmts.includes(name);
          return React.createElement("button", {
            key: name,
            onClick: () => toggleFmt(name),
            style: {
              padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: sel ? "var(--accent-light)" : "var(--surface)",
              color: sel ? "var(--accent-text)" : "var(--text2)",
              border: sel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
              transition: "all 0.12s",
            }
          }, name);
        })
      )
    ),

    // Result filter pills
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Result"),
      React.createElement("div", { style: { display: "flex", gap: 6 } },
        RESULTS.map(r => {
          const sel = results.includes(r);
          const style = sel ? RESULT_PILL[r].sel : { background: "var(--surface)", color: "var(--text2)", border: "1px solid var(--border)" };
          return React.createElement("button", {
            key: r,
            onClick: () => toggleResult(r),
            style: { padding: "5px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.12s", ...style }
          }, r);
        })
      )
    ),

    // Date range row
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 } }, "Date range"),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        React.createElement("div", { style: { position: "relative", flex: 1 } },
          React.createElement("input", {
            type: "date", value: dateFrom, onChange: e => setDateFrom(e.target.value),
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
          onClick: () => { setFmts([]); setResults([]); setDateFrom(""); setDateTo(""); },
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

const ROW_H = 52; // px per row including gap

function FormatList({ formats, onChange }) {
  const [editing,  setEditing]  = useState(null);
  const [editVal,  setEditVal]  = useState("");
  const [dragging, setDragging] = useState(null);
  const [dragY,    setDragY]    = useState(0);
  const [overIdx,  setOverIdx]  = useState(null);
  const listRef    = useRef(null);
  const draggingRef = useRef(null);
  const overIdxRef  = useRef(null);

  // Keep refs in sync for touch handlers
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { overIdxRef.current  = overIdx;  }, [overIdx]);

  const getOverIdx = (clientY) => {
    if (!listRef.current) return 0;
    const rows = [...listRef.current.querySelectorAll("[data-fmt-row]")];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  };

  const startDrag = (clientY, i) => {
    setDragging(i); setDragY(clientY); setOverIdx(i);
  };

  const moveDrag = (clientY) => {
    if (draggingRef.current === null) return;
    setDragY(clientY);
    setOverIdx(getOverIdx(clientY));
  };

  const endDrag = () => {
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

  // Compute per-row translateY shift so rows slide around the dragged item
  const getShift = (i) => {
    if (dragging === null || overIdx === null || i === dragging) return 0;
    // The dragged item is moving from `dragging` to `overIdx`
    if (dragging < overIdx) {
      // Dragging downward: rows between drag+1..overIdx shift up by one row
      if (i > dragging && i <= overIdx) return -ROW_H;
    } else {
      // Dragging upward: rows between overIdx..drag-1 shift down by one row
      if (i >= overIdx && i < dragging) return ROW_H;
    }
    return 0;
  };

  const toggleActive = (i) => onChange(formats.map((f, j) => j === i ? { ...f, active: !f.active } : f));
  const remove       = (i) => onChange(formats.filter((_, j) => j !== i));

  const commitEdit = (i) => {
    if (editVal.trim()) onChange(formats.map((f, j) => j === i ? { ...f, name: editVal.trim() } : f));
    setEditing(null);
  };

  const ghostFmt = dragging !== null ? formats[dragging] : null;

  return React.createElement("div", { style: { position: "relative" } },

    // Floating ghost row that follows the cursor
    // Rendered via portal so it escapes the tab slider's CSS transform (which would
    // otherwise break position:fixed, causing the ghost to be clipped/invisible).
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
        color: ghostFmt.active ? "var(--accent-text)" : "var(--text3)",
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
        return React.createElement("div", {
          key: i,
          "data-fmt-row": true,
          style: {
            background: "var(--surface)",
            border: `1px solid var(--border)`,
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
              color: f.active ? "var(--accent-text)" : "var(--text3)",
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

function SettingsTab({ settings, onSave }) {
  const [formats,  setFormats]  = useState(settings.formats);
  const [goals,    setGoals]    = useState(settings.goals);
  const [accent,   setAccent]   = useState(settings.accent);
  const [darkMode, setDarkMode] = useState(settings.darkMode);
  const [newFmt,   setNewFmt]   = useState("");
  const mounted = useRef(false);

  useEffect(() => { applyTheme(accent, darkMode); }, [accent, darkMode]);

  // Auto-save whenever any setting changes (skip initial mount)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const s = { ...settings, formats, goals, accent, darkMode };
    saveSettings(s);
    onSave(s);
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
      React.createElement(FormatList, { formats, onChange: setFormats }),
      React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
        React.createElement("input", {
          type: "text", placeholder: "Add format…", value: newFmt,
          onChange: e => setNewFmt(e.target.value),
          onKeyDown: e => { if (e.key === "Enter") addFormat(); },
          style: { flex: 1, fontSize: 13 },
        }),
        React.createElement("button", { className: "btn-primary", onClick: addFormat }, "Add")
      )
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
      )
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

  );
}

// ─── Log form ─────────────────────────────────────────────────────────────────

function LogForm({ initial, settings, defaultDate, onSave, onCancel, isEdit, saving, onFormatChange }) {
  const activeFormats = settings.formats.filter(f => f.active).map(f => f.name);
  const goals = settings.goals;

  // Pick default format: initial.format if editing, else lastFormat if still valid, else first
  const defaultFormat = initial
    ? initial.format
    : (activeFormats.includes(settings.lastFormat) ? settings.lastFormat : activeFormats[0] || "");

  const [form, setForm] = useState(initial || {
    date: defaultDate || todayStr(),
    format: defaultFormat,
    result: "", notes: "",
    goals: Array(goals.length).fill(false),
  });
  const [validationError, setValidationError] = useState("");

  const toggle = i => {
    haptic();
    const g = [...form.goals];
    g[i] = !g[i];
    setForm(f => ({ ...f, goals: g }));
  };
  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (k === "format") onFormatChange(v);
    if (k === "result" || k === "date") setValidationError("");
  };
  const score = form.goals.filter(Boolean).length;

  const handleSave = () => {
    if (!form.result) { setValidationError("Please select a result."); return; }
    if (!form.date)   { setValidationError("Please select a date.");   return; }
    onSave(form);
  };

  const RESULT_COLORS = {
    Win:  { bg: "#d1fae5", border: "#059669", text: "#065f46" },
    Lose: { bg: "#fee2e2", border: "#dc2626", text: "#991b1b" },
    Draw: { bg: "#fef9c3", border: "#d97706", text: "#854d0e" },
  };

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
    React.createElement("div", { className: "field" },
      React.createElement("label", null, "Result"),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        RESULTS.map(r => {
          const col = RESULT_COLORS[r];
          const selected = form.result === r;
          return React.createElement("button", {
            key: r,
            onClick: () => set("result", r),
            style: {
              flex: 1, padding: "10px 0", fontWeight: 600, fontSize: 14,
              borderRadius: "var(--radius-sm)",
              border: selected ? `2px solid ${col.border}` : "1.5px solid var(--border)",
              background: selected ? col.bg : "var(--surface)",
              color: selected ? col.text : "var(--text2)",
              cursor: "pointer", transition: "all 0.12s",
            }
          }, r);
        })
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
          onTouchStart: () => haptic(),
          onTouchEnd: e => { e.preventDefault(); toggle(i); },
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
    React.createElement("div", { style: { display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" } },
      validationError && React.createElement("span", {
        style: { flex: 1, fontSize: 13, color: "#dc2626" }
      }, validationError),
      React.createElement("button", { className: "btn-ghost", onClick: onCancel, disabled: saving }, "Cancel"),
      React.createElement("button", {
        className: "btn-primary", onClick: handleSave, disabled: saving,
      }, saving ? "Saving…" : (isEdit ? "Save changes" : "Log entry"))
    )
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({ entry, goals, onEdit, onDelete, onBack, deleting }) {
  const score = entry.goals.filter(Boolean).length;
  const displayGoals = goals.length === entry.goals.length ? goals : DEFAULT_GOALS;
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
      React.createElement("button", { className: "btn-ghost", onClick: onBack, style: { fontSize: 13 } }, "‹ Back"),
      React.createElement("span", { style: { fontWeight: 600, fontSize: 15, flex: 1, color: "var(--text)" } }, `${entry.format} — ${entry.date}`),
      entry.result && React.createElement(Badge, { label: entry.result })
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
      React.createElement("button", { className: "btn-danger", onClick: onDelete, disabled: deleting }, deleting ? "Deleting…" : "Delete"),
      React.createElement("button", { className: "btn-ghost", onClick: onEdit }, "Edit")
    )
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [settings,  setSettings]  = useState(loadSettings);
  const [entries,   setEntries]   = useState(() => cacheLoad().sort((a, b) => b.id - a.id));
  const [tab,       setTab]       = useState("Daily");
  const [view,      setView]      = useState("tabs");
  const [dailyDate, setDailyDate] = useState(todayStr);
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(true);  // true only on very first load (no cache)
  const [syncing,   setSyncing]   = useState(false);  // background sync indicator
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [error,     setError]     = useState(null);

  // Android back gesture: push a history entry when entering non-tabs views,
  // and intercept popstate to cancel/go back within the app instead of the browser.
  useEffect(() => {
    if (view !== "tabs") history.pushState({ appView: view }, "");
  }, [view]);

  useEffect(() => {
    const handler = () => {
      if (view === "log")    setView("tabs");
      else if (view === "edit")   setView("detail");
      else if (view === "detail") { setSelected(null); setView("tabs"); }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [view]);

  // Keep cache in sync whenever entries change
  const setAndCache = updated => {
    setEntries(updated);
    cacheSave(updated);
  };

  useEffect(() => {
    applyTheme(settings.accent, settings.darkMode);
    const hasCached = cacheLoad().length > 0;
    // If we have cached data, show it immediately and don't block with spinner
    if (hasCached) setLoading(false);
    setSyncing(true);
    apiGet()
      .then(data => {
        const clean = data.map(e => ({ ...e, date: String(e.date).slice(0, 10) }));
        const sorted = clean.sort((a, b) => b.id - a.id);
        setAndCache(sorted);
      })
      .catch(() => {
        // If we have cached data, silently fail; otherwise show error
        if (!hasCached) setError("Couldn't load entries. Check your script URL.");
      })
      .finally(() => { setLoading(false); setSyncing(false); });
  }, []);

  const changeTab = t => {
    if (t === "Daily") setDailyDate(todayStr());
    setTab(t);
  };

  // ── Persist last-used format ──
  const handleFormatChange = fmt => {
    const updated = { ...settings, lastFormat: fmt };
    saveSettings(updated);
    setSettings(updated);
  };

  // ── Data ops — optimistic local-first ──
  const saveNew = async form => {
    setSaving(true); setError(null);
    const entry = { ...form, id: Date.now() };
    // Optimistic: update UI + cache immediately
    setAndCache([entry, ...entries]);
    setView("tabs");
    setSaving(false);
    // Background sync to sheet
    apiPost({ action: "create", entry }).catch(() => {
      setError("Saved locally but sheet sync failed. It will retry on next load.");
    });
  };

  const saveEdit = async form => {
    setSaving(true); setError(null);
    const updated = { ...form, id: selected.id };
    // Optimistic update
    setAndCache(entries.map(e => e.id === selected.id ? updated : e));
    setSelected(updated);
    setView("detail");
    setSaving(false);
    // Background sync
    apiPost({ action: "update", entry: updated }).catch(() => {
      setError("Saved locally but sheet sync failed.");
    });
  };

  const deleteEntry = async () => {
    setDeleting(true); setError(null);
    const id = selected.id;
    // Optimistic delete
    setAndCache(entries.filter(e => e.id !== id));
    setSelected(null);
    setView("tabs");
    setDeleting(false);
    // Background sync
    apiPost({ action: "delete", id }).catch(() => {
      setError("Deleted locally but sheet sync failed.");
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

    // ── Tabs view ──
    view === "tabs" && React.createElement(React.Fragment, null,

      // Header: title + date nav side by side (only on Daily tab)
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "MTG Journal"),
          React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", fontWeight: 500 } }, "v1.0.6"),
          syncing && React.createElement("span", {
            style: { fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 3 }
          },
            React.createElement("span", { className: "sync-dot" }),
            "syncing"
          )
        ),
        tab === "Daily" && React.createElement(DateNav, { date: dailyDate, onChange: setDailyDate })
      ),

      React.createElement(TabBar, { active: tab, onChange: changeTab }),

      loading
        ? React.createElement(Spinner)
        : React.createElement(TabSlider, { tab, setTab: changeTab, setDailyDate },
            // All 3 panels always rendered side-by-side; slider translateX picks which is visible
            React.createElement("div", { style: { minWidth: "100%", width: "100%", padding: "0 8px" } },
              React.createElement(DailyTab, {
                entries, goals, date: dailyDate,
                onOpen: entry => { setSelected(entry); setView("detail"); },
                onLog:  () => setView("log"),
              })
            ),
            React.createElement("div", { style: { minWidth: "100%", width: "100%", padding: "0 8px" } },
              React.createElement(HistoryTab, { entries, goals, formats, onOpen: entry => { setSelected(entry); setView("detail"); }, onLog: () => setView("log") })
            ),
            React.createElement("div", { style: { minWidth: "100%", width: "100%", padding: "0 8px" } },
              React.createElement(SettingsTab, { settings, onSave: s => setSettings(s) })
            )
          )
    ),

    // ── Log form ──
    view === "log" && React.createElement(React.Fragment, null,
      React.createElement("div", { style: { marginBottom: 20 } },
        React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "Log a match"),
        React.createElement("p",  { style: { margin: 0 } }, "How did you play today?")
      ),
      React.createElement(LogForm, {
        settings, defaultDate: dailyDate,
        onSave: saveNew, onCancel: () => setView("tabs"), saving,
        onFormatChange: handleFormatChange,
      })
    ),

    // ── Detail ──
    view === "detail" && selected && React.createElement(DetailView, {
      entry: selected, goals,
      onBack:   () => { setSelected(null); setView("tabs"); },
      onEdit:   () => setView("edit"),
      onDelete: deleteEntry, deleting,
    }),

    // ── Edit ──
    view === "edit" && selected && React.createElement(React.Fragment, null,
      React.createElement("div", { style: { marginBottom: 20 } },
        React.createElement("h1", { style: { margin: 0, color: "var(--text)" } }, "Edit entry")
      ),
      React.createElement(LogForm, {
        initial: selected, settings,
        onSave: saveEdit, onCancel: () => setView("detail"), isEdit: true, saving,
        onFormatChange: handleFormatChange,
      })
    )
  );
}

ReactDOM.render(React.createElement(App), document.getElementById("root"));
