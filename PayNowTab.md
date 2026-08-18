## Pay Now Tab ##

Changes to make in PayNow Tab,

When I Pay one order or batch pay, the printing option generates for all the bills that i pay, remove that popping up preinting option in paynow option,

Remove the invoice number column, and check why there is a invoice number, if the orders in pay now are still in upaid status, 

When use Batch Pay Option, in Batch Pay Summary Window, add two new buttons as |Single Invoice| and |Separate Invoice|. 
If i use |Single Invoice| all the batch pay bills should save under one invoice number, but they have different order ids,
If i use |Seaparate Invoice| all the batch pay bills should save under as unique and separate invoice numbers.

## Batch Pay Summay Window ##
 current table view in the batch pay summary is this
 Customer Name	Order #	Invoice #	Amount (LKR)

 I want new summary table to be in this format

 |OrderID|Customer|Invoice No|Amount(LKR)|PickupDate|

 ## New Feature ##

 want an option to see overdue days of each order,
 add a column to the main pay now page over view 

Change BatchID ---> Order ID

|Order ID|	Customer|Status|Pickup Date| Unpaid Balance|   OverDue(days)|	Actions(add that hide unhide button)|

OverDue days are calclated from the date when the order is placed untill now (untill the status is unpaid)

## Partial Payments ##

Add a new status as partial. This is for partially paid orders.

In Partial Payment Windows, The real time calclation should show,

|Unpaid Balance - Balance Remaining| 

