// Stock Management functionality
import { db, rtdb } from "./firebase_config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import {
  ref,
  get,
  update,
  child
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const categoriesCollection = collection(db, "categories");
const rtdbItemsRef = ref(rtdb, 'items');
const rtdbBillsRef = ref(rtdb, 'bills');

let cachedCategories = [];
let cachedItems = [];
let currentEditingItem = null;

// Initialize the page
window.addEventListener("DOMContentLoaded", async () => {
  await loadCategories();
  await loadItems();
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

// Load items from Firebase
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
    
    // Sort by name
    items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    cachedItems = items;
    renderItemsGrid();
  } catch (err) {
    console.error('Failed to load items from RTDB:', err);
    cachedItems = [];
    renderItemsGrid();
  }
}

// Render items grid with stock information
function renderItemsGrid() {
  const grid = document.getElementById("stock-items-grid");
  if (!grid) return;
  
  grid.innerHTML = "";
  
  let itemsToShow = [...cachedItems];
  
  // Apply search filter
  const searchTerm = document.getElementById("stock-search")?.value?.toLowerCase() || "";
  if (searchTerm) {
    itemsToShow = itemsToShow.filter(item => 
      item.name?.toLowerCase().includes(searchTerm) ||
      item.code?.toLowerCase().includes(searchTerm)
    );
  }
  
  // Apply category filter
  const categoryFilter = document.getElementById("category-filter")?.value;
  if (categoryFilter && categoryFilter !== "all") {
    itemsToShow = itemsToShow.filter(item => item.categoryId === categoryFilter);
  }
  
  // Apply stock filter
  const stockFilter = document.getElementById("stock-filter")?.value;
  if (stockFilter && stockFilter !== "all") {
    const stock = Number(item.stock || 0);
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
        <div class="stock-status ${stockStatus}">${stockStatusText}</div>
      </div>
      
      <div class="stock-item-details">
        <div class="stock-item-code">Code: ${item.code || "N/A"}</div>
        <div class="stock-item-category">Category: ${category?.name || "Uncategorized"}</div>
        <div class="stock-item-price">
          Price: $${Number(item.price || 0).toFixed(2)}
          ${item.discountPrice ? `<span class="discount-price">$${Number(item.discountPrice).toFixed(2)}</span>` : ''}
        </div>
        <div class="stock-item-buying-price">
          ${item.buyingPrice ? `Buying Price: $${Number(item.buyingPrice).toFixed(2)}` : 'Buying Price: Not set'}
        </div>
        <div class="stock-item-quantity">Current Stock: <strong>${stock}</strong></div>
      </div>
    `;
    
    // Add click handler for the card - show selling details
    card.addEventListener("click", (e) => {
      showItemDetails(item.id);
      
      // Add visual feedback
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.style.transform = 'scale(1)';
      }, 150);
    });
    
    grid.appendChild(card);
  });
}

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
  let totalRevenue = 0;
  let totalProfit = 0;
  
  try {
    const billsSnap = await get(rtdbBillsRef);
    if (billsSnap.exists()) {
      billsSnap.forEach((billSnap) => {
        const bill = billSnap.val();
        if (bill.lines) {
          bill.lines.forEach(line => {
            if (line.itemId === itemId) {
              const saleData = {
                billNumber: bill.billNumber,
                quantity: line.quantity,
                salePrice: line.salePrice,
                total: line.total,
                date: bill.createdAt,
                customerName: bill.customerName || 'Walk-in Customer'
              };
              sellingQuantities.push(saleData);
              
              // Calculate revenue and profit
              totalRevenue += line.total;
              if (item.buyingPrice) {
                totalProfit += (line.salePrice - item.buyingPrice) * line.quantity;
              }
            }
          });
        }
      });
    }
  } catch (err) {
    console.error("Failed to load selling quantities", err);
  }
  
  // Calculate totals
  const totalSold = sellingQuantities.reduce((sum, sale) => sum + sale.quantity, 0);
  const averagePrice = totalSold > 0 ? totalRevenue / totalSold : 0;
  
  // Sort by date (most recent first)
  sellingQuantities.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const modal = document.getElementById("item-details-modal");
  const content = document.getElementById("item-details-content");
  
  content.innerHTML = `
    <div class="item-details">
      <div class="item-details-header">
        <h3>${item.name || "Untitled"}</h3>
        <div class="item-code">Code: ${item.code || "N/A"}</div>
      </div>
      
      <div class="item-details-info">
        <div class="info-row">
          <span class="label">Category:</span>
          <span class="value">${category?.name || "Uncategorized"}</span>
        </div>
        <div class="info-row">
          <span class="label">Current Stock:</span>
          <span class="value stock-value">${Number(item.stock || 0)}</span>
        </div>
        <div class="info-row">
          <span class="label">Buying Price:</span>
          <span class="value">${item.buyingPrice ? `$${Number(item.buyingPrice).toFixed(2)}` : "Not set"}</span>
        </div>
        <div class="info-row">
          <span class="label">Selling Price:</span>
          <span class="value">$${Number(item.price || 0).toFixed(2)}</span>
        </div>
        ${item.discountPrice ? `
        <div class="info-row">
          <span class="label">Discounted Price:</span>
          <span class="value">$${Number(item.discountPrice).toFixed(2)}</span>
        </div>
        ` : ''}
      </div>
      
      <div class="selling-summary">
        <h4>Sales Summary</h4>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Total Sold:</span>
            <span class="summary-value">${totalSold} units</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Revenue:</span>
            <span class="summary-value">$${totalRevenue.toFixed(2)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Average Price:</span>
            <span class="summary-value">$${averagePrice.toFixed(2)}</span>
          </div>
          ${item.buyingPrice ? `
          <div class="summary-item">
            <span class="summary-label">Total Profit:</span>
            <span class="summary-value profit">$${totalProfit.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      ${sellingQuantities.length > 0 ? `
      <div class="selling-history">
        <h4>Recent Sales (Last 10)</h4>
        <div class="selling-list">
          ${sellingQuantities.slice(0, 10).map(sale => `
            <div class="selling-item">
              <div class="sale-header">
                <span class="bill-number">Bill #${sale.billNumber}</span>
                <span class="sale-date">${new Date(sale.date).toLocaleDateString()}</span>
              </div>
              <div class="sale-details">
                <div class="sale-info">
                  <span class="customer">${sale.customerName}</span>
                  <span class="quantity">Qty: ${sale.quantity}</span>
                </div>
                <div class="sale-pricing">
                  <span class="price">@$${Number(sale.salePrice).toFixed(2)}</span>
                  <span class="total">Total: $${Number(sale.total).toFixed(2)}</span>
                </div>
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
