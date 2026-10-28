/**
 * ============================================================================
 * TSA CARGO / TSA LOGÍSTICA — EXECUTIVE PROCUREMENT & FLEET MAINTENANCE BI
 * ============================================================================
 * Script ID: 1N8ZLTuyyfmowpBIAIV2oMDbVQzb7AFB_WuHYXk5UUu7x5KXE2pNUKTvp
 * Base Spreadsheet ID: 153AuVXowt0wV1PArUpfHeFDJ2O_5Dy_PSwBl_k98nnw
 */

const SPREADSHEET_ID = '153AuVXowt0wV1PArUpfHeFDJ2O_5Dy_PSwBl_k98nnw';

/**
 * Serves the Executive HTML Dashboard on HTTP GET.
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  return template
    .evaluate()
    .setTitle('TSA Cargo | Executive Procurement & Maintenance Intelligence')
    .setFaviconUrl('https://cdn-icons-png.flaticon.com/512/2830/2830305.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Fetches live data directly from the Google Spreadsheet.
 * Called by the frontend "Refresh" button via google.script.run.getSheetData(sheetName)
 *
 * @param {string} Optional sheetName (if omitted, reads the first visible tab or combines tabs)
 * @return {Object} JSON payload with rows, sheets list, and timestamp
 */
function getSheetData(requestedSheetName) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    const sheetNames = sheets.map(s => s.getName());
    
    let targetSheet = sheets[0];
    if (requestedSheetName && requestedSheetName !== 'ALL') {
      const found = ss.getSheetByName(requestedSheetName);
      if (found) targetSheet = found;
    }

    const rawValues = targetSheet.getDataRange().getDisplayValues();
    if (!rawValues || rawValues.length < 2) {
      return {
        ok: true,
        sheetName: targetSheet.getName(),
        availableSheets: sheetNames,
        updatedAt: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
        headers: [],
        rows: []
      };
    }

    const headers = rawValues[0].map(h => String(h || '').trim());
    const rows = [];

    for (let i = 1; i < rawValues.length; i++) {
      const r = rawValues[i];
      // Skip completely empty rows
      if (!r || r.every(cell => String(cell || '').trim() === '')) continue;
      rows.push(r);
    }

    return {
      ok: true,
      spreadsheetTitle: ss.getName(),
      sheetName: targetSheet.getName(),
      availableSheets: sheetNames,
      updatedAt: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
      totalRows: rows.length,
      headers: headers,
      rows: rows
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      updatedAt: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss')
    };
  }
}
