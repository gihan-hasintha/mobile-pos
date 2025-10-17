// Stock Management functionality
import { db, rtdb } from "./firebase_config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import {
  ref,
  get,
  update,
  remove,
  child
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const categoriesCollection = collection(db, "categories");
const usersCollection = collection(db, "users");
const itemHistoryCollection = collection(db, "itemHistory");
const rtdbItemsRef = ref(rtdb, 'items');
const rtdbBillsRef = ref(rtdb, 'bills');

let cachedCategories = [];
let cachedItems = [];
let currentEditingItem = null;
let cachedAdmins = [];

// Format a date-like value into YYYY/MM/DD
function formatDateYMD(dateLike) {
  try {
    if (!dateLike) return '';
    let d;
    if (dateLike instanceof Date) {
      d = dateLike;
    } else if (typeof dateLike === 'number') {
      // Assume milliseconds since epoch
      d = new Date(dateLike);
    } else if (typeof dateLike === 'string') {
      // Try to parse common formats
      const num = Number(dateLike);
      if (!Number.isNaN(num) && dateLike.trim() !== '') {
        d = new Date(num);
      } else {
        d = new Date(dateLike);
      }
    } else {
      d = new Date(dateLike);
    }
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  } catch (_) {
    return '';
  }
}

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Save XLSX workbook to device (Capacitor native) or trigger browser download (web)
async function saveWorkbook(wb, filename) {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
    const isNative = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();

    if (isNative) {
      // Write as base64 to Documents/ImaPOS
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const directoryPath = 'ImaPOS';
      const Filesystem = cap.Plugins?.Filesystem || (window.Capacitor?.Filesystem);
      const Directory = (cap?.Filesystem && cap?.Filesystem?.Directory) || { Documents: 'DOCUMENTS' };

      if (Filesystem && typeof Filesystem.requestPermissions === 'function') {
        try { await Filesystem.requestPermissions(); } catch (_) {}
      }

      await Filesystem.writeFile({
        path: `${directoryPath}/${filename}`,
        data: base64,
        directory: Directory.Documents || 'DOCUMENTS',
        recursive: true
      });

      alert(`Saved to Documents/${directoryPath}/${filename}`);
      return;
    }

    // Web fallback: download via Blob
    const arrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Save workbook failed', err);
    throw err;
  }
}

// Initialize the page
window.addEventListener("DOMContentLoaded", async () => {
  await loadCategories();
  await loadItems();
  await loadAdmins();
  setupEventListeners();
});

