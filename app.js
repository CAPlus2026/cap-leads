/**
 * CAP Commercial Lead Tracker – Frontend App
 * Paste your deployed Apps Script URL into SCRIPT_URL below.
 */

// v2.1
// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbydEDsyeykVDuoKLlTX-anPqsKqmXaiTd--h7SJLO4rUjkKe9YppYkhCHa4TybeKLdw/exec';

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  leads: [],
  spiffRates: [],
  commission: [],
  builders: [],
  selectedLead: null,
  selectedBuilder: null,
  editingLeadId: null,
  editingBuilderId: null,
  filters: { status: 'all', type: 'all', assignee: 'all' },
  search: '',
  sort: { col: null, dir: 'asc' },
  commFilters: { period: 'all', status: 'all' },
  builderFilter: 'all',
};

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiGet(action, params = {}) {
  if (SCRIPT_URL.startsWith('PASTE')) { showToast('⚠ Set SCRIPT_URL in app.js first', true); return null; }
  const url = new URL(SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('_t', Date.now());
  const res = await fetch(url.toString(), { redirect: 'follow', cache: 'no-store' });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(action, payload) {
  if (SCRIPT_URL.startsWith('PASTE')) { showToast('⚠ Set SCRIPT_URL in app.js first', true); return null; }
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupLeadModal();
  setupBuilderModal();
  setupLogModal();
  setupFollowUpModal();
  setupSoldDetailsModal();
  setupDrawerClose();

  if (SCRIPT_URL.startsWith('PASTE')) {
    showConfigWarning();
    return;
  }

  try {
    await loadAll();
  } catch (e) {
    showToast('Failed to load data: ' + e.message, true);
  }
});

async function loadAll() {
  const [leads, spiff, commission, builders] = await Promise.all([
    apiGet('getLeads'),
    apiGet('getSpiffRates'),
    apiGet('getCommission'),
    apiGet('getBuilders'),
  ]);
  state.leads      = leads      || [];
  state.spiffRates = spiff      || [];
  state.commission = commission || [];
  state.builders   = builders   || [];

  renderLeadsTab();
  renderCommissionTab();
  renderBuildersTab();
  document.getElementById('header-sub').textContent =
    `${state.leads.length} leads · ${state.commission.filter(c => c.payment_status === 'Pending').length} pending commission`;
}

function showConfigWarning() {
  ['leads-tbody','commission-tbody','builders-tbody'].forEach(id => {
    const el = document.getElementById(id);
    const cols = id === 'commission-tbody' ? 10 : (id === 'builders-tbody' ? 7 : 9);
    el.innerHTML = `<tr><td colspan="${cols}" class="empty">
      ⚠ Open <strong>app.js</strong> and replace <code>PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE</code>
      with your deployed Apps Script URL to connect to Google Sheets.
    </td></tr>`;
  });
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      closeAllDrawers();
    });
  });
}

// ─── LEADS TAB ────────────────────────────────────────────────────────────────
function renderLeadsTab() {
  renderSummaryBar();
  renderLeadsTable();

  document.querySelectorAll('#status-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#status-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.status = chip.dataset.status;
      renderLeadsTable();
    });
  });

  document.getElementById('type-filter').addEventListener('change', e => {
    state.filters.type = e.target.value;
    renderLeadsTable();
  });

  document.getElementById('assignee-filter').addEventListener('change', e => {
    state.filters.assignee = e.target.value;
    renderLeadsTable();
  });

  document.getElementById('lead-search').addEventListener('input', e => {
    state.search = e.target.value.toLowerCase();
    renderLeadsTable();
  });

  document.querySelectorAll('#leads-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (state.sort.col === col) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.col = col;
        state.sort.dir = 'asc';
      }
      document.querySelectorAll('#leads-table thead th').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(state.sort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderLeadsTable();
    });
  });
}

