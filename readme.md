# 🧺 Sagacious Washing Center — Laundry Management System & POS

A modern, full-featured web-based **Laundry Management System and Point of Sale (POS)** designed for **Sagacious Washing Center**. Built for speed, responsiveness, and seamless operational workflow.

---

## ✨ Features

### 🧺 1. Items Catalog & Customer Quotations
- **Catalog Management**: Manage dry clean, wash & press, and wash & dry prices for all inventory items.
- **Customer Price Lists**: Configure customer-specific custom price overrides for specific hotels and clients.
- **Customer Quotation Generator**: Instantly generate formal **Service Quotations** formatted with official letterhead, customer details, and customer-specific price rates. Includes direct **Print / PDF export**.

### 📦 2. Orders & Batch Management
- Create, track, and manage laundry orders with real-time customer price calculation.
- Support for service types (Wash & Press, Dry Clean, Wash & Dry), item quantities, and batch tracking.
- Filter, search, and manage order statuses (*Pickup Requested, Received, Out for Delivery, Delivered, Completed, Paid, Credits*).

### 📄 3. Billing & Invoicing
- Generate standard **Invoices** and **Credit Bills**.
- Automatic calculation of subtotal, delivery fees, discounts, and payment history.
- Printable PDF invoice templates with custom letterhead and branding.

### 🤖 4. SAGA AI Assistant
- Integrated smart assistant powered by Google Gemini AI.
- Context-aware assistance for answering system queries, reports, and administrative tasks.

### 📊 5. Reports & Analytics
- Visual sales and income charts powered by Chart.js.
- Monthly bill reports, batch summary reports, customer statements, and payment tracking.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism & Modern UI), JavaScript (ES6+)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL real-time client SDK)
- **AI Integration**: Google Gen AI SDK (Gemini API)
- **Charts & Data**: Chart.js, XLSX Export, SignaturePad
- **Hosting / CD**: Netlify

---

## 🚀 Local Development

1. **Clone the Repository**:
   ```bash
   git clone git@github.com:ILLANGASINGHE-AMB/Sagacious_washing_center.git
   cd Sagacious_washing_center
   ```

2. **Run Locally**:
   Simply open `index.html` in any web browser, or serve using a lightweight local web server:
   ```bash
   npx serve .
   ```

---

## 📂 Project Structure

```
Sagacious_washing_center/
├── index.html        # Main POS application shell & layout
├── app.js            # Main application initialization & UI logic
├── db.js             # Supabase database layer & CRUD handlers
├── items.js          # Items catalog & Customer Quotation generator
├── orders.js         # Order creation, status tracking & customer pricing
├── invoice.js        # Invoices, credit bills & PDF printing templates
├── reports.js        # Analytics, charts & financial reports
├── settings.js       # Admin settings & system configuration
├── ui.js             # UI components, modals, toasts & formatters
├── gemini.js         # SAGA AI chat assistant integration
├── keyboard.js       # POS keyboard shortcuts handler
├── confirm.html      # Delivery confirmation page
├── quotation.md      # Quotation document layout specification
├── netlify.toml      # Netlify deployment & build configuration
└── inject-env.js     # Build script for Netlify environment variables
```

---

## 📄 License

Copyright © 2026 **Sagacious Washing Center**. All rights reserved.
