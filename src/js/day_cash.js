import { rtdb, db } from "./firebase_config.js";
import { ref, get, push, set, query, orderByChild, startAt, endAt } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const billsRef = ref(rtdb, 'bills');
const dayCashRef = ref(rtdb, 'dayCashEntries');

function startOfDay(date) {
	const dt = new Date(date);
	dt.setHours(0, 0, 0, 0);
	return dt;
}

function parseCreatedAtToMs(createdAtStr) {
	if (typeof createdAtStr !== 'string') return 0;
	const normalized = createdAtStr.replace(' at ', ' ');
	const t = Date.parse(normalized);
	return Number.isFinite(t) ? t : 0;
}

async function loadTodayBillsSummary() {
	try {
		const snap = await get(billsRef);
		if (!snap.exists()) return { totalBills: 0, totalItems: 0, totalAmount: 0 };
		const now = new Date();
		const startMs = startOfDay(now).getTime();
		const endMs = now.getTime();
		let totalBills = 0;
		let totalItems = 0;
		let totalAmount = 0;
		snap.forEach((child) => {
			const data = child.val();
			const createdAtMs = typeof data.createdAtTimestamp === 'number' ? data.createdAtTimestamp : (typeof data.createdAt === 'string' ? parseCreatedAtToMs(data.createdAt) : 0);
			if (createdAtMs >= startMs && createdAtMs <= endMs) {
				totalBills += 1;
				totalItems += Number(data.itemCount || 0);
				totalAmount += Number(data.grandTotal || 0);
			}
		});
		return { totalBills, totalItems, totalAmount };
	} catch (e) {
		console.error('Failed to load bills', e);
		return { totalBills: 0, totalItems: 0, totalAmount: 0 };
	}
}

async function loadTodayEntriesTotal() {
	try {
		const snap = await get(dayCashRef);
		if (!snap.exists()) return 0;
		const now = new Date();
		const startMs = startOfDay(now).getTime();
		const endMs = now.getTime();
		let totalEntries = 0;
		snap.forEach((child) => {
			const data = child.val() || {};
			const createdAtMs = Number(data.createdAtMs || 0);
			if (createdAtMs >= startMs && createdAtMs <= endMs) {
				totalEntries += Number(data.cashierAmount || 0);
			}
		});
		return totalEntries;
	} catch (e) {
		console.error('Failed to load entries total', e);
		return 0;
	}
}

function formatNumberWithCommas(value, fractionDigits = 2) {
	return Number(value).toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

async function renderSummary() {
	const { totalBills, totalItems, totalAmount } = await loadTodayBillsSummary();
	const totalEntries = await loadTodayEntriesTotal();
	const amountToSave = totalEntries - totalAmount;
	
	const billsEl = document.getElementById('summary-total-bills');
	const itemsEl = document.getElementById('summary-items-count');
	const amountEl = document.getElementById('summary-bills-amount');
	const entriesTotalEl = document.getElementById('summary-entries-total');
	const amountToSaveEl = document.getElementById('summary-amount-to-save');
	
	if (billsEl) billsEl.textContent = String(totalBills);
	if (itemsEl) itemsEl.textContent = String(totalItems);
	if (amountEl) amountEl.textContent = formatNumberWithCommas(totalAmount);
	if (entriesTotalEl) entriesTotalEl.textContent = formatNumberWithCommas(totalEntries);
	if (amountToSaveEl) amountToSaveEl.textContent = formatNumberWithCommas(amountToSave);
	
	return { totalBills, totalItems, totalAmount, totalEntries, amountToSave };
}

function renderEntryRow(entry, container) {
	const row = document.createElement('div');
	row.className = 'expense-card';
	const dt = new Date(Number(entry.createdAtMs || Date.now())).toLocaleString();
	row.innerHTML = `
		<div class="expense-title">${entry.userName ? String(entry.userName) : 'USER'} — LKR ${formatNumberWithCommas(entry.cashierAmount || 0)}</div>
		<div class="expense-sub">Bills: ${Number(entry.totalBills || 0)} | Items: ${Number(entry.totalItems || 0)} | Sold Amount: LKR ${formatNumberWithCommas(entry.totalSoldAmount || 0)}</div>
		<div class="expense-time">${dt}</div>
	`;
	container.appendChild(row);
}

async function loadTodayEntries() {
	const list = document.getElementById('dayCashList');
	if (!list) return;
	list.innerHTML = 'Loading...';
	try {
		const snap = await get(dayCashRef);
		if (!snap.exists()) { list.textContent = 'No entries'; return; }
		const now = new Date();
		const startMs = startOfDay(now).getTime();
		const endMs = now.getTime();
		const rows = [];
		snap.forEach((child) => {
			const data = child.val() || {};
			const createdAtMs = Number(data.createdAtMs || 0);
			if (createdAtMs >= startMs && createdAtMs <= endMs) {
				rows.push({ id: child.key, ...data });
			}
		});
		rows.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
		list.innerHTML = '';
		rows.forEach((r) => renderEntryRow(r, list));
		
		// Refresh summary after loading entries
		await renderSummary();
	} catch (e) {
		console.error('Failed to load entries', e);
		list.textContent = 'Error loading entries';
	}
}

async function handleSubmit(e) {
	e.preventDefault();
	const nameEl = document.getElementById('logged-user-name');
	const amountEl = document.getElementById('cashier-amount');
	const userName = (nameEl && nameEl.value || '').trim();
	const cashierAmount = Number(amountEl && amountEl.value || 0);
	if (!userName) { alert('Please enter logged user name'); return; }
	if (!Number.isFinite(cashierAmount) || cashierAmount < 0) { alert('Please enter valid amount'); return; }
	const summary = await renderSummary();
	try {
		const newRef = push(dayCashRef);
		const payload = {
			userName,
			cashierAmount,
			totalBills: summary.totalBills,
			totalItems: summary.totalItems,
			totalSoldAmount: summary.totalAmount,
			createdAtMs: Date.now()
		};
		await set(newRef, payload);
		if (amountEl) amountEl.value = '';
		alert('Saved');
		await loadTodayEntries();
	} catch (e) {
		console.error('Failed to save day cash', e);
		alert('Failed to save');
	}
}

// Function to get logged user from session storage
function getLoggedUser() {
	try {
		const sessionUser = sessionStorage.getItem('sessionUser');
		if (sessionUser) {
			return JSON.parse(sessionUser);
		}
	} catch (error) {
		console.error('Error getting session user:', error);
	}
	return null;
}

// Function to populate logged user name
function populateLoggedUserName() {
	const loggedUser = getLoggedUser();
	const nameInput = document.getElementById('logged-user-name');
	
	if (loggedUser && nameInput) {
		// Use the name field, fallback to username if name is not available
		const userName = loggedUser.name || loggedUser.username || '';
		nameInput.value = userName;
	}
}

window.addEventListener('DOMContentLoaded', async () => {
	await renderSummary();
	await loadTodayEntries();
	
	// Populate logged user name from session storage
	populateLoggedUserName();
	
	const form = document.getElementById('day-cash-form');
	if (form) form.addEventListener('submit', handleSubmit);
});


