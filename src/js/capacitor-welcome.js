import { SplashScreen } from '@capacitor/splash-screen';
import { Camera } from '@capacitor/camera';

window.customElements.define(
  'capacitor-welcome',
  class extends HTMLElement {
    constructor() {
      super();

      SplashScreen.hide();

      const root = this.attachShadow({ mode: 'open' });
      
      // If the component template was removed, we simply don't render anything here.
      
    }

    connectedCallback() {
      const self = this;

      const takePhotoBtn = (self.shadowRoot && self.shadowRoot.querySelector) ? self.shadowRoot.querySelector('#take-photo') : null;
      if (takePhotoBtn) {
        takePhotoBtn.addEventListener('click', async function (e) {
          try {
            const photo = await Camera.getPhoto({
              resultType: 'uri',
            });

            const image = self.shadowRoot.querySelector('#image');
            if (!image) {
              return;
            }

            image.src = photo.webPath;
          } catch (e) {
            console.warn('User cancelled', e);
          }
        });
      }

      const statusEl = (this.shadowRoot && this.shadowRoot.querySelector) ? this.shadowRoot.querySelector('#printer-status') : null;
      const listEl = (this.shadowRoot && this.shadowRoot.querySelector) ? this.shadowRoot.querySelector('#printers') : null;

      const setStatus = (msg) => {
        if (statusEl) statusEl.textContent = msg;
        const pageStatus = document.querySelector('#printer-status-page');
        if (pageStatus) pageStatus.textContent = msg;
      };

      const renderPrinters = (printers) => {
        if (listEl) {
          listEl.innerHTML = '';
          (printers || []).forEach((p) => {
            const li = document.createElement('li');
            li.textContent = JSON.stringify(p);
            listEl.appendChild(li);
          });
        }
        const pageList = document.querySelector('#printers-page');
        if (pageList) {
          pageList.innerHTML = '';
          (printers || []).forEach((p) => {
            const li = document.createElement('li');
            li.textContent = JSON.stringify(p);
            pageList.appendChild(li);
          });
        }
      };

      const listUsbPrinters = () => {
        const plugin = window.ThermalPrinter;
        if (!plugin) {
          setStatus('ThermalPrinter plugin not available (cordova.js is required and runs only on device).');
          return;
        }
        setStatus('Scanning USB printers...');
        plugin.listPrinters({ type: 'usb' }, function (devices) {
          renderPrinters(devices);
          if (devices && devices.length) {
            setStatus('Found ' + devices.length + ' USB printer(s).');
          } else {
            setStatus('No USB printers found.');
          }
        }, function (err) {
          setStatus('List error: ' + JSON.stringify(err));
        });
      };

      const printUsb = () => {
        const plugin = window.ThermalPrinter;
        if (!plugin) {
          setStatus('ThermalPrinter plugin not available (cordova.js is required and runs only on device).');
          return;
        }
        setStatus('Preparing to print...');
      
        plugin.listPrinters({ type: 'usb' }, function (devices) {
          if (!devices || !devices.length) {
            setStatus('No USB printers to print to.');
            return;
          }
      
          const printer = devices[0];
          const printerId = printer?.id ?? printer?.deviceId;
          if (!printerId) {
            setStatus('Printer identifier missing (expected id or deviceId).');
            return;
          }
      
          plugin.requestPermissions({ type: 'usb', id: printerId }, function () {
            // Collect data from the page QR section
            const qrInfoEl = document.querySelector('#qrInfo');
            const qrSectionEl = document.querySelector('#qrSection');
            let lastVehicle = null;
            let vehicleLine = '';
            let qrPayload = '';

            if (qrSectionEl && qrSectionEl.dataset && qrSectionEl.dataset.lastVehicle) {
              try {
                lastVehicle = JSON.parse(qrSectionEl.dataset.lastVehicle);
              } catch (_) {}
            }

            if (lastVehicle) {
              const name = lastVehicle.name || '';
              const plate = lastVehicle.numberPlate || '';
              const code = lastVehicle.code || '';
              vehicleLine = `Vehicle: ${name} \nPlate: ${plate} \nCode: ${code}`;
              // Our QR encodes the number plate per getQRCodePayload()
              qrPayload = plate || '';
            } else if (qrInfoEl) {
              vehicleLine = (qrInfoEl.textContent || '').trim();
            }

            const business = (function() {
              try {
                const raw = localStorage.getItem('appSettings');
                if (!raw) return 'RR Bike Park';
                const data = JSON.parse(raw);
                return (data && data.businessName) ? String(data.businessName) : 'RR Bike Park';
              } catch (e) { return 'RR Bike Park'; }
            })();

            const nowStr = new Date().toLocaleString();

            // Build printable text optimized for 80mm thermal printers
            // 80mm printers typically support 48-50 characters per line
            const lines = [];
            
            // Fixed configuration for 80mm printers (48 characters per line)
            const TOTAL_COLS = 48;
            const SEPARATOR = '[L]' + '-'.repeat(TOTAL_COLS);

            // Helper to visually center a line by padding spaces to TOTAL_COLS
            const centerLine = (raw) => {
              const plain = String(raw).replace(/<[^>]*>/g, '');
              const truncatedPlain = plain.length > TOTAL_COLS ? plain.slice(0, TOTAL_COLS) : plain;
              const leftPad = Math.max(0, Math.floor((TOTAL_COLS - truncatedPlain.length) / 2));
              return '[L]' + ' '.repeat(leftPad) + raw;
            };
            
            // Business header centered
            lines.push("<font size='big-2'><b> IMAPOS TESTER</b></font>");
            lines.push('');
            lines.push(centerLine(`Date: ${nowStr}`));
            lines.push(centerLine('No 80, New Shopping Complex,'));
            lines.push(centerLine('Hingurakgoda')); 
            lines.push(centerLine('Phone : 076 396 0566'));
            lines.push('');
            lines.push(SEPARATOR);
            
            // Get logged user information
            let loggedUserName = 'Unknown';
            try {
              const sessionUser = sessionStorage.getItem('sessionUser');
              if (sessionUser) {
                const user = JSON.parse(sessionUser);
                loggedUserName = user.name || user.username || 'User';
              }
            } catch (e) {
              console.warn('Could not get logged user info:', e);
            }
            
            // Get current bill number (if available from the page)
            let currentBillNumber = 'N/A';
            try {
              // Try to get bill number from the current transaction context
              const billNumberEl = document.querySelector('#currentBillNumber');
              if (billNumberEl && billNumberEl.textContent) {
                currentBillNumber = billNumberEl.textContent.trim();
              } else if (window.currentBillNumber) {
                // Get from global variable set after bill completion
                currentBillNumber = window.currentBillNumber;
              } else if (document.body.getAttribute('data-current-bill-number')) {
                // Get from data attribute set after bill completion
                currentBillNumber = document.body.getAttribute('data-current-bill-number');
              } else {
                // Generate a new bill number for this receipt
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const datePrefix = `${year}${month}${day}`;
                const timestamp = Date.now().toString().slice(-6);
                currentBillNumber = `${datePrefix}${timestamp}`;
              }
            } catch (e) {
              console.warn('Could not get bill number:', e);
            }
            
            lines.push(`Cashier : ${loggedUserName}`);
            lines.push(`Invoice Number : ${currentBillNumber}`);
            lines.push(SEPARATOR);

            // Cart items section (from current page cart cards)
            try {
              const cartList = document.querySelector('#cartList');
              const cards = cartList ? Array.from(cartList.querySelectorAll('.cart-card')) : [];
              if (cards.length > 0) {
                // Helpers to format fixed-width columns for thermal printers
                const padRight = (str, len) => {
                  const s = String(str ?? '');
                  return s.length >= len ? s.slice(0, len) : (s + ' '.repeat(len - s.length));
                };
                const padLeft = (str, len) => {
                  const s = String(str ?? '');
                  return s.length >= len ? s.slice(-len) : (' '.repeat(len - s.length) + s);
                };

                // Optimized column widths for 80mm printers (48 chars total)
                const COL_TOTAL = 12;  // Total column
                const COL_QTY   = 6;   // Quantity column  
                const COL_DIS   = 12;  // Discounted price column
                const COL_PRICE = 12;  // Original price column
                const COL_NAME  = TOTAL_COLS - (COL_TOTAL + COL_QTY + COL_DIS + COL_PRICE); // Remaining for item name

                const makeDetailsRow = (price, disPrice, qty, total) => {
                  return (
                    '[L]'
                    + ""
                    + padLeft(price, COL_PRICE)
                    + padLeft(disPrice, COL_DIS)
                    + padLeft(qty, COL_QTY)
                    + padLeft(total, COL_TOTAL)
                  );
                };

                // Build a single-line header like: Item  Price  Dis Price  Qty  Total
                const makeHeaderRow = () => {
                  const nameCol = padRight('Item', COL_NAME);
                  return (
                    '[L]'
                    + nameCol
                    + padLeft('Price', COL_PRICE)
                    + padLeft('Dis Price', COL_DIS)
                    + padLeft('Qty', COL_QTY)
                    + padLeft('Total', COL_TOTAL)
                  );
                };

                // Header row aligned to columns
                lines.push(makeHeaderRow());
                lines.push(SEPARATOR);
                // Rows (two-line per item: name on top, details below)
                cards.forEach((card) => {
                  const name = (card.dataset.itemName || '').toString();
                  const qtyNum = Number(card.dataset.quantity || '0');
                  const priceNum = Number(card.dataset.price || '0');
                  const disPriceNum = Number(card.dataset.salePrice || card.dataset.price || '0');
                  const totalNum = Number(card.dataset.total || String(qtyNum * disPriceNum));
                  
                  // Truncate item name to fit 80mm width (48 chars)
                  const truncatedName = name.length > TOTAL_COLS ? name.substring(0, TOTAL_COLS - 3) + '...' : name;
                  lines.push('[L]<b>' + truncatedName + '</b>');
                  lines.push(makeDetailsRow(
                    priceNum.toFixed(2),
                    disPriceNum.toFixed(2),
                    'x' + String(qtyNum),
                    totalNum.toFixed(2)
                  ));
                  lines.push('');
                });
                lines.push(SEPARATOR);

                const grandTotalEl = document.querySelector('#grandTotal');
                const itemCountEl = document.querySelector('#itemCount');
                const customerAmountEl = document.querySelector('#customerAmount');
                const balanceEl = document.querySelector('#balance');

                const grandTotal = grandTotalEl ? Number((grandTotalEl.textContent || '0').trim()) : 0;
                const itemCount = itemCountEl ? Number((itemCountEl.textContent || '0').trim()) : 0;
                const customerAmount = customerAmountEl ? Number(customerAmountEl.value || '0') : 0;
                const balance = balanceEl ? Number((balanceEl.textContent || '0').trim()) : (grandTotal - customerAmount);

                // Build explicit right-aligned lines using padding to TOTAL_COLS
                const rightAlign = (text) => {
                  const s = String(text ?? '');
                  return '[L]' + (s.length >= TOTAL_COLS ? s.slice(-TOTAL_COLS) : (' '.repeat(TOTAL_COLS - s.length) + s));
                };

                // Render a label on the left and a value on the far right
                const leftRight = (label, value) => {
                  const left = String(label ?? '');
                  const right = String(value ?? '');
                  const available = TOTAL_COLS - left.length - right.length;
                  const spaces = available > 1 ? available : 1;
                  return '[L]' + left + ' '.repeat(spaces) + right;
                };

                lines.push(leftRight('Grand Total:', grandTotal.toFixed(2)));
                lines.push(leftRight('Cash:', customerAmount.toFixed(2)));
                if (!Number.isNaN(customerAmount) && customerAmount > 0) {
                  lines.push(leftRight('Balance:', balance.toFixed(2)));
                }
                lines.push('');
              }
            } catch (e) {
              // If DOM not available, skip items
            }
            lines.push(SEPARATOR.replace('[L]', '[C]'));
            lines.push(centerLine("<font size='medium'><b>Thank you for shopping with us!</b></font>"));
            lines.push(centerLine("<font size='medium'><b>Hotline : 077 442 9053</b></font>"));
            lines.push(centerLine("<font size='medium'><b>System by ImaPOS www.imapos.xyz</b></font>"));
            lines.push('');
            lines.push('');
            lines.push("<font size='big-2'> </font>");
            // Bottom feed: add a small margin at end of bill
            const FEED_LINES = (function(){
              const v = Number(localStorage.getItem('printerFeedLines'));
              if (Number.isFinite(v) && v >= 0 && v <= 12) return Math.round(v);
              return 4; // default
            })();
            for (let i = 0; i < FEED_LINES; i++) lines.push('');

			const text = lines.join('\n');

			const payload = { type: 'usb', id: printerId, text };
			const onSuccess = function () { setStatus('Printed successfully.'); };
			const onError = function (err) { setStatus('Print error: ' + JSON.stringify(err)); };

			if (typeof plugin.printFormattedTextAndCut === 'function') {
				plugin.printFormattedTextAndCut(payload, onSuccess, onError);
			} else {
				plugin.printFormattedText(payload, onSuccess, onError);
			}

          }, function (err) {
            setStatus('Permission denied: ' + JSON.stringify(err));
          });
      
        }, function (err) {
          setStatus('List error: ' + JSON.stringify(err));
        });
      };
      

      const listBtn = (this.shadowRoot && this.shadowRoot.querySelector) ? this.shadowRoot.querySelector('#list-usb') : null;
      const printBtn = (this.shadowRoot && this.shadowRoot.querySelector) ? this.shadowRoot.querySelector('#print-usb') : null;
      if (listBtn) listBtn.addEventListener('click', listUsbPrinters);
      if (printBtn) printBtn.addEventListener('click', printUsb);

      const pageListBtn = document.querySelector('#list-usb-page');
      const pagePrintBtn = document.querySelector('#print-usb-page');
      if (pageListBtn) pageListBtn.addEventListener('click', listUsbPrinters);
      if (pagePrintBtn) pagePrintBtn.addEventListener('click', printUsb);
    }
  }
);

window.customElements.define(
  'capacitor-welcome-titlebar',
  class extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
    <style>
      :host {
        position: relative;
        display: block;
        padding: 15px 15px 15px 15px;
        text-align: center;
        background-color: #73B5F6;
      }
      ::slotted(h1) {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        font-size: 0.9em;
        font-weight: 600;
        color: #fff;
      }
    </style>
    <slot></slot>
    `;
    }
  }
);
