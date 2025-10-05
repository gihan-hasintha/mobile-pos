// Items and Categories form logic
import { db, rtdb } from "./firebase_config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  doc,
  getDoc,
  runTransaction as runFsTransaction,
  increment
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import {
  ref,
  push,
  get,
  set,
  update,
  child,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const categoriesCollection = collection(db, "categories");
const itemsCollection = collection(db, "items");
const billsCollection = collection(db, "bills"); // Legacy (reading only if ever needed)
const customersCollection = collection(db, "customer");

// Realtime Database references
const rtdbBillsRef = ref(rtdb, 'bills');
const rtdbItemsRef = ref(rtdb, 'items');

let cachedCategories = [];
let cachedItems = [];
let activeCategoryId = "all";

async function loadCategoriesIntoSelect(selectElement) {
  if (!selectElement) return;
  selectElement.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Select category";
  selectElement.appendChild(placeholderOption);

  const categoriesQuery = query(categoriesCollection, orderBy("name"));
  const snapshot = await getDocs(categoriesQuery);
  cachedCategories = [];
  snapshot.forEach((docSnap) => {
    const data = { id: docSnap.id, ...docSnap.data() };
    cachedCategories.push(data);
    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = data.name;
    selectElement.appendChild(option);
  });

  renderCategoryButtons();
}

async function loadItems() {
  try {
    const snap = await get(rtdbItemsRef);
    if (!snap.exists()) {
      cachedItems = [];
      renderItemsGrid();
      return;
    }
    const items = [];
    snap.forEach((childSnap) => {
      const data = childSnap.val();
      items.push({ id: childSnap.key, ...data });
    });
    // Sort by name client-side
    items.sort((a, b) => String(a.name||'').localeCompare(String(b.name||'')));
    cachedItems = items;
    renderItemsGrid();
  } catch (err) {
    console.error('Failed to load items from RTDB:', err);
    cachedItems = [];
    renderItemsGrid();
  }
}

function renderCategoryButtons() {
  const container = document.getElementById("category-buttons");
  if (!container) return;
  container.innerHTML = "";
  container.className = "category-bar";

  const allBtn = document.createElement("button");
  allBtn.textContent = "All";
  allBtn.dataset.categoryId = "all";
  allBtn.className = "category-chip" + (activeCategoryId === "all" ? " active" : "");
  allBtn.addEventListener("click", () => {
    activeCategoryId = "all";
    renderCategoryButtons();
    renderItemsGrid();
  });
  container.appendChild(allBtn);

  cachedCategories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.textContent = cat.name;
    btn.dataset.categoryId = cat.id;
    btn.className = "category-chip" + (activeCategoryId === cat.id ? " active" : "");
    btn.addEventListener("click", () => {
      activeCategoryId = cat.id;
      renderCategoryButtons();
      renderItemsGrid();
    });
    container.appendChild(btn);
  });
}

function populatePurchaseForm(item) {
  const idEl = document.getElementById("forpurchesingitemid");
  const nameEl = document.getElementById("forpurchesingitemname");
  const qntEl = document.getElementById("forpurchesingitemqntload");
  const priceEl = document.getElementById("forpurchesingitempriceload");
  const discountEl = document.getElementById("forpurchesingitemdiscount");

  if (!idEl || !nameEl || !qntEl || !priceEl || !discountEl) return;

  idEl.value = item.id || "";
  nameEl.value = item.name || "";
  qntEl.value = qntEl.value || "1";
  priceEl.value = Number(item.price || 0).toString();
  if (typeof item.discountPrice === "number") {
    discountEl.value = Number(item.discountPrice).toString();
  } else {
    discountEl.value = "";
  }
}

