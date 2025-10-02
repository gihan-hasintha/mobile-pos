import { db } from "./firebase_config.js";
import { collection, getDocs, getDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const billsCollection = collection(db, "bills");

async function loadBills() {
  const container = document.getElementById("billsContainer");
  if (!container) return;
  container.innerHTML = "Loading...";

  const q = query(billsCollection, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  if (snap.empty) {
    container.innerHTML = "No bills";
    return;
  }

  container.innerHTML = "";
  snap.forEach((d) => {
    const data = d.data();
    const card = document.createElement("div");
    card.className = "bill-card";
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const billNumber = data.billNumber || d.id; // Use custom bill number or fallback to document ID
    card.innerHTML = `
      <div class="bill-card-title">Bill #${billNumber}</div>
      <div class="bill-card-sub">Items: ${Number(data.itemCount || 0)} | Total: ${Number(data.grandTotal || 0).toFixed(2)}</div>
      <div class="bill-card-time">${createdAt.toLocaleString()}</div>
      <div><button class="view-btn" data-id="${d.id}">View</button></div>
    `;
    container.appendChild(card);
  });

  container.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.classList.contains("view-btn")) {
      const id = target.getAttribute("data-id");
      if (id) await showBill(id);
    }
  });
}

async function showBill(billId) {
  const detail = document.getElementById("billDetail");
  if (!detail) return;
  detail.innerHTML = "Loading...";

  const billRef = doc(billsCollection, billId);
  const snap = await getDoc(billRef);
  if (!snap.exists()) {
    detail.textContent = "Bill not found";
    return;
  }

  const data = snap.data();
  const lines = Array.isArray(data.lines) ? data.lines : [];
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  const billNumber = data.billNumber || billId; // Use custom bill number or fallback to document ID

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
      <div>${createdAt.toLocaleString()}</div>
      <div>Items: ${Number(data.itemCount || 0)} | Grand Total: ${Number(data.grandTotal || 0).toFixed(2)}</div>
    </div>
    <div class="bill-lines">${itemsHtml}</div>
  `;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

window.addEventListener("DOMContentLoaded", () => {
  loadBills();
});


