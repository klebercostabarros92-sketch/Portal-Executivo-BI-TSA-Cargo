/**
 * ============================================================================
 * TSA CARGO / TSA LOGÍSTICA — EXECUTIVE BI PORTAL
 * Module 1: Compras & Custos de Manutenção — Ano Completo 2026 (153AuVXowt0wV1PArUpfHeFDJ2O_5Dy_PSwBl_k98nnw)
 *   - Filtros Temporais, Sazonalidade, CAPEX vs OPEX, TCO Placa × FIPE, SLA & Outliers
 * Module 2: Patrimônio Frota TSA (1tRhBfK38m58vzoFmoxv8QWxjG6CYN66u7ozsE3RuI8Q)
 *   - Sincronização Tabela FIPE Oficial + Regra de Depreciação Empilhadeiras
 *   - Gravação direta na coluna FIPE / Idade da Planilha Patrimônio Frota
 * ============================================================================
 * Script ID: 1N8ZLTuyyfmowpBIAIV2oMDbVQzb7AFB_WuHYXk5UUu7x5KXE2pNUKTvp
 */

const SPREADSHEET_ID = '153AuVXowt0wV1PArUpfHeFDJ2O_5Dy_PSwBl_k98nnw';
const PATRIMONIO_SPREADSHEET_ID = '1tRhBfK38m58vzoFmoxv8QWxjG6CYN66u7ozsE3RuI8Q';
const DIESEL_SPREADSHEET_ID = '1uZY3XdXKa4X_gphl0Rl_P2VS1ztogsXFX9AOlLP2-kU';
const CTA_DEFAULT_TOKEN = '1fz4gyqEtZ'; // Token POWER BI configurado no CTA Smart


/**
 * Serves the Executive HTML Dashboard on HTTP GET.
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('TSA Cargo | Portal Executivo — Compras, Manutenção & Patrimônio Frota')
    .setFaviconUrl('https://cdn-icons-png.flaticon.com/512/2830/2830305.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Webhook Receptor: Recebe novos abastecimentos em tempo real via HTTP POST
 * Permite que o CTA Smart ou qualquer webhook envie o registro do bico/bomba diretamente.
 */
