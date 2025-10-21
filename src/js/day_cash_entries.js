import { rtdb } from "./firebase_config.js";
import { ref, get, query, orderByChild, startAt, endAt } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const dayCashRef = ref(rtdb, 'dayCashEntries');

function startOfDay(date) {
	const dt = new Date(date);
	dt.setHours(0, 0, 0, 0);
	return dt;
}

function endOfDay(date) {
	const dt = new Date(date);
	dt.setHours(23, 59, 59, 999);
	return dt;
}

function formatNumberWithCommas(value, fractionDigits = 2) {
	return Number(value).toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function formatDate(date) {
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function renderEntryRow(entry, container) {
	const row = document.createElement('div');
	row.className = 'expense-card';
	const dt = formatDate(Number(entry.createdAtMs || Date.now()));
	
	row.innerHTML = `
		<div class="expense-title">${entry.userName ? String(entry.userName) : 'USER'} — LKR ${formatNumberWithCommas(entry.cashierAmount || 0)}</div>
		<div class="expense-sub">
			Bills: ${Number(entry.totalBills || 0)} | 
			Items: ${Number(entry.totalItems || 0)} | 
			Sold Amount: LKR ${formatNumberWithCommas(entry.totalSoldAmount || 0)}
		</div>
		<div class="expense-time">${dt}</div>
	`;
	container.appendChild(row);
}

function updateSummary(entries) {
	const totalEntries = entries.length;
	const totalCashierAmount = entries.reduce((sum, entry) => sum + Number(entry.cashierAmount || 0), 0);
	const totalBills = entries.reduce((sum, entry) => sum + Number(entry.totalBills || 0), 0);
	const totalItems = entries.reduce((sum, entry) => sum + Number(entry.totalItems || 0), 0);
	const totalSales = entries.reduce((sum, entry) => sum + Number(entry.totalSoldAmount || 0), 0);

	document.getElementById('summary-total-entries').textContent = totalEntries;
	document.getElementById('summary-total-cashier-amount').textContent = formatNumberWithCommas(totalCashierAmount);
	document.getElementById('summary-total-bills').textContent = totalBills;
	document.getElementById('summary-total-items').textContent = totalItems;
	document.getElementById('summary-total-sales').textContent = formatNumberWithCommas(totalSales);
}

async function loadEntries(selectedDate = null) {
	const list = document.getElementById('dayCashEntriesList');
	if (!list) return;
	
	list.innerHTML = 'Loading...';
	
	try {
		const snap = await get(dayCashRef);
		if (!snap.exists()) { 
			list.textContent = 'No entries found'; 
			updateSummary([]);
			return; 
		}
		
		let entries = [];
		snap.forEach((child) => {
			const data = child.val() || {};
			entries.push({ id: child.key, ...data });
		});
		
		// Filter by date if selected
		if (selectedDate) {
			const startMs = startOfDay(selectedDate).getTime();
			const endMs = endOfDay(selectedDate).getTime();
			entries = entries.filter(entry => {
				const createdAtMs = Number(entry.createdAtMs || 0);
				return createdAtMs >= startMs && createdAtMs <= endMs;
			});
		}
		
		// Sort by creation time (newest first)
		entries.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
		
		list.innerHTML = '';
		if (entries.length === 0) {
			list.textContent = selectedDate ? 'No entries found for selected date' : 'No entries found';
		} else {
			entries.forEach((entry) => renderEntryRow(entry, list));
		}
		
		updateSummary(entries);
		
	} catch (e) {
		console.error('Failed to load entries', e);
		list.textContent = 'Error loading entries';
		updateSummary([]);
	}
}

function exportToExcel(entries) {
	// Create CSV content
	const headers = ['Date', 'User Name', 'Cashier Amount (LKR)', 'Total Bills', 'Total Items', 'Total Sales Amount (LKR)'];
	const csvContent = [
		headers.join(','),
		...entries.map(entry => [
			formatDate(Number(entry.createdAtMs || Date.now())),
			`"${entry.userName || 'USER'}"`,
			entry.cashierAmount || 0,
			entry.totalBills || 0,
			entry.totalItems || 0,
			entry.totalSoldAmount || 0
		].join(','))
	].join('\n');
	
	// Create and download file
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.setAttribute('href', url);
	
	const now = new Date();
	const dateStr = now.toISOString().split('T')[0];
	link.setAttribute('download', `day_cash_entries_${dateStr}.csv`);
	
	link.style.visibility = 'hidden';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

async function handleExport() {
	try {
		const snap = await get(dayCashRef);
		if (!snap.exists()) {
			alert('No entries to export');
			return;
		}
		
		let entries = [];
		snap.forEach((child) => {
			const data = child.val() || {};
			entries.push({ id: child.key, ...data });
		});
		
		// Filter by selected date if any
		const dateFilter = document.getElementById('date-filter');
		const selectedDate = dateFilter.value;
		
		if (selectedDate) {
			const startMs = startOfDay(selectedDate).getTime();
			const endMs = endOfDay(selectedDate).getTime();
			entries = entries.filter(entry => {
				const createdAtMs = Number(entry.createdAtMs || 0);
				return createdAtMs >= startMs && createdAtMs <= endMs;
			});
		}
		
		if (entries.length === 0) {
			alert('No entries to export for the selected date');
			return;
		}
		
		// Sort by creation time (newest first)
		entries.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
		
		exportToExcel(entries);
		alert(`Exported ${entries.length} entries successfully!`);
		
	} catch (e) {
		console.error('Failed to export entries', e);
		alert('Failed to export entries');
	}
}

window.addEventListener('DOMContentLoaded', async () => {
	// Load all entries initially
	await loadEntries();
	
	// Set up date filter
	const dateFilter = document.getElementById('date-filter');
	dateFilter.addEventListener('change', async (e) => {
		const selectedDate = e.target.value;
		await loadEntries(selectedDate ? new Date(selectedDate) : null);
	});
	
	// Set up export button
	const exportBtn = document.getElementById('export-excel-btn');
	exportBtn.addEventListener('click', handleExport);
});
