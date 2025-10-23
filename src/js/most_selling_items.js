import { rtdb } from "./firebase_config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const billsRef = ref(rtdb, 'bills');

let allBills = [];
let currentRange = 'today'; // 'today' | 'thisWeek' | 'thisMonth'

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekStart(date) {
  const dt = new Date(date);
  const day = dt.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday as start
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - diff);
  return startOfDay(monday);
}

function parseCreatedAtToMs(createdAtStr) {
  if (typeof createdAtStr !== 'string') return 0;
  const normalized = createdAtStr.replace(' at ', ' ');
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : 0;
}

async function loadBills() {
  try {
    const snap = await get(billsRef);
    const rows = [];
    if (snap.exists()) {
      snap.forEach(child => {
        const data = child.val();
        const createdAtMs = typeof data.createdAtTimestamp === 'number'
          ? data.createdAtTimestamp
          : (typeof data.createdAt === 'string' ? parseCreatedAtToMs(data.createdAt) : 0);
        rows.push({ id: child.key, createdAtMs, ...data });
      });
    }
    allBills = rows.sort((a,b) => b.createdAtMs - a.createdAtMs);
  } catch (err) {
    console.error('Failed to load bills', err);
    allBills = [];
  }
}

function filterBills(range) {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStart = startOfDay(now).getTime();
  const weekStart = getWeekStart(now).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  switch (range) {
    case 'today':
      return allBills.filter(b => {
        const t = Number(b.createdAtMs || 0);
        return t >= todayStart && t <= nowMs;
      });
    case 'thisWeek':
      return allBills.filter(b => Number(b.createdAtMs || 0) >= weekStart);
    case 'thisMonth':
      return allBills.filter(b => Number(b.createdAtMs || 0) >= monthStart);
    default:
      return allBills;
  }
}

function aggregateTopItems(bills) {
  const map = new Map(); // key: itemId|name
  bills.forEach(b => {
    const lines = Array.isArray(b.lines) ? b.lines : [];
    lines.forEach(l => {
      const qty = Number(l.quantity || 0);
      const price = Number(l.salePrice || l.price || 0);
      const itemId = String(l.itemId || '').trim();
      const name = String(l.name || itemId || 'Item');
      const key = itemId ? `id:${itemId}` : `name:${name}`;
      if (!map.has(key)) {
        map.set(key, { key, itemId, name, qty: 0, amount: 0 });
      }
      const agg = map.get(key);
      agg.qty += qty;
      agg.amount += qty * price;
    });
  });
  const rows = Array.from(map.values());
  rows.sort((a,b) => b.qty - a.qty || b.amount - a.amount);
  return rows.slice(0, 10);
}

function setActive(range) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-range') === range);
  });
}

function render(list) {
  const container = document.getElementById('list');
  const empty = document.getElementById('emptyState');
  container.innerHTML = '';
  if (!list || list.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.forEach((row, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="left">
        <div class="rank">${idx + 1}</div>
        <div>
          <div class="iname">${escapeHtml(row.name)}</div>
          <div class="amt">Amount: ${formatAmount(row.amount)}</div>
        </div>
      </div>
      <div class="right">
        <div class="qty">Qty: ${Number(row.qty || 0)}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function formatAmount(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function updateSummary(range, count) {
  const el = document.getElementById('summaryText');
  const label = range === 'today' ? 'Today' : (range === 'thisWeek' ? 'This week' : 'This month');
  el.textContent = `Showing Top ${count} by quantity • ${label}`;
}

async function init() {
  setActive(currentRange);
  await loadBills();
  const filtered = filterBills(currentRange);
  const rows = aggregateTopItems(filtered);
  updateSummary(currentRange, rows.length || 10);
  render(rows);

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.getAttribute('data-range');
      if (!range) return;
      currentRange = range;
      setActive(range);
      const filtered2 = filterBills(range);
      const rows2 = aggregateTopItems(filtered2);
      updateSummary(range, rows2.length || 10);
      render(rows2);
    });
  });
}

window.addEventListener('DOMContentLoaded', init);