function filteredLeads() {
  let leads = state.leads.filter(l => {
    const s = l.status || '';
    const isSold = s === 'Sold' || s === 'Sold (Delayed)';
    const isComplete = !!(l.job_complete_date && l.job_complete_date !== '');
    const isActive = !isSold && s !== 'Lost';

    if (state.filters.status === 'active'   && !isActive)   return false;
    if (state.filters.status === 'sold'     && !(isSold && !isComplete)) return false;
    if (state.filters.status === 'complete' && !isComplete)  return false;
    if (state.filters.status === 'lost'     && s !== 'Lost') return false;
    if (state.filters.type !== 'all' && l.project_type !== state.filters.type) return false;
    if (state.filters.assignee !== 'all' && l.assigned_to !== state.filters.assignee) return false;
    if (state.search) {
      const q = state.search;
      if (!(l.job_name||'').toLowerCase().includes(q) && !(l.address||'').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (state.sort.col) {
    const col = state.sort.col;
    const dir = state.sort.dir === 'asc' ? 1 : -1;
    leads = leads.slice().sort((a, b) => {
      let av = a[col] || '', bv = b[col] || '';
      if (col === 'sale_amount') { av = parseFloat(av)||0; bv = parseFloat(bv)||0; }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }

  return leads;
}

function renderSummaryBar() {
  const leads = state.leads;
  const today = new Date().toISOString().split('T')[0];
  const pipeline = leads
    .filter(l => l.status !== 'Lost' && l.status !== 'Sold' && l.status !== 'Sold (Delayed)')
    .reduce((s, l) => s + (parseFloat(l.sale_amount) || 0), 0);
  const sold = leads.filter(l => (l.status === 'Sold' || l.status === 'Sold (Delayed)') && !l.job_complete_date).length;
  const backlog = leads
    .filter(l => (l.status === 'Sold' || l.status === 'Sold (Delayed)') && !l.job_complete_date)
    .reduce((s, l) => s + (parseFloat(l.sale_amount) || 0), 0);
  const soldTotal = leads.filter(l => l.status === 'Sold' || l.status === 'Sold (Delayed)').length;
  const lostTotal = leads.filter(l => l.status === 'Lost').length;
  const winRate = (soldTotal + lostTotal) > 0 ? Math.round((soldTotal / (soldTotal + lostTotal)) * 100) : null;
  const followupsDue = leads.filter(l => {
    const isSold = l.status === 'Sold' || l.status === 'Sold (Delayed)';
    const isLost = l.status === 'Lost';
    return !isSold && !isLost && l.next_followup_date && String(l.next_followup_date).split('T')[0] < today;
  }).length;

  document.getElementById('leads-summary').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Leads</div><div class="stat-value blue">${leads.length}</div></div>
    <div class="stat-card"><div class="stat-label">Pipeline Value</div><div class="stat-value">${fmt$(pipeline)}</div></div>
    <div class="stat-card"><div class="stat-label">Sold Jobs</div><div class="stat-value green">${sold}</div></div>
    <div class="stat-card"><div class="stat-label">Committed Backlog</div><div class="stat-value green">${fmt$(backlog)}</div></div>
    ${followupsDue > 0
      ? `<div class="stat-card"><div class="stat-label">Follow-Ups Due</div><div class="stat-value amber">${followupsDue}</div></div>`
      : `<div class="stat-card"><div class="stat-label">Follow-Ups Due</div><div class="stat-value" style="color:var(--gray)">0</div></div>`}
    ${winRate !== null
      ? `<div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value blue">${winRate}%</div></div>`
      : ''}
  `;
}

function renderLeadsTable() {
  const tbody = document.getElementById('leads-tbody');
  const leads = filteredLeads();

  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No leads match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = leads.map(l => {
    const isSold     = l.status === 'Sold' || l.status === 'Sold (Delayed)';
    const isDelayed  = l.status === 'Sold (Delayed)';
    const isLost     = l.status === 'Lost';
    const isComplete = !!(l.job_complete_date && l.job_complete_date !== '');
    const today      = new Date().toISOString().split('T')[0];
    const isOverdue  = !isSold && !isLost && !isComplete && l.next_followup_date && String(l.next_followup_date).split('T')[0] < today;
    const rowClass   = isComplete ? 'row-complete' : isOverdue ? 'row-followup-due' : (isSold && !isDelayed ? 'row-sold' : (isDelayed ? 'row-delayed' : (isLost ? 'row-lost' : '')));

    const roughAmt  = l.billing_rough_date ? (parseFloat(l.billing_rough_amount) || 0) : 0;
    const trimAmt   = l.billing_trim_date  ? (parseFloat(l.billing_trim_amount)  || 0) : 0;
    const saleAmt   = parseFloat(l.sale_amount) || 1;
    const roughPct  = Math.min(100, (roughAmt / saleAmt) * 100);
    const trimPct   = Math.min(100 - roughPct, (trimAmt / saleAmt) * 100);

    const ageDays   = l.created_date ? Math.floor((Date.now() - new Date(l.created_date)) / 86400000) : null;
    const ageHtml   = ageDays !== null && !isSold && !isLost && !isComplete
      ? `<div class="lead-age${ageDays > 30 ? ' stale' : ''}">${ageDays}d old${isOverdue ? ' · ⚠ follow-up overdue' : ''}</div>`
      : (isOverdue ? '<div class="lead-age stale">⚠ follow-up overdue</div>' : '');

    return `<tr class="${rowClass}" data-id="${l.lead_id}">
      <td><strong>${esc(l.job_name)}</strong><br><small style="color:var(--gray)">${esc(l.address||'')}</small>${ageHtml}</td>
      <td>${typeBadge(l.project_type)}</td>
      <td onclick="event.stopPropagation()">
        <select class="status-select ${statusSelectClass(l.status)}" data-id="${l.lead_id}" onchange="quickStatusChange(this)">
          <option ${l.status==='Bid Submitted'?'selected':''}>Bid Submitted</option>
          <option ${l.status==='Waiting Approval'?'selected':''}>Waiting Approval</option>
          <option ${l.status==='Waiting Load Calc'?'selected':''}>Waiting Load Calc</option>
          <option ${l.status==='Sold'?'selected':''}>Sold</option>
          <option ${l.status==='Sold (Delayed)'?'selected':''}>Sold (Delayed)</option>
          <option ${l.status==='Lost'?'selected':''}>Lost</option>
        </select>
      </td>
      <td>${fmt$(l.sale_amount)}</td>
      <td>${esc(l.assigned_to||'')}</td>
      <td>${fmtMonth(l.est_start_month)}</td>
      <td>${l.total_days_budgeted || '—'}</td>
      <td>${l.subs_needed || '—'}</td>
      <td>${isSold ? `<div class="billing-bar"><div class="seg-rough" style="width:${roughPct}%"></div><div class="seg-trim" style="width:${trimPct}%"></div></div>` : '—'}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const lead = state.leads.find(l => l.lead_id === tr.dataset.id);
      if (lead) openLeadDrawer(lead);
    });
  });
}

// ─── LEAD DRAWER ──────────────────────────────────────────────────────────────
async function openLeadDrawer(lead) {
  state.selectedLead = lead;
  const isSold = lead.status === 'Sold' || lead.status === 'Sold (Delayed)';

  let items = [];
  if (isSold) {
    try { items = await apiGet('getLeadItems', { leadId: lead.lead_id }) || []; }
    catch(e) { items = []; }
  }

  const isService = lead.project_type === 'Service & Add-Ons';
  const accRev   = items.reduce((s, i) => s + (parseFloat(i.total_revenue) || 0), 0);
  const spiffs   = items.reduce((s, i) => s + (parseFloat(i.total_spiff)   || 0), 0);
  const saleAmt  = parseFloat(lead.sale_amount) || 0;
  const netSale  = isService ? 0 : saleAmt - accRev;
  const baseComm = isService ? 0 : netSale * 0.02;
  const totalPayout = isService ? spiffs : baseComm + spiffs;

  document.getElementById('drawer-title').textContent = lead.job_name;

  const body = document.getElementById('drawer-body');
  body.innerHTML = `
    <div class="drawer-section">
      <h3>Project Info</h3>
      <div class="detail-row"><span class="label">Address</span><span class="value">${esc(lead.address||'—')}</span></div>
      <div class="detail-row"><span class="label">Type</span><span class="value">${typeBadge(lead.project_type)}</span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value">
        <select id="drawer-status-select" style="border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:13px;background:var(--surface)">
          <option ${lead.status==='Bid Submitted'?'selected':''}>Bid Submitted</option>
          <option ${lead.status==='Waiting Approval'?'selected':''}>Waiting Approval</option>
          <option ${lead.status==='Waiting Load Calc'?'selected':''}>Waiting Load Calc</option>
          <option ${lead.status==='Sold'?'selected':''}>Sold</option>
          <option ${lead.status==='Sold (Delayed)'?'selected':''}>Sold (Delayed)</option>
          <option ${lead.status==='Lost'?'selected':''}>Lost</option>
        </select>
        ${isSold ? '<span class="badge badge-notified">Caleb notified</span>' : ''}
      </span></div>
      <div class="detail-row"><span class="label">Assigned To</span><span class="value">${esc(lead.assigned_to||'—')}</span></div>
      <div class="detail-row"><span class="label">Sale Amount</span><span class="value blue">${fmt$(lead.sale_amount)}</span></div>
      ${lead.notes ? `<div class="detail-row"><span class="label">Notes</span><span class="value" style="max-width:180px;text-align:right">${esc(lead.notes)}</span></div>` : ''}
    </div>

    ${isSold ? `
    <div class="drawer-section">
      <h3>Contract Details</h3>
      <div class="detail-row"><span class="label">Billing Name</span><span class="value">${esc(lead.billing_name||'—')}</span></div>
      <div class="detail-row"><span class="label">Est. Start</span><span class="value">${fmtMonth(lead.est_start_month)||'—'}</span></div>
      <div class="detail-row"><span class="label">Subs Needed</span><span class="value">${lead.subs_needed||'—'}</span></div>
    </div>

    <div class="drawer-section">
      <h3>Days Breakdown</h3>
      <div class="detail-row"><span class="label">Total Days Budgeted</span><span class="value">${lead.total_days_budgeted||'—'}</span></div>
      ${lead.rough_cap_days ? `<div class="detail-row"><span class="label">Rough CAP Days</span><span class="value">${lead.rough_cap_days}</span></div>` : ''}
      ${lead.rough_sub_days ? `<div class="detail-row"><span class="label">Rough Sub Days</span><span class="value">${lead.rough_sub_days}</span></div>` : ''}
      ${lead.trim_cap_days  ? `<div class="detail-row"><span class="label">Trim CAP Days</span><span class="value">${lead.trim_cap_days}</span></div>` : ''}
      ${lead.trim_sub_days  ? `<div class="detail-row"><span class="label">Trim Sub Days</span><span class="value">${lead.trim_sub_days}</span></div>` : ''}
    </div>

    <div class="drawer-section">
      <h3>Commission / Payout</h3>
      <div class="commission-box">
        ${isService ? `
        <div class="comm-row"><span>Spiffs</span><span>${fmt$(spiffs)}</span></div>
        <div class="comm-row total"><span>Total Payout</span><span>${fmt$(totalPayout)}</span></div>
        ` : `
        <div class="comm-row"><span>Sale Amount</span><span>${fmt$(saleAmt)}</span></div>
        <div class="comm-row"><span>− Acc/Mem Revenue</span><span style="color:var(--amber)">−${fmt$(accRev)}</span></div>
        <div class="comm-row"><span>Net Sale</span><span>${fmt$(netSale)}</span></div>
        <div class="comm-row"><span>Base Commission (2%)</span><span>${fmt$(baseComm)}</span></div>
        <div class="comm-row"><span>Spiffs</span><span>${fmt$(spiffs)}</span></div>
        <div class="comm-row total"><span>Total Payout</span><span>${fmt$(totalPayout)}</span></div>
        `}
      </div>
    </div>

    ${items.length ? `
    <div class="drawer-section">
      <h3>Accessories &amp; Memberships</h3>
      <div class="item-list">
        ${items.map(i => `
          <div class="item-row">
            <span class="item-name">${esc(i.item_name)} ×${i.quantity}</span>
            <span class="item-val">${fmt$(i.total_revenue)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${lead.project_type !== 'Service & Add-Ons' ? `
    <div class="drawer-section">
      <h3>Milestones</h3>
      ${milestoneCheck('permit_pulled', 'Permit Pulled', lead.permit_pulled, lead.permit_date, lead.lead_id)}
      ${milestoneCheck('inspection_scheduled', 'Inspection Scheduled', lead.inspection_scheduled, lead.inspection_date, lead.lead_id)}
      ${milestoneCheck('equipment_ordered', 'Equipment Ordered', lead.equipment_ordered, lead.equipment_order_date, lead.lead_id)}
    </div>
    ` : ''}

    ${lead.project_type !== 'Service & Add-Ons' && (parseFloat(lead.billing_rough_amount) || parseFloat(lead.billing_trim_amount) || parseFloat(lead.billing_other_amount)) ? `
    <div class="drawer-section">
      <h3>Progress Billing</h3>
      ${billingRow('Rough-in', lead.billing_rough_amount, lead.billing_rough_date)}
      ${billingRow('Trim', lead.billing_trim_amount, lead.billing_trim_date)}
      ${billingRow('Other', lead.billing_other_amount, lead.billing_other_date)}
    </div>
    ` : ''}
    ` : ''}
  `;

  const isComplete = lead.job_complete_date && lead.job_complete_date !== '';
  document.getElementById('drawer-footer').innerHTML = `
    <button class="btn btn-secondary btn-sm" id="btn-edit-lead">Edit Lead</button>
    ${isSold ? (isComplete
      ? `<span class="badge badge-sold" style="padding:7px 14px;font-size:12px">✓ Completed ${fmtDate(lead.job_complete_date)}</span>
         <button class="btn btn-sm" style="background:#f3f4f6;color:var(--gray);border:1px solid var(--border)" id="btn-undo-complete">Undo</button>`
      : `<button class="btn btn-green btn-sm" id="btn-mark-complete">Mark Complete</button>`
    ) : `<button class="btn btn-primary btn-sm" id="btn-log-followup">Log Follow-Up</button>`}
  `;
  document.getElementById('btn-edit-lead').addEventListener('click', () => openEditLeadModal(lead));
  if (isSold && isComplete) {
    document.getElementById('btn-undo-complete').addEventListener('click', () => undoLeadComplete(lead));
  } else if (isSold) {
    document.getElementById('btn-mark-complete').addEventListener('click', () => markLeadComplete(lead));
  } else {
    document.getElementById('btn-log-followup').addEventListener('click', () => openFollowUpModal(lead));
  }

  // Follow-up history for non-sold leads
  if (!isSold) {
    apiGet('getFollowUpLogs', { leadId: lead.lead_id }).then(logs => {
      logs = logs || [];
      const section = document.createElement('div');
      section.className = 'drawer-section';
      section.innerHTML = `
        <h3>Follow-Up History (${logs.length})</h3>
        ${logs.length ? logs.slice().reverse().map(l => `
          <div class="followup-entry">
            <div class="followup-date">${fmtDate(l.followup_date)}${l.next_followup_date ? ' · Next: ' + fmtDate(l.next_followup_date) : ''}</div>
            ${l.notes ? `<div class="followup-notes">${esc(l.notes)}</div>` : ''}
          </div>`).join('')
        : '<div style="color:var(--gray);font-size:12px;padding:8px 0">No follow-ups logged yet.</div>'}
      `;
      document.getElementById('drawer-body').appendChild(section);
    }).catch(() => {});
  }

  // Last updated
  if (lead.last_updated) {
    const lu = document.createElement('div');
    lu.style = 'font-size:11px;color:var(--gray);text-align:right;padding:4px 0 8px';
    lu.textContent = 'Last updated: ' + fmtDate(lead.last_updated);
    document.getElementById('drawer-body').appendChild(lu);
  }

  document.getElementById('drawer-status-select').addEventListener('change', async function() {
    const newStatus = this.value;
    const isSoldStatus = newStatus === 'Sold' || newStatus === 'Sold (Delayed)';
    const wasAlreadySold = lead.status === 'Sold' || lead.status === 'Sold (Delayed)';
    if (isSoldStatus && !wasAlreadySold) {
      openSoldDetailsModal(lead, newStatus);
    } else {
      try {
        await apiPost('updateLead', { payload: { ...lead, status: newStatus } });
        showToast('Status updated!');
        await loadAll();
        const updated = state.leads.find(l => l.lead_id === lead.lead_id);
        if (updated) openLeadDrawer(updated);
      } catch(e) {
        showToast('Error: ' + e.message, true);
      }
    }
  });

  document.querySelectorAll('.milestone-toggle').forEach(cb => {
    cb.addEventListener('change', async function() {
      const field = this.dataset.field;
      const val = this.checked ? 'TRUE' : 'FALSE';
      try {
        await apiPost('updateLead', { payload: { ...lead, [field]: val } });
        showToast('Milestone updated!');
        await loadAll();
        const updated = state.leads.find(l => l.lead_id === lead.lead_id);
        if (updated) openLeadDrawer(updated);
      } catch(e) {
        showToast('Error: ' + e.message, true);
      }
    });
  });

  openDrawer('lead-drawer');
}

async function markLeadComplete(lead) {
  if (!confirm(`Mark "${lead.job_name}" as complete today?`)) return;
  const today = new Date().toISOString().split('T')[0];
  try {
    await apiPost('updateLead', { payload: { ...lead, job_complete_date: today } });
    showToast('Job marked complete!');
    await loadAll();
    const updated = state.leads.find(l => l.lead_id === lead.lead_id);
    if (updated) openLeadDrawer(updated);
  } catch(e) {
    showToast('Error: ' + e.message, true);
  }
}

async function undoLeadComplete(lead) {
  if (!confirm(`Remove the completion date from "${lead.job_name}"?`)) return;
  try {
    await apiPost('updateLead', { payload: { ...lead, job_complete_date: '' } });
    showToast('Completion undone.');
    await loadAll();
    const updated = state.leads.find(l => l.lead_id === lead.lead_id);
    if (updated) openLeadDrawer(updated);
  } catch(e) {
    showToast('Error: ' + e.message, true);
  }
}

function setupSoldDetailsModal() {
  document.getElementById('sold-details-close').addEventListener('click', closeSoldDetailsModal);
  document.getElementById('sold-progress-billing').addEventListener('change', e => {
    document.getElementById('sold-billing-fields').classList.toggle('hidden', !e.target.checked);
  });
  document.getElementById('sold-details-skip').addEventListener('click', async () => {
    const form = document.getElementById('sold-details-form');
    const leadId = form.elements.lead_id.value;
    const newStatus = form.elements.new_status.value;
    const lead = state.leads.find(l => l.lead_id === leadId);
    if (!lead) return;
    closeSoldDetailsModal();
    try {
      await apiPost('updateLead', { payload: { ...lead, status: newStatus } });
      showToast('Marked as Sold!');
      await loadAll();
      const updated = state.leads.find(l => l.lead_id === leadId);
      if (updated) openLeadDrawer(updated);
    } catch(e) { showToast('Error: ' + e.message, true); }
  });
  document.getElementById('sold-details-save').addEventListener('click', saveSoldDetailsForm);
  document.getElementById('btn-add-sold-item').addEventListener('click', addSoldItemRow);
}

function openSoldDetailsModal(lead, newStatus) {
  const form = document.getElementById('sold-details-form');
  form.reset();
  form.elements.lead_id.value = lead.lead_id;
  form.elements.new_status.value = newStatus;
  document.getElementById('sold-details-project-type').value = lead.project_type || '';
  document.getElementById('sold-item-rows').innerHTML = '';

  const isService = lead.project_type === 'Service & Add-Ons';
  document.getElementById('sold-progress-toggle-row').classList.toggle('hidden', isService);
  document.getElementById('sold-billing-fields').classList.add('hidden');
  document.getElementById('sold-progress-billing').checked = false;

  openModal('sold-details-overlay');
}

async function saveSoldDetailsForm() {
  const form = document.getElementById('sold-details-form');
  const btn = document.getElementById('sold-details-save');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    const fd = Object.fromEntries(new FormData(form));
    const lead = state.leads.find(l => l.lead_id === fd.lead_id);
    if (!lead) return;
    const progressChecked = document.getElementById('sold-progress-billing').checked;
    const payload = { ...lead, status: fd.new_status, billing_name: fd.billing_name,
      est_start_month: fd.est_start_month, total_days_budgeted: fd.total_days_budgeted,
      subs_needed: fd.subs_needed,
      billing_rough_amount: progressChecked ? (fd.billing_rough_amount || '') : '',
      billing_rough_date:   progressChecked ? (fd.billing_rough_date   || '') : '',
      billing_trim_amount:  progressChecked ? (fd.billing_trim_amount  || '') : '',
      billing_trim_date:    progressChecked ? (fd.billing_trim_date    || '') : '',
      billing_other_amount: progressChecked ? (fd.billing_other_amount || '') : '',
      billing_other_date:   progressChecked ? (fd.billing_other_date   || '') : '',
    };
    await apiPost('updateLead', { payload });
    const items = collectSoldItems();
    if (items.length) await apiPost('saveLeadItems', { leadId: fd.lead_id, items });
    closeSoldDetailsModal();
    showToast('Marked as Sold!');
    await loadAll();
    const updated = state.leads.find(l => l.lead_id === fd.lead_id);
    if (updated) openLeadDrawer(updated);
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.textContent = 'Save & Mark Sold'; btn.disabled = false;
  }
}

function addSoldItemRow(prefill = {}) {
  const container = document.getElementById('sold-item-rows');
  const row = document.createElement('div');
  row.className = 'item-selector-row';
  const options = state.spiffRates.map(r =>
    `<option value="${esc(r.item_name)}" data-price="${r.sale_price}" data-spiff="${r.spiff_amount}"
      ${prefill.item_name === r.item_name ? 'selected' : ''}>${esc(r.item_name)}</option>`
  ).join('');
  row.innerHTML = `
    <select data-field="item_name"><option value="">Select item…</option>${options}</select>
    <input type="number" data-field="quantity" value="${prefill.quantity||1}" min="1" style="width:60px">
    <span data-field="price" style="text-align:right;padding:0 4px">—</span>
    <span data-field="spiff" style="text-align:right;padding:0 4px">—</span>
    <button type="button" class="btn-remove" title="Remove">✕</button>
  `;
  row.querySelector('[data-field=item_name]').addEventListener('change', () => updateItemRow(row));
  row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function collectSoldItems() {
  return Array.from(document.querySelectorAll('#sold-item-rows .item-selector-row')).map(row => ({
    item_name: row.querySelector('[data-field=item_name]').value,
    quantity:  row.querySelector('[data-field=quantity]').value,
  })).filter(i => i.item_name);
}

function closeSoldDetailsModal() {
  document.getElementById('sold-details-overlay').classList.remove('open');
}

function setupFollowUpModal() {
  document.getElementById('followup-modal-close').addEventListener('click', closeFollowUpModal);
  document.getElementById('followup-modal-cancel').addEventListener('click', closeFollowUpModal);
  document.getElementById('followup-modal-save').addEventListener('click', saveFollowUpForm);
}

function openFollowUpModal(lead) {
  const form = document.getElementById('followup-form');
  form.reset();
  form.elements.lead_id.value = lead.lead_id;
  const todayDate = new Date();
  form.elements.followup_date.value = todayDate.toISOString().split('T')[0];
  const nextDate = new Date(todayDate); nextDate.setDate(nextDate.getDate() + 7);
  form.elements.next_followup_date.value = nextDate.toISOString().split('T')[0];
  state.selectedLead = lead;
  openModal('followup-modal-overlay');
}

async function saveFollowUpForm() {
  const form = document.getElementById('followup-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('followup-modal-save');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    await apiPost('logFollowUp', { payload });
    closeFollowUpModal();
    showToast('Follow-up logged!');
    const updated = state.leads.find(l => l.lead_id === payload.lead_id);
    if (updated) openLeadDrawer(updated);
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.textContent = 'Log Follow-Up'; btn.disabled = false;
  }
}

function closeFollowUpModal() {
  document.getElementById('followup-modal-overlay').classList.remove('open');
}

function milestoneCheck(field, label, val, date, leadId) {
  const done = val === true || val === 'TRUE' || val === 'true';
  return `<div class="milestone-row">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" class="milestone-toggle" data-field="${field}" data-lead="${leadId}" ${done ? 'checked' : ''}
        style="width:16px;height:16px;cursor:pointer;accent-color:var(--green)">
      <span class="${done ? 'check' : ''}">${label}${done && date ? ' · ' + fmtDate(date) : ''}</span>
    </label>
  </div>`;
}

function billingRow(label, amt, date) {
  if (!amt) return '';
  return `<div class="detail-row">
    <span class="label">${label}</span>
    <span class="value">${fmt$(amt)}${date ? ' · ' + fmtDate(date) : ''}</span>
  </div>`;
}

// ─── LEAD MODAL ───────────────────────────────────────────────────────────────
function setupLeadModal() {
  document.getElementById('btn-new-lead').addEventListener('click', () => openNewLeadModal());
  document.getElementById('lead-modal-close').addEventListener('click', closeLeadModal);
  document.getElementById('lead-modal-cancel').addEventListener('click', closeLeadModal);
  document.getElementById('lead-modal-save').addEventListener('click', saveLeadForm);

  document.getElementById('form-status').addEventListener('change', e => {
    const sold = e.target.value === 'Sold' || e.target.value === 'Sold (Delayed)';
    document.getElementById('sold-fields').classList.toggle('hidden', !sold);
    updateCommissionPreview();
  });

  document.getElementById('lead-form').querySelector('[name=project_type]').addEventListener('change', e => {
    const phase = e.target.value === 'Remodel' || e.target.value === 'New Construction';
    document.getElementById('phase-fields').classList.toggle('hidden', !phase);
    const isService = e.target.value === 'Service & Add-Ons';
    document.getElementById('lead-milestones-section').classList.toggle('hidden', isService);
    document.getElementById('lead-progress-billing-toggle-row').classList.toggle('hidden', isService);
    if (isService) {
      document.getElementById('form-progress-billing').checked = false;
      document.getElementById('lead-billing-fields').classList.add('hidden');
    }
  });

  document.getElementById('form-progress-billing').addEventListener('change', e => {
    document.getElementById('lead-billing-fields').classList.toggle('hidden', !e.target.checked);
  });

  document.getElementById('lead-form').querySelector('[name=sale_amount]').addEventListener('input', updateCommissionPreview);

  document.getElementById('btn-add-item').addEventListener('click', addItemRow);
}

function openNewLeadModal() {
  state.editingLeadId = null;
  document.getElementById('lead-modal-title').textContent = 'New Lead';
  document.getElementById('lead-form').reset();
  document.getElementById('sold-fields').classList.add('hidden');
  document.getElementById('phase-fields').classList.add('hidden');
  document.getElementById('item-rows').innerHTML = '';
  populateBuilderDropdown(null);
  updateCommissionPreview();
  openModal('lead-modal-overlay');
}

async function openEditLeadModal(lead) {
  state.editingLeadId = lead.lead_id;
  document.getElementById('lead-modal-title').textContent = 'Edit Lead';

  // Populate form
  const form = document.getElementById('lead-form');
  form.reset();
  Object.entries(lead).forEach(([k, v]) => {
    const el = form.elements[k];
    if (!el) return;
    if (el.type === 'checkbox') el.checked = v === true || v === 'TRUE';
    else el.value = v || '';
  });

  const isSold = lead.status === 'Sold' || lead.status === 'Sold (Delayed)';
  document.getElementById('sold-fields').classList.toggle('hidden', !isSold);
  const phase = lead.project_type === 'Remodel' || lead.project_type === 'New Construction';
  document.getElementById('phase-fields').classList.toggle('hidden', !phase);

  const isService = lead.project_type === 'Service & Add-Ons';
  document.getElementById('lead-milestones-section').classList.toggle('hidden', isService);
  document.getElementById('lead-progress-billing-toggle-row').classList.toggle('hidden', isService);
  const hasBilling = !!(parseFloat(lead.billing_rough_amount) || parseFloat(lead.billing_trim_amount) || parseFloat(lead.billing_other_amount));
  document.getElementById('form-progress-billing').checked = !isService && hasBilling;
  document.getElementById('lead-billing-fields').classList.toggle('hidden', isService || !hasBilling);

  // Load existing items
  document.getElementById('item-rows').innerHTML = '';
  if (isSold) {
    try {
      const items = await apiGet('getLeadItems', { leadId: lead.lead_id }) || [];
      items.forEach(i => addItemRow(i));
    } catch(e) {}
  }

  populateBuilderDropdown(lead.builder_id || '');
  updateCommissionPreview();
  openModal('lead-modal-overlay');
}

async function saveLeadForm() {
  const form = document.getElementById('lead-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  // Validate days: if phase fields are visible, total must equal sum of phases
  const totalDays = parseFloat(form.elements.total_days_budgeted?.value) || 0;
  const roughCap  = parseFloat(form.elements.rough_cap_days?.value) || 0;
  const roughSub  = parseFloat(form.elements.rough_sub_days?.value) || 0;
  const trimCap   = parseFloat(form.elements.trim_cap_days?.value)  || 0;
  const trimSub   = parseFloat(form.elements.trim_sub_days?.value)  || 0;
  const phaseSum  = roughCap + roughSub + trimCap + trimSub;
  const phaseVisible = !document.getElementById('phase-fields').classList.contains('hidden');
  if (phaseVisible && totalDays > 0 && phaseSum > 0 && phaseSum !== totalDays) {
    showToast(`Phase days (${phaseSum}) must equal Total Days Budgeted (${totalDays})`, true);
    return;
  }

  const btn = document.getElementById('lead-modal-save');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const payload = collectFormData(form);
    const items = collectItems();

    let result;
    if (state.editingLeadId) {
      payload.lead_id = state.editingLeadId;
      result = await apiPost('updateLead', { payload });
    } else {
      result = await apiPost('createLead', { payload });
    }

    if (result && (payload.status === 'Sold' || payload.status === 'Sold (Delayed)')) {
      const leadId = state.editingLeadId || result.lead_id;
      await apiPost('saveLeadItems', { leadId, items });
    }

    closeLeadModal();
    showToast(state.editingLeadId ? 'Lead updated!' : 'Lead created!');
    await loadAll();
  } catch (e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.textContent = 'Save Lead';
    btn.disabled = false;
  }
}

function populateBuilderDropdown(selectedId) {
  const sel = document.getElementById('form-builder-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">None / Direct</option>' +
    state.builders.map(b =>
      `<option value="${esc(b.builder_id)}" ${b.builder_id === selectedId ? 'selected' : ''}>${esc(b.company_name)}</option>`
    ).join('');
}

function collectFormData(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  // Checkboxes
  ['permit_pulled','inspection_scheduled','equipment_ordered'].forEach(name => {
    data[name] = form.elements[name]?.checked ? 'TRUE' : 'FALSE';
  });
  // Builder dropdown (not captured by FormData since it may be a plain select outside a named input)
  const builderSel = document.getElementById('form-builder-select');
  if (builderSel) data.builder_id = builderSel.value;
  return data;
}

function collectItems() {
  return Array.from(document.querySelectorAll('#item-rows .item-selector-row')).map(row => ({
    item_name: row.querySelector('[data-field=item_name]').value,
    quantity:  row.querySelector('[data-field=quantity]').value,
  })).filter(i => i.item_name);
}

function closeLeadModal() {
  document.getElementById('lead-modal-overlay').classList.remove('open');
}

// ─── ITEM SELECTOR ────────────────────────────────────────────────────────────
function addItemRow(prefill = {}) {
  const container = document.getElementById('item-rows');
  const row = document.createElement('div');
  row.className = 'item-selector-row';

  const options = state.spiffRates.map(r =>
    `<option value="${esc(r.item_name)}" data-price="${r.sale_price}" data-spiff="${r.spiff_amount}"
      ${prefill.item_name === r.item_name ? 'selected' : ''}>${esc(r.item_name)}</option>`
  ).join('');

  row.innerHTML = `
    <select data-field="item_name"><option value="">Select item…</option>${options}</select>
    <input type="number" data-field="quantity" value="${prefill.quantity||1}" min="1" style="width:60px">
    <span data-field="price" style="text-align:right;padding:0 4px">—</span>
    <span data-field="spiff" style="text-align:right;padding:0 4px">—</span>
    <button type="button" class="btn-remove" title="Remove">✕</button>
  `;

  row.querySelector('[data-field=item_name]').addEventListener('change', () => { updateItemRow(row); updateCommissionPreview(); });
  row.querySelector('[data-field=quantity]').addEventListener('input', updateCommissionPreview);
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); updateCommissionPreview(); });

  container.appendChild(row);
  if (prefill.item_name) updateItemRow(row);
  updateCommissionPreview();
}

function updateItemRow(row) {
  const sel = row.querySelector('[data-field=item_name]');
  const opt = sel.options[sel.selectedIndex];
  row.querySelector('[data-field=price]').textContent = fmt$(opt.dataset.price || 0);
  row.querySelector('[data-field=spiff]').textContent = fmt$(opt.dataset.spiff || 0);
}

function updateCommissionPreview() {
  const saleAmt = parseFloat(document.querySelector('[name=sale_amount]')?.value) || 0;
  let accRev = 0, totalSpiff = 0;

  document.querySelectorAll('#item-rows .item-selector-row').forEach(row => {
    const sel = row.querySelector('[data-field=item_name]');
    const qty = parseFloat(row.querySelector('[data-field=quantity]')?.value) || 0;
    const opt = sel.options[sel.selectedIndex];
    accRev     += (parseFloat(opt?.dataset?.price) || 0) * qty;
    totalSpiff += (parseFloat(opt?.dataset?.spiff) || 0) * qty;
  });

  const baseComm = (saleAmt - accRev) * 0.02;
  document.getElementById('tot-acc').textContent   = fmt$(accRev);
  document.getElementById('tot-spiff').textContent = fmt$(totalSpiff);
  document.getElementById('tot-sale').textContent  = fmt$(saleAmt);
  document.getElementById('tot-comm').textContent  = fmt$(baseComm);
}

// ─── COMMISSION TAB ───────────────────────────────────────────────────────────
function renderCommissionTab() {
  buildPeriodFilter();
  applyCommissionFilters();

  document.getElementById('comm-period-filter').addEventListener('change', e => {
    state.commFilters.period = e.target.value;
    applyCommissionFilters();
  });
  document.getElementById('comm-status-filter').addEventListener('change', e => {
    state.commFilters.status = e.target.value;
    applyCommissionFilters();
  });
  document.getElementById('btn-export-payroll').addEventListener('click', exportPayroll);
}

function buildPeriodFilter() {
  const sel = document.getElementById('comm-period-filter');
  const periods = [...new Set(state.commission.map(c => c.pay_period).filter(Boolean))].sort().reverse();
  sel.innerHTML = '<option value="all">All Pay Periods</option>' +
    periods.map(p => `<option value="${p}">${p}</option>`).join('');
}

function filteredCommission() {
  return state.commission.filter(c => {
    if (state.commFilters.period !== 'all' && c.pay_period !== state.commFilters.period) return false;
    if (state.commFilters.status !== 'all' && c.payment_status !== state.commFilters.status) return false;
    return true;
  });
}

// Returns flat list of display rows — one per commission record, with progress-billing
// records expanded to show a parent summary + one sub-row per billing stage.
function expandCommissionRows(commRows) {
  const out = [];
  commRows.forEach(c => {
    const lead = state.leads.find(l => l.lead_id === c.lead_id) || {};
    const isProgress = !!(lead.billing_rough_amount || lead.billing_trim_amount || lead.billing_other_amount);

    if (!isProgress) {
      out.push({ type: 'flat', c, lead });
      return;
    }

    // Parent summary row
    out.push({ type: 'parent', c, lead });

    // Build stages
    const totalSale = parseFloat(c.sale_amount) || 1;
    const baseComm  = parseFloat(c.base_commission) || 0;
    const spiffs    = parseFloat(c.total_spiffs) || 0;
    const stages = [
      { key: 'rough', label: 'Rough-in', amt: parseFloat(lead.billing_rough_amount)||0, date: lead.billing_rough_date, paidField: 'rough_paid_date', paidDate: c.rough_paid_date, withSpiff: true },
      { key: 'trim',  label: 'Trim',     amt: parseFloat(lead.billing_trim_amount)||0,  date: lead.billing_trim_date,  paidField: 'trim_paid_date',  paidDate: c.trim_paid_date  },
      { key: 'other', label: 'Other',    amt: parseFloat(lead.billing_other_amount)||0, date: lead.billing_other_date, paidField: 'other_paid_date', paidDate: c.other_paid_date },
    ].filter(s => s.amt > 0);

    stages.forEach((s, i) => {
      const stageComm  = (s.amt / totalSale) * baseComm;
      const stageSpiff = s.withSpiff ? spiffs : 0;
      const stagePayout = stageComm + stageSpiff;
      const notInvoiced = !s.date;
      out.push({ type: 'stage', c, lead, stage: s, stageComm, stageSpiff, stagePayout, notInvoiced });
    });
  });
  return out;
}

function applyCommissionFilters() {
  const rows = filteredCommission();
  const expanded = expandCommissionRows(rows);

  // Summary cards — use parent commission records only (avoid double-counting)
  const totalPayout = rows.reduce((s, c) => s + (parseFloat(c.total_payout)||0), 0);
  const baseComm    = rows.reduce((s, c) => s + (parseFloat(c.base_commission)||0), 0);
  const spiffs      = rows.reduce((s, c) => s + (parseFloat(c.total_spiffs)||0), 0);

  document.getElementById('comm-summary').innerHTML = `
    <div class="summary-card"><div class="sc-label">Jobs This Period</div><div class="sc-value">${rows.length}</div></div>
    <div class="summary-card"><div class="sc-label">Total Base Commission</div><div class="sc-value" style="color:var(--blue)">${fmt$(baseComm)}</div></div>
    <div class="summary-card"><div class="sc-label">Total Spiffs</div><div class="sc-value" style="color:var(--green)">${fmt$(spiffs)}</div></div>
    <div class="summary-card"><div class="sc-label">Total Payout to Derrick</div><div class="sc-value" style="color:var(--green)">${fmt$(totalPayout)}</div></div>
  `;

  const tbody = document.getElementById('commission-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">No commission records match the current filters.</td></tr>';
    document.getElementById('commission-tfoot').innerHTML = '';
    return;
  }

  tbody.innerHTML = expanded.map(row => {
    const { type, c } = row;

    if (type === 'flat') {
      return `<tr>
        <td><strong>${esc(c.job_name)}</strong></td>
        <td>${fmt$(c.sale_amount)}</td>
        <td style="color:var(--amber)">${fmt$(c.total_acc_mem_revenue)}</td>
        <td>${fmt$(c.net_sale)}</td>
        <td>${fmt$(c.base_commission)}</td>
        <td>${fmt$(c.total_spiffs)}</td>
        <td style="font-weight:600;color:var(--green)">${fmt$(c.total_payout)}</td>
        <td>
          <input type="date" value="${fmtDateInput(c.job_complete_date)}"
            style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px"
            onchange="updateCommissionField('${c.lead_id}','job_complete_date',this.value)">
        </td>
        <td>
          <input type="date" value="${fmtDateInput(c.paid_date)}"
            style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px"
            onchange="updateCommissionField('${c.lead_id}','paid_date',this.value)">
        </td>
        <td>${c.payment_status === 'Paid'
          ? '<span class="badge badge-paid">Paid</span>'
          : '<span class="badge badge-pending">Pending</span>'}</td>
      </tr>`;
    }

    if (type === 'parent') {
      return `<tr style="background:var(--surface)">
        <td><strong>${esc(c.job_name)}</strong> <span style="font-size:11px;color:var(--gray)">▾ Progress Billing</span></td>
        <td>${fmt$(c.sale_amount)}</td>
        <td style="color:var(--amber)">${fmt$(c.total_acc_mem_revenue)}</td>
        <td>${fmt$(c.net_sale)}</td>
        <td>${fmt$(c.base_commission)}</td>
        <td>${fmt$(c.total_spiffs)}</td>
        <td style="font-weight:600;color:var(--green)">${fmt$(c.total_payout)}</td>
        <td>
          <input type="date" value="${fmtDateInput(c.job_complete_date)}"
            style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px"
            onchange="updateCommissionField('${c.lead_id}','job_complete_date',this.value)">
        </td>
        <td colspan="2" style="color:var(--gray);font-size:11px">Set per stage below</td>
      </tr>`;
    }

    // stage row
    const { stage, stageComm, stageSpiff, stagePayout, notInvoiced } = row;
    const statusBadgeHtml = stage.paidDate
      ? '<span class="badge badge-paid">Paid</span>'
      : (notInvoiced
          ? '<span class="badge badge-not-invoiced">⚠ Not Invoiced</span>'
          : '<span class="badge badge-pending">Pending</span>');
    return `<tr class="comm-stage-row">
      <td><span class="comm-stage-label">${esc(stage.label)}</span>${stage.withSpiff ? ' <span style="font-size:10px;color:var(--green)">+spiff</span>' : ''}</td>
      <td>${fmt$(stage.amt)}</td>
      <td></td>
      <td></td>
      <td>${fmt$(stageComm)}</td>
      <td>${stage.withSpiff ? fmt$(stageSpiff) : '—'}</td>
      <td style="font-weight:600;color:var(--green)">${fmt$(stagePayout)}</td>
      <td style="color:var(--gray);font-size:11px">${stage.date ? fmtDate(stage.date) : '—'}</td>
      <td>
        <input type="date" value="${fmtDateInput(stage.paidDate)}"
          style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px"
          onchange="updateCommissionField('${c.lead_id}','${stage.paidField}',this.value)">
      </td>
      <td>${statusBadgeHtml}</td>
    </tr>`;
  }).join('');

  const totPayout = rows.reduce((s,c) => s+(parseFloat(c.total_payout)||0),0);
  document.getElementById('commission-tfoot').innerHTML = `
    <tr>
      <td>TOTAL</td><td></td><td></td><td></td><td></td><td></td>
      <td>${fmt$(totPayout)}</td><td></td><td></td><td></td>
    </tr>
  `;
}

async function updateCommissionField(leadId, field, value) {
  try {
    await apiPost('updateCommission', { payload: { lead_id: leadId, [field]: value } });
    const row = state.commission.find(c => c.lead_id === leadId);
    if (row) row[field] = value;
    // Stage paid dates also update payment_status heuristic locally
    if (field === 'paid_date' || field === 'rough_paid_date' || field === 'trim_paid_date' || field === 'other_paid_date') {
      if (row && value) row.payment_status = 'Paid';
    }
    showToast('Saved');
    applyCommissionFilters();
  } catch(e) {
    showToast('Error saving: ' + e.message, true);
  }
}

function exportPayroll() {
  const allRows = filteredCommission();
  const period = state.commFilters.period !== 'all' ? state.commFilters.period : 'All Periods';
  const expanded = expandCommissionRows(allRows);

  // For flat jobs: include when job_complete_date is set
  // For progress billing stages: include when the stage has a billing date (invoiced)
  const exportRows = expanded.filter(row => {
    if (row.type === 'flat')   return row.c.job_complete_date && row.c.job_complete_date !== '';
    if (row.type === 'parent') return false; // parent header rows are rebuilt below per included stages
    if (row.type === 'stage')  return !!row.stage.date; // include stage if billing date exists
    return false;
  });

  if (!exportRows.length) { showToast('No invoiced or completed jobs to export for this period', true); return; }

  // Group stage rows under their parent job for display
  const seenParents = new Set();
  const bodyRows = exportRows.map(row => {
    if (row.type === 'flat') {
      const c = row.c;
      return `<tr>
        <td>${esc(c.job_name)}</td><td>${fmt$(c.sale_amount)}</td><td>${fmt$(c.net_sale)}</td>
        <td>${fmt$(c.base_commission)}</td><td>${fmt$(c.total_spiffs)}</td>
        <td style="font-weight:600">${fmt$(c.total_payout)}</td>
        <td>${fmtDate(c.job_complete_date)}</td><td>${fmtDate(c.paid_date)}</td>
      </tr>`;
    }
    // stage row — prepend parent header row first time we see this job
    const { c, stage, stageComm, stageSpiff, stagePayout } = row;
    let html = '';
    if (!seenParents.has(c.lead_id)) {
      seenParents.add(c.lead_id);
      html += `<tr style="background:#f8fafc">
        <td colspan="5"><strong>${esc(c.job_name)}</strong> <span style="font-size:11px;color:#6b7280">Progress Billing · Sale ${fmt$(c.sale_amount)} · ${fmtDate(c.job_complete_date)||'In Progress'}</span></td>
        <td colspan="3" style="color:#6b7280;font-size:11px">Paid by stage below</td>
      </tr>`;
    }
    html += `<tr style="background:#f1f5f9;font-size:12px">
      <td style="padding-left:28px">↳ ${esc(stage.label)}${stage.withSpiff ? ' +spiff' : ''}</td>
      <td>${fmt$(stage.amt)}</td><td></td>
      <td>${fmt$(stageComm)}</td>
      <td>${stage.withSpiff ? fmt$(stageSpiff) : '—'}</td>
      <td style="font-weight:600">${fmt$(stagePayout)}</td>
      <td>${fmtDate(stage.date)}</td>
      <td>${fmtDate(stage.paidDate)}</td>
    </tr>`;
    return html;
  }).join('');

  const totalPayout = exportRows
    .filter(r => r.type === 'flat').reduce((s,r) => s+(parseFloat(r.c.total_payout)||0),0)
    + exportRows.filter(r => r.type === 'stage').reduce((s,r) => s+r.stagePayout,0);

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>CAP Payroll – ${period}</title>
  <style>body{font-family:sans-serif;padding:32px;max-width:800px;margin:auto}
  h1{color:#185FA5;margin-bottom:4px}h2{color:#6b7280;font-size:14px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th{background:#185FA5;color:white;padding:8px 12px;text-align:left;font-size:12px}
  td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
  tfoot td{font-weight:700;color:#0F6E56;border-top:2px solid #0F6E56}
  @media print{button{display:none}}</style></head><body>
  <h1>CAP – Commission Payroll</h1>
  <h2>Period: ${period} · Generated: ${new Date().toLocaleDateString()}</h2>
  <button onclick="window.print()" style="background:#185FA5;color:white;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;margin-bottom:16px">🖨 Print / Save PDF</button>
  <table><thead><tr><th>Project</th><th>Stage Amt</th><th>Net Sale</th><th>Base (2%)</th><th>Spiffs</th><th>Total Payout</th><th>Invoiced/Complete</th><th>Paid On</th></tr></thead>
  <tbody>${bodyRows}</tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td></td><td></td><td></td><td>${fmt$(totalPayout)}</td><td></td><td></td></tr></tfoot>
  </table></body></html>`);
  win.document.close();
}

// ─── BUILDERS TAB ─────────────────────────────────────────────────────────────
function renderBuildersTab() {
  renderBuildersTable();

  document.getElementById('builder-status-filter').addEventListener('change', e => {
    state.builderFilter = e.target.value;
    renderBuildersTable();
  });
  document.getElementById('btn-new-builder').addEventListener('click', () => openBuilderModal());
}

function renderBuildersTable() {
  const today = new Date().toISOString().split('T')[0];
  const tbody = document.getElementById('builders-tbody');
  const builders = state.builderFilter === 'all'
    ? state.builders
    : state.builders.filter(b => b.status === state.builderFilter);

  if (!builders.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No builder contacts yet. Click "+ Add Builder" to get started.</td></tr>';
    return;
  }

  tbody.innerHTML = builders.map(b => {
    const overdue = b.next_contact_date && b.next_contact_date < today;
    const openLeads = state.leads.filter(l =>
      l.status !== 'Lost' && l.status !== 'Sold' && l.status !== 'Sold (Delayed)' &&
      l.builder_id === b.builder_id
    ).length;
    return `<tr class="${overdue ? 'overdue-row' : ''}" data-id="${b.builder_id}">
      <td><strong>${esc(b.company_name)}</strong></td>
      <td>${esc(b.contact_name||'—')}</td>
      <td>${builderStatusBadge(b.status)}</td>
      <td>${fmtDate(b.last_contact_date)||'—'}</td>
      <td>${overdue
        ? `<span class="badge badge-overdue">⚠ Overdue</span> ${fmtDate(b.next_contact_date)}`
        : (fmtDate(b.next_contact_date)||'—')}</td>
      <td>${openLeads || 0}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-log-contact" data-id="${b.builder_id}">Log Contact</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.classList.contains('btn-log-contact')) return;
      const builder = state.builders.find(b => b.builder_id === tr.dataset.id);
      if (builder) openBuilderDrawer(builder);
    });
  });

  tbody.querySelectorAll('.btn-log-contact').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const builder = state.builders.find(b => b.builder_id === btn.dataset.id);
      if (builder) openLogModal(builder);
    });
  });
}

