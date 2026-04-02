// Paste this entire file into your Google Apps Script editor.
// Tools → Script Editor (from Google Sheets)

const SHEET_NAME = "Entries";
const SETTINGS_SHEET_NAME = "Settings";
const HEADERS = ["id", "date", "format", "result", "notes", "g1", "g2", "g3", "g4", "g5"];

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

// Google Sheets auto-converts date strings to Date objects.
// This formats them back to plain YYYY-MM-DD strings.
function cellDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(val);
  return s.length > 10 ? s.slice(0, 10) : s;
}

function getSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
  return sheet;
}

function doGet(e) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
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

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
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

  } else if (body.action === "saveSettings") {
    getSettingsSheet().getRange("A1").setValue(JSON.stringify(body.settings));

  } else if (body.action === "delete") {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(body.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }

  return json({ ok: true });
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