function renderItemsGrid() {
  const grid = document.getElementById("items-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const itemsToShow = activeCategoryId === "all"
    ? cachedItems
    : cachedItems.filter((it) => it.categoryId === activeCategoryId);

  if (itemsToShow.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No items";
    grid.appendChild(empty);
    return;
  }

  itemsToShow.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-card";

    // Optional image support - expects item.imageUrl; if absent, show initials color block
    const media = document.createElement("div");
    media.className = "item-card-media";
    if (item.imageUrl) {
      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = item.name || "";
      media.appendChild(img);
    }

    const title = document.createElement("div");
    title.className = "item-card-title";
    title.textContent = item.name;

    const price = document.createElement("div");
    price.className = "item-card-price";
    if (typeof item.discountPrice === "number") {
      price.innerHTML = `PRICE : <span style=\"text-decoration:line-through; opacity:.7;display: none; color:#ffffffcc\">${Number(item.price).toFixed(2)}</span> <span>${Number(item.discountPrice).toFixed(2)}</span>`;
    } else {
      price.innerHTML = `PRICE : <span>${Number(item.price).toFixed(2)}</span>`;
    }

    const code = document.createElement("div");
    code.className = "item-card-code";
    code.textContent = `CODE : ${item.code}`;

    const stock = document.createElement("div");
    stock.style.display = "none";
    stock.className = "item-card-sub";
    stock.textContent = `STOCK : ${item.stock}`;

    if (media.childElementCount) card.appendChild(media);
    card.appendChild(title);
    card.appendChild(price);
    card.appendChild(code);
    card.appendChild(stock);

    const numericStock = Number(item.stock || 0);
    if (numericStock <= 0) {
      const notice = document.createElement("p");
      notice.textContent = "This item is out of stock";
      notice.style.color = "#b00020"; // red
      notice.style.fontWeight = "bold";
      card.appendChild(notice);
      card.style.opacity = "0.6";
      card.style.pointerEvents = "none"; // disable clicking
      card.title = "Out of stock";
    } else {
      card.addEventListener("click", () => {
        populatePurchaseForm(item);
        const billingWindow = document.getElementById("window-for-show-billing-form-page");
        if (billingWindow) billingWindow.style.display = "block";
      });
      card.style.cursor = "pointer";
    }

    grid.appendChild(card);
  });
}

async function handleCreateCategory(event) {
  event.preventDefault();
  const nameInput = document.getElementById("category-name");
  const name = nameInput && nameInput.value ? nameInput.value.trim() : "";
  if (!name) {
    alert("Category name is required");
    return;
  }
  await addDoc(categoriesCollection, { name });
  if (nameInput) nameInput.value = "";
  const categorySelect = document.getElementById("item-category");
  await loadCategoriesIntoSelect(categorySelect);
  alert("Category created");
}

async function handleCreateItem(event) {
  event.preventDefault();
  const nameEl = document.getElementById("item-name");
  const codeEl = document.getElementById("item-code");
  const priceEl = document.getElementById("item-price");
  const buyingEl = document.getElementById("item-buying-price");
  const discountEl = document.getElementById("item-discount-price");
  const stockEl = document.getElementById("item-stock");
  const categoryEl = document.getElementById("item-category");

  const name = nameEl && nameEl.value ? nameEl.value.trim() : "";
  const code = codeEl && codeEl.value ? codeEl.value.trim() : "";
  const priceStr = priceEl && priceEl.value ? priceEl.value.trim() : "";
  const buyingStr = buyingEl && buyingEl.value ? buyingEl.value.trim() : "";
  const discountStr = discountEl && discountEl.value ? discountEl.value.trim() : "";
  const stockStr = stockEl && stockEl.value ? stockEl.value.trim() : "";
  const categoryId = categoryEl && categoryEl.value ? categoryEl.value : "";

  if (!name || !code || !priceStr || !stockStr || !categoryId) {
    alert("Please fill in all required fields.");
    return;
  }

  const price = Number(priceStr);
  if (Number.isNaN(price)) {
    alert("Price must be a number.");
    return;
  }

  let buyingPrice = null;
  if (buyingStr !== "") {
    buyingPrice = Number(buyingStr);
    if (Number.isNaN(buyingPrice) || buyingPrice < 0) {
      alert("Buying price must be a non-negative number.");
      return;
    }
  }

  let discountPrice = null;
  if (discountStr !== "") {
    discountPrice = Number(discountStr);
    if (Number.isNaN(discountPrice)) {
      alert("Discount price must be a number.");
      return;
    }
    if (discountPrice > price) {
      alert("Discount price cannot be greater than price.");
      return;
    }
  }

  const stock = Number(stockStr);
  if (Number.isNaN(stock)) {
    alert("Stock must be a number.");
    return;
  }

  const item = {
    name,
    code,
    price,
    stock,
    categoryId,
    createdAt: Date.now()
  };
  if (buyingPrice !== null) item.buyingPrice = buyingPrice;
  if (discountPrice !== null) item.discountPrice = discountPrice;

  // Save item to Realtime Database
  await push(rtdbItemsRef, item);
  const itemForm = document.getElementById("item-form");
  if (itemForm && typeof itemForm.reset === "function") itemForm.reset();
  alert("Item created");

  await loadItems();
}

// Function to generate bill number without storing counters in DB
async function generateBillNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;
  const timestamp = Date.now().toString().slice(-6);
  return `${datePrefix}${timestamp}`;
}