function doPost(e) {
  try {
    const rawData = e && e.postData && e.postData.contents ? e.postData.contents : null;
    if (!rawData) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'No payload received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch (parseErr) {
      payload = e.parameter;
    }

    const res = appendAbastecimentoRealTime(payload);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Anexa novo registro de abastecimento na planilha Google Sheets do Diesel (1uZY3XdXKa4X_gphl0Rl_P2VS1ztogsXFX9AOlLP2-kU)
 * Garante mapeamento das 42 colunas e anexação contínua.
 */
function appendAbastecimentoRealTime(item) {
  try {
    const ss = SpreadsheetApp.openById(DIESEL_SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    
    const items = Array.isArray(item) ? item : [item];
    const newRows = [];

    items.forEach(function(rec) {
      const row = new Array(42).fill('');
      row[0] = rec.data_hora_inicio || rec.dataHoraInicio || rec.data || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
      row[1] = rec.data_hora_fim || rec.dataHoraFim || row[0];
      row[2] = rec.empresa || 'TSA CARGO';
      row[3] = String(rec.placa || rec.veiculo || '').toUpperCase().trim();
      row[4] = rec.nr_frota || rec.frota || '';
      row[5] = rec.descricao || '';
      row[6] = rec.categoria || '';
      row[7] = rec.ano || '';
      row[8] = rec.modelo || '';
      row[9] = rec.fornecedor || '';
      row[10] = rec.fabricante || '';
      row[11] = rec.volume || rec.litros || rec.quantidade || '';
      row[12] = rec.custo_total || rec.valor_total || rec.total || '';
      row[13] = rec.odometro || rec.km || '';
      row[14] = rec.distancia || '';
      row[15] = rec.custo_por_km || '';
      row[16] = rec.media_kml || rec.media || '';
      row[29] = rec.combustivel || rec.produto || 'S10';
      row[32] = rec.motorista || rec.operador || '';
      row[33] = rec.posto || 'Tanque Próprio TSA';
      
      if (row[3] || row[11]) {
        newRows.push(row);
      }
    });

    if (newRows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 42).setValues(newRows);
      return { ok: true, appended: newRows.length };
    }
    return { ok: false, error: 'Dados insuficientes para anexar' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Helper to read any spreadsheet by ID and optional sheet name.
 */
function readSpreadsheetPayload_(spreadsheetId, requestedSheetName) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
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

/**
 * Module 1: Fetches live data from the Compras & Manutenção Google Spreadsheet.
 * (100% Untouched)
 */
function getSheetData(requestedSheetName) {
  return readSpreadsheetPayload_(SPREADSHEET_ID, requestedSheetName);
}

/**
 * Module 2: Fetches live data from the Patrimônio Frota Google Spreadsheet.
 */
function getPatrimonioSheetData(requestedSheetName) {
  return readSpreadsheetPayload_(PATRIMONIO_SPREADSHEET_ID, requestedSheetName);
}

/**
 * Module 3: Fetches live data from the Controle de Diesel Google Spreadsheet.
 */
function getDieselSheetData(requestedSheetName) {
  return readSpreadsheetPayload_(DIESEL_SPREADSHEET_ID, requestedSheetName);
}

/**
 * Sincronizador Diário com CTA Smart via API.
 * Pode ser executado manualmente ou configurado via acionador diário (ex: 04:00 da manhã).
 * O token da API deve ser salvo em Propriedades do Script (Chave: CTA_API_TOKEN).
 */
function syncCtaSmartAbastecimentosDiarios() {
  const token = PropertiesService.getScriptProperties().getProperty('CTA_API_TOKEN') || CTA_DEFAULT_TOKEN;
  if (!token) {
    Logger.log('CTA_API_TOKEN não configurado nas Propriedades do Script.');
    return { ok: false, error: 'Token não configurado.' };
  }
  try {
    const hoje = new Date();
    const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
    const dStr = Utilities.formatDate(ontem, 'America/Sao_Paulo', 'yyyy-MM-dd');

    const candidateUrls = [
      'https://ctasmart.com.br/SincronizaAbastecimentos?token=' + token + '&data_inicio=' + dStr + '&data_fim=' + dStr + '&formato=json',
      'https://api.ctasmart.com.br/v1/abastecimentos?data_inicio=' + dStr + '&data_fim=' + dStr
    ];

    let lastError = null;
    for (let u = 0; u < candidateUrls.length; u++) {
      try {
        const response = UrlFetchApp.fetch(candidateUrls[u], {
          method: 'get',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
          },
          muteHttpExceptions: true
        });

        const statusCode = response.getResponseCode();
        if (statusCode === 200) {
          const txt = response.getContentText();
          if (txt && (txt.trim().startsWith('{') || txt.trim().startsWith('['))) {
            const data = JSON.parse(txt);
            Logger.log('Abastecimentos recebidos da API CTA Smart: ' + (Array.isArray(data) ? data.length : 1));
            return { ok: true, count: Array.isArray(data) ? data.length : 1, data: data };
          }
        }
        lastError = 'HTTP ' + statusCode + ': ' + response.getContentText().slice(0, 200);
      } catch (errLoop) {
        lastError = errLoop.message;
      }
    }
    Logger.log('Tentativas de sincronização CTA Smart: ' + lastError);
    return { ok: false, error: lastError };
  } catch (err) {
    Logger.log('Exceção ao sincronizar CTA Smart: ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Persists the updated FIPE values (Official FIPE + Forklift Depreciation Rule)
 * directly into Column Y ('Fipe') and Column V ('Idade') of the Patrimônio Frota Google Sheet.
 * Writes ONLY the narrowest cell ranges (Fipe and Idade) to preserve all formatting and formulas.
 */
function savePatrimonioFipeToSheet(updatesList) {
  try {
    if (!Array.isArray(updatesList) || updatesList.length === 0) {
      return { ok: true, updatedCount: 0 };
    }
    const ss = SpreadsheetApp.openById(PATRIMONIO_SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    const dataRange = sheet.getDataRange();
    const values = dataRange.getDisplayValues();
    if (!values || values.length < 2) {
      return { ok: false, error: 'Planilha Patrimônio vazia.' };
    }

    const headers = values[0].map(h => String(h || '').trim().toLowerCase());
    let fipeColIdx = headers.findIndex(h => h.indexOf('fipe') >= 0);
    if (fipeColIdx < 0) fipeColIdx = 24; // Column Y (0-based 24)
    let idadeColIdx = headers.findIndex(h => h === 'idade');
    if (idadeColIdx < 0) idadeColIdx = 21; // Column V (0-based 21)

    // Map updates by composite identity (Item|Placa|Frota) and sheetRow for 100% row-safe matching
    const byIdentity = {};
    const bySheetRow = {};
    updatesList.forEach(u => {
      if (u && typeof u.valorNum === 'number' && u.valorNum > 0) {
        const key = String(u.item || '').trim() + '|' + String(u.placa || '').trim() + '|' + String(u.frota || '').trim();
        byIdentity[key] = u;
        if (u.sheetRow >= 2) bySheetRow[u.sheetRow] = u;
      }
    });

    const numDataRows = values.length - 1;
    const fipeRange = sheet.getRange(2, fipeColIdx + 1, numDataRows, 1);
    const currentFipeFormulas = fipeRange.getFormulas();
    const currentFipeValues = fipeRange.getValues();

    const idadeRange = sheet.getRange(2, idadeColIdx + 1, numDataRows, 1);
    const idadeFormulas = idadeRange.getFormulas();
    const idadeVals = idadeRange.getValues();

    let updatedCount = 0;
    let changedIdade = false;
    const newFipeCol = [];
    const newIdadeCol = [];

    for (let rIdx = 0; rIdx < numDataRows; rIdx++) {
      const sheetRow = rIdx + 2;
      const rawRow = values[rIdx + 1] || [];
      const rowKey = String(rawRow[0] || '').trim() + '|' + String(rawRow[1] || '').trim() + '|' + String(rawRow[9] || '').trim();
      const upd = byIdentity[rowKey] || bySheetRow[sheetRow];

      if (upd) {
        newFipeCol.push([Math.round(upd.valorNum * 100) / 100]);
        updatedCount++;
      } else {
        const existingFormula = currentFipeFormulas[rIdx][0];
        newFipeCol.push([existingFormula ? existingFormula : currentFipeValues[rIdx][0]]);
      }

      if (upd && typeof upd.novaIdade === 'number' && !idadeFormulas[rIdx][0]) {
        newIdadeCol.push([upd.novaIdade]);
        changedIdade = true;
      } else {
        newIdadeCol.push([idadeFormulas[rIdx][0] ? idadeFormulas[rIdx][0] : idadeVals[rIdx][0]]);
      }
    }

    fipeRange.setValues(newFipeCol);
    fipeRange.setNumberFormat('R$ #,##0.00');
    if (changedIdade) {
      idadeRange.setValues(newIdadeCol);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      updatedCount: updatedCount,
      updatedAt: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss')
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  }
}
