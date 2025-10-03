import { db } from "./firebase_config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  updateDoc,
  runTransaction,
  increment
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const categoriesCollection = collection(db, "categories");
const itemsCollection = collection(db, "items");

let currentItemId = "";
let cachedItems = [];
let cachedCategories = [];
let activeCategoryId = "all";

async function loadCategoriesIntoSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select category";
  selectEl.appendChild(placeholder);

  const q = query(categoriesCollection, orderBy("name"));
  const snap = await getDocs(q);
  cachedCategories = [];
  snap.forEach((docSnap) => {
    const data = { id: docSnap.id, ...docSnap.data() };
    cachedCategories.push(data);
    const option = document.createElement("option");
    option.value = data.id;
    option.textContent = data.name;
    selectEl.appendChild(option);
  });
}

async function loadItems() {
  const q = query(itemsCollection, orderBy("name"));
  const snap = await getDocs(q);
  cachedItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCategoryButtons();
  renderItemsGrid();
}

function renderCategoryButtons() {
  const container = document.getElementById("manage-category-buttons");
  if (!container) return;
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.textContent = "All";
  allBtn.dataset.categoryId = "all";
  if (activeCategoryId === "all") allBtn.disabled = true;
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
    if (activeCategoryId === cat.id) btn.disabled = true;
    btn.addEventListener("click", () => {
      activeCategoryId = cat.id;
      renderCategoryButtons();
      renderItemsGrid();
    });
    container.appendChild(btn);
  });
}

function renderItemsGrid() {
  const grid = document.getElementById("manage-items-grid");
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

    const title = document.createElement("h3");
    title.textContent = item.name;

    const code = document.createElement("p");
    code.textContent = `Code: ${item.code}`;

    const price = document.createElement("p");
    if (typeof item.discountPrice === "number") {
      price.innerHTML = `<span style=\"text-decoration:line-through; opacity:.7;\">$${Number(item.price).toFixed(2)}</span> <strong>$${Number(item.discountPrice).toFixed(2)}</strong>`;
    } else {
      price.textContent = `$${Number(item.price).toFixed(2)}`;
    }

    const stock = document.createElement("p");
    stock.textContent = `Stock: ${item.stock}`;

    card.appendChild(title);
    card.appendChild(code);
    card.appendChild(price);
    card.appendChild(stock);

    const numericStock = Number(item.stock || 0);
    if (numericStock <= 0) {
      const notice = document.createElement("p");
      notice.textContent = "This item is out of stock";
      notice.style.color = "#b00020";
      notice.style.fontWeight = "bold";
      card.appendChild(notice);
      card.style.opacity = "0.6";
      card.title = "Out of stock";
    }

    card.addEventListener("click", () => selectItem(item.id));

    grid.appendChild(card);
  });
}

function fillItemForm(item) {
  const nameEl = document.getElementById("m-item-name");
  const codeEl = document.getElementById("m-item-code");
  const priceEl = document.getElementById("m-item-price");
  const discountEl = document.getElementById("m-item-discount");
  const buyingEl = document.getElementById("m-item-buying");
  const stockEl = document.getElementById("m-item-stock");
  const categoryEl = document.getElementById("m-item-category");

  if (nameEl) nameEl.value = item.name || "";
  if (codeEl) codeEl.value = item.code || "";
  if (priceEl) priceEl.value = (item.price ?? "").toString();
  if (discountEl) discountEl.value = (item.discountPrice ?? "").toString();
  if (buyingEl) buyingEl.value = (item.buyingPrice ?? "").toString();
  if (stockEl) stockEl.value = (item.stock ?? 0).toString();
  if (categoryEl) categoryEl.value = item.categoryId || "";
}

async function selectItem(id) {
  currentItemId = id;
  const snap = await getDoc(doc(itemsCollection, id));
  if (!snap.exists()) {
    alert("Selected item not found");
    return;
  }
  const item = { id: snap.id, ...snap.data() };
  fillItemForm(item);
  showDetailsPanel(item);
}