// Load categories for dropdowns
async function loadCategories() {
  try {
    const categoriesQuery = query(categoriesCollection, orderBy("name"));
    const snapshot = await getDocs(categoriesQuery);
    cachedCategories = [];
    snapshot.forEach((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() };
      cachedCategories.push(data);
    });
    
    // Populate category filter dropdown
    const categoryFilter = document.getElementById("category-filter");
    if (categoryFilter) {
      categoryFilter.innerHTML = '<option value="all">All Categories</option>';
      cachedCategories.forEach(category => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        categoryFilter.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Failed to load categories", err);
  }
}

// Load admins for delete authorization
async function loadAdmins() {
  try {
    const adminsQuery = query(usersCollection, where("role", "==", "admin"));
    const snapshot = await getDocs(adminsQuery);
    cachedAdmins = [];
    snapshot.forEach((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() };
      cachedAdmins.push(data);
    });

    const adminSelect = document.getElementById("admin-select");
    if (adminSelect) {
      adminSelect.innerHTML = '<option value="">Select admin</option>';
      cachedAdmins.forEach((admin) => {
        const option = document.createElement("option");
        option.value = admin.id;
        option.textContent = admin.name || admin.username || admin.phone || admin.id;
        adminSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Failed to load admins", err);
  }
}

// Load items from Firebase
async function loadItems() {
  try {
    const snap = await get(rtdbItemsRef);
    if (!snap.exists()) {
      cachedItems = [];
      renderItemsGrid();
      updateStatsFromItems();
      return;
    }
    
    const items = [];
    snap.forEach((childSnap) => {
      const data = childSnap.val();
      items.push({ id: childSnap.key, ...data });
    });
    
    // Sort by name
    items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    cachedItems = items;
    renderItemsGrid();
    updateStatsFromItems();
  } catch (err) {
    console.error('Failed to load items from RTDB:', err);
    cachedItems = [];
    renderItemsGrid();
    updateStatsFromItems();
  }
}

// Update header stats using cached items
function updateStatsFromItems() {
  try {
    const totalItemsEl = document.getElementById("total-items-count");
    const totalStockEl = document.getElementById("total-stock-count");
    const stockValueEl = document.getElementById("stock-value-amount");
    const lowStockEl = document.getElementById("low-stock-count");

    if (!totalItemsEl && !totalStockEl && !stockValueEl && !lowStockEl) return;

    const items = Array.isArray(cachedItems) ? cachedItems : [];
    const totalItems = items.length;
    let totalStock = 0;
    let totalValue = 0;
    let lowStockCount = 0;

    for (const item of items) {
      const stock = Number(item.stock || 0);
      // Value should be computed using buying price (cost). Fallback to selling price only if buying price is missing.
      const costPerUnit = (item.buyingPrice != null && item.buyingPrice !== "")
        ? Number(item.buyingPrice)
        : Number(item.price || item.discountPrice || 0);
      totalStock += stock;
      totalValue += stock * (Number.isFinite(costPerUnit) ? costPerUnit : 0);
      if (stock > 0 && stock <= 10) lowStockCount += 1;
    }

    if (totalItemsEl) totalItemsEl.textContent = String(totalItems);
    if (totalStockEl) totalStockEl.textContent = String(totalStock);
    if (stockValueEl) stockValueEl.textContent = formatCurrency(totalValue);
    if (lowStockEl) lowStockEl.textContent = String(lowStockCount);
  } catch (err) {
    console.error('Failed to update stats', err);
  }
}

// Compute filtered items based on search and dropdown filters
function getFilteredItems() {
  let itemsToShow = [...cachedItems];
  const searchTerm = document.getElementById("stock-search")?.value?.toLowerCase() || "";
  if (searchTerm) {
    itemsToShow = itemsToShow.filter(item =>
      item.name?.toLowerCase().includes(searchTerm) ||
      item.code?.toLowerCase().includes(searchTerm)
    );
  }
  const categoryFilter = document.getElementById("category-filter")?.value;
  if (categoryFilter && categoryFilter !== "all") {
    itemsToShow = itemsToShow.filter(item => item.categoryId === categoryFilter);
  }
  const stockFilter = document.getElementById("stock-filter")?.value;
  if (stockFilter && stockFilter !== "all") {
    switch (stockFilter) {
      case "in-stock":
        itemsToShow = itemsToShow.filter(item => Number(item.stock || 0) > 10);
        break;
      case "low-stock":
        itemsToShow = itemsToShow.filter(item => {
          const stock = Number(item.stock || 0);
          return stock > 0 && stock <= 10;
        });
        break;
      case "out-of-stock":
        itemsToShow = itemsToShow.filter(item => Number(item.stock || 0) <= 0);
        break;
    }
  }
  return itemsToShow;
}

// Render items grid with stock information
function renderItemsGrid() {
  const grid = document.getElementById("stock-items-grid");
  if (!grid) return;
  
  grid.innerHTML = "";
  
  const itemsToShow = getFilteredItems();
  
  if (itemsToShow.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon">📦</div>
      <h3>No items found</h3>
      <p>Try adjusting your search or filter criteria</p>
    `;
    grid.appendChild(empty);
    return;
  }
  
  itemsToShow.forEach((item) => {
    const card = document.createElement("div");
    card.className = "stock-item-card clickable-item";
    
    const stock = Number(item.stock || 0);
    const category = cachedCategories.find(cat => cat.id === item.categoryId);
    
    // Stock status indicator
    let stockStatus = "in-stock";
    let stockStatusText = "In Stock";
    if (stock <= 0) {
      stockStatus = "out-of-stock";
      stockStatusText = "Out of Stock";
    } else if (stock <= 10) {
      stockStatus = "low-stock";
      stockStatusText = "Low Stock";
    }
    
    card.innerHTML = `
      <div class="stock-item-header">
        <div class="stock-item-name">${item.name || "Untitled"}</div>
        <div class="stock-status-of-item-in-stock-manage ${stockStatus}">${stockStatusText}</div>
      </div>
      
      <div class="stock-item-details">
        <div class="stock-item-code">${item.code || "N/A"}</div>
        <div class="stock-item-category">Category: ${category?.name || "Uncategorized"}</div>
        <div class="stock-item-price">
          Rs ${formatCurrency(item.price || 0)}
          ${item.discountPrice ? `<span class="discount-price" style="display: none;">Rs ${formatCurrency(item.discountPrice)}</span>` : ''}
        </div>
        <div class="stock-item-buying-price">
          ${item.buyingPrice ? `Buying Price: Rs ${formatCurrency(item.buyingPrice)}` : 'Buying Price: Not set'}
        </div>
        <div class="stock-item-quantity">Current Stock: <strong>${stock}</strong></div>
      </div>
    `;
    
    // Add click handler for the card - open edit modal with selling details
    card.addEventListener("click", (e) => {
      showItemDetails(item.id);      addItemToSelection(item);
      
      // Add visual feedback
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.style.transform = 'scale(1)';
      }, 150);
    });
    
    grid.appendChild(card);
  });
}

// Export current filtered stock list to Excel
async function exportStockToExcel() {
  try {
    const rows = getFilteredItems().map(item => {
      const stock = Number(item.stock || 0);
      const category = cachedCategories.find(cat => cat.id === item.categoryId);
      let stockStatus = "In Stock";
      if (stock <= 0) stockStatus = "Out of Stock";
      else if (stock <= 10) stockStatus = "Low Stock";
      return {
        Name: item.name || "Untitled",
        Code: item.code || "N/A",
        Category: category?.name || "Uncategorized",
        "Buying Price": item.buyingPrice != null ? Number(item.buyingPrice) : "",
        "Selling Price": item.price != null ? Number(item.price) : "",
        "Discount Price": item.discountPrice != null ? Number(item.discountPrice) : "",
        Stock: stock,
        "Stock Status": stockStatus
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const filename = `Stock_Report_${y}-${m}-${d}.xlsx`;
    await saveWorkbook(wb, filename);
  } catch (err) {
    console.error('Export failed', err);
    alert('Failed to export. Please try again.');
  }
}

// Export only item names and codes to Excel
async function exportNamesCodesToExcel() {
  try {
    const rows = getFilteredItems().map(item => ({
      Name: item.name || "Untitled",
      Code: item.code || "N/A"
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const filename = `Items_Names_Codes_${y}-${m}-${d}.xlsx`;
    await saveWorkbook(wb, filename);
  } catch (err) {
    console.error('Export failed', err);
    alert('Failed to export names and codes. Please try again.');
  }
}

document.getElementById("item-clicked-to-show-details-of-selling-window").style.display = "none";

// Add item to selection - populate edit form with item details
function addItemToSelection(item) {
  // Set the current editing item
  currentEditingItem = item;
  
  // Populate the edit form with item data
  document.getElementById("edit-item-id").value = item.id;
  document.getElementById("edit-item-name").value = item.name || "";
  document.getElementById("edit-item-code").value = item.code || "";
  document.getElementById("edit-item-buying-price").value = item.buyingPrice || "";
  document.getElementById("edit-item-price").value = item.price || "";
  document.getElementById("edit-item-discount-price").value = item.discountPrice || "";
  document.getElementById("edit-item-stock").value = item.stock || "";
  
  // Populate category dropdown
  const categorySelect = document.getElementById("edit-item-category");
  categorySelect.innerHTML = '<option value="">Select Category</option>';
  cachedCategories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    if (category.id === item.categoryId) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });
  
  // Open the edit modal
  const modal = document.getElementById("edit-item-modal");
  modal.style.display = "block";
  
  // Add visual feedback
  const card = event.target.closest('.stock-item-card');
  if (card) {
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      card.style.transform = 'scale(1)';
    }, 150);
  }
}

// Show item details with selling quantities
async function showItemDetails(itemId) {
  const item = cachedItems.find(i => i.id === itemId);
  if (!item) return;
  
  const category = cachedCategories.find(cat => cat.id === item.categoryId);
  
  // Get selling quantities from bills
  let sellingQuantities = [];
  try {
    const billsSnap = await get(rtdbBillsRef);
    if (billsSnap.exists()) {
      billsSnap.forEach((billSnap) => {
        const bill = billSnap.val();
        if (bill.lines) {
          bill.lines.forEach(line => {
            if (line.itemId === itemId) {
              sellingQuantities.push({
                billNumber: bill.billNumber,
                quantity: line.quantity,
                salePrice: line.salePrice,
                total: line.total,
                date: bill.createdAt
              });
            }
          });
        }
      });
    }
  } catch (err) {
    console.error("Failed to load selling quantities", err);
  }
  
  // Calculate total sold
  const totalSold = sellingQuantities.reduce((sum, sale) => sum + sale.quantity, 0);
  
  const modal = document.getElementById("item-details-modal");
  const content = document.getElementById("item-details-content");
  
  content.innerHTML = `
    <div class="item-details">
      <div class="item-details-header">
        <h3>${item.name || "Untitled"}</h3>
        <div class="item-code">Code: ${item.code || "N/A"}</div>
      </div>
      
      <div class="item-details-info">
        <div class="info-row info-row-category">
          <span class="label">Category:</span>
          <span class="value">${category?.name || "Uncategorized"}</span>
        </div>
        <div class="info-row stock-value-for-showing-datas-is">
          <span class="label">Current Stock:</span>
          <span class="value stock-value stock-value-for-showing-datas">${Number(item.stock || 0)}</span>
        </div>
        <div class="info-row">
          <span class="label">Buying Price:</span>
          <span class="value">${item.buyingPrice ? `Rs ${formatCurrency(item.buyingPrice)}` : "Not set"}</span>
        </div>
        <div class="info-row">
          <span class="label">Selling Price:</span>
          <span class="value">Rs ${formatCurrency(item.price || 0)}</span>
        </div>
        ${item.discountPrice ? `
        <div class="info-row">
          <span class="label">Discounted Price:</span>
          <span class="value">Rs ${formatCurrency(item.discountPrice)}</span>
        </div>
        ` : ''}
        <div class="info-row stock-value-for-showing-datas-total-soldds">
          <span class="label">Total Sold:</span>
          <span class="value stock-value stock-value-for-showing-datas-total-sold">${totalSold}</span>
        </div>
      </div>
      
      ${sellingQuantities.length > 0 ? `
      <div class="selling-history">
        <h4>Selling History</h4>
        <div class="selling-list">
          ${sellingQuantities.slice(0, 10).map(sale => `
            <div class="selling-item">
              <div class="sale-info">
                <span class="bill-number">Bill #${sale.billNumber}</span>
                <span class="sale-date">${formatDateYMD(sale.date)}</span>
              </div>
              <div class="sale-details">
                <span class="quantity">Qty: ${sale.quantity}</span>
                <span class="price">Rs ${formatCurrency(sale.salePrice)}</span>
                <span class="total">Total: Rs ${formatCurrency(sale.total)}</span>
              </div>
            </div>
          `).join('')}
          ${sellingQuantities.length > 10 ? `<div class="more-items">... and ${sellingQuantities.length - 10} more sales</div>` : ''}
        </div>
      </div>
      ` : '<div class="no-sales">No sales recorded for this item</div>'}
    </div>
  `;
  
  currentEditingItem = item;
  modal.style.display = "block";
}

// Open edit modal
function openEditModal() {
  if (!currentEditingItem) return;
  
  const modal = document.getElementById("edit-item-modal");
  const form = document.getElementById("edit-item-form");
  
  // Populate form with current item data
  document.getElementById("edit-item-id").value = currentEditingItem.id;
  document.getElementById("edit-item-name").value = currentEditingItem.name || "";
  document.getElementById("edit-item-code").value = currentEditingItem.code || "";
  document.getElementById("edit-item-buying-price").value = currentEditingItem.buyingPrice || "";
  document.getElementById("edit-item-price").value = currentEditingItem.price || "";
  document.getElementById("edit-item-discount-price").value = currentEditingItem.discountPrice || "";
  document.getElementById("edit-item-stock").value = currentEditingItem.stock || "";
  
  // Populate category dropdown
  const categorySelect = document.getElementById("edit-item-category");
  categorySelect.innerHTML = '<option value="">Select Category</option>';
  cachedCategories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    if (category.id === currentEditingItem.categoryId) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });
  
  modal.style.display = "block";
}

// Close edit modal
function closeEditModal() {
  const modal = document.getElementById("edit-item-modal");
  modal.style.display = "none";
  currentEditingItem = null;
}

// Close item details modal
function closeItemDetailsModal() {
  const modal = document.getElementById("item-details-modal");
  modal.style.display = "none";
  currentEditingItem = null;
}

// Handle edit form submission
async function handleEditItem(event) {
  event.preventDefault();
  
  const itemId = document.getElementById("edit-item-id").value;
  const name = document.getElementById("edit-item-name").value.trim();
  const code = document.getElementById("edit-item-code").value.trim();
  const categoryId = document.getElementById("edit-item-category").value;
  const buyingPrice = document.getElementById("edit-item-buying-price").value;
  const price = document.getElementById("edit-item-price").value;
  const discountPrice = document.getElementById("edit-item-discount-price").value;
  const stock = document.getElementById("edit-item-stock").value;
  
  if (!name || !code || !categoryId || !price || !stock) {
    alert("Please fill in all required fields.");
    return;
  }
  
  try {
    const itemRef = child(rtdbItemsRef, itemId);
    const updateData = {
      name,
      code,
      categoryId,
      price: Number(price),
      stock: Number(stock)
    };
    
    if (buyingPrice) {
      updateData.buyingPrice = Number(buyingPrice);
    }
    
    if (discountPrice) {
      updateData.discountPrice = Number(discountPrice);
    }
    
    await update(itemRef, updateData);
    
    alert("Item updated successfully!");
    closeEditModal();
    await loadItems(); // Reload items to reflect changes
  } catch (err) {
    console.error("Failed to update item", err);
    alert("Failed to update item. Please try again.");
  }
}

// Search items
function searchItems() {
  renderItemsGrid();
}

// Setup event listeners
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById("stock-search");
  if (searchInput) {
    searchInput.addEventListener("input", renderItemsGrid);
  }
  
  // Filter dropdowns
  const categoryFilter = document.getElementById("category-filter");
  const stockFilter = document.getElementById("stock-filter");
  
  if (categoryFilter) {
    categoryFilter.addEventListener("change", renderItemsGrid);
  }
  
  if (stockFilter) {
    stockFilter.addEventListener("change", renderItemsGrid);
  }
  
  // Edit form
  const editForm = document.getElementById("edit-item-form");
  if (editForm) {
    editForm.addEventListener("submit", handleEditItem);
  }

  // Add stock form
  const addStockForm = document.getElementById("add-stock-form");
  if (addStockForm) {
    addStockForm.addEventListener("submit", handleAddStockSubmit);
  }

  // Export button
  const exportBtn = document.getElementById("export-excel-btn");
  if (exportBtn && typeof XLSX !== 'undefined') {
    exportBtn.addEventListener("click", exportStockToExcel);
  }
  const exportNamesCodesBtn = document.getElementById("export-names-codes-btn");
  if (exportNamesCodesBtn && typeof XLSX !== 'undefined') {
    exportNamesCodesBtn.addEventListener("click", exportNamesCodesToExcel);
  }
  
  // Close modals when clicking outside
  window.addEventListener("click", (event) => {
    const editModal = document.getElementById("edit-item-modal");
    const detailsModal = document.getElementById("item-details-modal");
    
    if (event.target === editModal) {
      closeEditModal();
    }
    
    if (event.target === detailsModal) {
      closeItemDetailsModal();
    }
  });
  
  // Admin PIN form submit
  const adminPinForm = document.getElementById("admin-pin-form");
  if (adminPinForm) {
    adminPinForm.addEventListener("submit", handleAdminPinSubmit);
  }
}

// Prefill the add stock form with current item's prices
function prefillAddStockForm() {
  try {
    const qtyInput = document.getElementById("add-stock-qty");
    const buyingInput = document.getElementById("add-stock-buying");
    const priceInput = document.getElementById("add-stock-price");
    const discountInput = document.getElementById("add-stock-discount");

    if (qtyInput) qtyInput.value = "";
    if (!currentEditingItem) return;
    if (buyingInput) buyingInput.value = currentEditingItem.buyingPrice != null ? currentEditingItem.buyingPrice : "";
    if (priceInput) priceInput.value = currentEditingItem.price != null ? currentEditingItem.price : "";
    if (discountInput) discountInput.value = currentEditingItem.discountPrice != null ? currentEditingItem.discountPrice : "";
  } catch (_) {}
}

// Handle add stock submit for the currently selected item
async function handleAddStockSubmit(event) {
  event.preventDefault();
  try {
    if (!currentEditingItem) {
      alert("Select an item first by clicking it.");
      return;
    }

    const qtyInput = document.getElementById("add-stock-qty");
    const buyingInput = document.getElementById("add-stock-buying");
    const priceInput = document.getElementById("add-stock-price");
    const discountInput = document.getElementById("add-stock-discount");

    const quantityToAdd = Number(qtyInput?.value || 0);
    const newBuyingPrice = buyingInput?.value !== "" ? Number(buyingInput.value) : null;
    const newPrice = priceInput?.value !== "" ? Number(priceInput.value) : null;
    const newDiscount = discountInput?.value !== "" ? Number(discountInput.value) : null;

    if (!Number.isFinite(quantityToAdd) || quantityToAdd <= 0) {
      alert("Enter a valid quantity to add.");
      return;
    }

    // Read latest stock to avoid race conditions
    const itemRef = child(rtdbItemsRef, currentEditingItem.id);
    const latestSnap = await get(itemRef);
    const latest = latestSnap.exists() ? latestSnap.val() : currentEditingItem;
    const previousStock = Number(latest?.stock || 0);
    const updatedStock = previousStock + quantityToAdd;

    const updateData = { stock: updatedStock };
    if (newBuyingPrice != null && Number.isFinite(newBuyingPrice)) updateData.buyingPrice = newBuyingPrice;
    if (newPrice != null && Number.isFinite(newPrice)) updateData.price = newPrice;
    if (newDiscount != null && Number.isFinite(newDiscount)) updateData.discountPrice = newDiscount;

    await update(itemRef, updateData);

    // Only write a history record if any price changed
    const buyingChanged = newBuyingPrice != null && Number.isFinite(newBuyingPrice) && newBuyingPrice !== Number(latest?.buyingPrice ?? NaN);
    const priceChanged = newPrice != null && Number.isFinite(newPrice) && newPrice !== Number(latest?.price ?? NaN);
    const discountChanged = newDiscount != null && Number.isFinite(newDiscount) && newDiscount !== Number(latest?.discountPrice ?? NaN);

    if (buyingChanged || priceChanged || discountChanged) {
      const prevBuying = (latest?.buyingPrice != null && Number.isFinite(Number(latest.buyingPrice))) ? Number(latest.buyingPrice) : null;
      const prevPrice = (latest?.price != null && Number.isFinite(Number(latest.price))) ? Number(latest.price) : null;
      const prevDiscount = (latest?.discountPrice != null && Number.isFinite(Number(latest.discountPrice))) ? Number(latest.discountPrice) : null;

      const nextBuying = (newBuyingPrice != null && Number.isFinite(newBuyingPrice)) ? newBuyingPrice : prevBuying;
      const nextPrice = (newPrice != null && Number.isFinite(newPrice)) ? newPrice : prevPrice;
      const nextDiscount = (newDiscount != null && Number.isFinite(newDiscount)) ? newDiscount : prevDiscount;

      await addDoc(itemHistoryCollection, {
        itemId: currentEditingItem.id,
        code: latest?.code || currentEditingItem.code || "",
        name: latest?.name || currentEditingItem.name || "",
        quantityAdded: quantityToAdd,
        previousStock,
        newStock: updatedStock,
        // Keep existing fields for compatibility (representing the resulting/new values)
        buyingPrice: nextBuying,
        price: nextPrice,
        discountPrice: nextDiscount,
        // Explicit previous/new fields for clarity
        previousBuyingPrice: prevBuying,
        newBuyingPrice: nextBuying,
        previousPrice: prevPrice,
        newPrice: nextPrice,
        previousDiscountPrice: prevDiscount,
        newDiscountPrice: nextDiscount,
        createdAt: Date.now()
      });
    }

    // Clear form and refresh list
    if (qtyInput) qtyInput.value = "";
    if (buyingInput) buyingInput.value = "";
    if (priceInput) priceInput.value = "";
    if (discountInput) discountInput.value = "";

    alert(`Stock updated: ${previousStock} + ${quantityToAdd} = ${updatedStock}`);
    await loadItems();
  } catch (err) {
    console.error("Failed to add stock", err);
    alert("Failed to add stock. Please try again.");
  }
}

// Delete current item function
async function deleteCurrentItem() {
  if (!currentEditingItem) {
    alert("Please select an item to delete.");
    return;
  }
  
  // Show confirmation dialog
  const itemName = currentEditingItem.name || "this item";
  const confirmed = confirm(`Are you sure you want to delete "${itemName}"? This action cannot be undone.`);
  
  if (!confirmed) {
    return;
  }
  
  try {
    const itemRef = child(rtdbItemsRef, currentEditingItem.id);
    await remove(itemRef);
    
    alert("Item deleted successfully!");
    
    // Close any open modals
    closeEditModal();
    closeItemDetailsModal();
    
    // Reload items to reflect changes
    await loadItems();
    
    // Clear current editing item
    currentEditingItem = null;
  } catch (err) {
    console.error("Failed to delete item", err);
    alert("Failed to delete item. Please try again.");
  }
}

// Open delete auth modal
function openDeleteAuth() {
  if (!currentEditingItem) {
    alert("Please select an item to delete.");
    return;
  }
  const modal = document.getElementById("delete-item-on-application-window");
  if (modal) modal.style.display = "block";
}

// Close delete auth modal
function closeDeleteAuth() {
  const modal = document.getElementById("delete-item-on-application-window");
  if (modal) modal.style.display = "none";
}

// Handle admin PIN submit
async function handleAdminPinSubmit(event) {
  event.preventDefault();
  try {
    const adminSelect = document.getElementById("admin-select");
    const pinInput = document.getElementById("admin-pin-input");
    const adminId = adminSelect?.value;
    const enteredPin = pinInput?.value?.trim();

    if (!adminId || !enteredPin) {
      alert("Select admin and enter PIN.");
      return;
    }

    const admin = cachedAdmins.find(a => a.id === adminId);
    if (!admin) {
      alert("Admin not found.");
      return;
    }

    // Compare plain PIN field `pin` from Firestore user doc
    if (String(admin.pin || "") !== enteredPin) {
      alert("Incorrect PIN.");
      return;
    }

    // Success: proceed to delete
    await actuallyDeleteCurrentItem();
    alert("PIN verified. Item deleted successfully!");
    closeDeleteAuth();
  } catch (err) {
    console.error("PIN verification failed", err);
    alert("Failed to verify PIN. Try again.");
  }
}

// Internal delete used after PIN verification
async function actuallyDeleteCurrentItem() {
  if (!currentEditingItem) return;
  const itemRef = child(rtdbItemsRef, currentEditingItem.id);
  await remove(itemRef);
  closeEditModal();
  closeItemDetailsModal();
  await loadItems();
  currentEditingItem = null;
}

// Navigation function
function navigateTo(page) {
  window.location.href = page;
}

// Make functions globally available
window.showItemDetails = showItemDetails;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.closeItemDetailsModal = closeItemDetailsModal;
window.searchItems = searchItems;
window.navigateTo = navigateTo;
window.deleteCurrentItem = deleteCurrentItem;
window.openDeleteAuth = openDeleteAuth;
window.prefillAddStockForm = prefillAddStockForm;