async function openBuilderDrawer(builder) {
  state.selectedBuilder = builder;
  document.getElementById('bdr-title').textContent = builder.company_name;

  let logs = [];
  try { logs = await apiGet('getBuilderLogs', { builderId: builder.builder_id }) || []; }
  catch(e) {}

  const body = document.getElementById('bdr-body');
  body.innerHTML = `
    <div class="drawer-section">
      <h3>Contact Info</h3>
      <div class="detail-row"><span class="label">Company</span><span class="value">${esc(builder.company_name)}</span></div>
      <div class="detail-row"><span class="label">Contact</span><span class="value">${esc(builder.contact_name||'—')}</span></div>
      <div class="detail-row"><span class="label">Phone</span><span class="value">${esc(builder.phone||'—')}</span></div>
      <div class="detail-row"><span class="label">Email</span><span class="value">${esc(builder.email||'—')}</span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value">${builderStatusBadge(builder.status)}</span></div>
      ${builder.notes ? `<div class="detail-row"><span class="label">Notes</span><span class="value">${esc(builder.notes)}</span></div>` : ''}
    </div>
    <div class="drawer-section">
      <h3>Contact History (${logs.length})</h3>
      ${logs.length ? logs.slice().reverse().map(log => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <strong>${fmtDate(log.contact_date)||''}</strong>
            <span class="badge badge-bid" style="font-size:10px">${esc(log.contact_method||'')}</span>
          </div>
          ${log.notes ? `<div style="color:var(--text-sm)">${esc(log.notes)}</div>` : ''}
          ${log.next_planned_contact ? `<div style="color:var(--gray);margin-top:2px">Next: ${fmtDate(log.next_planned_contact)}</div>` : ''}
        </div>`).join('') : '<div class="empty" style="padding:16px 0">No contact history yet.</div>'}
    </div>
  `;

  document.getElementById('bdr-footer').innerHTML = `
    <button class="btn btn-secondary btn-sm" id="btn-edit-builder">Edit</button>
    <button class="btn btn-primary btn-sm" id="btn-log-from-drawer">Log Contact</button>
  `;
  document.getElementById('btn-edit-builder').addEventListener('click', () => openBuilderModal(builder));
  document.getElementById('btn-log-from-drawer').addEventListener('click', () => openLogModal(builder));

  openDrawer('builder-drawer');
}

// ─── BUILDER MODAL ────────────────────────────────────────────────────────────
function setupBuilderModal() {
  document.getElementById('builder-modal-close').addEventListener('click', closeBuilderModal);
  document.getElementById('builder-modal-cancel').addEventListener('click', closeBuilderModal);
  document.getElementById('builder-modal-save').addEventListener('click', saveBuilderForm);
}

function openBuilderModal(builder = null) {
  state.editingBuilderId = builder ? builder.builder_id : null;
  document.getElementById('builder-modal-title').textContent = builder ? 'Edit Builder' : 'Add Builder';
  const form = document.getElementById('builder-form');
  form.reset();
  if (builder) Object.entries(builder).forEach(([k,v]) => { if (form.elements[k]) form.elements[k].value = v||''; });
  openModal('builder-modal-overlay');
}

async function saveBuilderForm() {
  const form = document.getElementById('builder-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('builder-modal-save');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    if (state.editingBuilderId) {
      payload.builder_id = state.editingBuilderId;
      await apiPost('updateBuilder', { payload });
    } else {
      await apiPost('createBuilder', { payload });
    }
    closeBuilderModal();
    showToast('Builder saved!');
    const builders = await apiGet('getBuilders');
    state.builders = builders || [];
    renderBuildersTable();
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.textContent = 'Save Builder'; btn.disabled = false;
  }
}

function closeBuilderModal() {
  document.getElementById('builder-modal-overlay').classList.remove('open');
}

// ─── LOG CONTACT MODAL ────────────────────────────────────────────────────────
function setupLogModal() {
  document.getElementById('log-modal-close').addEventListener('click', closeLogModal);
  document.getElementById('log-modal-cancel').addEventListener('click', closeLogModal);
  document.getElementById('log-modal-save').addEventListener('click', saveLogForm);
}

function openLogModal(builder) {
  const form = document.getElementById('log-form');
  form.reset();
  form.elements.builder_id.value = builder.builder_id;
  form.elements.contact_date.value = new Date().toISOString().split('T')[0];
  openModal('log-modal-overlay');
}

async function saveLogForm() {
  const form = document.getElementById('log-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('log-modal-save');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    await apiPost('logContact', { payload });
    closeLogModal();
    showToast('Contact logged!');
    const builders = await apiGet('getBuilders');
    state.builders = builders || [];
    renderBuildersTable();
    if (state.selectedBuilder && state.selectedBuilder.builder_id === payload.builder_id) {
      const updated = state.builders.find(b => b.builder_id === payload.builder_id);
      if (updated) openBuilderDrawer(updated);
    }
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.textContent = 'Log Contact'; btn.disabled = false;
  }
}

function closeLogModal() {
  document.getElementById('log-modal-overlay').classList.remove('open');
}

// ─── DRAWERS ──────────────────────────────────────────────────────────────────
function setupDrawerClose() {
  document.getElementById('drawer-close').addEventListener('click', () => closeDrawer('lead-drawer'));
  document.getElementById('bdr-close').addEventListener('click', () => closeDrawer('builder-drawer'));
}

function openDrawer(id) {
  closeAllDrawers();
  document.getElementById(id).classList.add('open');
  document.getElementById('main').classList.add('drawer-open');
}

function closeDrawer(id) {
  document.getElementById(id).classList.remove('open');
  document.getElementById('main').classList.remove('drawer-open');
}

function closeAllDrawers() {
  document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
  document.getElementById('main').classList.remove('drawer-open');
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(overlayId) {
  document.getElementById(overlayId).classList.add('open');
}

// Close on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function fmt$(n) {
  const num = parseFloat(n);
  if (!num && num !== 0) return '—';
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateInput(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt)) return '';
  return dt.toISOString().split('T')[0];
}

function fmtMonth(m) {
  if (!m) return '';
  const [y, mo] = String(m).split('-');
  if (!mo) return m;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(mo)-1]} ${y}`;
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusSelectClass(status) {
  const map = {
    'Bid Submitted': 's-bid', 'Waiting Approval': 's-approval',
    'Waiting Load Calc': 's-loadcalc', 'Sold': 's-sold',
    'Sold (Delayed)': 's-delayed', 'Lost': 's-lost',
  };
  return map[status] || 's-bid';
}

