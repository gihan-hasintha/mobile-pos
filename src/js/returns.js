import { rtdb } from "./firebase_config.js";
import { ref, get, child, query, orderByChild, equalTo, update, push } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const billsRef = ref(rtdb, 'bills');
const itemsRef = ref(rtdb, 'items');
const returnsRef = ref(rtdb, 'returns');

let loadedBill = null; // { id, billNumber, lines: [...] }

function escapeHtml(text) {
	return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function renderBillInfo(bill) {
	const info = document.getElementById('returnBillInfo');
	if (!info) return;
	if (!bill) {
		info.innerHTML = '';
		return;
	}
	const displayDate = bill.createdAt || new Date(Number(bill.createdAtTimestamp||bill.createdAtMs||0)).toLocaleString();
	const billNumber = bill.billNumber || bill.id;
	info.innerHTML = `
		<div class="bill-detail-header">
			<div class="bill-detail-header-title"><strong>Bill #${escapeHtml(String(billNumber))}</strong></div>
			<div style="font-size: 13px;">${escapeHtml(String(displayDate))}</div>
			<div>Items: ${Number(bill.itemCount||0)} | Grand Total: ${Number(bill.grandTotal||0).toFixed(2)}</div>
		</div>
	`;
}

function renderReturnLines(bill) {
    const container = document.getElementById('returnItemsContainer');
    const actions = document.getElementById('returnActions');
    if (!container || !actions) return;
    container.innerHTML = '';
    const isArray = Array.isArray(bill && bill.lines);
    const entries = bill && bill.lines ? (isArray
        ? bill.lines.map((v, i) => [String(i), v])
        : Object.entries(bill.lines)) : [];
    if (!bill || entries.length === 0) {
        container.innerHTML = 'No items on this bill';
        actions.style.display = 'none';
        return;
    }
    let anyReturnable = false;
    entries.forEach(([key, line]) => {
        const originalQty = Number(line.quantity||0);
        const alreadyReturned = Number(line.returnedQty||0);
        const maxReturnable = Math.max(0, originalQty - alreadyReturned);
        if (maxReturnable > 0) anyReturnable = true;

        const card = document.createElement('div');
        card.className = 'bill-card';
        card.dataset.key = String(key);
        card.innerHTML = `
            <div class="bill-card-title">${escapeHtml(String(line.name||line.itemId||'Item'))}</div>
            <div class="bill-card-sub">QNT: ${originalQty} | Price: ${Number(line.salePrice||line.price||0).toFixed(2)} ${alreadyReturned>0?`| Returned: ${alreadyReturned}`:''}</div>
            <div class="bill-card-total">
                ${maxReturnable === 0
                    ? '<span style="opacity:.7;">Fully returned</span>'
                    : `Return Qnt: <input type="number" min="0" max="${maxReturnable}" step="1" value="0" class="return-input" style="width:90px;"> / ${maxReturnable}`}
            </div>
        `;
        container.appendChild(card);
    });
    actions.style.display = anyReturnable ? 'block' : 'none';
}

async function loadBillByNumber(billNumber) {
    const normalized = String(billNumber || '').trim();
    // Try to find by billNumber field via query
    try {
        const q = query(billsRef, orderByChild('billNumber'), equalTo(normalized));
        const snap = await get(q);
        if (snap.exists()) {
            let foundId = null; let data = null;
            snap.forEach((childSnap) => {
                if (!foundId) { foundId = childSnap.key; data = childSnap.val(); }
            });
            return { id: foundId, ...data };
        }
    } catch {}
    // Fallback: some RTDBs store billNumber as number or lack index → scan
    try {
        const allSnap = await get(billsRef);
        if (allSnap.exists()) {
            let found = null;
            allSnap.forEach((cs) => {
                if (found) return;
                const val = cs.val() || {};
                const numAsStr = String(val.billNumber ?? '').trim();
                if (numAsStr && numAsStr === normalized) {
                    found = { id: cs.key, ...val };
                }
            });
            if (found) return found;
        }
    } catch {}
    // fallback: try direct child id (if user pasted RTDB key)
    const direct = await get(child(billsRef, normalized));
    if (direct.exists()) {
        return { id: normalized, ...direct.val() };
    }
    return null;
}

async function processReturn() {
	const status = document.getElementById('returnStatus');
	status.textContent = '';
	if (!loadedBill) { status.textContent = 'No bill loaded'; return; }
	const container = document.getElementById('returnItemsContainer');
    const inputs = container.querySelectorAll('.return-input');
	const operations = [];
	const returnLines = [];

    inputs.forEach((inputEl) => {
        const card = inputEl.closest('.bill-card');
        if (!card) return;
        const key = card.dataset.key || '0';
        const toReturn = Number(inputEl.value || 0);
        if (!Number.isFinite(toReturn) || toReturn <= 0) return;
        const isArray = Array.isArray(loadedBill.lines);
        const line = isArray ? loadedBill.lines[Number(key)] : (loadedBill.lines && loadedBill.lines[key]);
        if (!line) return;
        const originalQty = Number(line.quantity||0);
        const alreadyReturned = Number(line.returnedQty||0);
        const maxReturnable = Math.max(0, originalQty - alreadyReturned);
        if (toReturn > maxReturnable) return;
        returnLines.push({
            lineKey: key,
            itemId: line.itemId || '',
            name: line.name || '',
            quantity: toReturn,
            price: Number(line.salePrice||line.price||0)
        });
    });

	if (returnLines.length === 0) { status.textContent = 'Nothing to return'; return; }

	try {
		// Build a multi-location update for atomicity where possible
		const updates = {};
		// Update each item stock: add returned quantity back
		for (const rl of returnLines) {
			if (!rl.itemId) continue;
			const itemSnap = await get(child(itemsRef, rl.itemId));
			const current = itemSnap.exists() ? (itemSnap.val() || {}) : {};
			const newStock = Math.max(0, Number(current.stock||0) + Number(rl.quantity||0));
			updates[`items/${rl.itemId}/stock`] = newStock;
		}
        // Mark returnedQty on bill lines
        const isArray = Array.isArray(loadedBill.lines);
        const asEntries = isArray ? loadedBill.lines.map((v,i)=>[String(i),v]) : Object.entries(loadedBill.lines||{});
        asEntries.forEach(([k, line]) => {
            const ret = returnLines.find(r => r.lineKey === k);
            if (ret) {
                const already = Number(line.returnedQty||0);
                const path = isArray ? `bills/${loadedBill.id}/lines/${k}/returnedQty` : `bills/${loadedBill.id}/lines/${k}/returnedQty`;
                updates[path] = already + Number(ret.quantity||0);
            }
        });
		// Create a return record
		const returnEntryKey = push(returnsRef).key;
		const now = Date.now();
		updates[`returns/${returnEntryKey}`] = {
			billId: loadedBill.id,
			billNumber: loadedBill.billNumber || loadedBill.id,
			createdAtTimestamp: now,
			createdAt: new Date(now).toLocaleString(),
			lines: returnLines,
			refundedAmount: returnLines.reduce((sum, l) => sum + Number(l.quantity||0)*Number(l.price||0), 0)
		};

		await update(ref(rtdb), updates);
		status.style.color = '#28a745';
		status.textContent = 'Return processed successfully';
		// Reload bill to reflect returned quantities
		const bill = await get(child(billsRef, loadedBill.id));
		loadedBill = bill.exists() ? { id: loadedBill.id, ...bill.val() } : loadedBill;
		renderReturnLines(loadedBill);
		renderBillInfo(loadedBill);
	} catch (error) {
		console.error('Error processing return:', error);
		status.style.color = '#dc3545';
		status.textContent = 'Error processing return';
	}
}

window.addEventListener('DOMContentLoaded', () => {
	const input = document.getElementById('returnBillInput');
	const btn = document.getElementById('loadBillForReturnBtn');
	const processBtn = document.getElementById('processReturnBtn');
	const status = document.getElementById('returnStatus');

	async function loadHandler() {
		status.textContent = '';
		const billNo = String((input && input.value) || '').trim();
		if (!billNo) { status.textContent = 'Enter bill number'; return; }
		const result = await loadBillByNumber(billNo);
		if (!result) { status.textContent = 'Bill not found'; renderBillInfo(null); document.getElementById('returnItemsContainer').innerHTML=''; document.getElementById('returnActions').style.display='none'; return; }
		loadedBill = result;
		renderBillInfo(loadedBill);
		renderReturnLines(loadedBill);
	}

	if (btn) btn.addEventListener('click', loadHandler);
	if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadHandler(); } });
	if (processBtn) processBtn.addEventListener('click', processReturn);
});


