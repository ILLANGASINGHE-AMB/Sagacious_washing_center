# Sagacious Washing Center — Financial Equations & Calculation Reference

This document provides a clean, simple, and straightforward reference for every equation used in the SAGA Washing Center ERP system.

---

## 1. Order Calculations (`orders.js`)

### A. Items Subtotal
Total price of all clothes/items in the order before any discounts:
$$\text{Items Subtotal} = \sum (\text{Quantity} \times \text{Unit Price})$$

### B. Discount Amount
Discount applied only to laundry items (not applied to delivery or extra charges):
$$\text{Discount Amount} = \text{Items Subtotal} \times \left(\frac{\text{Discount Rate \%}}{100}\right)$$

### C. Order Grand Total
$$\text{Order Grand Total} = (\text{Items Subtotal} - \text{Discount Amount}) + \text{Delivery Charge} + \text{Extra Payment}$$

### D. Order Status
- **Paid**: If $\text{Advance Payment} \ge \text{Order Grand Total}$
- **Unpaid**: If $\text{Advance Payment} < \text{Order Grand Total}$

---

## 2. Invoice Calculations (`invoice.js` & `financials.js`)

### A. Gross Invoice Total
Total bill before any customer dispute/damage deductions:
$$\text{Gross Total} = (\text{Items Subtotal} - \text{Discount Amount}) + \text{Delivery Charge} + \text{Extra Payment}$$

### B. Final Net Payable Total
Final amount owed by customer after subtracting approved deductions (e.g. damaged linen):
$$\text{Final Net Payable} = \text{Gross Total} - \text{Deductions / Damage Amount}$$

### C. Total Paid
All money received so far from the customer for this invoice:
$$\text{Total Paid} = \text{Advance Payment} + \sum (\text{Recorded Payments})$$

### D. Balance Due (Outstanding Amount)
$$\text{Balance Due} = \max(0, \text{Final Net Payable} - \text{Total Paid})$$

### E. Invoice Payment Status
- **Paid**: If $\text{Balance Due} \le 0$
- **Partially Paid**: If $\text{Total Paid} > 0$ and $\text{Balance Due} > 0$
- **Unpaid**: If $\text{Total Paid} = 0$

---

## 3. Expense & Transport Calculations (`expenses.js`, `transport.js`)

### A. Multi-Month Expense Averaging (Amortization)
Spreads long-term expenses (e.g. 12-month insurance, quarterly licenses) evenly across months:
$$\text{Monthly Expense Share} = \frac{\text{Total Expense Amount}}{\text{Months Covered}}$$

### B. Chemical Stock Costs (Two Costing Options)
1. **Cash Outflow (Purchases)**: Sum of all chemical purchase bills in the period:
   $$\text{Chemical Expense} = \sum (\text{Purchase Inflow Amount})$$
2. **COGS (Actual Usage)**: Value of chemicals actually consumed in washing machines:
   $$\text{Chemical Expense (COGS)} = \sum (\text{Quantity Used} \times \text{Unit Purchase Price})$$

### C. Transport Fuel Cost per Trip
$$\text{Cost Per KM} = \frac{\text{Fuel Price per Litre}}{\text{KM per Litre}}$$
$$\text{Trip Fuel Cost} = \text{Trip Distance (KM)} \times \text{Cost Per KM}$$

---

## 4. Executive Analytics & Profit / Loss (`analytics.js`)

### A. Booked Revenue vs. Net Booked Revenue (Accrual Basis)
$$\text{Gross Revenue} = \sum (\text{Order Grand Totals in period})$$
$$\text{Net Booked Revenue} = \text{Gross Revenue} - \sum (\text{Invoice Deductions in period})$$

### B. Cash Collected (Realized Cash Flow Basis)
Actual cash in hand received during the period:
$$\text{Cash Collected} = \sum (\text{Advance Payments in period}) + \sum (\text{Payments Received in period})$$

### C. Total Operating Expenses (OPEX)
$$\text{Total Expenses} = \text{Amortized General Expenses} + \text{Chemical Expenses} + \text{Transport Fuel Costs}$$

### D. Net Operating Profit
$$\text{Net Profit} = \text{Net Booked Revenue} - \text{Total Expenses}$$

### E. Profit Margin %
Percentage of sales kept as profit:
$$\text{Profit Margin \%} = \left(\frac{\text{Net Profit}}{\text{Net Booked Revenue}}\right) \times 100$$

### F. Operating Cost Ratio %
Percentage of revenue consumed by expenses:
$$\text{Cost Ratio \%} = \left(\frac{\text{Total Expenses}}{\text{Net Booked Revenue}}\right) \times 100$$

### G. Average Order Value (AOV)
$$\text{Average Order Value} = \frac{\text{Net Booked Revenue}}{\text{Total Number of Orders}}$$

### H. Outstanding Receivables
Total unpaid money owed to the business across all customers:
$$\text{Total Uncollected Receivables} = \sum (\text{Balance Due on Unpaid Invoices})$$
