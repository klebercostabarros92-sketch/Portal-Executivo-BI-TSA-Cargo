/**
 * ============================================================================
 * TSA CARGO / TSA LOGÍSTICA — EXECUTIVE BI PORTAL
 * Module 1: Compras & Custos de Manutenção (153AuVXowt0wV1PArUpfHeFDJ2O_5Dy_PSwBl_k98nnw)
 * Module 2: Patrimônio Frota TSA (1tRhBfK38m58vzoFmoxv8QWxjG6CYN66u7ozsE3RuI8Q)
 *   - Inclui Integração Oficial FIPE (https://veiculos.fipe.org.br/)
 *   - Inclui Regra de Depreciação Automática para Empilhadeiras (Sem FIPE)
 * ============================================================================
 * Script ID: 1N8ZLTuyyfmowpBIAIV2oMDbVQzb7AFB_WuHYXk5UUu7x5KXE2pNUKTvp
 */

const SPREADSHEET_ID = '153AuVXowt0wV1PArUpfHeFDJ2O_5Dy_PSwBl_k98nnw';
const PATRIMONIO_SPREADSHEET_ID = '1tRhBfK38m58vzoFmoxv8QWxjG6CYN66u7ozsE3RuI8Q';

/**
 * Serves the Executive HTML Dashboard on HTTP GET.
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  return template
    .evaluate()
    .setTitle('TSA Cargo | Portal Executivo — Compras, Manutenção & Patrimônio Frota')
    .setFaviconUrl('https://cdn-icons-png.flaticon.com/512/2830/2830305.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

// ============================================================================
// FIPE OFFICIAL API (https://veiculos.fipe.org.br/) + FORKLIFT DEPRECIATION
// ============================================================================

/**
 * Calls the official https://veiculos.fipe.org.br/api/veiculos/ endpoint
 * with ScriptCache caching and gentle retry.
 */