async function quickStatusChange(sel) {
  const newStatus = sel.value;
  const lead = state.leads.find(l => l.lead_id === sel.dataset.id);
  if (!lead) return;
  const isSoldStatus = newStatus === 'Sold' || newStatus === 'Sold (Delayed)';
  const wasAlreadySold = lead.status === 'Sold' || lead.status === 'Sold (Delayed)';
  // Update select color immediately
  sel.className = 'status-select ' + statusSelectClass(newStatus);
  if (isSoldStatus && !wasAlreadySold) {
    openSoldDetailsModal(lead, newStatus);
  } else {
    try {
      await apiPost('updateLead', { payload: { ...lead, status: newStatus } });
      showToast('Status updated!');
      await loadAll();
      if (state.selectedLead && state.selectedLead.lead_id === lead.lead_id) {
        const updated = state.leads.find(l => l.lead_id === lead.lead_id);
        if (updated) openLeadDrawer(updated);
      }
    } catch(e) {
      showToast('Error: ' + e.message, true);
      sel.value = lead.status;
      sel.className = 'status-select ' + statusSelectClass(lead.status);
    }
  }
}

function statusBadge(status) {
  const map = {
    'Bid Submitted':    'badge-bid',
    'Waiting Approval': 'badge-approval',
    'Waiting Load Calc':'badge-loadcalc',
    'Sold':             'badge-sold',
    'Sold (Delayed)':   'badge-delayed',
    'Lost':             'badge-lost',
  };
  return `<span class="badge ${map[status]||'badge-lost'}">${esc(status)}</span>`;
}

function typeBadge(type) {
  const map = { 'New Construction':'badge-nc', 'Remodel':'badge-remodel', 'Changeout':'badge-changeout', 'Service & Add-Ons':'badge-service' };
  return `<span class="badge ${map[type]||'badge-bid'}">${esc(type||'—')}</span>`;
}

function builderStatusBadge(status) {
  const map = { 'Hot':'badge-hot', 'Warm':'badge-warm', 'Cool':'badge-cool' };
  return `<span class="badge ${map[status]||'badge-bid'}">${esc(status||'—')}</span>`;
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
