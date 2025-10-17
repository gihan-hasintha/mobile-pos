import { rtdb } from "./firebase_config.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const rtdbBillsRef = ref(rtdb, 'bills');

let allBillsCache = [];
let currentViewMode = 'bills'; // 'bills' | 'items'
let lastRenderedList = []; // cache of the currently filtered list for export

async function loadBills() {
  const container = document.getElementById("billsContainer");
  if (!container) return;
  container.innerHTML = '<div class="spinner" aria-label="Loading"></div>';

  try {
    const rtdbBills = await loadBillsFromRTDB();
    const allBills = [...rtdbBills];
    allBills.sort((a, b) => {
      const dateA = Number(a.createdAtMs || 0);
      const dateB = Number(b.createdAtMs || 0);
      return dateB - dateA; // Newest first
    });
    allBillsCache = allBills;

    if (allBills.length === 0) {
      container.innerHTML = "No bills";
      return;
    }

    // Render today's bills by default
    const filterEl = document.getElementById('billFilter');
    if (filterEl) filterEl.value = 'today';
    const initial = filterBillsByRange(allBills, 'today');
    lastRenderedList = initial;
    renderBillsDecide(initial);
    updateStats(initial);

    container.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const card = target.closest('.bill-card');
      if (!card) return;
      const id = card.getAttribute("data-id");
      const source = card.getAttribute("data-source");
      if (id) await showBill(id, source);
    });
  } catch (error) {
    console.error("Error loading bills:", error);
    container.innerHTML = "Error loading bills";
  }
}

async function loadBillsFromRTDB() {
  try {
    const snapshot = await get(rtdbBillsRef);
    if (!snapshot.exists()) return [];
    
    const bills = [];
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      // Prefer numeric timestamp; fallback to parsing date string if present
      const createdAtMs = typeof data.createdAtTimestamp === 'number'
        ? data.createdAtTimestamp
        : (typeof data.createdAt === 'string' ? parseCreatedAtToMs(data.createdAt) : 0);
      bills.push({
        id: childSnapshot.key,
        source: 'rtdb',
        createdAtMs,
        createdAtFormatted: data.createdAt,
        ...data
      });
    });
    return bills;
  } catch (error) {
    console.error("Error loading bills from RTDB:", error);
    return [];
  }
}

// Removed Firestore loading; RTDB is the source of truth

