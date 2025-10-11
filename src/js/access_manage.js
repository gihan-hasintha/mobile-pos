import { db } from "./firebase_config.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const usersCollection = collection(db, "users");

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

async function loadRecentUsers() {
  const list = document.getElementById("usersList");
  if (!list) return;
  list.innerHTML = "Loading...";

  try {
    const qUsers = query(usersCollection, orderBy("createdAt", "desc"), limit(20));
    const snap = await getDocs(qUsers);
    if (snap.empty) {
      list.textContent = "No users yet";
      return;
    }
    list.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data() || {};
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      const row = document.createElement("div");
      row.className = "expense-card";
      row.innerHTML = `
        <div class="expense-title">${escapeHtml(data.name || data.username || "Unnamed")}</div>
        <div class="expense-sub">Role: ${escapeHtml(data.role || "")} ${data.phone ? `| ${escapeHtml(data.phone)}` : ""}</div>
        ${createdAt ? `<div class="expense-time">${createdAt.toLocaleString()}</div>` : ""}
      `;
      list.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    list.textContent = "Error loading users";
  }
}

function wireToggles() {
  const toggle = document.getElementById("toggleAccessForms");
  const adminWrap = document.getElementById("admin-form-wrapper");
  const cashierWrap = document.getElementById("cashier-form-wrapper");
  if (toggle && adminWrap && cashierWrap) {
    try {
      const saved = localStorage.getItem("access.toggleAdmin");
      toggle.checked = saved === "1";
    } catch {}
    adminWrap.style.display = toggle.checked ? "block" : "none";
    toggle.addEventListener("change", () => {
      adminWrap.style.display = toggle.checked ? "block" : "none";
      try { localStorage.setItem("access.toggleAdmin", toggle.checked ? "1" : "0"); } catch {}
    });
  }
}

function setupForms() {
  const adminForm = document.getElementById("admin-form");
  const cashierForm = document.getElementById("cashier-form");

  if (adminForm) {
    adminForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (document.getElementById("admin-name").value || "").trim();
      const username = (document.getElementById("admin-username").value || "").trim();
      const pin = (document.getElementById("admin-pin").value || "").trim();
      const phone = (document.getElementById("admin-phone").value || "").trim();
      if (!name || !username || !pin) { alert("Please fill all required admin fields"); return; }
      try {
        await addDoc(usersCollection, {
          role: "admin",
          name,
          username,
          pin,
          phone: phone || null,
          createdAt: serverTimestamp(),
        });
        adminForm.reset();
        alert("Admin saved");
        await loadRecentUsers();
      } catch (err) {
        console.error(err);
        alert("Failed to save admin");
      }
    });
  }

  if (cashierForm) {
    cashierForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (document.getElementById("cashier-name").value || "").trim();
      const username = (document.getElementById("cashier-username").value || "").trim();
      const pin = (document.getElementById("cashier-pin").value || "").trim();
      const phone = (document.getElementById("cashier-phone").value || "").trim();
      if (!name || !username || !pin) { alert("Please fill all required cashier fields"); return; }
      try {
        await addDoc(usersCollection, {
          role: "cashier",
          name,
          username,
          pin,
          phone: phone || null,
          createdAt: serverTimestamp(),
        });
        cashierForm.reset();
        alert("Cashier saved");
        await loadRecentUsers();
      } catch (err) {
        console.error(err);
        alert("Failed to save cashier");
      }
    });
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  wireToggles();
  setupForms();
  await loadRecentUsers();
});


