# Transport / Trip Management System – Complete Workflow

## 1. System Login

The user opens the system and is presented with the **Login Screen**.

### Login Process

1. Enter **Username**
2. Enter **Password**
3. Click **Login**
4. System validates the credentials.
5. If the credentials are valid, the user is logged into the system.
6. The system identifies the user's role/permissions.

```text
Login Screen
     ↓
Enter Username
     ↓
Enter Password
     ↓
Click Login
     ↓
Validate Credentials
     ↓
 ┌───────────────┐
 │ Valid Login?  │
 └───────┬───────┘
       Yes│
          ↓
     Dashboard
```

---

# 2. Dashboard

After successful login, the system displays the **Dashboard**.

The Driver can access the functions available according to their permissions.

The Driver selects:

> **Transport**

```text
Login
  ↓
Dashboard
  ↓
Transport
```

---

# 3. Transport Module

The system opens the **Transport** section.

The Driver can:

The system displays summary statistics cards:
- **Total Trips**: Total vehicle trips logged.
- **In Progress**: Currently active ongoing trips.
- **Completed Trips**: Finished trips.
- **Total Distance**: All-time accumulated kilometres.
- **Monthly Distance Travelled & Fuel Cost**: Total distance travelled in the current month, along with the calculated **Monthly Fuel Cost** and **Full Cost** (sum of monthly fuel outlays across all recorded months).

### Admin Fuel Price Configuration:
- Admins can configure **Fuel Price (LKR/Litre)** and **Vehicle Efficiency (KM/Litre)**.
- **Monthly Fuel Cost** = $\text{Monthly Distance} \times \text{Fuel Rate (LKR/KM)}$.
- **Full Cost** = $\sum_{\text{all months}} \text{Monthly Fuel Cost in LKR}$ (accounting for fuel price changes over time).
- Integrated automatically into the **Expenses Tab** under **Financial Balance & Operating Margin Summary**.

Example:

```text
Trip ID      Status
-------------------------
ST-0001      Completed
ST-0002      Completed
ST-0003      In Progress
```

To create a new trip, the Driver selects:

> **New Trip**

---

# 4. Create New Trip

The system opens the **New Trip** screen.

The Driver provides the initial trip information.

### Required Information

- Start Date
- Start Time
- Starting KM

---

# 5. Enter Start Date

The system requests the **Start Date**.

The date may default to the current date.

The Driver can edit the date if required.

Example:

```text
Start Date: 09/08/2026
```

---

# 6. Record Start Time

The system records the **Start Time**.

Normally, the current system time is automatically captured.

Example:

```text
Start Time: 08:30 AM
```

---

# 7. Enter Starting KM

The Driver enters the vehicle's current kilometre reading.

Example:

```text
Starting KM: 45,250 KM
```

This value is stored as the starting kilometre reading for the trip.

---

# 8. Start Trip

After entering the required information, the Driver clicks:

> **Start**

The system:

1. Creates a unique Trip ID.
2. Saves the Start Date.
3. Saves the Start Time.
4. Saves the Starting KM.
5. Sets the trip status to **In Progress**.
6. Opens the customer selection process.

Example:

```text
Trip ID: ST-0004
Status: In Progress

Start Date: 09/08/2026
Start Time: 08:30 AM
Starting KM: 45,250 KM
```

---

# 9. Select Customers

The Driver selects:

> **Select Customer**

The system displays the available customer list.

Example:

```text
Customer List

[ ] Customer A
[ ] Customer B
[ ] Customer C
[ ] Customer D
[ ] Customer E
```

The Driver selects the customers who need to be visited during the trip.

---

# 10. Record Customer Selection Order

The system must record the **order in which the Driver selects the customers**.

For example, the Driver selects:

```text
1. Customer C
2. Customer A
3. Customer D
```

The system stores:

```text
Visit Order 1 → Customer C
Visit Order 2 → Customer A
Visit Order 3 → Customer D
```

Therefore, the intended sequence is:

```text
Customer C
     ↓
Customer A
     ↓
Customer D
```

> **Important Business Rule:** The order of customer selection represents the order in which the customers should be visited/served.

---

# 11. Confirm Customer Selection

After selecting all required customers, the Driver clicks:

> **Done**

The system:

- Validates the customer selection.
- Saves the selected customers.
- Saves their selection/visit order.
- Associates the customers with the current Trip ID.
- Continues the trip workflow.

---

# 12. Add Trip Notes

The system provides an optional:

> **Notes**

field.

The Driver can enter additional information about the trip.

Example:

```text
Notes:
Customer requested delivery after 10:00 AM.
```

The Driver can leave this field empty if there are no additional notes.

---

# 13. Continue / Complete Trip

Once:

- Customers have been selected
- Customer order has been recorded
- Optional notes have been added

the Driver proceeds with the trip.

The trip remains:

```text
Status: In Progress
```

The Driver performs the actual transport/service activity.