function fipeOfficialPost_(endpoint, payloadObj) {
  const cache = CacheService.getScriptCache();
  const rawKey = 'FIPE_' + endpoint + '_' + JSON.stringify(payloadObj || {});
  const cacheKey = rawKey.length > 240 ? 'FIPE_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, rawKey)) : rawKey;

  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const url = 'https://veiculos.fipe.org.br/api/veiculos/' + endpoint;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) Utilities.sleep(1100 * attempt);
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payloadObj || {}),
        muteHttpExceptions: true,
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://veiculos.fipe.org.br/',
          'Origin': 'https://veiculos.fipe.org.br',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (res.getResponseCode() === 200) {
        const parsed = JSON.parse(res.getContentText());
        if (parsed && !parsed.erro) {
          try { cache.put(cacheKey, JSON.stringify(parsed), 21600); } catch (e) {}
          return parsed;
        }
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Fallback to Parallelum FIPE v2 mirror (synced to official FIPE reference table)
 * if Cloudflare temporarily throttles https://veiculos.fipe.org.br.
 */
function fipeMirrorGet_(pathSuffix) {
  const cache = CacheService.getScriptCache();
  const cacheKey = ('FIPEMIR_' + pathSuffix).slice(0, 240);
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  try {
    const res = UrlFetchApp.fetch('https://fipe.parallelum.com.br/api/v2/' + pathSuffix, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    if (res.getResponseCode() === 200) {
      const parsed = JSON.parse(res.getContentText());
      try { cache.put(cacheKey, JSON.stringify(parsed), 21600); } catch (e) {}
      return parsed;
    }
  } catch (e) {}
  return null;
}

function normFipeText_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b14190\b/g, '14-190')
    .replace(/\b17190\b/g, '17-190')
    .replace(/\b17210\b/g, '17-210')
    .replace(/\b17230\b/g, '17-230')
    .replace(/\b17260\b/g, '17-260')
    .replace(/\b19360\b/g, '19-360')
    .replace(/\b25370\b/g, '25-370')
    .replace(/\b11180\b/g, '11-180')
    .replace(/\b13180\b/g, '13-180')
    .replace(/(\b\d{2})[.\-\s](\d{3}\b)/g, '$1-$2')
    .replace(/[^A-Z0-9.\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFipeBrandTargets_(marcaRaw, modeloRaw, tipoV) {
  const m = normFipeText_(marcaRaw).replace(/-/g, ' ');
  const mod = normFipeText_(modeloRaw);
  if (tipoV === 3) {
    if (mod.indexOf('MAN ') === 0) return ['VOLKSWAGEN', 'MAN'];
    if (m === 'VW' || m.indexOf('VOLKS') >= 0) return ['VOLKSWAGEN'];
    if (m.indexOf('BENZ') >= 0 || m === 'MB') return ['MERCEDES-BENZ', 'MERCEDES BENZ'];
    if (m.indexOf('SCANIA') >= 0) return ['SCANIA'];
    if (m.indexOf('VOLVO') >= 0) return ['VOLVO'];
    if (m === 'DAF') return ['DAF'];
    if (m.indexOf('IVECO') >= 0) return ['IVECO'];
    if (m.indexOf('EFFA') >= 0) return ['EFFA-JMC', 'EFFA'];
  } else {
    if (m === 'VW' || m.indexOf('VOLKS') >= 0) return ['VW - VOLKSWAGEN', 'VOLKSWAGEN'];
    if (m.indexOf('BENZ') >= 0 || m === 'MB') return ['MERCEDES-BENZ'];
    if (m.indexOf('CHEV') >= 0) return ['GM - CHEVROLET', 'CHEVROLET'];
    if (m.indexOf('CHERY') >= 0 || m.indexOf('CAOA') >= 0) return ['CAOA CHERY', 'CAOA CHERY/CHERY'];
    if (m.indexOf('LAND ROVER') >= 0) return ['LAND ROVER'];
    if (m.indexOf('JAGUAR') >= 0) return ['JAGUAR'];
    if (m.indexOf('EFFA') >= 0) return ['EFFA', 'EFFA-JMC'];
    if (m.indexOf('FIAT') >= 0) return ['FIAT'];
    if (m.indexOf('FORD') >= 0) return ['FORD'];
    if (m.indexOf('RENAULT') >= 0) return ['RENAULT'];
    if (m.indexOf('TOYOTA') >= 0) return ['TOYOTA'];
    if (m.indexOf('BMW') >= 0) return ['BMW'];
    if (m.indexOf('AUDI') >= 0) return ['AUDI'];
    if (m.indexOf('IVECO') >= 0) return ['IVECO'];
  }
  return [m];
}

function cleanFipeQuery_(modeloRaw) {
  let s = normFipeText_(modeloRaw);
  s = s.replace(/^(VW|CHEV|LR|I JAG|JAG|VOLVO|DAF|IVECO|BMW|MAN)\s+/, '');
  s = s.replace(/\b2651S6X4\b/g, '2651 6X4')
       .replace(/\b2651S\b/g, '2651')
       .replace(/\b1933 36\b|\b1933\/36\b/g, '1933')
       .replace(/\b460S36T\b/g, '460 S36T')
       .replace(/\b35S14HD\b/g, '35S14')
       .replace(/\bDAILY 150\b/g, 'DAILY 35-150')
       .replace(/\bDISC SPT\b/g, 'DISCOVERY SPORT')
       .replace(/\bEPACE\b/g, 'E-PACE')
       .replace(/\bTIGOO\b/g, 'TIGGO')
       .replace(/\bCONFORLINE\b|\bCONFORTLINE\b/g, 'COMFORTLINE')
       .replace(/\b18L\b/g, '1.8')
       .replace(/\bXDRIVE30I\b/g, 'XDRIVE 30I')
       .replace(/\bCDSRXA4FD\b/g, 'CD SRX 4X4')
       .replace(/\bHA B\b|\bFF\b|\bRDY\b|\bMA\b|\bAT9\b|\bD4\b/g, ' ')
       .replace(/\bDRC\b|\bCRM\b|\bCTC\b|\bCLM\b/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function scoreFipeCandidate_(qClean, tipoRaw, candLabel) {
  const cand = normFipeText_(candLabel);
  const candWords = cand.replace(/-/g, ' ').split(/\s+/);
  const qTokens = qClean.split(/\s+/).filter(Boolean);
  if (qTokens.length === 0) return 0;

  let score = 0;

  // Check hyphenated truck tonnage code (e.g. 17-260, 11-180, 19-360)
  const truckCodeMatch = qClean.match(/\b(\d{2}-\d{3})\b/);
  if (truckCodeMatch) {
    const tc = truckCodeMatch[1];
    if (cand.indexOf(tc) >= 0) score += 160;
    else return -500;
  }

  // Primary family token check (e.g. POLO, SPIN, FIORINO, XF, FH, VM, ATEGO, ACTROS, AXOR, TIGGO, COROLLA)
  const firstTok = qTokens[0];
  if (!/^\d{2}-\d{3}$/.test(firstTok) && firstTok !== 'DELIVERY') {
    const firstPlain = firstTok.replace(/-/g, ' ');
    const hasFamily = cand.indexOf(firstTok) >= 0 || candWords.indexOf(firstPlain) >= 0 ||
      (firstTok === 'FH' && cand.indexOf('FH-') >= 0) ||
      (firstTok === 'P' && (cand.indexOf('P 340') >= 0 || cand.indexOf('P-340') >= 0 || cand.indexOf('P340') >= 0));
    if (hasFamily) score += 120;
    else return -400;
  }

  // Avoid Corolla Cross when query is Corolla GLI, avoid Ka Sedan when query is Ka hatch
  if (firstTok === 'COROLLA' && qClean.indexOf('CROSS') < 0 && cand.indexOf('CROSS') >= 0) score -= 120;
  if (firstTok === 'KA' && qClean.indexOf('SEDAN') < 0 && (cand.indexOf('SEDAN') >= 0 || cand.indexOf('KA+') >= 0)) score -= 80;

  for (let i = 1; i < qTokens.length; i++) {
    const tok = qTokens[i];
    if (tok === truckCodeMatch?.[1]) continue;
    const hasDigit = /\d/.test(tok);
    const weight = hasDigit ? 45 : 22;
    const tokPlain = tok.replace(/[.\-]/g, '');
    const candPlain = cand.replace(/[.\-]/g, '');
    if (cand.indexOf(tok) >= 0 || candWords.indexOf(tok) >= 0) {
      score += weight;
    } else if (tokPlain.length >= 2 && candPlain.indexOf(tokPlain) >= 0) {
      score += weight * 0.85;
    } else if (hasDigit && tok.length >= 3) {
      score -= 35;
    }
  }

  const tUpper = normFipeText_(tipoRaw);
  if (tUpper.indexOf('6X4') >= 0 && cand.indexOf('6X4') >= 0) score += 35;
  if (tUpper.indexOf('6X2') >= 0 && cand.indexOf('6X2') >= 0) score += 35;
  if (tUpper.indexOf('4X2') >= 0 && cand.indexOf('4X2') >= 0) score += 25;
  if (tUpper.indexOf('TRUCK') >= 0 && cand.indexOf('6X2') >= 0) score += 25;
  if (tUpper.indexOf('TOCO') >= 0 && cand.indexOf('4X2') >= 0) score += 25;

  return score;
}

/**
 * Step 1: Returns the latest official FIPE Reference Table from https://veiculos.fipe.org.br/
 */
function getOfficialFipeReference() {
  const refs = fipeOfficialPost_('ConsultarTabelaDeReferencia', {});
  if (Array.isArray(refs) && refs.length > 0) {
    return {
      ok: true,
      source: 'veiculos.fipe.org.br',
      codigoTabela: refs[0].Codigo,
      mesReferencia: String(refs[0].Mes || '').trim()
    };
  }
  const mir = fipeMirrorGet_('references');
  if (Array.isArray(mir) && mir.length > 0) {
    return {
      ok: true,
      source: 'fipe.org.br (mirror)',
      codigoTabela: parseInt(mir[0].code, 10),
      mesReferencia: String(mir[0].month || '').trim()
    };
  }
  return { ok: false, error: 'Não foi possível conectar ao portal veiculos.fipe.org.br no momento.' };
}

/**
 * Step 2: Resolves a batch of unique vehicles [{ key, tipo, marca, modelo, anoMod }]
 * against https://veiculos.fipe.org.br/api/veiculos/ (with automatic mirror fallback).
 */
function resolveOfficialFipeBatch(batchItems, codigoTabela) {
  const results = {};
  if (!Array.isArray(batchItems) || batchItems.length === 0) return { ok: true, results: results };

  const marcasCache = {};
  const modelosCache = {};

  function getMarcas(tv) {
    if (!marcasCache[tv]) {
      const m = fipeOfficialPost_('ConsultarMarcas', { codigoTabelaReferencia: codigoTabela, codigoTipoVeiculo: tv });
      if (Array.isArray(m)) {
        marcasCache[tv] = m;
      } else {
        const mirType = tv === 3 ? 'trucks' : 'cars';
        const mm = fipeMirrorGet_(mirType + '/brands');
        marcasCache[tv] = Array.isArray(mm) ? mm.map(x => ({ Label: x.name, Value: String(x.code) })) : [];
      }
    }
    return marcasCache[tv];
  }

  function getModelos(tv, codMarca) {
    const k = tv + ':' + codMarca;
    if (!modelosCache[k]) {
      const modRes = fipeOfficialPost_('ConsultarModelos', {
        codigoTabelaReferencia: codigoTabela,
        codigoTipoVeiculo: tv,
        codigoMarca: String(codMarca)
      });
      if (modRes && Array.isArray(modRes.Modelos)) {
        modelosCache[k] = modRes.Modelos;
      } else {
        const mirType = tv === 3 ? 'trucks' : 'cars';
        const mm = fipeMirrorGet_(mirType + '/brands/' + codMarca + '/models');
        modelosCache[k] = Array.isArray(mm) ? mm.map(x => ({ Label: x.name, Value: x.code })) : [];
      }
    }
    return modelosCache[k];
  }

  const currentYear = new Date().getFullYear();

  batchItems.forEach(item => {
    try {
      const tipo = String(item.tipo || '').trim();
      const marca = String(item.marca || '').trim();
      const modelo = String(item.modelo || '').trim();
      const anoMod = parseInt(item.anoMod, 10) || currentYear;

      const isHeavy = /Cavalo|Toco|Truck|Vuc|VUC/i.test(tipo);
      const tryTypes = (marca.toUpperCase().indexOf('IVECO') >= 0 && /Van/i.test(tipo)) || marca.toUpperCase().indexOf('EFFA') >= 0
        ? [1, 3]
        : (isHeavy ? [3, 1] : [1, 3]);

      const qClean = cleanFipeQuery_(modelo);
      let topCandidates = [];

      for (let tIdx = 0; tIdx < tryTypes.length; tIdx++) {
        const tv = tryTypes[tIdx];
        const targets = getFipeBrandTargets_(marca, modelo, tv);
        const brands = getMarcas(tv).filter(b => {
          const bNorm = normFipeText_(b.Label);
          const bPlain = bNorm.replace(/-/g, ' ');
          return targets.some(tg => {
            const tgNorm = normFipeText_(tg);
            const tgPlain = tgNorm.replace(/-/g, ' ');
            return bNorm === tgNorm || bPlain === tgPlain || bPlain.indexOf(tgPlain) >= 0;
          });
        });

        brands.forEach(bObj => {
          const mods = getModelos(tv, bObj.Value);
          mods.forEach(mObj => {
            const sc = scoreFipeCandidate_(qClean, tipo, mObj.Label);
            if (sc >= 60) {
              topCandidates.push({ score: sc, tv: tv, brandCode: String(bObj.Value), brandLabel: bObj.Label, modelCode: mObj.Value, modelLabel: mObj.Label });
            }
          });
        });

        if (topCandidates.length > 0) break;
      }

      topCandidates.sort((a, b) => b.score - a.score);
      // Inspect up to top 4 close candidates to pick the one that actually has the exact model year (e.g. Euro 5 vs Euro 6!)
      const bestScore = topCandidates[0] ? topCandidates[0].score : 0;
      const shortlist = topCandidates.filter(c => c.score >= bestScore - 35).slice(0, 4);

      let resolved = null;
      for (let i = 0; i < shortlist.length; i++) {
        const cand = shortlist[i];
        let anos = fipeOfficialPost_('ConsultarAnoModelo', {
          codigoTabelaReferencia: codigoTabela,
          codigoTipoVeiculo: cand.tv,
          codigoMarca: cand.brandCode,
          codigoModelo: cand.modelCode
        });

        let usedMirror = false;
        const mirType = cand.tv === 3 ? 'trucks' : 'cars';
        if (!Array.isArray(anos)) {
          const mirYears = fipeMirrorGet_(mirType + '/brands/' + cand.brandCode + '/models/' + cand.modelCode + '/years');
          if (Array.isArray(mirYears)) {
            anos = mirYears.map(y => ({ Label: y.name, Value: y.code }));
            usedMirror = true;
          }
        }
        if (!Array.isArray(anos) || anos.length === 0) continue;

        // Exact year match first
        let chosenAno = anos.find(a => String(a.Value).indexOf(String(anoMod) + '-') === 0);
        // For current/next model year (e.g. 2026/2027 0km), allow 32000 (Zero KM) or currentYear
        if (!chosenAno && anoMod >= currentYear) {
          chosenAno = anos.find(a => String(a.Value).indexOf('32000-') === 0) ||
                      anos.find(a => String(a.Value).indexOf(String(currentYear) + '-') === 0) ||
                      anos.find(a => String(a.Value).indexOf(String(currentYear - 1) + '-') === 0);
        }
        // Within +-2 years only if exact year not found on primary candidate
        if (!chosenAno && i === shortlist.length - 1) {
          let bestDiff = 999;
          anos.forEach(a => {
            const yr = parseInt(String(a.Value).split('-')[0], 10);
            const effYr = yr === 32000 ? currentYear : yr;
            const diff = Math.abs(effYr - anoMod);
            if (diff <= 2 && diff < bestDiff) {
              bestDiff = diff;
              chosenAno = a;
            }
          });
        }

        if (!chosenAno) continue;

        const parts = String(chosenAno.Value).split('-');
        const yrInt = parseInt(parts[0], 10);
        const fuelInt = parseInt(parts[1] || '1', 10);

        let valData = !usedMirror ? fipeOfficialPost_('ConsultarValorComTodosParametros', {
          codigoTabelaReferencia: codigoTabela,
          codigoTipoVeiculo: cand.tv,
          codigoMarca: cand.brandCode,
          codigoModelo: cand.modelCode,
          anoModelo: yrInt,
          codigoTipoCombustivel: fuelInt,
          tipoVeiculo: cand.tv === 3 ? 'caminhao' : 'carro',
          modeloCodigoExterno: '',
          tipoConsulta: 'tradicional'
        }) : null;

        if (valData && valData.Valor) {
          resolved = {
            ok: true,
            valorStr: String(valData.Valor).trim(),
            codigoFipe: valData.CodigoFipe || '',
            modeloFipe: valData.Modelo || cand.modelLabel,
            anoReferencia: chosenAno.Label || String(anoMod),
            mesReferencia: String(valData.MesReferencia || '').trim(),
            fonte: 'veiculos.fipe.org.br'
          };
          break;
        } else {
          const mirVal = fipeMirrorGet_(mirType + '/brands/' + cand.brandCode + '/models/' + cand.modelCode + '/years/' + chosenAno.Value);
          if (mirVal && mirVal.price) {
            resolved = {
              ok: true,
              valorStr: String(mirVal.price).trim(),
              codigoFipe: mirVal.codeFipe || '',
              modeloFipe: mirVal.model || cand.modelLabel,
              anoReferencia: String(mirVal.modelYear || anoMod),
              mesReferencia: String(mirVal.referenceMonth || '').trim(),
              fonte: 'fipe.org.br'
            };
            break;
          }
        }
      }

      results[item.key] = resolved || { ok: false, reason: 'Modelo/Ano sem correspondência exata na FIPE' };
    } catch (err) {
      results[item.key] = { ok: false, reason: err.message || String(err) };
    }
  });

  return { ok: true, results: results };
}

/**
 * Step 3: Persists the updated FIPE values (official FIPE + Forklift Depreciation)
 * directly into Column Y ('Fipe') and Column V ('Idade') of the Patrimônio Frota Google Sheet.
 * Writes ONLY the narrowest cell ranges (Fipe and Idade) to preserve all formatting and other columns.
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
      freshPayload: readSpreadsheetPayload_(PATRIMONIO_SPREADSHEET_ID, 'ALL')
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  }
}