async function showBill(billId, source = 'rtdb') {
  const detail = document.getElementById("billDetail");
  if (!detail) return;
  detail.innerHTML = '<div class="spinner" aria-label="Loading bill"></div>';

  try {
    let data;
    if (source === 'rtdb') {
      const billRef = child(rtdbBillsRef, billId);
      const snap = await get(billRef);
      if (!snap.exists()) {
        detail.textContent = "Bill not found";
        return;
      }
      data = snap.val();
    }

    const lines = Array.isArray(data.lines) ? data.lines : [];
    // Use formatted date if available (from RTDB), otherwise format timestamp or Firestore date
    const displayDate = data.createdAt ? data.createdAt : new Date(
      (typeof data.createdAtTimestamp === 'number' ? data.createdAtTimestamp : (typeof data.createdAtMs === 'number' ? data.createdAtMs : 0))
    ).toLocaleString();
    const billNumber = data.billNumber || billId;

    const itemsHtml = lines.map((l) => `
      <div class="bill-line">
        <div class="bill-line-title">${escapeHtml(l.name || l.itemId || "Item")}</div>
        <div class="bill-line-sub">QNT: ${Number(l.quantity || 0)} | Price: ${formatAmount(l.salePrice)}</div>
        <div class="bill-line-total">Total: ${formatAmount(l.total || (Number(l.quantity||0)*Number(l.salePrice||0)))}</div>
      </div>
    `).join("");

    detail.innerHTML = `
      <div class="bill-detail-header">
        <div class="bill-detail-header-title"><strong>Bill #${billNumber}</strong></div>
        <div style="font-size: 13px;">${displayDate}</div>
        <div>Items: ${Number(data.itemCount || 0)} | Grand Total: ${formatAmount(data.grandTotal)}</div>
      </div>
      <div class="bill-lines">${itemsHtml}</div>
    `;

    const modal = document.getElementById('billModal');
    if (modal) modal.style.display = 'block';
  } catch (error) {
    console.error("Error loading bill:", error);
    detail.textContent = "Error loading bill";
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

// Format numeric amounts with thousand separators and 2 decimals
function formatAmount(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

// Parse RTDB-created human-readable createdAt like
// "October 10, 2025 at 01:30:34 PM GMT+5:30" into milliseconds
function parseCreatedAtToMs(createdAtStr) {
  if (typeof createdAtStr !== 'string') return 0;
  // Remove the literal " at " to improve native Date parsing
  const normalized = createdAtStr.replace(' at ', ' ');
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : 0;
}

function renderBills(list) {
  const container = document.getElementById('billsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = 'No bills';
    return;
  }
  list.forEach((billData) => {
    const card = document.createElement('div');
    card.className = 'bill-card';
    card.setAttribute('data-id', billData.id);
    card.setAttribute('data-source', billData.source);
    const displayDate = billData.createdAtFormatted || new Date(billData.createdAtMs || 0).toLocaleString();
    const billNumber = billData.billNumber || billData.id;
    card.innerHTML = `
      <div class="bill-card-title">Bill #${billNumber}</div>
      <div class="bill-card-sub">Items: ${Number(billData.itemCount || 0)} | Total: ${formatAmount(billData.grandTotal)}</div>
      <div class="bill-card-time">${displayDate}</div>
    `;
    container.appendChild(card);
  });
}

function renderBillsGroupedByDate(list) {
  const container = document.getElementById('billsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = 'No bills';
    return;
  }
  const groups = new Map();
  list.forEach((b) => {
    const key = formatDateKey(Number(b.createdAtMs || 0));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });
  // Keep groups ordered by date desc (list already sorted desc)
  const seen = new Set();
  list.forEach((b) => {
    const key = formatDateKey(Number(b.createdAtMs || 0));
    if (seen.has(key)) return;
    seen.add(key);
    const heading = document.createElement('div');
    heading.className = 'bill-date-heading';
    heading.textContent = formatDateHeading(Number(b.createdAtMs || 0));
    container.appendChild(heading);
    const group = groups.get(key) || [];
    group.forEach((billData) => {
      const card = document.createElement('div');
      card.className = 'bill-card';
      card.setAttribute('data-id', billData.id);
      card.setAttribute('data-source', billData.source);
      const displayDate = billData.createdAtFormatted || new Date(billData.createdAtMs || 0).toLocaleString();
      const billNumber = billData.billNumber || billData.id;
      card.innerHTML = `
        <div class="bill-card-title">Bill #${billNumber}</div>
        <div class="bill-card-sub">Items: ${Number(billData.itemCount || 0)} | Total: ${formatAmount(billData.grandTotal)}</div>
        <div class="bill-card-time">${displayDate}</div>
      `;
      container.appendChild(card);
    });
  });
}

function renderBillsDecide(list) {
  const toggle = document.getElementById('toggleShowDates');
  const enabled = !!(toggle && toggle.checked);
  if (currentViewMode === 'items') {
    renderItemsView(list);
  } else {
    if (enabled) {
      renderBillsGroupedByDate(list);
    } else {
      renderBills(list);
    }
  }
}

function formatDateKey(ms) {
  const d = new Date(ms || 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateHeading(ms) {
  const d = new Date(ms || 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  return `${y}/${m}/${day} - ${weekday}`;
}

function updateStats(list) {
  const billCountEl = document.getElementById('billCount');
  const itemsSoldEl = document.getElementById('itemsSoldCount');
  const count = Array.isArray(list) ? list.length : 0;
  const items = Array.isArray(list) ? list.reduce((sum, b) => sum + Number(b.itemCount || 0), 0) : 0;
  if (billCountEl) billCountEl.textContent = String(count);
  if (itemsSoldEl) itemsSoldEl.textContent = String(items);
}

function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function filterBillsByRange(list, range) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const now = new Date();
  const nowMs = now.getTime();
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = new Date(todayStart - 24 * 60 * 60 * 1000).getTime();
  const weekStart = (() => {
    const dt = new Date(now);
    const day = dt.getDay(); // 0=Sun
    const diff = day === 0 ? 6 : day - 1; // make Monday=0
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - diff);
    return startOfDay(monday).getTime();
  })();
  const monthStart = (() => {
    const dt = new Date(now.getFullYear(), now.getMonth(), 1);
    return dt.getTime();
  })();

  let filtered = list;
  switch (range) {
    case 'today':
      filtered = list.filter(b => {
        const t = Number(b.createdAtMs || 0);
        return t >= todayStart && t <= nowMs;
      });
      break;
    case 'yesterday':
      filtered = list.filter(b => {
        const t = Number(b.createdAtMs || 0);
        return t >= yesterdayStart && t < todayStart;
      });
      break;
    case 'thisWeek':
      filtered = list.filter(b => Number(b.createdAtMs || 0) >= weekStart);
      break;
    case 'thisMonth':
      filtered = list.filter(b => Number(b.createdAtMs || 0) >= monthStart);
      break;
    case 'all':
    default:
      filtered = list;
  }
  filtered.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  return filtered;
}

window.addEventListener("DOMContentLoaded", () => {
  loadBills();
  const closeBtn = document.getElementById('closeBillModal');
  const modal = document.getElementById('billModal');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
  const backdrop = document.getElementById('billModalBackdrop');
  if (backdrop && modal) {
    backdrop.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
  const filter = document.getElementById('billFilter');
  if (filter) {
    filter.addEventListener('change', () => {
      const filtered = filterBillsByRange(allBillsCache, filter.value);
      lastRenderedList = filtered;
      renderBillsDecide(filtered);
      updateStats(filtered);
    });
  }
  const viewSelect = document.getElementById('viewModeSelect');
  if (viewSelect) {
    viewSelect.addEventListener('change', () => {
      currentViewMode = viewSelect.value === 'items' ? 'items' : 'bills';
      const currentFilter = (document.getElementById('billFilter') || { value: 'today' }).value;
      const filtered = filterBillsByRange(allBillsCache, currentFilter);
      lastRenderedList = filtered;
      renderBillsDecide(filtered);
      updateStats(filtered);
    });
  }
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const currentFilter = (document.getElementById('billFilter') || { value: 'today' }).value;
      const filtered = filterBillsByRange(allBillsCache, currentFilter);
      exportCurrentData(filtered);
    });
  }
  const toggle = document.getElementById('toggleShowDates');
  if (toggle) {
    // restore persisted choice
    try {
      const saved = localStorage.getItem('bills.showDateGroups');
      if (saved === '1') toggle.checked = true;
    } catch {}
    toggle.addEventListener('change', () => {
      try { localStorage.setItem('bills.showDateGroups', toggle.checked ? '1' : '0'); } catch {}
      const currentFilter = (document.getElementById('billFilter') || { value: 'today' }).value;
      const filtered = filterBillsByRange(allBillsCache, currentFilter);
      lastRenderedList = filtered;
      renderBillsDecide(filtered);
      updateStats(filtered);
    });
  }
});

// ITEMS VIEW
function buildItemsFromBills(list) {
  // Build a flat list of item occurrences across bills
  const rows = [];
  list.forEach((b) => {
    const lines = Array.isArray(b.lines) ? b.lines : [];
    const cashier = b.cashier || b.createdBy || 'USER';
    const billNo = b.billNumber || b.id;
    lines.forEach((l) => {
      const qty = Number(l.quantity || 0);
      const price = Number(l.salePrice || l.price || 0);
      rows.push({
        billId: b.id,
        billNumber: billNo,
        createdAtMs: Number(b.createdAtMs || 0),
        cashier,
        quantity: qty,
        itemName: l.name || l.itemId || 'Item',
        itemPrice: price
      });
    });
  });
  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return rows;
}

function renderItemsView(list) {
  const container = document.getElementById('billsContainer');
  if (!container) return;
  const rows = buildItemsFromBills(list);
  if (rows.length === 0) { container.innerHTML = 'No items'; return; }
  const grid = document.createElement('div');
  grid.className = 'item-occ-grid';
  rows.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'bill-card item-occ-card';
    const dt = new Date(r.createdAtMs || 0).toLocaleString();
    card.innerHTML = `
      <div class="bill-card-title">${escapeHtml(String(r.itemName))}</div>
      <div class="bill-card-sub">Qty: ${r.quantity} | Price: ${formatAmount(r.itemPrice)}</div>
      <div class="bill-card-sub">Cashier: ${escapeHtml(String(r.cashier))}</div>
      <div class="bill-card-time">${dt}</div>
      <div class="bill-card-link">Bill: <a href="#" data-bill-id="${r.billId}" class="bill-link">${escapeHtml(String(r.billNumber))}</a></div>
    `;
    grid.appendChild(card);
  });
  container.innerHTML = '';
  container.appendChild(grid);
  container.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const link = t.closest('.bill-link');
    if (link) {
      e.preventDefault();
      const id = link.getAttribute('data-bill-id');
      if (id) await showBill(id, 'rtdb');
    }
  }, { once: true });
}

