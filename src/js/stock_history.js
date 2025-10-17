import { db, rtdb } from "./firebase_config.js";
import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import {
  ref,
  get
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const rtdbItemsRef = ref(rtdb, 'items');
const itemHistoryCollection = collection(db, 'itemHistory');

let cachedItems = [];
let itemHistoryChart = null; // holds Chart.js instance to avoid duplicates

function truncateText(value, maxLength = 27) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function formatDateYMD(dateLike) {
  try {
    if (!dateLike) return '';
    let d;
    if (dateLike instanceof Date) d = dateLike; else if (typeof dateLike === 'number') d = new Date(dateLike); else if (typeof dateLike === 'string') {
      const num = Number(dateLike);
      d = !Number.isNaN(num) && dateLike.trim() !== '' ? new Date(num) : new Date(dateLike);
    } else {
      d = new Date(dateLike);
    }
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${hh}:${mm}`;
  } catch (_) {
    return '';
  }
}

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadItems() {
  const grid = document.getElementById('history-items-grid');
  try {
    const snap = await get(rtdbItemsRef);
    cachedItems = [];
    if (snap.exists()) {
      snap.forEach(child => {
        const data = child.val();
        cachedItems.push({ id: child.key, ...data });
      });
    }
    cachedItems.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    renderItemsGrid();
  } catch (err) {
    console.error('Failed to load items for history', err);
    if (grid) grid.innerHTML = '<div class="empty-state"><h3>Failed to load items</h3></div>';
  }
}

function getFilteredItems() {
  const term = document.getElementById('history-search')?.value?.toLowerCase() || '';
  if (!term) return cachedItems;
  return cachedItems.filter(i =>
    (i.name || '').toLowerCase().includes(term) ||
    (i.code || '').toLowerCase().includes(term)
  );
}

function renderItemsGrid() {
  const grid = document.getElementById('history-items-grid');
  if (!grid) return;
  const items = getFilteredItems();
  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>No items found</h3><p>Try another search</p></div>';
    return;
  }
  grid.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'stock-item-card clickable-item';
    const stock = Number(item.stock || 0);
    card.innerHTML = `
      <div class="stock-item-header">
        <div class="stock-item-name">${truncateText(item.name || 'Untitled', 26)}</div>
        <div class="stock-status">Stock: ${stock}</div>
      </div>
      <div class="stock-item-details">
        <div class="stock-item-code">${item.code || 'N/A'}</div>
        <div class="stock-item-price">Rs ${formatCurrency(item.price || 0)}</div>
      </div>
    `;
    card.addEventListener('click', () => openItemHistory(item));
    grid.appendChild(card);
  });
}

async function openItemHistory(item) {
  try {
    const modal = document.getElementById('item-history-modal');
    const title = document.getElementById('item-history-title');
    const content = document.getElementById('item-history-content');
    if (!modal || !content) return;
    title.textContent = `${truncateText(item.name || 'Untitled', 200)} — History`;

  const q = query(
    itemHistoryCollection,
    where('itemId', '==', item.id)
  );
  const snap = await getDocs(q);

    if (snap.empty) {
      content.innerHTML = '<div class="no-sales">No history found for this item</div>';
      modal.style.display = 'block';
      return;
    }

    const rows = [];
    snap.forEach(doc => {
      const h = doc.data();
      rows.push({ id: doc.id, ...h });
    });

  // Sort client-side by createdAt desc to avoid composite index requirement
  rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  const html = rows.map(h => {
      const date = formatDateYMD(h.createdAt);
      const qty = Number(h.quantityAdded || 0);
      const prevStock = h.previousStock != null ? Number(h.previousStock) : '';
      const newStock = h.newStock != null ? Number(h.newStock) : '';
      const prevBuy = h.previousBuyingPrice ?? h.buyingPrice; // fallback if older schema
      const nextBuy = h.newBuyingPrice ?? h.buyingPrice;
      const prevSell = h.previousPrice ?? h.price;
      const nextSell = h.newPrice ?? h.price;
      const prevDisc = h.previousDiscountPrice ?? h.discountPrice;
      const nextDisc = h.newDiscountPrice ?? h.discountPrice;

      const trendIcon = (prev, next) => {
        if (prev == null || next == null || Number.isNaN(Number(prev)) || Number.isNaN(Number(next))) return { cls: 'trend-flat', icon: '↔', label: 'No change' };
        const p = Number(prev);
        const n = Number(next);
        if (n > p) return { cls: 'trend-up', icon: '▲', label: 'Up' };
        if (n < p) return { cls: 'trend-down', icon: '▼', label: 'Down' };
        return { cls: 'trend-flat', icon: '↔', label: 'No change' };
      };

      const buyTrend = trendIcon(prevBuy, nextBuy);
      const sellTrend = trendIcon(prevSell, nextSell);
      const discTrend = trendIcon(prevDisc, nextDisc);

      return `
        <div class="history-row">
          <div class="history-row-header">
            <div class="history-date">${date}</div>
            <div class="history-qty">+${qty} stock</div>
          </div>
          <div class="history-row-body">
            <div>Stock: ${prevStock} → ${newStock}</div>
            <div>
              Buying: ${prevBuy != null ? 'Rs ' + formatCurrency(prevBuy) : '-'} → ${nextBuy != null ? 'Rs ' + formatCurrency(nextBuy) : '-'}
              <span class="price-trend ${buyTrend.cls}" title="${buyTrend.label}">${buyTrend.icon}</span>
            </div>
            <div>
              Selling: ${prevSell != null ? 'Rs ' + formatCurrency(prevSell) : '-'} → ${nextSell != null ? 'Rs ' + formatCurrency(nextSell) : '-'}
              <span class="price-trend ${sellTrend.cls}" title="${sellTrend.label}">${sellTrend.icon}</span>
            </div>
            <div>
              Discount: ${prevDisc != null ? 'Rs ' + formatCurrency(prevDisc) : '-'} → ${nextDisc != null ? 'Rs ' + formatCurrency(nextDisc) : '-'}
              <span class="price-trend ${discTrend.cls}" title="${discTrend.label}">${discTrend.icon}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div class="history-list">
        ${html}
      </div>
    `;

    // Build chart datasets (ascending by time)
    const asc = [...rows].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const labels = asc.map(h => formatDateYMD(h.createdAt));
    const stockSeries = asc.map(h => {
      const v = h.newStock ?? h.previousStock ?? null;
      return v != null ? Number(v) : null;
    });
    const priceSeries = asc.map(h => {
      const v = (h.newPrice ?? h.price ?? null);
      return v != null ? Number(v) : null;
    });

    const canvas = document.getElementById('item-history-chart');
    if (canvas && typeof Chart !== 'undefined') {
      if (itemHistoryChart && typeof itemHistoryChart.destroy === 'function') {
        itemHistoryChart.destroy();
      }
      const ctx = canvas.getContext('2d');
      itemHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Stock',
              data: stockSeries,
              borderColor: '#385dff',
              backgroundColor: '#385dff33',
              tension: 0.25,
              pointRadius: 2,
              yAxisID: 'y',
            },
            {
              label: 'Selling Price (Rs)',
              data: priceSeries,
              borderColor: '#0a8f00',
              backgroundColor: '#0a8f0033',
              tension: 0.25,
              pointRadius: 2,
              yAxisID: 'y1',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true },
            tooltip: { enabled: true }
          },
          scales: {
            y: {
              type: 'linear',
              position: 'left',
              grid: { drawOnChartArea: true },
              title: { display: true, text: 'Stock' }
            },
            y1: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Price (Rs)' }
            },
            x: {
              ticks: { autoSkip: true, maxTicksLimit: 6 }
            }
          }
        }
      });
    }
    modal.style.display = 'block';
  } catch (err) {
    console.error('Failed to open item history', err);
    alert('Failed to load item history. Please try again.');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const search = document.getElementById('history-search');
  if (search) search.addEventListener('input', renderItemsGrid);
  await loadItems();
});


