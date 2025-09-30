// Items and Categories form logic
import { db } from "./firebase_config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const categoriesCollection = collection(db, "categories");
const itemsCollection = collection(db, "items");
const billsCollection = collection(db, "bills");

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
  const itemsQuery = query(itemsCollection, orderBy("name"));
  const snapshot = await getDocs(itemsQuery);
  cachedItems = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderItemsGrid();
}

function renderCategoryButtons() {
  const container = document.getElementById("category-buttons");
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

    const title = document.createElement("h3");
    title.textContent = item.name;

    const code = document.createElement("p");
    code.textContent = `Code: ${item.code}`;

    const price = document.createElement("p");
    if (typeof item.discountPrice === "number") {
      price.innerHTML = `<span style="text-decoration:line-through; opacity:.7;">$${Number(item.price).toFixed(2)}</span> <strong>$${Number(item.discountPrice).toFixed(2)}</strong>`;
    } else {
      price.textContent = `$${Number(item.price).toFixed(2)}`;
    }

    const stock = document.createElement("p");
    stock.textContent = `Stock: ${item.stock}`;

    card.appendChild(title);
    card.appendChild(code);
    card.appendChild(price);
    card.appendChild(stock);

    card.addEventListener("click", () => populatePurchaseForm(item));

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

  await addDoc(itemsCollection, item);
  const itemForm = document.getElementById("item-form");
  if (itemForm && typeof itemForm.reset === "function") itemForm.reset();
  alert("Item created");

  await loadItems();
}

async function handleCompleteBill() {
  const tableBody = document.getElementById("tableBody");
  const rows = tableBody ? Array.from(tableBody.querySelectorAll("tr")) : [];
  if (rows.length === 0) {
    alert("No items to bill.");
    return;
  }

  const grandTotalText = document.getElementById("grandTotal")?.textContent || "0";
  const itemCountText = document.getElementById("itemCount")?.textContent || "0";
  const grandTotal = Number(grandTotalText);
  const itemCount = Number(itemCountText);

  const lines = rows.map((row) => {
    const cells = row.querySelectorAll("td");
    return {
      itemId: cells[0].textContent,
      name: cells[1].textContent,
      quantity: Number(cells[2].textContent),
      salePrice: Number(cells[4].textContent),
      total: Number(cells[5].textContent)
    };
  });

  const now = new Date();
  const localDate = now.toLocaleDateString();
  const localTime = now.toLocaleTimeString();

  const bill = {
    grandTotal,
    itemCount,
    lines,
    createdAt: serverTimestamp(),
  };

  try {
    const ref = await addDoc(billsCollection, bill);
    alert(`Bill saved. ID: ${ref.id}`);
    // Clear table and summary
  } catch (err) {
    console.error(err);
    alert("Failed to save bill");
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
}

window.addEventListener("DOMContentLoaded", async () => {
  setupForms();
  await loadItems();
}); 