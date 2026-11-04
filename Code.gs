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
  if (e && e.parameter) {
    if (e.parameter.action === 'getAetData' || e.parameter.api === 'aet') {
      const data = getAetDriveLicenses(e.parameter.force === 'true');
      return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
    }
    if (e.parameter.action === 'syncCtaSmart' || e.parameter.api === 'syncCta') {
      const dInicio = e.parameter.data_inicio || '01/11/2026';
      const dFim = e.parameter.data_fim || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
      const res = syncCtaSmartAbastecimentosDiarios(dInicio, dFim);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (e.parameter.action === 'installTrigger' || e.parameter.action === 'setupTrigger') {
      const res = installAutoSyncTrigger();
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if (e.parameter.action === 'getDieselData') {
      const res = getDieselSheetData();
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
  }
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
 * Mapeamento padronizado com as 16 colunas da aba 'Abastecimentos 2026'.
 */
function appendAbastecimentoRealTime(item) {
  try {
    const ss = SpreadsheetApp.openById(DIESEL_SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    
    const items = Array.isArray(item) ? item : [item];
    const newRows = [];

    items.forEach(function(rec) {
      const dataFull = rec.data_hora_inicio || rec.dataHoraInicio || rec.data || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
      let dStr = dataFull;
      let hStr = rec.hora || '';
      if (dataFull.includes(' ')) {
        const parts = dataFull.split(' ');
        dStr = parts[0];
        if (!hStr) hStr = parts[1];
      }

      const row = new Array(16).fill('');
      row[0] = dStr;
      row[1] = hStr;
      row[2] = rec.empresa || 'TSA CARGO';
      row[3] = String(rec.placa || rec.veiculo || '').toUpperCase().trim();
      row[4] = rec.nr_frota || rec.frota || '';
      row[5] = rec.modelo || rec.descricao || '';
      row[6] = rec.categoria || '';
      row[7] = rec.volume || rec.litros || rec.quantidade || '';
      row[8] = rec.custo || rec.custo_total || rec.valor_total || rec.total || '';
      row[9] = rec.odometro || rec.km || '';
      row[10] = rec.distancia || '';
      row[11] = rec.media || rec.media_kml || rec.media_kilometro_litro || '';
      row[12] = rec.posto || 'Tanque Próprio TSA';
      row[13] = rec.combustivel || rec.produto || 'S10';
      row[14] = rec.frentista || '';
      row[15] = rec.motorista || rec.operador || '';
      
      if (row[3] || row[7]) {
        newRows.push(row);
      }
    });

    if (newRows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 16).setValues(newRows);
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
/**
 * Sincronizador Oficial com a Sync API da CTASmart (Porta 8443).
 * Documentação Oficial E+Bros / CTASmart:
 * Endpoint: https://www.ctasmart.com.br:8443/SvWebSincronizaAbastecimentos
 * Permite buscar os abastecimentos recentes e avançar a fila com SvWebInformaSincronismoAbastecimentos.
 * Pode ser chamado manualmente no portal ou executado via acionador diário/horário.
 */
function syncCtaSmartAbastecimentosDiarios(dInicioParam, dFimParam) {
  const token = PropertiesService.getScriptProperties().getProperty('CTA_API_TOKEN') || CTA_DEFAULT_TOKEN;
  if (!token) {
    Logger.log('CTA_API_TOKEN não configurado.');
    return { ok: false, error: 'Token CTA Smart não configurado.' };
  }

  try {
    const hoje = new Date();
    const dHojeStr = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy');
    
    // Se não informadas as datas, busca dos últimos 5 dias até hoje
    let dInicio = dInicioParam;
    let dFim = dFimParam || dHojeStr;
    if (!dInicio) {
      const cincoDiasAtras = new Date(hoje.getTime() - 5 * 24 * 60 * 60 * 1000);
      dInicio = Utilities.formatDate(cincoDiasAtras, 'America/Sao_Paulo', 'dd/MM/yyyy');
    }

    // Carrega dicionário de enriquecimento a partir do Patrimônio Frota (Placa -> Frota, Modelo, Categoria)
    const plateEnrichMap = {};
    try {
      const patSs = SpreadsheetApp.openById(PATRIMONIO_SPREADSHEET_ID);
      const patSheet = patSs.getSheets()[0];
      const patValues = patSheet.getRange(2, 2, Math.max(1, patSheet.getLastRow() - 1), 17).getDisplayValues();
      patValues.forEach(function(r) {
        const p = String(r[0] || '').trim().toUpperCase();
        if (p && p !== '-') {
          plateEnrichMap[p] = {
            frota: r[8] || '',  // Col 10: Nº de Frota
            tipo: r[14] || '',  // Col 16: Tipo
            marca: r[15] || '', // Col 17: Marca
            modelo: r[16] || '' // Col 18: Modelo
          };
        }
      });
    } catch(patErr) {
      Logger.log('Aviso ao carregar mapa de patrimônio: ' + patErr.message);
    }

    // Coleta abastecimentos da Sync API do CTA Smart com paginação automática
    let allFetched = [];
    let lastId = null;
    let page = 1;

    while (page <= 10) { // Limite de segurança: até 1.000 registros por chamada
      let apiUrl = 'https://www.ctasmart.com.br:8443/SvWebSincronizaAbastecimentos?token=' + encodeURIComponent(token) +
        '&data_inicio=' + encodeURIComponent(dInicio) +
        '&data_fim=' + encodeURIComponent(dFim) +
        '&formato=json&max_linhas=100';

      if (lastId) {
        apiUrl += '&abastecimento=' + encodeURIComponent(lastId);
      }

      Logger.log('Consultando CTA Smart (Página ' + page + '): ' + apiUrl);

      const response = UrlFetchApp.fetch(apiUrl, {
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/json'
        },
        muteHttpExceptions: true
      });

      const statusCode = response.getResponseCode();
      if (statusCode !== 200) {
        Logger.log('Erro HTTP CTA Smart: ' + statusCode + ' - ' + response.getContentText().slice(0, 300));
        if (allFetched.length === 0) {
          return { ok: false, status: statusCode, error: response.getContentText().slice(0, 300) };
        }
        break;
      }

      const json = JSON.parse(response.getContentText());
      const list = json && json.abastecimentos ? json.abastecimentos : [];
      Logger.log('Página ' + page + ' retornou ' + list.length + ' abastecimentos.');

      if (list.length === 0) break;
      allFetched = allFetched.concat(list);

      if (list.length < 100) break;

      // Obtém maior ID para paginar próxima chamada
      let maxBatchId = null;
      list.forEach(function(item) {
        const numId = parseInt(item.id, 10);
        if (!isNaN(numId) && (maxBatchId === null || numId > maxBatchId)) {
          maxBatchId = numId;
        }
      });

      if (!maxBatchId || maxBatchId === lastId) break;
      lastId = maxBatchId;
      page++;
      Utilities.sleep(1200);
    }

    Logger.log('Total de abastecimentos coletados da API: ' + allFetched.length);

    if (allFetched.length === 0) {
      return { ok: true, count: 0, message: 'Nenhum abastecimento novo retornado para o período ' + dInicio + ' a ' + dFim + '.' };
    }

    // Abre a planilha Google Sheets de Diesel para anexar
    const ss = SpreadsheetApp.openById(DIESEL_SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    const lastRow = sheet.getLastRow();
    
    // Obtém chaves dos últimos 800 registros com getDisplayValues para evitar duplicidades
    const existingKeys = new Set();
    const existingIds = new Set();

    if (lastRow > 1) {
      const startCheck = Math.max(2, lastRow - 800);
      const numRows = lastRow - startCheck + 1;
      const recentData = sheet.getRange(startCheck, 1, numRows, 42).getDisplayValues();
      recentData.forEach(function(r) {
        // Coluna 34: Abastecimentos (ID do CTA Smart)
        const idCta = String(r[34] || '').trim();
        if (idCta) existingIds.add(idCta);

        // Chave composta: DataHora_Placa_Volume
        const dt = String(r[0] || '').trim();
        const p = String(r[3] || '').trim().toUpperCase();
        const v = String(r[11] || '').trim().replace('.', ',');
        if (dt && p) existingKeys.add(dt + '_' + p + '_' + v);
      });
    }

    const newRows = [];

    allFetched.forEach(function(item) {
      // Checa duplicidade por ID do CTA Smart
      const strId = String(item.id || '').trim();
      if (strId && existingIds.has(strId)) {
        return;
      }

      const dInicioStr = item.data_inicio || Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy');
      const hInicioStr = item.hora_inicio || '00:00:00';
      const dtInicioFull = dInicioStr + ' ' + hInicioStr;

      const dFimStr = item.data_fim || dInicioStr;
      const hFimStr = item.hora_fim || hInicioStr;
      const dtFimFull = dFimStr + ' ' + hFimStr;

      const placa = item.veiculo && item.veiculo.placa ? String(item.veiculo.placa).toUpperCase().trim() : '';
      const volume = item.volume || item.volume_fixed || '';
      const volNormalized = String(volume).trim().replace('.', ',');

      // Checa duplicidade por chave composta
      const compKey = dtInicioFull + '_' + placa + '_' + volNormalized;
      if (existingKeys.has(compKey)) {
        return;
      }
      existingKeys.add(compKey);
      if (strId) existingIds.add(strId);

      // Enriquecimento do Veículo
      let frota = (item.veiculo && item.veiculo.frota) ? item.veiculo.frota : '';
      let modelo = (item.veiculo && item.veiculo.modelo) ? item.veiculo.modelo : ((item.veiculo && item.veiculo.nome) ? item.veiculo.nome : '');
      let categoria = (item.veiculo && item.veiculo.categoria) ? item.veiculo.categoria : ((item.veiculo && item.veiculo.tipo) ? item.veiculo.tipo : '');
      let fabricante = '';

      if (plateEnrichMap[placa]) {
        if (!frota) frota = plateEnrichMap[placa].frota;
        if (!modelo && plateEnrichMap[placa].modelo) modelo = plateEnrichMap[placa].modelo;
        if (!fabricante && plateEnrichMap[placa].marca) fabricante = plateEnrichMap[placa].marca;
        if (!categoria && plateEnrichMap[placa].tipo) categoria = plateEnrichMap[placa].tipo;
      }

      // Constrói a linha com exatamente 42 colunas conforme a planilha oficial
      const row = new Array(42).fill('');
      row[0] = dtInicioFull;                                                                // Data/Hora início
      row[1] = dtFimFull;                                                                   // Data/Hora final
      row[2] = (item.empresa && item.empresa.nome) ? item.empresa.nome : 'TSA CARGO';       // Empresa
      row[3] = placa;                                                                       // Placa
      row[4] = frota;                                                                       // Nr. de Frota
      row[5] = modelo;                                                                      // Descricao
      row[6] = categoria;                                                                   // Categoria
      row[7] = '';                                                                          // Ano
      row[8] = modelo;                                                                      // Modelo
      row[9] = '';                                                                          // Fornecedor
      row[10] = fabricante;                                                                 // Fabricante
      row[11] = volume;                                                                     // Volume (l)
      row[12] = item.custo || '';                                                           // Custo Total (R$)
      row[13] = item.odometro || '';                                                        // Odometro
      row[14] = item.distancia || '';                                                       // Distância (km)
      row[15] = '';                                                                         // Custo por km (R$)
      row[16] = item.media_kilometro_litro || '';                                           // Média (km/l)
      row[17] = item.horimetro || '';                                                       // Horimetro
      row[18] = item.horas_trabalhadas || '';                                               // Horas trabalhadas
      row[19] = '';                                                                         // Custo por Hora (R$)
      row[20] = item.media_litro_hora || '';                                                // Média l/h
      row[21] = (item.posto && item.posto.nome) ? item.posto.nome : 'Posto TSA Cargo';      // Posto
      row[22] = (item.posto && item.posto.codigo) ? item.posto.codigo : '';                 // Cod. do Posto
      row[23] = (item.tanque && item.tanque.nome) ? item.tanque.nome : '';                  // Tanque
      row[24] = '';                                                                         // Cod exportação numérico
      row[25] = (item.bomba && item.bomba.nome) ? item.bomba.nome : '';                     // Bomba
      row[26] = (item.bomba && item.bomba.codigo) ? item.bomba.codigo : '';                 // Cod. da Bomba
      row[27] = (item.combustivel && item.combustivel.descricao) ? item.combustivel.descricao : 'S10'; // Combustível
      row[28] = (item.frentista && item.frentista.nome) ? item.frentista.nome : '';         // Frentista
      row[29] = (item.frentista && item.frentista.codigo) ? item.frentista.codigo : '';     // Cod. do Frentista
      row[30] = (item.motorista && item.motorista.nome) ? item.motorista.nome : '';         // Motorista
      row[31] = '';                                                                         // Sobrenome
      row[32] = (item.motorista && item.motorista.nome) ? item.motorista.nome : '';         // Nome curto
      row[33] = (item.motorista && item.motorista.codigo) ? item.motorista.codigo : '';     // Cod. do Motorista
      row[34] = strId;                                                                      // Abastecimentos (ID CTA Smart)
      row[35] = item.encerrante || '';                                                      // Encerrante Final
      row[36] = '';                                                                         // Lacre
      row[37] = '';                                                                         // Cod
      row[38] = '';                                                                         // Lacre 2
      row[39] = '';                                                                         // Cod
      row[40] = (item.telemetria && item.telemetria.latitude) ? item.telemetria.latitude : '';   // Latitude
      row[41] = (item.telemetria && item.telemetria.longitude) ? item.telemetria.longitude : ''; // Longitude

      newRows.push(row);
    });

    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 42).setValues(newRows);
      SpreadsheetApp.flush();
      Logger.log('Gravadas com sucesso ' + newRows.length + ' novas linhas na planilha do Diesel.');
    }

    return {
      ok: true,
      totalFromApi: allFetched.length,
      newAppended: newRows.length,
      periodo: dInicio + ' a ' + dFim,
      updatedAt: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss')
    };

  } catch (err) {
    Logger.log('Exceção ao sincronizar CTA Smart: ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Função executada pelo frontend para disparar sincronização CTA Smart e retornar os dados de Diesel
 */
function syncCtaSmartAndReturnDiesel() {
  const syncRes = syncCtaSmartAbastecimentosDiarios();
  const dataRes = getDieselSheetData();
  dataRes.syncStats = syncRes;
  return dataRes;
}

/**
 * Instala acionador automático no Google Apps Script para rodar a cada 1 hora.
 */
function installAutoSyncTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let removed = 0;
    for (let i = 0; i < triggers.length; i++) {
      const fn = triggers[i].getHandlerFunction();
      if (fn === 'syncCtaSmartJob' || fn === 'syncCtaSmartAbastecimentosDiarios') {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    }

    ScriptApp.newTrigger('syncCtaSmartJob')
      .timeBased()
      .everyHours(1)
      .create();

    Logger.log('Acionador automático CTA Smart instalado para executar a cada 1 hora.');
    return { ok: true, message: 'Acionador automático ativado com sucesso! A base atualizará a cada 1 hora.', removedOld: removed };
  } catch (err) {
    Logger.log('Erro ao instalar acionador: ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Função executada pelo Trigger a cada 1 hora
 */
function syncCtaSmartJob() {
  const hoje = new Date();
  const dFim = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy');
  const dInicio = Utilities.formatDate(new Date(hoje.getTime() - 5 * 24 * 60 * 60 * 1000), 'America/Sao_Paulo', 'dd/MM/yyyy');
  return syncCtaSmartAbastecimentosDiarios(dInicio, dFim);
}

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


/**
 * ============================================================================
 * AUDITORIA DE LICENÇAS AET (AUTORIZAÇÃO ESPECIAL DE TRÂNSITO) — GOOGLE DRIVE
 * Pasta Raiz: 16NnsTxTEA9sAll4Z8wFnzUh4uxDgA0R8
 * ============================================================================
 */
const DRIVE_AET_FOLDER_ID = '16NnsTxTEA9sAll4Z8wFnzUh4uxDgA0R8';

function getAetDriveLicenses(forceRescan) {
  try {
    const rootFolder = DriveApp.getFolderById(DRIVE_AET_FOLDER_ID);
    const subfolders = rootFolder.getFolders();
    const allAets = [];
    let folderCount = 0;

    while (subfolders.hasNext()) {
      const folder = subfolders.next();
      const folderName = folder.getName().trim();
      const folderId = folder.getId();
      folderCount++;

      // Standardize plate
      let placa = folderName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (placa === 'GNH0I21') placa = 'GHN0I21';

      // Scan active files in main folder
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        const fName = file.getName();
        if (fName.toLowerCase().indexOf('.pdf') !== -1) {
          allAets.push(parseAetFileName_(fName, file.getId(), folderId, placa, false));
        }
      }

      // Scan subfolder 'vencidas' / 'historico' if present
      const innerFolders = folder.getFolders();
      while (innerFolders.hasNext()) {
        const sub = innerFolders.next();
        const subName = sub.getName().toLowerCase();
        if (subName.indexOf('vencid') !== -1 || subName.indexOf('antig') !== -1 || subName.indexOf('histor') !== -1) {
          const vFiles = sub.getFiles();
          while (vFiles.hasNext()) {
            const vFile = vFiles.next();
            const vfName = vFile.getName();
            if (vfName.toLowerCase().indexOf('.pdf') !== -1) {
              allAets.push(parseAetFileName_(vfName, vFile.getId(), folderId, placa, true));
            }
          }
        }
      }
    }

    const payload = {
      ok: true,
      rootFolderId: DRIVE_AET_FOLDER_ID,
      folderCount: folderCount,
      scannedAt: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
      aets: allAets
    };

    // Payload com mais de 250 AETs ultrapassa o limite de 9KB do PropertiesService, então retornamos direto
    return payload;
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function parseAetFileName_(fileName, fileId, folderId, placa, isArchived) {
  const nameLower = fileName.toLowerCase();

  // Date extraction
  let vencimentoISO = null;
  let vencimentoStr = null;
  const dateMatch = fileName.match(/v.?\s*(\d{1,2})\s*[\.\/\-]\s*(\d{1,2})\s*[\.\/\-]\s*(\d{2,4})/i);
  if (dateMatch) {
    const day = ('0' + dateMatch[1]).slice(-2);
    const mon = ('0' + dateMatch[2]).slice(-2);
    let yr = dateMatch[3];
    if (yr.length === 2) yr = '20' + yr;
    if (yr === '206') yr = '2026';
    vencimentoStr = day + '/' + mon + '/' + yr;
    vencimentoISO = yr + '-' + mon + '-' + day;
  }

  // Config extraction
  const nameWithoutDate = nameLower.replace(/v.?\s*\d{1,2}[\.\/\-]\s*\d{1,2}[\.\/\-]\s*\d{2,4}.*$/i, '');
  const isAnchieta = /anchiett?a/.test(nameWithoutDate);
  const isRodotrem = /(^|[^\d])30([,\.]00?)?(\s*m(t|etros?)?)?([^\d]|$)/.test(nameWithoutDate) || /rodotrem/.test(nameWithoutDate);
  const isBitrem = /(^|[^\d])25([,\.]50?|[,\.]00?)?(\s*m(t|etros?)?)?([^\d]|$)/.test(nameWithoutDate) || /bi-?trem/.test(nameWithoutDate);

  let config = 'Geral';
  let configType = 'GERAL';
  if (isAnchieta && isRodotrem) {
    config = 'Rodotrem 30,00m (Anchieta)';
    configType = 'RODOTREM';
  } else if (isAnchieta && isBitrem) {
    config = 'Bi-trem 25,50m (Anchieta)';
    configType = 'BITREM';
  } else if (isAnchieta) {
    config = 'Anchieta SP';
    configType = 'ANCHIETA';
  } else if (isRodotrem) {
    config = 'Rodotrem 30,00m';
    configType = 'RODOTREM';
  } else if (isBitrem) {
    config = 'Bi-trem 25,50m';
    configType = 'BITREM';
  }

  // Agency
  let orgao = 'DNIT';
  if (/der\s*-?\s*sp/i.test(fileName)) orgao = 'DER-SP';
  else if (/der\s*-?\s*mg/i.test(fileName)) orgao = 'DER-MG';
  else if (/dnit/i.test(fileName)) orgao = 'DNIT';
  else if (/artesp/i.test(fileName)) orgao = 'ARTESP';

  // Number
  let numeroAet = 'S/N';
  const numMatch = fileName.match(/aet\.?\s*([A-Z0-9\/\.\-]+?)(?=\s*(?:-|v\.|\())/i) || 
                   fileName.match(/(?:der\s*sp|der\s*mg|dnit)\s*(\d{4,8})/i) ||
                   fileName.match(/aet\.?\s*([0-9]{4,8})/i);
  if (numMatch) {
    numeroAet = numMatch[1].replace(/[\.\s]/g, '');
  }

  return {
    placa: placa,
    fileId: fileId,
    folderId: folderId,
    fileName: fileName,
    config: config,
    configType: configType,
    orgao: orgao,
    numeroAet: numeroAet,
    dataVencimentoISO: vencimentoISO,
    dataVencimentoStr: vencimentoStr,
    isArchived: isArchived ? true : false,
    viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view',
    folderUrl: 'https://drive.google.com/drive/folders/' + folderId
  };
}
