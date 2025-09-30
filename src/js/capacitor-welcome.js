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

            // Build printable text. Many ESC/POS formatters support <qrcode> ... </qrcode>.
            // If the printer plugin does not support QR, it will still print the payload text.
            const lines = [];
            lines.push(`[C]<font size='big'><b>${business}</b></font>`);
            lines.push(`[C]Date: ${nowStr}`);
            lines.push('');
            lines.push('[L]--------------------------------');
            if (qrPayload) {
              lines.push('[C]<font size="medium"><b>Scan QR</b></font>');
              lines.push(`[C]<qrcode>${qrPayload}</qrcode>`);
              lines.push('');
            } else {
              lines.push('[C]QR not available');
            }
            lines.push('[L]--------------------------------');
            if (vehicleLine) {
              lines.push(`[L]${vehicleLine}`);
            }
            lines.push('[C]--------------------------------');
            lines.push("[C]<font size='medium'><b>Thank you!</b></font>");
            lines.push("[C]<font size='medium'><b>System by ImaPOS</b></font>");
            lines.push('');

            const text = lines.join('\n');

            plugin.printFormattedText({ type: 'usb', id: printerId, text }, function () {
              setStatus('Printed successfully.');
            }, function (err) {
              setStatus('Print error: ' + JSON.stringify(err));
            });

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
