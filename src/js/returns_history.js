import { rtdb } from "./firebase_config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const returnsRef = ref(rtdb, 'returns');

function escapeHtml(text) {
	return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function startOfDay(d) {
	const dt = new Date(d);
	dt.setHours(0,0,0,0);
	return dt;
}

function filterByRange(list, range) {
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
			filtered = list.filter(r => {
				const t = Number(r.createdAtTimestamp || 0);
				return t >= todayStart && t <= nowMs;
			});
			break;
		case 'yesterday':
			filtered = list.filter(r => {
				const t = Number(r.createdAtTimestamp || 0);
				return t >= yesterdayStart && t < todayStart;
			});
			break;
		case 'thisWeek':
			filtered = list.filter(r => Number(r.createdAtTimestamp||0) >= weekStart);
			break;
		case 'thisMonth':
			filtered = list.filter(r => Number(r.createdAtTimestamp||0) >= monthStart);
			break;
		case 'all':
		default:
			filtered = list;
	}
	filtered.sort((a,b) => Number(b.createdAtTimestamp||0) - Number(a.createdAtTimestamp||0));
	return filtered;
}

function renderReturns(list) {
	const container = document.getElementById('returnsList');
	if (!container) return;
	container.innerHTML = '';
	if (!list || list.length === 0) { container.innerHTML = 'No returns'; return; }
	list.forEach((ret) => {
		const card = document.createElement('div');
		card.className = 'bill-card';
		const dt = new Date(Number(ret.createdAtTimestamp||0)).toLocaleString();
		const amount = Number(ret.refundedAmount||0).toFixed(2);
		const linesHtml = Array.isArray(ret.lines) ? ret.lines.map(l => `
			<div class="bill-line">
				<div class="bill-line-title">${escapeHtml(String(l.name||l.itemId||'Item'))}</div>
				<div class="bill-line-sub">Qty: ${Number(l.quantity||0)} | Price: ${Number(l.price||0).toFixed(2)}</div>
			</div>
		`).join('') : '';
		card.innerHTML = `
			<div class="bill-card-title">Bill #${escapeHtml(String(ret.billNumber||ret.billId||''))}</div>
			<div class="bill-card-sub">Refunded: ${amount}</div>
			<div class="bill-card-time">${escapeHtml(dt)}</div>
			<div class="bill-lines">${linesHtml}</div>
		`;
		container.appendChild(card);
	});
}

async function loadReturns() {
	const container = document.getElementById('returnsList');
	if (container) container.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
	try {
		const snap = await get(returnsRef);
		const rows = [];
		if (snap.exists()) {
			snap.forEach((c) => {
				rows.push({ id: c.key, ...c.val() });
			});
		}
		const filterEl = document.getElementById('retFilter');
		const range = filterEl ? filterEl.value : 'today';
		const filtered = filterByRange(rows, range);
		renderReturns(filtered);
	} catch (e) {
		console.error('Error loading returns:', e);
		if (container) container.innerHTML = 'Error loading returns';
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

function exportReturns(list) {
	const header = ['Return ID','Bill #','Date & Time','Refunded Amount','Lines'];
	const rows = list.map(r => [
		r.id,
		r.billNumber || r.billId || '',
		new Date(Number(r.createdAtTimestamp||0)).toLocaleString(),
		Number(r.refundedAmount||0).toFixed(2),
		(Array.isArray(r.lines)?r.lines.map(l => `${l.name||l.itemId} x${l.quantity} @${Number(l.price||0).toFixed(2)}`).join(' | '):'')
	]);
	downloadCsv([header, ...rows], 'returns_export.csv');
}

window.addEventListener('DOMContentLoaded', () => {
	loadReturns();
	const filter = document.getElementById('retFilter');
	if (filter) filter.addEventListener('change', loadReturns);
	const exportBtn = document.getElementById('exportReturnsBtn');
	if (exportBtn) exportBtn.addEventListener('click', async () => {
		const snap = await get(returnsRef);
		const rows = [];
		if (snap.exists()) snap.forEach(c => rows.push({ id: c.key, ...c.val() }));
		exportReturns(rows);
	});
});


