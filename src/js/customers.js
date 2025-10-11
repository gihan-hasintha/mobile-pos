import { db } from "./firebase_config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const customersCollection = collection(db, 'customer');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

let allCustomersCache = [];

function parseCreatedAtToMs(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return Number(createdAt) || 0;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === 'object' && typeof createdAt.toDate === 'function') {
    try { return createdAt.toDate().getTime(); } catch { return 0; }
  }
  if (typeof createdAt === 'string') {
    const normalized = createdAt.replace(' at ', ' ');
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

async function loadCustomers() {
  const container = document.getElementById('customersContainer');
  if (!container) return;
  container.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  try {
    // Fetch all and sort client-side to support string-based createdAt
    const snap = await getDocs(customersCollection);
    if (snap.empty) {
      container.textContent = 'No customers';
      return;
    }
    const rows = [];
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const createdAtMs = parseCreatedAtToMs(data.createdAt);
      const createdAtDisplay = typeof data.createdAt === 'string' ? data.createdAt : (createdAtMs ? new Date(createdAtMs).toLocaleString() : '');
      rows.push({ id: doc.id, createdAtMs, createdAtDisplay, ...data });
    });
    allCustomersCache = rows;
    renderCustomers(applyCurrentCustomersFilter(rows));
  } catch (e) {
    console.error('Failed to load customers', e);
    container.textContent = 'Error loading customers';
  }
}

function renderCustomers(list) {
  const container = document.getElementById('customersContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(list) || list.length === 0) {
    container.textContent = 'No customers';
    return;
  }
  list.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'bill-card';
    const name = c.name || c.fullName || 'Unnamed';
    const phone = c.phone || c.mobile || c.contact || '';
    const totalSpent = Number(c.totalSpent || c.total || 0);
    const created = c.createdAtDisplay || (c.createdAtMs ? new Date(c.createdAtMs).toLocaleString() : '');
    card.innerHTML = `
      <div class="bill-card-title">${escapeHtml(name)}</div>
      <div class="bill-card-sub">${phone ? `Phone: ${escapeHtml(String(phone))}` : 'No phone'}</div>
      <div class="bill-card-time">${created}</div>
      ${totalSpent ? `<div class="bill-card-sub">Total Spent: ${totalSpent.toFixed(2)}</div>` : ''}
    `;
    container.appendChild(card);
  });
}

function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0,0,0,0);
  return dt;
}

function filterByDateRange(list, range) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const now = new Date();
  const nowMs = now.getTime();
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = new Date(todayStart - 24*60*60*1000).getTime();
  const weekStart = (() => {
    const dt = new Date(now);
    const day = dt.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday=0
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - diff);
    return startOfDay(monday).getTime();
  })();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let filtered = list;
  switch (range) {
    case 'today':
      filtered = list.filter(c => {
        const t = Number(c.createdAtMs || 0);
        return t >= todayStart && t <= nowMs;
      });
      break;
    case 'yesterday':
      filtered = list.filter(c => {
        const t = Number(c.createdAtMs || 0);
        return t >= yesterdayStart && t < todayStart;
      });
      break;
    case 'thisWeek':
      filtered = list.filter(c => Number(c.createdAtMs || 0) >= weekStart);
      break;
    case 'thisMonth':
      filtered = list.filter(c => Number(c.createdAtMs || 0) >= monthStart);
      break;
    case 'all':
    default:
      filtered = list;
  }
  // When date filter is active, show newest first
  filtered.sort((a,b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  return filtered;
}

function applyCurrentCustomersFilter(list) {
  const toggle = document.getElementById('toggleCustomersDateFilter');
  const dateRange = (document.getElementById('customersDateRange') || { value: 'all' }).value;
  const dateMode = !!(toggle && toggle.checked);
  if (dateMode) {
    return filterByDateRange(list, dateRange);
  }
  // Default alphabetical by name
  const copy = [...list];
  copy.sort((a,b) => String(a.name||'').localeCompare(String(b.name||'')));
  return copy;
}

function wireCustomersControls() {
  const toggle = document.getElementById('toggleCustomersDateFilter');
  const range = document.getElementById('customersDateRange');
  if (toggle && range) {
    // restore persisted state
    try {
      const savedToggle = localStorage.getItem('customers.filterByDate');
      const savedRange = localStorage.getItem('customers.dateRange');
      if (savedToggle === '1') toggle.checked = true;
      if (savedRange) range.value = savedRange;
    } catch {}
    range.style.display = toggle.checked ? 'inline-block' : 'none';

    toggle.addEventListener('change', () => {
      try { localStorage.setItem('customers.filterByDate', toggle.checked ? '1' : '0'); } catch {}
      range.style.display = toggle.checked ? 'inline-block' : 'none';
      renderCustomers(applyCurrentCustomersFilter(allCustomersCache));
    });
    range.addEventListener('change', () => {
      try { localStorage.setItem('customers.dateRange', range.value); } catch {}
      renderCustomers(applyCurrentCustomersFilter(allCustomersCache));
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  wireCustomersControls();
  loadCustomers();
});


