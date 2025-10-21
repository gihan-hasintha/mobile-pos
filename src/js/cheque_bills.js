import { rtdb } from "./firebase_config.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const rtdbChequeBillsRef = ref(rtdb, 'cheque_bills');

let allBillsCache = [];

async function loadChequeBills() {
  const container = document.getElementById("billsContainer");
  if (!container) return;
  container.innerHTML = '<div class="spinner" aria-label="Loading"></div>';

  try {
    const bills = await loadFromRTDB();
    bills.sort((a,b) => Number(b.createdAtMs||0) - Number(a.createdAtMs||0));
    allBillsCache = bills;
    if (bills.length === 0) { container.innerHTML = 'No cheque bills'; return; }
    const filterEl = document.getElementById('billFilter');
    if (filterEl) filterEl.value = 'today';
    const initial = filterByRange(bills, 'today');
    renderList(initial);
  } catch (e) {
    console.error(e);
    container.innerHTML = 'Error loading cheque bills';
  }
}

async function loadFromRTDB() {
  const snap = await get(rtdbChequeBillsRef);
  if (!snap.exists()) return [];
  const rows = [];
  snap.forEach((childSnap) => {
    const data = childSnap.val() || {};
    const createdAtMs = typeof data.createdAtTimestamp === 'number'
      ? data.createdAtTimestamp
      : (typeof data.createdAt === 'string' ? parseCreatedAtToMs(data.createdAt) : 0);
    rows.push({ id: childSnap.key, createdAtMs, ...data });
  });
  return rows;
}

function parseCreatedAtToMs(createdAtStr) {
  if (typeof createdAtStr !== 'string') return 0;
  const normalized = createdAtStr.replace(' at ', ' ');
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : 0;
}

function renderList(list) {
  const container = document.getElementById('billsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) { container.innerHTML = 'No cheque bills'; return; }
  list.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'bill-card';
    const dt = b.createdAt || new Date(Number(b.createdAtMs||0)).toLocaleString();
    const billNumber = b.billNumber || b.id;
    const statusLower = String(b.status || 'pending').toLowerCase();
    const status = statusLower.toUpperCase();
    const isFinal = statusLower === 'cleared' || statusLower === 'cancelled';
    card.innerHTML = `
      <div class="bill-card-title">Cheque Bill #${billNumber}</div>
      <div class="bill-card-sub">Items: ${Number(b.itemCount||0)} | Total: ${formatAmount(b.grandTotal)}</div>
      <div class="bill-card-sub">Customer: ${escapeHtml(String(b.customerName||''))} | ${escapeHtml(String(b.customerPhone||''))}</div>
      <div class="bill-card-sub">Cheque No: ${escapeHtml(String(b.chequeNumber||''))} | Cheque Date: ${escapeHtml(String(b.chequeDate||''))}</div>
      <div class="bill-card-sub">Status: ${escapeHtml(status)}</div>
      <div class="bill-card-time">${dt}</div>
      ${!isFinal ? `
      <div class="bill-card-actions">
        <button class="bill-action-cleared" data-id="${b.id}">Cleared</button>
        <button class="bill-action-cancelled" data-id="${b.id}">Cancel</button>
      </div>` : ''}
    `;
    const clearedBtn = card.querySelector('.bill-action-cleared');
    const cancelledBtn = card.querySelector('.bill-action-cancelled');
    const actionsWrap = card.querySelector('.bill-card-actions');
    if (clearedBtn) {
      clearedBtn.addEventListener('click', async () => {
        clearedBtn.disabled = true;
        if (cancelledBtn) cancelledBtn.disabled = true;
        await handleStatusChange(String(b.id), 'cleared');
      });
    }
    if (cancelledBtn) {
      cancelledBtn.addEventListener('click', async () => {
        cancelledBtn.disabled = true;
        if (clearedBtn) clearedBtn.disabled = true;
        if (actionsWrap) actionsWrap.style.display = 'none';
        await handleStatusChange(String(b.id), 'cancelled');
      });
    }
    container.appendChild(card);
  });
}

function formatAmount(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0,0,0,0);
  return dt.getTime();
}

function filterByRange(list, range) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const now = Date.now();
  const todayStart = startOfDay(new Date());
  const yesterdayStart = todayStart - 24*60*60*1000;
  const weekStart = (() => {
    const dt = new Date();
    const day = dt.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - diff);
    monday.setHours(0,0,0,0);
    return monday.getTime();
  })();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  let out = list;
  switch (range) {
    case 'today': out = list.filter(b => Number(b.createdAtMs||0) >= todayStart && Number(b.createdAtMs||0) <= now); break;
    case 'yesterday': out = list.filter(b => Number(b.createdAtMs||0) >= yesterdayStart && Number(b.createdAtMs||0) < todayStart); break;
    case 'thisWeek': out = list.filter(b => Number(b.createdAtMs||0) >= weekStart); break;
    case 'thisMonth': out = list.filter(b => Number(b.createdAtMs||0) >= monthStart); break;
    case 'all': default: out = list;
  }
  out.sort((a,b) => Number(b.createdAtMs||0) - Number(a.createdAtMs||0));
  return out;
}

async function updateBillStatus(billId, newStatus) {
  const billRef = ref(rtdb, `cheque_bills/${billId}`);
  await update(billRef, { status: newStatus, statusUpdatedAt: Date.now() });
}

async function handleStatusChange(billId, newStatus) {
  const confirmMsg = newStatus === 'cleared' ? 'Mark this cheque as CLEARED?' : 'Mark this cheque as CANCELLED?';
  if (!window.confirm(confirmMsg)) return;
  try {
    await updateBillStatus(billId, newStatus);
    const idx = allBillsCache.findIndex((x) => String(x.id) === String(billId));
    if (idx !== -1) {
      allBillsCache[idx] = { ...allBillsCache[idx], status: newStatus };
    }
    const filter = document.getElementById('billFilter');
    const range = filter && filter.value ? filter.value : 'today';
    const filtered = filterByRange(allBillsCache, range);
    renderList(filtered);
  } catch (err) {
    console.error(err);
    alert('Failed to update status');
  }
}

function wireUI() {
  const filter = document.getElementById('billFilter');
  if (filter) {
    filter.addEventListener('change', () => {
      const filtered = filterByRange(allBillsCache, filter.value);
      renderList(filtered);
    });
  }
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportCsv(allBillsCache);
    });
  }
}

function safeCsv(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(safeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCsv(list) {
  if (!Array.isArray(list) || list.length === 0) { alert('No data'); return; }
  const header = ['Bill #','Created At','Items','Grand Total','Customer','Phone','Cheque Number','Cheque Date','Status'];
  const rows = list.map(b => [
    b.billNumber || b.id,
    b.createdAt || new Date(Number(b.createdAtMs||0)).toLocaleString(),
    Number(b.itemCount||0),
    Number(b.grandTotal||0).toFixed(2),
    b.customerName || '',
    b.customerPhone || '',
    b.chequeNumber || '',
    b.chequeDate || '',
    String(b.status||'pending')
  ]);
  downloadCsv([header, ...rows], 'cheque_bills_export.csv');
}

window.addEventListener('DOMContentLoaded', async () => {
  wireUI();
  await loadChequeBills();
});