```text
Start Trip
    ↓
Travel
    ↓
Visit Customer 1
    ↓
Visit Customer 2
    ↓
Visit Customer 3
    ↓
Trip Activities Completed
```

---

# 14. End Trip

When the Driver has completed the trip, the Driver selects:

> **Complete Trip / End Trip**

The system requests the final trip information.

### End Trip Information

- End Date
- End Time
- Final KM

---

# 15. Record End Date

The system records the date on which the trip ends.

Example:

```text
End Date: 09/08/2026
```

---

# 16. Record End Time

The system captures the current time when the Driver ends the trip.

Example:

```text
End Time: 04:45 PM
```

---

# 17. Enter Final KM

The Driver enters the vehicle's final kilometre reading.

Example:

```text
Final KM: 45,340 KM
```

The system validates the KM reading.

Normally:

```text
Final KM >= Starting KM
```

---

# 18. Calculate Trip Distance

The system calculates the total distance travelled.

### Formula

```text
Distance Travelled = Final KM - Starting KM
```

### Example

```text
Starting KM = 45,250 KM
Final KM    = 45,340 KM

Distance Travelled
= 45,340 - 45,250
= 90 KM
```

---

# 19. Complete and Save Trip

After validating the final information, the system saves the complete trip.

The trip status changes from:

```text
In Progress
```

to:

```text
Completed
```

The system stores the complete trip record.

---

# 20. Final Trip Record

The completed trip contains:

```text
Trip ID
Start Date
Start Time
Starting KM

Selected Customers
Customer Selection Order

Trip Notes

End Date
End Time
Final KM

Distance Travelled

Trip Status
```

Example:

```text
Trip ID: ST-0004

Start Date: 09/08/2026
Start Time: 08:30 AM
Starting KM: 45,250 KM

Customers:
    1. Customer C
    2. Customer A
    3. Customer D

Notes:
    Customer requested delivery after 10:00 AM.

End Date: 09/08/2026
End Time: 04:45 PM
Final KM: 45,340 KM

Distance Travelled: 90 KM

Status: Completed
```

---

# 21. Complete End-to-End Workflow

```text
┌──────────────────────┐
│        LOGIN         │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Enter Username       │
│ Enter Password       │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ Validate Credentials │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│      DASHBOARD       │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   TRANSPORT MODULE   │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│     VIEW TRIPS       │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│      NEW TRIP        │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│     START DATE       │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│     START TIME       │
│   (Current Time)     │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│     STARTING KM      │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│        START         │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   CREATE TRIP ID     │
│   STATUS: IN PROGRESS│
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│  SELECT CUSTOMER     │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   CUSTOMER LIST      │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ SELECT CUSTOMERS     │
│                      │
│ RECORD SELECTION     │
│ ORDER                │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│        DONE          │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   OPTIONAL NOTES     │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│    TRIP IN PROGRESS  │
│                      │
│ Travel & Visit       │
│ Selected Customers   │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│      END TRIP        │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│      END DATE        │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│      END TIME        │
│   (Current Time)     │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│       FINAL KM       │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│ CALCULATE DISTANCE   │
│                      │
│ Final KM - Start KM  │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   VALIDATE DETAILS   │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│     SAVE TRIP        │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│   STATUS: COMPLETED  │
└──────────────────────┘
```

---

# 22. Trip Lifecycle

```text
New Trip
   ↓
In Progress
   ↓
Customer Selection
   ↓
Customer Visit/Service
   ↓
End Trip
   ↓
Completed
```

---

# 23. Main Business Rules

1. Only an authorized user/Driver can access the Transport function.
2. Every new trip must have a unique Trip ID.
3. Start Date must be recorded.
4. Start Time should be captured when the trip starts.
5. Starting KM must be recorded before starting the trip.
6. A trip must have the status **In Progress** while it is active.
7. Multiple customers can be associated with a trip.
8. The **customer selection order must be preserved**.
9. Customer order represents the intended visit/service sequence.
10. Trip Notes are optional.
11. End Date must be recorded when the trip ends.
12. End Time should be captured when the trip is completed.
13. Final KM must be recorded before completing the trip.
14. Final KM should not normally be less than Starting KM.
15. Distance travelled can be calculated using:

```text
Distance = Final KM - Starting KM
```

16. Once all required information is valid, the trip is saved.
17. A successfully completed trip receives the status **Completed**.

---

# 24. Simplified Workflow

```text
LOGIN
  ↓
DASHBOARD
  ↓
TRANSPORT
  ↓
NEW TRIP
  ↓
START DATE + TIME + KM
  ↓
START
  ↓
SELECT CUSTOMERS
  ↓
SAVE CUSTOMER ORDER
  ↓
DONE
  ↓
OPTIONAL NOTES
  ↓
TRIP IN PROGRESS
  ↓
CUSTOMER VISITS / TRANSPORT
  ↓
END TRIP
  ↓
END DATE + TIME + FINAL KM
  ↓
CALCULATE DISTANCE
  ↓
SAVE
  ↓
TRIP COMPLETED
```
