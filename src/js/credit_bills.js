import { rtdb } from "./firebase_config.js";
import { ref, get, child, update, push } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const rtdbCreditBillsRef = ref(rtdb, 'credit_bills');

let allBillsCache = [];
let activeBillForPayment = null; // {id, data}

async function loadCreditBills() {
  const container = document.getElementById("billsContainer");
  if (!container) return;
  container.innerHTML = '<div class="spinner" aria-label="Loading"></div>';

  try {
    const bills = await loadFromRTDB();
    bills.sort((a,b) => Number(b.createdAtMs||0) - Number(a.createdAtMs||0));
    allBillsCache = bills;

    if (bills.length === 0) {
      container.innerHTML = "No credit bills";
      return;
    }

    const filterEl = document.getElementById('billFilter');
    if (filterEl) filterEl.value = 'today';
    const initial = filterByRange(bills, 'today');
    renderList(initial);
  } catch (e) {
    console.error(e);
    container.innerHTML = "Error loading credit bills";
  }
}

async function loadFromRTDB() {
  const snap = await get(rtdbCreditBillsRef);
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
  if (!list || list.length === 0) {
    container.innerHTML = 'No credit bills';
    return;
  }
  list.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'bill-card';
    card.setAttribute('data-id', b.id);
    const dt = b.createdAt || new Date(Number(b.createdAtMs||0)).toLocaleString();
    const billNumber = b.billNumber || b.id;
    const balance = Number(b.balanceAmount || 0);
    const status = String(b.status || 'pending').toUpperCase();
    card.innerHTML = `
      <div class="bill-card-title">Bill #${billNumber}</div>
      <div class="bill-card-sub">Items: ${Number(b.itemCount||0)} | Total: ${formatAmount(b.grandTotal)} | Paid: ${formatAmount(b.paidAmount)}</div>
      <div class="bill-card-sub">Customer Name: ${escapeHtml(String(b.customerName || ''))}</div>
      <div class="bill-card-sub">Customer Address: ${escapeHtml(String(b.customerAddress || 'Not Provided'))}</div>
      <div class="bill-card-sub">Customer Phone: ${escapeHtml(String(b.customerPhone || 'Not Provided'))}</div>
      <div class="bill-card-sub">Balance: ${formatAmount(balance)} | Due: ${escapeHtml(String(b.dueDate || 'N/A'))} | Status: ${escapeHtml(status)}</div>
      <div class="bill-card-time">${dt}</div>
    `;
    card.style.cursor = balance > 0 ? 'pointer' : 'default';
    if (balance > 0) {
      card.addEventListener('click', () => openPaymentModal(b.id));
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
    const diff = day === 0 ? 6 : day - 1; // Monday = 0
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - diff);
    monday.setHours(0,0,0,0);
    return monday.getTime();
  })();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  let out = list;
  switch (range) {
    case 'today':
      out = list.filter(b => Number(b.createdAtMs||0) >= todayStart && Number(b.createdAtMs||0) <= now);
      break;
    case 'yesterday':
      out = list.filter(b => Number(b.createdAtMs||0) >= yesterdayStart && Number(b.createdAtMs||0) < todayStart);
      break;
    case 'thisWeek':
      out = list.filter(b => Number(b.createdAtMs||0) >= weekStart);
      break;
    case 'thisMonth':
      out = list.filter(b => Number(b.createdAtMs||0) >= monthStart);
      break;
    case 'all':
    default:
      out = list;
  }
  out.sort((a,b) => Number(b.createdAtMs||0) - Number(a.createdAtMs||0));
  return out;
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
  const closeBtn = document.getElementById('closeBillModal');
  const modal = document.getElementById('billModal');
  const backdrop = document.getElementById('billModalBackdrop');
  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.style.display = 'none');
  if (backdrop && modal) backdrop.addEventListener('click', () => modal.style.display = 'none');

  // Payment modal wiring
  const payClose = document.getElementById('closeCreditPayModal');
  const payModal = document.getElementById('creditPayModal');
  const payBackdrop = document.getElementById('creditPayModalBackdrop');
  const paySubmit = document.getElementById('creditPaySubmit');
  if (payClose && payModal) payClose.addEventListener('click', () => { payModal.style.display = 'none'; activeBillForPayment = null; });
  if (payBackdrop && payModal) payBackdrop.addEventListener('click', (e) => { if (e.target === payBackdrop) { payModal.style.display = 'none'; activeBillForPayment = null; } });
  if (paySubmit) paySubmit.addEventListener('click', submitPayment);
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
  const header = ['Bill #','Created At','Items','Grand Total','Paid','Balance','Due Date','Customer','Phone','Status'];
  const rows = list.map(b => [
    b.billNumber || b.id,
    b.createdAt || new Date(Number(b.createdAtMs||0)).toLocaleString(),
    Number(b.itemCount||0),
    Number(b.grandTotal||0).toFixed(2),
    Number(b.paidAmount||0).toFixed(2),
    Number(b.balanceAmount||0).toFixed(2),
    b.dueDate || '',
    b.customerName || '',
    b.customerPhone || '',
    String(b.status||'pending')
  ]);
  downloadCsv([header, ...rows], 'credit_bills_export.csv');
}