async function onSaveItemDetails(event) {
  event.preventDefault();
  if (!currentItemId) {
    alert("Please select an item first");
    return;
  }
  const name = document.getElementById("m-item-name").value.trim();
  const code = document.getElementById("m-item-code").value.trim();
  const priceStr = document.getElementById("m-item-price").value.trim();
  const discountStr = document.getElementById("m-item-discount").value.trim();
  const buyingStr = document.getElementById("m-item-buying").value.trim();
  const categoryId = document.getElementById("m-item-category").value;

  if (!name || !code || !priceStr || !categoryId) {
    alert("Please fill in required fields");
    return;
  }

  const price = Number(priceStr);
  if (Number.isNaN(price) || price < 0) {
    alert("Price must be a non-negative number");
    return;
  }

  let discountPrice = null;
  if (discountStr !== "") {
    discountPrice = Number(discountStr);
    if (Number.isNaN(discountPrice) || discountPrice < 0) {
      alert("Discount price must be a non-negative number");
      return;
    }
    if (discountPrice > price) {
      alert("Discount price cannot be greater than price");
      return;
    }
  }

  let buyingPrice = null;
  if (buyingStr !== "") {
    buyingPrice = Number(buyingStr);
    if (Number.isNaN(buyingPrice) || buyingPrice < 0) {
      alert("Buying price must be a non-negative number");
      return;
    }
  }

  const update = { name, code, price, categoryId };
  if (discountPrice !== null) update.discountPrice = discountPrice;
  else update.discountPrice = null;
  if (buyingPrice !== null) update.buyingPrice = buyingPrice;
  else update.buyingPrice = null;

  await updateDoc(doc(itemsCollection, currentItemId), update);
  alert("Item updated");
  await loadItems();
  await selectItem(currentItemId);
}

async function onAddStock(event) {
  event.preventDefault();
  if (!currentItemId) {
    alert("Please select an item first");
    return;
  }
  const amtStr = document.getElementById("add-stock-amount").value.trim();
  const amount = Number(amtStr);
  if (Number.isNaN(amount) || amount <= 0) {
    alert("Add Quantity must be a positive number");
    return;
  }
  await runTransaction(db, async (tx) => {
    const ref = doc(itemsCollection, currentItemId);
    tx.update(ref, { stock: increment(amount) });
  });
  alert("Stock added");
  await loadItems();
  await selectItem(currentItemId);
  document.getElementById("add-stock-form").reset();
}

function showDetailsPanel(item) {
  const details = document.getElementById("manage-details");
  const title = document.getElementById("manage-details-title");
  const summary = document.getElementById("manage-summary");
  const editForm = document.getElementById("manage-item-form");
  const addForm = document.getElementById("add-stock-form");

  if (details) details.style.display = "block";
  if (title) title.textContent = `Item Details - ${item.name}`;
  if (summary) {
    summary.innerHTML = `
      <div>Code: <strong>${item.code}</strong></div>
      <div>Price: <strong>$${Number(item.price).toFixed(2)}</strong></div>
      <div>Discount: <strong>${typeof item.discountPrice === "number" ? "$" + Number(item.discountPrice).toFixed(2) : "-"}</strong></div>
      <div>Stock: <strong>${item.stock}</strong></div>
    `;
  }
  if (editForm) editForm.style.display = "none";
  if (addForm) addForm.style.display = "none";
}

function toggleEditForm(show) {
  const editForm = document.getElementById("manage-item-form");
  if (editForm) editForm.style.display = show ? "block" : "none";
}

function toggleAddForm(show) {
  const addForm = document.getElementById("add-stock-form");
  if (addForm) addForm.style.display = show ? "block" : "none";
}

async function setup() {
  const itemForm = document.getElementById("manage-item-form");
  const addStockForm = document.getElementById("add-stock-form");
  const categorySelect = document.getElementById("m-item-category");
  const btnEdit = document.getElementById("btn-edit-details");
  const btnAdd = document.getElementById("btn-add-stock");
  const btnClear = document.getElementById("btn-clear-selection");

  await loadCategoriesIntoSelect(categorySelect);
  await loadItems();
  if (itemForm) itemForm.addEventListener("submit", onSaveItemDetails);
  if (addStockForm) addStockForm.addEventListener("submit", onAddStock);
  if (btnEdit) btnEdit.addEventListener("click", () => { toggleAddForm(false); toggleEditForm(true); });
  if (btnAdd) btnAdd.addEventListener("click", () => { toggleEditForm(false); toggleAddForm(true); });
  if (btnClear) btnClear.addEventListener("click", () => { currentItemId = ""; const details = document.getElementById("manage-details"); if (details) details.style.display = "none"; });
}

window.addEventListener("DOMContentLoaded", setup);


