// ─── MTG Journal — Google Apps Script backend ─────────────────────────────────
// Deployed as a Web App (Execute as: Me, Who has access: Anyone).
// doGet  → returns all entries + settings as JSON.
// doPost → handles create / update / delete / saveSettings actions.

const SHEET_NAME          = "Entries";
const SETTINGS_SHEET_NAME = "Settings";
const HEADERS = ["id", "date", "format", "result", "notes", "g1", "g2", "g3", "g4", "g5"];

// ─── Sheet helpers ────────────────────────────────────────────────────────────

/** Returns the Entries sheet, creating it with a header row if it doesn't exist. */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Returns the Settings sheet, creating it if it doesn't exist. */
function getSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
  return sheet;
}

/**
 * Google Sheets auto-converts date strings to Date objects when reading cells.
 * This normalizes them back to plain YYYY-MM-DD strings.
 */
function cellDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(val);
  return s.length > 10 ? s.slice(0, 10) : s;
}

// ─── Request handlers ─────────────────────────────────────────────────────────

/**
 * GET handler — returns all entries and saved settings as JSON.
 *
 * Response shape: { entries: Entry[], settings: SettingsObject | null }
 *
 * `settings` is null if the Settings sheet is empty (e.g. before the first
 * saveSettings call or on a fresh deployment). The client handles this by
 * falling back to its localStorage copy.
 */
function doGet(e) {
  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();
  const entries = rows.slice(1)
    .filter(r => r[0] !== "")
    .map(r => ({
      id:     r[0],
      date:   cellDate(r[1]),
      format: r[2],
      result: r[3],
      notes:  r[4],
      goals:  [r[5], r[6], r[7], r[8], r[9]].map(v => v === true || v === "TRUE"),
    }));

  const settingsSheet = getSettingsSheet();
  const raw = settingsSheet.getRange("A1").getValue();
  let settings = null;
  try { if (raw) settings = JSON.parse(raw); } catch {}

  return json({ entries, settings });
}

/**
 * POST handler — dispatches on body.action.
 *
 * Actions:
 *   create       — appends a new entry row.
 *   update       — overwrites an existing row matched by id.
 *   delete       — deletes the row matched by id.
 *   saveSettings — writes the settings JSON blob to Settings!A1.
 */
function doPost(e) {
  const body  = JSON.parse(e.postData.contents);
  const sheet = getSheet();

  if (body.action === "create") {
    const en = body.entry;
    sheet.appendRow([en.id, en.date, en.format, en.result, en.notes, ...en.goals]);

  } else if (body.action === "update") {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(body.entry.id)) {
        const en = body.entry;
        sheet.getRange(i + 1, 1, 1, 10).setValues([
          [en.id, en.date, en.format, en.result, en.notes, ...en.goals]
        ]);
        break;
      }
    }

  } else if (body.action === "delete") {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(body.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }

  } else if (body.action === "saveSettings") {
    getSettingsSheet().getRange("A1").setValue(JSON.stringify(body.settings));

  } else {
    Logger.log("doPost: unknown action: " + body.action);
    return json({ ok: false, error: "Unknown action: " + body.action });
  }

  return json({ ok: true });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
