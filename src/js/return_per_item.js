import { rtdb } from "./firebase_config.js";
import { ref, get, child, query, orderByChild, equalTo, update, push } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const itemsRef = ref(rtdb, 'items');
const returnsRef = ref(rtdb, 'returns');

let currentItem = null;

// Debug function to list all available items
async function debugListAllItems() {
    try {
        const allItemsSnap = await get(itemsRef);
        if (allItemsSnap.exists()) {
            console.log('=== ALL ITEMS IN DATABASE ===');
            allItemsSnap.forEach((childSnap) => {
                const itemData = childSnap.val();
                console.log(`ID: ${childSnap.key}`);
                console.log(`Name: ${itemData.name || 'N/A'}`);
                console.log(`Code: ${itemData.code || 'N/A'}`);
                console.log(`Price: ${itemData.price || 'N/A'}`);
                console.log(`Stock: ${itemData.stock || 'N/A'}`);
                console.log('---');
            });
        } else {
            console.log('No items found in database');
        }
    } catch (error) {
        console.error('Error listing items:', error);
    }
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function showStatus(message, isError = false) {
    const status = document.getElementById('returnStatus');
    if (!status) return;
    
    status.textContent = message;
    status.style.display = 'block';
    status.style.backgroundColor = isError ? '#f8d7da' : '#d4edda';
    status.style.color = isError ? '#721c24' : '#155724';
    status.style.border = isError ? '1px solid #f5c6cb' : '1px solid #c3e6cb';
    
    // Hide status after 5 seconds
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}

function displayItemInfo(item) {
    const itemInfo = document.getElementById('itemInfo');
    const itemDetails = document.getElementById('itemDetails');
    const itemNameDisplay = document.getElementById('itemNameDisplay');
    
    if (!itemInfo || !itemDetails) return;
    
    const currentPrice = Number(item.price || 0);
    const discountPrice = Number(item.discountPrice || 0);
    const displayPrice = discountPrice > 0 ? discountPrice : currentPrice;
    
    itemDetails.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; color: #333;">${escapeHtml(String(item.name || 'Unknown Item'))}</h3>
            <span style="background-color: #E78B00; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(String(item.code || ''))}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
            <div><strong>Current Price:</strong> ${currentPrice.toFixed(2)}</div>
            <div><strong>Stock:</strong> ${Number(item.stock || 0)}</div>
            ${discountPrice > 0 ? `<div><strong>Discount Price:</strong> ${discountPrice.toFixed(2)}</div>` : ''}
            <div><strong>Category:</strong> ${escapeHtml(String(item.categoryId || 'N/A'))}</div>
        </div>
    `;
    
    itemInfo.style.display = 'block';
    
    // Set the item name in the verification field
    if (itemNameDisplay) {
        itemNameDisplay.value = String(item.name || 'Unknown Item');
    }
    
    // Set the return price to the current selling price
    const returnPriceInput = document.getElementById('returnPrice');
    if (returnPriceInput) {
        returnPriceInput.value = displayPrice.toFixed(2);
    }
}

async function loadItemByCode(itemCode) {
    const normalized = String(itemCode || '').trim();
    if (!normalized) {
        showStatus('Please enter an item code', true);
        return null;
    }
    
    try {
        console.log('Searching for item code:', normalized);
        
        // First try to find by code field using query
        try {
            const codeQuery = query(itemsRef, orderByChild('code'), equalTo(normalized));
            const codeSnap = await get(codeQuery);
            
            if (codeSnap.exists()) {
                let foundItem = null;
                codeSnap.forEach((childSnap) => {
                    if (!foundItem) {
                        foundItem = { id: childSnap.key, ...childSnap.val() };
                        console.log('Found item by code query:', foundItem);
                    }
                });
                if (foundItem) return foundItem;
            }
        } catch (queryError) {
            console.log('Code query failed, trying alternative methods:', queryError);
        }
        
        // If query fails, try scanning all items manually
        try {
            const allItemsSnap = await get(itemsRef);
            if (allItemsSnap.exists()) {
                let foundItem = null;
                allItemsSnap.forEach((childSnap) => {
                    const itemData = childSnap.val();
                    if (itemData && String(itemData.code || '').trim() === normalized) {
                        foundItem = { id: childSnap.key, ...itemData };
                        console.log('Found item by manual scan:', foundItem);
                    }
                });
                if (foundItem) return foundItem;
            }
        } catch (scanError) {
            console.log('Manual scan failed:', scanError);
        }
        
        // If not found by code, try direct ID lookup
        try {
            const directSnap = await get(child(itemsRef, normalized));
            if (directSnap.exists()) {
                const foundItem = { id: normalized, ...directSnap.val() };
                console.log('Found item by direct ID:', foundItem);
                return foundItem;
            }
        } catch (directError) {
            console.log('Direct ID lookup failed:', directError);
        }
        
        console.log('No item found with code:', normalized);
        return null;
    } catch (error) {
        console.error('Error loading item:', error);
        return null;
    }
}

async function saveReturn() {
    if (!currentItem) {
        showStatus('Please load an item first', true);
        return;
    }
    
    const returnQuantity = document.getElementById('returnQuantity');
    const returnPrice = document.getElementById('returnPrice');
    const returnReason = document.getElementById('returnReason');
    const paymentMethod = document.getElementById('paymentMethod');
    const returnHandling = document.querySelector('input[name="returnHandling"]:checked');
    
    if (!returnQuantity || !returnPrice || !returnReason || !paymentMethod || !returnHandling) {
        showStatus('Form elements not found', true);
        return;
    }
    
    const quantity = Number(returnQuantity.value || 0);
    const price = Number(returnPrice.value || 0);
    const reason = returnReason.value;
    const method = paymentMethod.value;
    const handling = returnHandling.value;
    
    // Validation
    if (quantity <= 0) {
        showStatus('Please enter a valid return quantity', true);
        return;
    }
    
    if (price <= 0) {
        showStatus('Please enter a valid return price', true);
        return;
    }
    
    if (!reason) {
        showStatus('Please select a return reason', true);
        return;
    }
    
    if (!method) {
        showStatus('Please select a payment method', true);
        return;
    }
    
    // Check if quantity is not more than current stock (only for restore option)
    const currentStock = Number(currentItem.stock || 0);
    if (handling === 'restore' && quantity > currentStock) {
        showStatus(`Cannot return more than current stock (${currentStock})`, true);
        return;
    }
    
    try {
        // Create return record
        const returnData = {
            itemId: currentItem.id,
            itemName: currentItem.name,
            itemCode: currentItem.code,
            quantity: quantity,
            price: price,
            totalAmount: quantity * price,
            reason: reason,
            paymentMethod: method,
            handling: handling,
            stockUpdated: handling === 'restore',
            createdAt: new Date().toLocaleString(),
            createdAtTimestamp: Date.now()
        };
        
        // Save return record
        const returnRef = await push(returnsRef, returnData);
        
        // Update item stock only if handling is 'restore'
        if (handling === 'restore') {
            const newStock = currentStock + quantity;
            await update(child(itemsRef, currentItem.id), { stock: newStock });
        }
        
        const handlingText = handling === 'restore' ? 'and stock updated' : 'but stock not updated (damaged)';
        showStatus(`Return saved successfully! Return ID: ${returnRef.key} - ${handlingText}`);
        
        // Clear form
        returnQuantity.value = '';
        returnPrice.value = '';
        returnReason.value = '';
        paymentMethod.value = '';
        
        // Reset handling to default
        const restoreRadio = document.querySelector('input[name="returnHandling"][value="restore"]');
        if (restoreRadio) {
            restoreRadio.checked = true;
        }
        
        // Clear item name verification field
        const itemNameDisplay = document.getElementById('itemNameDisplay');
        if (itemNameDisplay) {
            itemNameDisplay.value = '';
        }
        
        // Reload item to show updated stock (only if stock was updated)
        if (handling === 'restore') {
            const updatedItem = await loadItemByCode(currentItem.code);
            if (updatedItem) {
                currentItem = updatedItem;
                displayItemInfo(updatedItem);
            }
        }
        
    } catch (error) {
        console.error('Error saving return:', error);
        showStatus('Failed to save return. Please try again.', true);
    }
}

// Event listeners
window.addEventListener('DOMContentLoaded', () => {
    const itemCodeInput = document.getElementById('itemCodeInput');
    const loadItemBtn = document.getElementById('loadItemBtn');
    const debugItemsBtn = document.getElementById('debugItemsBtn');
    const saveReturnBtn = document.getElementById('saveReturnBtn');
    
    // Load item button
    if (loadItemBtn) {
        loadItemBtn.addEventListener('click', async () => {
            const itemCode = itemCodeInput ? itemCodeInput.value : '';
            if (!itemCode.trim()) {
                showStatus('Please enter an item code', true);
                return;
            }
            
            // Clear previous item name verification
            const itemNameDisplay = document.getElementById('itemNameDisplay');
            if (itemNameDisplay) {
                itemNameDisplay.value = '';
            }
            
            showStatus('Loading item...');
            const item = await loadItemByCode(itemCode);
            
            if (item) {
                currentItem = item;
                displayItemInfo(item);
                showStatus('Item loaded successfully');
            } else {
                showStatus('Item not found. Please check the item code.', true);
            }
        });
    }
    
    // Debug items button
    if (debugItemsBtn) {
        debugItemsBtn.addEventListener('click', async () => {
            showStatus('Loading all items for debugging...');
            await debugListAllItems();
            showStatus('Check browser console for item list');
        });
    }
    
    // Enter key on item code input
    if (itemCodeInput) {
        itemCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadItemBtn.click();
            }
        });
    }
    
    // Save return button
    if (saveReturnBtn) {
        saveReturnBtn.addEventListener('click', saveReturn);
    }
    
    // Auto-calculate total when quantity or price changes
    const returnQuantity = document.getElementById('returnQuantity');
    const returnPrice = document.getElementById('returnPrice');
    
    function updateTotal() {
        if (returnQuantity && returnPrice) {
            const quantity = Number(returnQuantity.value || 0);
            const price = Number(returnPrice.value || 0);
            const total = quantity * price;
            
            // You could display the total somewhere if needed
            console.log('Total return amount:', total);
        }
    }
    
    if (returnQuantity) {
        returnQuantity.addEventListener('input', updateTotal);
    }
    
    if (returnPrice) {
        returnPrice.addEventListener('input', updateTotal);
    }
});