async function showItemDetail(itemKey, sourceList) {
  const detail = document.getElementById('billDetail');
  const modal = document.getElementById('billModal');
  if (!detail || !modal) return;
  detail.innerHTML = '<div class="spinner" aria-label="Loading item"></div>';
  // Build list of bills containing the item
  const items = buildItemsFromBills(sourceList);
  const entry = items.find(i => i.key === String(itemKey));
  if (!entry) { detail.textContent = 'Item not found'; return; }
  const rows = entry.occurrences
    .sort((a,b) => Number(b.createdAtMs||0) - Number(a.createdAtMs||0))
    .map(o => {
      const dt = new Date(Number(o.createdAtMs||0)).toLocaleString();
      return `<div class="bill-line"><div class="bill-line-title">Bill #${o.billId}</div><div class="bill-line-sub">${dt} | Qty: ${o.qty}</div><div class="bill-line-total">${o.total.toFixed(2)}</div></div>`;
    }).join('');
  detail.innerHTML = `
    <div class="bill-detail-header">
      <div class="bill-detail-header-title"><strong>Item: ${escapeHtml(entry.name)}</strong></div>
      <div>Total Qty: ${entry.totalQty} | Amount: ${formatAmount(entry.totalAmount)}</div>
    </div>
    <div class="bill-lines">${rows}</div>
  `;
  modal.style.display = 'block';
}

// EXPORT
function exportCurrentData(list) {
  if (currentViewMode === 'items') {
    const rows = buildItemsFromBills(list);
    const header = ['Bill #','Date & Time','Cashier','Quantity','Item Name','Item Price'];
    const out = rows.map(r => [
      r.billNumber,
      new Date(r.createdAtMs||0).toLocaleString(),
      r.cashier,
      r.quantity,
      r.itemName,
      r.itemPrice.toFixed(2)
    ]);
    downloadCsv([header, ...out], 'items_occurrences_export.csv');
  } else {
    const header = ['Bill #','Items','Grand Total','Created At'];
    const rows = list.map(b => [b.billNumber || b.id, Number(b.itemCount||0), Number(b.grandTotal||0).toFixed(2), new Date(Number(b.createdAtMs||0)).toLocaleString()]);
    downloadCsv([header, ...rows], 'bills_export.csv');
  }
}

function safeCsv(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
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


