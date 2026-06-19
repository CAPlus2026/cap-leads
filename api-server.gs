/**
 * CAP Commercial Lead Tracker – Apps Script Web App API
 *
 * Paste this into the Apps Script project (as a new file or replace Code.gs).
 * Then: Deploy > New Deployment > Web App
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the web app URL and paste it into app.js as SCRIPT_URL.
 */

const SS_ID = '1nW7R8zJRx0w007wNJTm2OT51tBVQrS1HbVy81HPaKfw';

function doGet(e) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case 'getLeads':       result = getLeads(ss); break;
      case 'getLeadItems':   result = getLeadItems(ss, e.parameter.leadId); break;
      case 'getSpiffRates':  result = getSpiffRates(ss); break;
      case 'getCommission':  result = getCommission(ss); break;
      case 'getBuilders':    result = getBuilders(ss); break;
      case 'getBuilderLogs':   result = getBuilderLogs(ss, e.parameter.builderId); break;
      case 'getFollowUpLogs': result = getFollowUpLogs(ss, e.parameter.leadId); break;
      default: result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let data, result;
  try {
    data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'createLead':    result = createLead(ss, data.payload); break;
      case 'updateLead':    result = updateLead(ss, data.payload); break;
      case 'saveLeadItems': result = saveLeadItems(ss, data.leadId, data.items); break;
      case 'updateCommission': result = updateCommission(ss, data.payload); break;
      case 'createBuilder': result = createBuilder(ss, data.payload); break;
      case 'updateBuilder': result = updateBuilder(ss, data.payload); break;
      case 'logContact':    result = logContact(ss, data.payload); break;
      case 'logFollowUp':   result = logFollowUp(ss, data.payload); break;
      default: result = { error: 'Unknown action: ' + data.action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── LEADS ────────────────────────────────────────────────────────────────────

function getLeads(ss) {
  return sheetToObjects(ss.getSheetByName('Leads'));
}

function createLead(ss, payload) {
  const sheet = ss.getSheetByName('Leads');
  const headers = getHeaders(sheet);
  const now = new Date().toISOString();
  payload.lead_id = generateId('LEAD');
  payload.created_date = now;
  payload.last_updated = now;
  sheet.appendRow(headers.map(h => payload[h] !== undefined ? payload[h] : ''));
  if (payload.status === 'Sold' || payload.status === 'Sold (Delayed)') {
    addToCommission(ss, payload);
  }
  return { success: true, lead_id: payload.lead_id };
}

function updateLead(ss, payload) {
  const sheet = ss.getSheetByName('Leads');
  const headers = getHeaders(sheet);
  const rowNum = findRowById(sheet, 0, payload.lead_id);
  if (!rowNum) return { error: 'Lead not found: ' + payload.lead_id };
  payload.last_updated = new Date().toISOString();
  sheet.getRange(rowNum, 1, 1, headers.length)
    .setValues([headers.map(h => payload[h] !== undefined ? payload[h] : '')]);
  if (payload.status === 'Sold' || payload.status === 'Sold (Delayed)') {
    syncCommission(ss, payload);
  }
  return { success: true };
}

// ─── LEAD ITEMS ───────────────────────────────────────────────────────────────

function getLeadItems(ss, leadId) {
  const all = sheetToObjects(ss.getSheetByName('Lead Items'));
  return leadId ? all.filter(r => r.lead_id === leadId) : all;
}

function saveLeadItems(ss, leadId, items) {
  const sheet = ss.getSheetByName('Lead Items');
  const headers = getHeaders(sheet);
  deleteRowsWhere(sheet, 1, leadId);
  items.forEach(item => {
    item.item_id = generateId('ITEM');
    item.lead_id = leadId;
    sheet.appendRow(headers.map(h => item[h] !== undefined ? item[h] : ''));
  });
  return { success: true };
}

// ─── SPIFF RATES ──────────────────────────────────────────────────────────────

function getSpiffRates(ss) {
  const all = sheetToObjects(ss.getSheetByName('Spiff Rates'));
  return all.filter(r => r.active === true || r.active === 'TRUE');
}

// ─── COMMISSION ───────────────────────────────────────────────────────────────

function getCommission(ss) {
  return sheetToObjects(ss.getSheetByName('Commission'));
}

function addToCommission(ss, lead) {
  const sheet = ss.getSheetByName('Commission');
  if (findRowById(sheet, 0, lead.lead_id)) return;
  const headers = getHeaders(sheet);
  sheet.appendRow(headers.map(h => {
    if (h === 'lead_id') return lead.lead_id;
    if (h === 'job_name') return lead.job_name;
    if (h === 'sale_amount') return lead.sale_amount;
    return '';
  }));
}

function syncCommission(ss, lead) {
  const sheet = ss.getSheetByName('Commission');
  const headers = getHeaders(sheet);
  const rowNum = findRowById(sheet, 0, lead.lead_id);
  if (!rowNum) { addToCommission(ss, lead); return; }
  const ji = headers.indexOf('job_name');
  const si = headers.indexOf('sale_amount');
  const ci  = headers.indexOf('job_complete_date');
  const ppi = headers.indexOf('pay_period');
  if (ji >= 0) sheet.getRange(rowNum, ji + 1).setValue(lead.job_name);
  if (si >= 0) sheet.getRange(rowNum, si + 1).setValue(lead.sale_amount);
  if (ci >= 0 && lead.job_complete_date) {
    sheet.getRange(rowNum, ci + 1).setValue(lead.job_complete_date);
    // Auto-set pay_period to YYYY-MM of the completion date
    if (ppi >= 0) {
      const d = new Date(lead.job_complete_date);
      const payPeriod = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      sheet.getRange(rowNum, ppi + 1).setValue(payPeriod);
    }
  }
  // If completion date is cleared, clear pay_period too
  if (ci >= 0 && lead.job_complete_date === '') {
    sheet.getRange(rowNum, ci + 1).setValue('');
    if (ppi >= 0) sheet.getRange(rowNum, ppi + 1).setValue('');
  }
}

function updateCommission(ss, payload) {
  const sheet = ss.getSheetByName('Commission');
  const headers = getHeaders(sheet);
  const rowNum = findRowById(sheet, 0, payload.lead_id);
  if (!rowNum) return { error: 'Commission row not found' };
  ['job_complete_date', 'paid_date', 'notes'].forEach(field => {
    const ci = headers.indexOf(field);
    if (ci >= 0 && payload[field] !== undefined) {
      sheet.getRange(rowNum, ci + 1).setValue(payload[field]);
    }
  });
  return { success: true };
}

// ─── BUILDERS ─────────────────────────────────────────────────────────────────

function getBuilders(ss) {
  const sheet = ss.getSheetByName('Builders');
  if (!sheet) return [];
  return sheetToObjects(sheet);
}

function createBuilder(ss, payload) {
  const sheet = ss.getSheetByName('Builders');
  if (!sheet) return { error: 'Builders tab not found — run step6_Builders first' };
  const headers = getHeaders(sheet);
  payload.builder_id = generateId('BLD');
  payload.created_date = new Date().toISOString();
  sheet.appendRow(headers.map(h => payload[h] !== undefined ? payload[h] : ''));
  return { success: true, builder_id: payload.builder_id };
}

function updateBuilder(ss, payload) {
  const sheet = ss.getSheetByName('Builders');
  if (!sheet) return { error: 'Builders tab not found' };
  const headers = getHeaders(sheet);
  const rowNum = findRowById(sheet, 0, payload.builder_id);
  if (!rowNum) return { error: 'Builder not found' };
  sheet.getRange(rowNum, 1, 1, headers.length)
    .setValues([headers.map(h => payload[h] !== undefined ? payload[h] : '')]);
  return { success: true };
}

function getBuilderLogs(ss, builderId) {
  const sheet = ss.getSheetByName('Builder Log');
  if (!sheet) return [];
  const all = sheetToObjects(sheet);
  return builderId ? all.filter(r => r.builder_id === builderId) : all;
}

function logContact(ss, payload) {
  const sheet = ss.getSheetByName('Builder Log');
  if (!sheet) return { error: 'Builder Log tab not found' };
  const headers = getHeaders(sheet);
  payload.log_id = generateId('LOG');
  payload.logged_at = new Date().toISOString();
  sheet.appendRow(headers.map(h => payload[h] !== undefined ? payload[h] : ''));

  // Update builder last_contact_date + next_contact_date
  const builderSheet = ss.getSheetByName('Builders');
  if (builderSheet && payload.builder_id) {
    const bHeaders = getHeaders(builderSheet);
    const rowNum = findRowById(builderSheet, 0, payload.builder_id);
    if (rowNum) {
      const lci = bHeaders.indexOf('last_contact_date');
      const nci = bHeaders.indexOf('next_contact_date');
      const lni = bHeaders.indexOf('last_notified_date');
      if (lci >= 0) builderSheet.getRange(rowNum, lci + 1).setValue(payload.contact_date);
      if (nci >= 0 && payload.next_planned_contact) builderSheet.getRange(rowNum, nci + 1).setValue(payload.next_planned_contact);
      if (lni >= 0) builderSheet.getRange(rowNum, lni + 1).setValue('');
    }
  }
  return { success: true, log_id: payload.log_id };
}

// ─── FOLLOW-UP LOGS ───────────────────────────────────────────────────────────

function getFollowUpLogs(ss, leadId) {
  const sheet = ss.getSheetByName('Follow-Up Log');
  if (!sheet) return [];
  const all = sheetToObjects(sheet);
  return leadId ? all.filter(r => r.lead_id === leadId) : all;
}

function logFollowUp(ss, payload) {
  const sheet = ss.getSheetByName('Follow-Up Log');
  if (!sheet) return { error: 'Follow-Up Log tab not found — run step7_FollowUpLog first' };
  const headers = getHeaders(sheet);
  payload.log_id = generateId('FU');
  payload.logged_at = new Date().toISOString();
  sheet.appendRow(headers.map(h => payload[h] !== undefined ? payload[h] : ''));
  return { success: true, log_id: payload.log_id };
}

// ─── BUILDERS TAB SETUP (run once) ────────────────────────────────────────────

function step6_Builders() {
  const ss = SpreadsheetApp.openById(SS_ID);

  // Builders tab
  let builders = ss.getSheetByName('Builders');
  if (!builders) builders = ss.insertSheet('Builders');
  else builders.clear();
  builders.getRange(1, 1, 1, 10).setValues([[
    'builder_id','company_name','contact_name','phone','email',
    'status','last_contact_date','next_contact_date','notes','last_notified_date'
  ]]);
  builders.getRange(1,1,1,10).setBackground('#185FA5').setFontColor('#FFFFFF').setFontWeight('bold');
  setDropdown(builders, 'F2:F100', ['Hot','Warm','Cool']);
  builders.setFrozenRows(1);

  // Builder Log tab
  let log = ss.getSheetByName('Builder Log');
  if (!log) log = ss.insertSheet('Builder Log');
  else log.clear();
  log.getRange(1, 1, 1, 7).setValues([[
    'log_id','builder_id','contact_date','contact_method','notes','next_planned_contact','logged_at'
  ]]);
  log.getRange(1,1,1,7).setBackground('#185FA5').setFontColor('#FFFFFF').setFontWeight('bold');
  setDropdown(log, 'D2:D100', ['Call','Email','In Person','Text']);
  log.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('✅ Builders and Builder Log tabs created!');
}

function setDropdown(sheet, rangeA1, values) {
  sheet.getRange(rangeA1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build()
  );
}

// ─── FOLLOW-UP LOG TAB SETUP (run once) ───────────────────────────────────────

function step7_FollowUpLog() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName('Follow-Up Log');
  if (!sheet) sheet = ss.insertSheet('Follow-Up Log');
  else sheet.clear();
  sheet.getRange(1, 1, 1, 6).setValues([[
    'log_id', 'lead_id', 'followup_date', 'next_followup_date', 'notes', 'logged_at'
  ]]);
  sheet.getRange(1, 1, 1, 6).setBackground('#185FA5').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('✅ Follow-Up Log tab created!');
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row[0] !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function findRowById(sheet, colIndex, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(id)) return i + 1;
  }
  return null;
}

function deleteRowsWhere(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIndex]) === String(value)) sheet.deleteRow(i + 1);
  }
}

function generateId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2,4).toUpperCase();
}