window.addEventListener('DOMContentLoaded', async () => {
  wireUI();
  await loadCreditBills();
});

async function openPaymentModal(billId) {
  const bill = allBillsCache.find(b => b.id === billId);
  if (!bill) return;
  const balance = Number(bill.balanceAmount || 0);
  if (balance <= 0) return; // do nothing if already settled
  activeBillForPayment = { id: billId, data: bill };
  const label = document.getElementById('creditPayBillLabel');
  const balEl = document.getElementById('creditPayCurrentBalance');
  const amountEl = document.getElementById('creditPayAmount');
  const noteEl = document.getElementById('creditPayNote');
  if (label) label.textContent = `Bill #${bill.billNumber || bill.id}`;
  if (balEl) balEl.value = formatAmount(balance);
  if (amountEl) amountEl.value = '';
  if (noteEl) noteEl.value = '';
  const modal = document.getElementById('creditPayModal');
  if (modal) modal.style.display = 'block';
}

async function submitPayment() {
  if (!activeBillForPayment) return;
  const amountEl = document.getElementById('creditPayAmount');
  const noteEl = document.getElementById('creditPayNote');
  const raw = amountEl && amountEl.value ? Number(amountEl.value) : 0;
  if (!Number.isFinite(raw) || raw <= 0) { alert('Enter a valid amount'); return; }

  // Read most recent bill snapshot to avoid stale math
  const billRef = child(rtdbCreditBillsRef, activeBillForPayment.id);
  const snap = await get(billRef);
  if (!snap.exists()) { alert('Bill not found'); return; }
  const current = snap.val() || {};
  const currentPaid = Number(current.paidAmount || 0);
  const grandTotal = Number(current.grandTotal || 0);
  const currentBalance = Number(current.balanceAmount != null ? current.balanceAmount : (grandTotal - currentPaid));
  if (currentBalance <= 0) { alert('This bill is already settled'); return; }
  if (raw > currentBalance) { alert('Amount exceeds current balance'); return; }

  const newPaid = currentPaid + raw;
  const newBalance = Math.max(0, grandTotal - newPaid);
  const newStatus = newBalance === 0 ? 'settled' : (current.status || 'pending');

  // Build updates
  const updates = {
    paidAmount: newPaid,
    balanceAmount: newBalance,
    status: newStatus
  };

  // Optional payment log under credit_bills/{id}/payments
  const paymentsRef = child(billRef, 'payments');
  const entry = {
    amount: raw,
    note: (noteEl && noteEl.value ? String(noteEl.value).trim() : null) || null,
    createdAt: new Date().toISOString()
  };

  await Promise.all([
    update(billRef, updates),
    push(paymentsRef, entry)
  ]);

  // Refresh UI
  const modal = document.getElementById('creditPayModal');
  if (modal) modal.style.display = 'none';
  activeBillForPayment = null;
  await loadCreditBills();
}