async function handleCompleteBill() {
  const cartList = document.getElementById("cartList");
  const cards = cartList ? Array.from(cartList.querySelectorAll(".cart-card")) : [];
  if (cards.length === 0) {
    alert("No items to bill.");
    return;
  }

  const grandTotalText = document.getElementById("grandTotal")?.textContent || "0";
  const itemCountText = document.getElementById("itemCount")?.textContent || "0";
  const grandTotal = Number(grandTotalText);
  const itemCount = Number(itemCountText);

  const lines = cards.map((card) => {
    const itemId = card.dataset.itemId || "";
    const name = card.dataset.itemName || "";
    const quantity = Number(card.dataset.quantity || "0");
    const salePrice = Number(card.dataset.salePrice || card.dataset.price || "0");
    const total = Number(card.dataset.total || String(quantity * salePrice));
    return { itemId, name, quantity, salePrice, total };
  });

  // Combine quantities by item to ensure correct validation and atomic updates
  const quantityByItemId = lines.reduce((acc, line) => {
    const id = (line.itemId || "").trim();
    const qty = Number(line.quantity || 0);
    if (!id) return acc;
    acc[id] = (acc[id] || 0) + qty;
    return acc;
  }, {});

  const billNumber = await generateBillNumber();
  
  // Create formatted date string like "October 2, 2025 at 6:02:03 PM UTC+5:30"
  const now = new Date();
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  };
  const formattedDate = now.toLocaleString('en-US', options);

  const bill = {
    grandTotal,
    itemCount,
    lines,
    createdAt: formattedDate,
    billNumber,
  };

  try {
    // For each item, atomically check and decrement stock using RTDB transaction
    for (const [itemId, qty] of Object.entries(quantityByItemId)) {
      const stockRef = child(rtdbItemsRef, `${itemId}/stock`);
      await runTransaction(stockRef, (currentStock) => {
        const stockNum = Number(currentStock || 0);
        const decrementBy = Number(qty || 0);
        if (Number.isNaN(stockNum) || stockNum < decrementBy) {
          // Abort transaction by returning; we'll throw later
          return currentStock;
        }
        return stockNum - decrementBy;
      }, { applyLocally: false }).then((res) => {
        const stockNum = Number(res.snapshot.val());
        if (Number.isNaN(stockNum)) {
          throw new Error('Stock update failed');
        }
      });
      // After transaction, verify not negative
      const postSnap = await get(child(rtdbItemsRef, `${itemId}/stock`));
      const postStock = Number(postSnap.val() || 0);
      if (postStock < 0) {
        throw new Error(`Insufficient stock for ${itemId}`);
      }
    }

    // Save bill to Realtime Database
    const billRef = await push(rtdbBillsRef, bill);
    const finalResult = { billId: billRef.key, billNumber };

    alert(`Bill #${finalResult.billNumber} saved and stock updated.`);

    // Update cached stock for offline accuracy
    if (window.updateCachedStock) {
      for (const [itemId, qty] of Object.entries(quantityByItemId)) {
        window.updateCachedStock(itemId, qty);
      }
    }


    // Reload items to reflect new stock values
    await loadItems();
  } catch (err) {
    console.error(err);
    alert(err && err.message ? err.message : "Failed to save bill");
  }
}

function setupForms() {
  const categoryForm = document.getElementById("category-form");
  const itemForm = document.getElementById("item-form");
  const categorySelect = document.getElementById("item-category");

  if (categoryForm) categoryForm.addEventListener("submit", handleCreateCategory);
  if (itemForm) itemForm.addEventListener("submit", handleCreateItem);
  loadCategoriesIntoSelect(categorySelect);

  const completeBtn = document.getElementById("completeBill");
  if (completeBtn) completeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleCompleteBill();
  });

  // Customer form handler
  const customerForm = document.getElementById("customer-form");
  if (customerForm) {
    customerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameEl = document.getElementById("customerName");
      const phoneEl = document.getElementById("customerPhone");
      const name = nameEl && nameEl.value ? nameEl.value.trim() : "";
      const phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";

      if (!name) {
        alert("Customer name is required");
        return;
      }

      try {
        await addDoc(customersCollection, {
          name,
          phone: phone || null,
          createdAt: serverTimestamp(),
        });
        if (customerForm && typeof customerForm.reset === "function") customerForm.reset();
        alert("Customer saved");
      } catch (err) {
        console.error(err);
        alert("Failed to save customer");
      }
    });
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  setupForms();
  await loadItems();
}); 