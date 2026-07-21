---
name: POS Hardware
description: Physical POS peripherals — terminal brand, integration status, and pending work.
---

## Card Terminal
- **Brand:** Dejavoo (by Electronic Payments)
- **Status:** NOT yet integrated — Credit button on POS screen records sale as `paymentMethod: 'credit'` in DB only; cashier manually processes on the physical terminal.
- **Integration path:** Dejavoo terminals expose a local REST/TCP API. When ready, build a charge-trigger endpoint that POSTs the sale amount to the terminal's local IP so the Credit button auto-sends the charge.

## Receipt Printer & Cash Drawer
- **Status:** NOT yet integrated — Print Order button is disabled on the POS screen.
- **Integration path:** Requires QZ Tray installed on the POS computer. QZ Tray bridges the browser to USB/serial/network printers via ESC/POS commands. Cash drawer connects to the printer's kick port and fires with the same print job.
- **User confirmed:** QZ Tray installation is a future phase — do not implement until user says they're ready.

**Why this matters:** The Credit button should eventually call a local Dejavoo API endpoint (terminal IP + port) with the sale total so the terminal auto-displays the charge amount. Until then, the cashier keys it in manually on the terminal.
