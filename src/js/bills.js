import { rtdb } from "./firebase_config.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const rtdbBillsRef = ref(rtdb, 'bills');

async function loadBills() {
  const container = document.getElementById("billsContainer");
  if (!container) return;
  container.innerHTML = "Loading...";

  try {
    const rtdbBills = await loadBillsFromRTDB();
    const allBills = [...rtdbBills];
    allBills.sort((a, b) => {
      const dateA = a.createdAt || 0;
      const dateB = b.createdAt || 0;
      return dateB - dateA; // Newest first
    });

    if (allBills.length === 0) {
      container.innerHTML = "No bills";
      return;
    }

    container.innerHTML = "";
    allBills.forEach((billData) => {
      const card = document.createElement("div");
      card.className = "bill-card";
      // Use formatted date if available (from RTDB), otherwise format timestamp
      const displayDate = billData.createdAtFormatted || new Date(billData.createdAt).toLocaleString();
      const billNumber = billData.billNumber || billData.id;
      card.innerHTML = `
        <div class="bill-card-title">Bill #${billNumber}</div>
        <div class="bill-card-sub">Items: ${Number(billData.itemCount || 0)} | Total: ${Number(billData.grandTotal || 0).toFixed(2)}</div>
        <div class="bill-card-time">${displayDate}</div>
        <div><button class="view-btn" data-id="${billData.id}" data-source="${billData.source}">View</button></div>
      `;
      container.appendChild(card);
    });

    container.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.classList.contains("view-btn")) {
        const id = target.getAttribute("data-id");
        const source = target.getAttribute("data-source");
        if (id) await showBill(id, source);
      }
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
      bills.push({
        id: childSnapshot.key,
        source: 'rtdb',
        createdAt: data.createdAtTimestamp || 0,
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
  detail.innerHTML = "Loading...";

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
    const displayDate = data.createdAt ? data.createdAt : new Date(data.createdAtTimestamp || 0).toLocaleString();
    const billNumber = data.billNumber || billId;

    const itemsHtml = lines.map((l) => `
      <div class="bill-line">
        <div class="bill-line-title">${escapeHtml(l.name || l.itemId || "Item")}</div>
        <div class="bill-line-sub">QNT: ${Number(l.quantity || 0)} | Price: ${Number(l.salePrice || 0).toFixed(2)}</div>
        <div class="bill-line-total">Total: ${Number(l.total || (Number(l.quantity||0)*Number(l.salePrice||0))).toFixed(2)}</div>
      </div>
    `).join("");

    detail.innerHTML = `
      <div class="bill-detail-header">
        <div><strong>Bill #${billNumber}</strong></div>
        <div>${displayDate}</div>
        <div>Items: ${Number(data.itemCount || 0)} | Grand Total: ${Number(data.grandTotal || 0).toFixed(2)}</div>
      </div>
      <div class="bill-lines">${itemsHtml}</div>
    `;
  } catch (error) {
    console.error("Error loading bill:", error);
    detail.textContent = "Error loading bill";
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

window.addEventListener("DOMContentLoaded", () => {
  loadBills();
});


