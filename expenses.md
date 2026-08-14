Chemicals — System Structure

1. Navigation Flow

System Login
    ↓
Expenses Tab
    ↓
Add Expense Category
    ↓
Expenses Table

=== First Structure for Chemicals ====
```text
System Login
    ↓
Expenses Tab
    ↓
Chemicals
    ↓
Table View of Current Chemical Expenses / Stock
```

────────

2. Chemicals Table View

The Chemicals table follows the structure shown in the handwritten record.

Each Chemical is a grouped column that is divided into three sub-columns:

```text
IN | OUT | BAL
```

The overall table structure is:

```text
┌────────────┬─────────────────────────────┬─────────────────────────────┬─────────────────────────────┐
│    Date    │         Chemical 01         │         Chemical 02         │         Chemical 03         │
│            │   IN   │  OUT   │   BAL     │   IN   │  OUT   │   BAL     │   IN   │  OUT   │   BAL     │
├────────────┼─────────┼─────────┼──────────┼─────────┼─────────┼──────────┼─────────┼─────────┼──────────┤
│ 04/04/2026 │         │         │          │         │         │          │         │         │          │
│ 09/07/2026 │         │         │          │         │         │          │         │         │          │
│ 20/01/2026 │         │         │          │         │         │          │         │         │          │
└────────────┴─────────┴─────────┴──────────┴─────────┴─────────┴──────────┴─────────┴─────────┴──────────┘
```

Conceptually:

```text
Date
│
├── Chemical 01
│   ├── IN
│   ├── OUT
│   └── BAL
│
├── Chemical 02
│   ├── IN
│   ├── OUT
│   └── BAL
│
├── Chemical 03
│   ├── IN
│   ├── OUT
│   └── BAL
│
└── Chemical N
    ├── IN
    ├── OUT
    └── BAL
```

────────

3. Chemical Identification

Each chemical must have a unique Chemical ID inside the system.

Example:

```text
Chemical ID: CHM-0001
Chemical Name: Supermat
```

```text
Chemical ID: CHM-0002
Chemical Name: Oxalic Acid
```

```text
Chemical ID: CHM-0003
Chemical Name: Organic Chlorine Bleach
```

The Chemical ID identifies the chemical/product, not an individual purchase.

Example Chemical Master

|Updated Date|Chemical ID|Chemical Name          |Standard Package Size|Purchased|Remaining|Status|
|------------|-----------|-----------------------|---------------------|---------|---------|------|
|2026-04-04  |CHM-0001   |Supermat               |5 kg                 |+20.00 kg|15.00 kg |Active|
|2026-07-09  |CHM-0002   |Oxalic Acid            |10 kg                |+10.00 kg|8.50 kg  |Active|
|2026-01-20  |CHM-0003   |Organic Chlorine Bleach|25 kg                |+25.00 kg|20.00 kg |Active|
|2026-02-15  |CHM-0004   |Emolshi Fire           |1 L                  |+1.00 L  |500.00 ml|Active|
|2026-03-01  |CHM-0005   |Safna                  |500 ml               |+0.00 ml |0.00 ml  |Active|

The Chemical ID should remain permanent even if the chemical name is later edited.

────────

4. Expense Identification

Every individual purchase/expense should have its own unique Expense ID.

Recommended structure:

```text
Expense ID
Expense Date
Chemical ID
Chemical Name
Quantity
Unit
Unit Price
Total Amount
```

Example:

```text
Expense ID:    EXP-2026-00001
Date:          2026-04-04
Chemical ID:   CHM-0001
Chemical:      Supermat
Quantity IN:   1 kg
```

Another purchase of the same chemical:

```text
Expense ID:    EXP-2026-00002
Date:          2026-07-09
Chemical ID:   CHM-0001
Chemical:      Supermat
Quantity IN:   1 kg
```

Both expenses refer to:

```text
CHM-0001
```

but they have different Expense IDs.

────────

5. Chemical ID vs Expense ID

These two IDs have different purposes.

```text
Chemical ID
    ↓
Identifies the chemical/product
```

```text
Expense ID
    ↓
Identifies one specific purchase/expense transaction
```

Example:

```text
CHM-0001
Supermat
    │
    ├── EXP-2026-00001
    │   Date: 2026-04-04
    │   IN: 1 kg
    │
    ├── EXP-2026-00002
    │   Date: 2026-07-09
    │   IN: 1 kg
    │
    └── EXP-2026-00003
        Date: 2026-01-20
        IN: 1 kg
```

This allows the system to track multiple purchases of the same chemical without creating duplicate chemical records.

────────

6. Complete System Flow

```text
System Login
     │
     ▼
Dashboard
     │
     ▼
Expenses Tab
     │
     ├── General Expenses
     │
     ├── Chemicals
     │      │
     │      ▼
     │   Chemicals Table
     │      │
     │      ├── Date
     │      │
     │      ├── Chemical 01
     │      │      ├── IN
     │      │      ├── OUT
     │      │      └── BAL
     │      │
     │      ├── Chemical 02
     │      │      ├── IN
     │      │      ├── OUT
     │      │      └── BAL
     │      │
     │      └── Chemical N
     │             ├── IN
     │             ├── OUT
     │             └── BAL
     │
     └── Other Expenses
```

────────

7. Chemical Master

Before a chemical can appear in the Chemicals table, it should exist in the system’s Chemical Master.

Recommended fields:

```text
Chemical ID
Chemical Name
Unit
Package Size
Price
Status
Created Date
Updated Date
```

Example:

```text
Chemical ID:  CHM-0001
Name:         Supermat
Unit:         kg
Package Size: 5 kg
Price:        [value]
Status:       Active
```

────────

8. Expense Record

Recommended expense record fields:

```text
Expense ID
Expense Date
Chemical ID
Quantity
Unit
Unit Price
Total Amount
```

Example:

```text
Expense ID:    EXP-2026-00001
Expense Date:  2026-04-04
Chemical ID:   CHM-0001
Quantity:      1
Unit:          kg
Unit Price:    2160.00
Total Amount:  2160.00
```

The system should calculate:

```text
Total Amount = Quantity × Unit Price
```

rather than relying on a manually entered total.

────────

9. Stock Table Logic

The visible table uses:

```text
IN | OUT | BAL
```

For a particular chemical:

```text
BAL = Previous BAL + IN - OUT
```

Example:

```text
Opening Balance = 0 kg

IN  = 5 kg
OUT = 1 kg

BAL = 0 + 5 - 1
    = 4 kg
```

The balance should be calculated by the system rather than manually entered whenever possible.

────────

10. Final Structure

The complete system concept is:

```text
SYSTEM
│
├── Login
│
├── Dashboard
│
└── Expenses
    │
    ├── General Expenses
    │
    ├── Chemicals
    │   │
    │   ├── Chemical Master
    │   │   ├── CHM-0001
    │   │   ├── CHM-0002
    │   │   ├── CHM-0003
    │   │   └── ...
    │   │
    │   └── Chemical Table
    │       │
    │       ├── Date
    │       ├── Chemical 01
    │       │   ├── IN
    │       │   ├── OUT
    │       │   └── BAL
    │       ├── Chemical 02
    │       │   ├── IN
    │       │   ├── OUT
    │       │   └── BAL
    │       └── Chemical N
    │           ├── IN
    │           ├── OUT
    │           └── BAL
    │
    └── Other Expenses
```

Key Rule

> **Chemical ID identifies the chemical. Expense ID identifies the individual expense/purchase.**

This allows the system to maintain the same table structure as the handwritten chemical register while keeping every chemical and every expense uniquely identifiable.