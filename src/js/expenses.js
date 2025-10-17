import { db } from "./firebase_config.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const expensesCollection = collection(db, "expenses");

async function loadRecentExpenses() {
  const list = document.getElementById("expensesList");
  if (!list) return;
  list.innerHTML = "Loading...";

  const q = query(expensesCollection, orderBy("createdAt", "desc"), limit(20));
  const snap = await getDocs(q);
  if (snap.empty) {
    list.textContent = "No expenses yet";
    return;
  }
  list.innerHTML = "";
  snap.forEach((d) => {
    const data = d.data();
    const card = document.createElement("div");
    card.className = "expense-card";
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    card.innerHTML = `
      <div class="expense-title">${escapeHtml(data.title || "Untitled")}</div>
      <div class="expense-sub">Amount: ${formatAmount(data.amount)}${data.category ? ` | ${escapeHtml(data.category)}` : ""}</div>
      <div class="expense-time">${createdAt.toLocaleString()}</div>
      ${data.notes ? `<div class=\"expense-notes\">${escapeHtml(data.notes)}</div>` : ""}
    `;
    list.appendChild(card);
  });
}

function setupForm() {
  const form = document.getElementById("expense-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = (document.getElementById("expense-title").value || "").trim();
    const amountStr = (document.getElementById("expense-amount").value || "").trim();
    const category = (document.getElementById("expense-category").value || "").trim();
    const notes = (document.getElementById("expense-notes").value || "").trim();

    if (!title) { alert("Title is required"); return; }
    const amount = Number(amountStr);
    if (Number.isNaN(amount) || amount < 0) { alert("Amount must be a non-negative number"); return; }

    try {
      await addDoc(expensesCollection, {
        title,
        amount,
        category: category || null,
        notes: notes || null,
        createdAt: serverTimestamp(),
      });
      form.reset();
      alert("Expense saved");
      await loadRecentExpenses();
    } catch (err) {
      console.error(err);
      alert("Failed to save expense");
    }
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function formatAmount(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

window.addEventListener("DOMContentLoaded", async () => {
  setupForm();
  await loadRecentExpenses();
});


