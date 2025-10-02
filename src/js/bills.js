import { db, rtdb } from "./firebase_config.js";
import { collection, getDocs, getDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const billsCollection = collection(db, "bills");
const rtdbBillsRef = ref(rtdb, 'bills');

async function loadBills() {
  const container = document.getElementById("billsContainer");
  if (!container) return;
  container.innerHTML = "Loading...";

  try {
    // Load bills from both Realtime Database and Firestore
    const [rtdbBills, firestoreBills] = await Promise.all([
      loadBillsFromRTDB(),
      loadBillsFromFirestore()
    ]);

    // Combine and sort bills by creation date
    const allBills = [...rtdbBills, ...firestoreBills];
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

async function loadBillsFromFirestore() {
  try {
    const q = query(billsCollection, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    
    const bills = [];
    snap.forEach((d) => {
      const data = d.data();
      bills.push({
        id: d.id,
        source: 'firestore',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0,
        ...data
      });
    });
    return bills;
  } catch (error) {
    console.error("Error loading bills from Firestore:", error);
    return [];
  }
}

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
    } else {
      const billRef = doc(billsCollection, billId);
      const snap = await getDoc(billRef);
      if (!snap.exists()) {
        detail.textContent = "Bill not found";
        return;
      }
      data = snap.data();
    }

    const lines = Array.isArray(data.lines) ? data.lines : [];
    // Use formatted date if available (from RTDB), otherwise format timestamp or Firestore date
    let displayDate;
    if (source === 'rtdb' && data.createdAt) {
      displayDate = data.createdAt; // Already formatted
    } else if (source === 'firestore' && data.createdAt?.toDate) {
      displayDate = data.createdAt.toDate().toLocaleString();
    } else {
      displayDate = new Date(data.createdAtTimestamp || 0).toLocaleString();
    }
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
        <div>${createdAt.toLocaleString()}</div>
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


