# Implementation Plan: Staff Change Requests & Internal Activity Log

## Overview

Two features to implement:

1. **Staff Account Change Requests** — staff can request profile or bank account changes; admin/internal staff review and approve/reject with locking and audit trail.
2. **Internal Staff Activity Log** — all actions performed by `SUPER_ADMIN`, `COORDINATOR`, `ACCOUNTS` (and other internal roles) are recorded in a central log.

---

## Feature 1: Staff Account Change Requests

### Workflow

```
Staff submits request
        │
        ▼
Request status: PENDING
        │
        ▼
Admin/internal staff views queue → claims review
        │  (reviewer_name locked; no one else can claim)
        ▼
Request status: UNDER_REVIEW
        │
   ┌────┴────┐
   ▼         ▼
APPROVED   REJECTED
   │         │
   └────┬────┘
        ▼
  Log entry created
  Changes applied (if approved)
```

### Request Types

| type | description |
|---|---|
| `PROFILE_UPDATE` | Changes to `full_name`, `home_address`, `location`, `gender`, `date_of_birth`, `willing_to_live_in`, `qualifications`, `nic_number`, `profile_picture_url`, `nic_front_url`, `nic_back_url` |
| `BANK_ACCOUNT_ADD` | Staff wants to add a new bank account |
| `BANK_ACCOUNT_EDIT` | Staff wants to change details on an existing bank account |
| `BANK_ACCOUNT_REMOVE` | Staff wants to deactivate/remove a bank account |

---

## Step 1 — Database Schema

### 1a. Add existing `internal_staff` tables to `migrate.js`

Add the following block to `backend/migrate.js` inside `runMigration()`, after the existing `staff_reviews` table and before the `ALTER TABLE` section:

```sql
-- internal_staff table (already exists in local DB, added here for portability)
CREATE TABLE IF NOT EXISTS internal_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  base_salary DECIMAL(10,2) DEFAULT 0.00,
  joined_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_staff_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES internal_staff(id) ON DELETE CASCADE,
  task_type VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'Pending',
  assigned_date DATE DEFAULT CURRENT_DATE,
  completed_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_staff_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES internal_staff(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_month VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'Pending',
  paid_on TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

Then add the `address` column reconciliation using `ADD COLUMN IF NOT EXISTS`:

```sql
ALTER TABLE internal_staff ADD COLUMN IF NOT EXISTS address TEXT;
```

### 1b. New tables for change requests

```sql
-- Stores the pending/in-review/resolved change requests
CREATE TABLE IF NOT EXISTS staff_change_requests (
  request_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL,
    -- 'PROFILE_UPDATE' | 'BANK_ACCOUNT_ADD' | 'BANK_ACCOUNT_EDIT' | 'BANK_ACCOUNT_REMOVE'
  requested_changes JSONB NOT NULL,
    -- For PROFILE_UPDATE: { field: { old_value, new_value }, ... }
    -- For BANK_ACCOUNT_*: full bank account payload
  target_bank_account_id UUID REFERENCES staff_bank_accounts(staff_bank_account_id),
    -- Only populated for BANK_ACCOUNT_EDIT / BANK_ACCOUNT_REMOVE
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'
  reviewer_user_id UUID REFERENCES users(user_id),
  reviewer_name VARCHAR(255),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Immutable audit log — one row per action taken on a request
CREATE TABLE IF NOT EXISTS staff_change_request_logs (
  log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES staff_change_requests(request_id) ON DELETE CASCADE,
  staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id),
  action VARCHAR(50) NOT NULL,
    -- 'SUBMITTED' | 'CLAIMED' | 'APPROVED' | 'REJECTED'
  performed_by_user_id UUID REFERENCES users(user_id),
  performed_by_name VARCHAR(255) NOT NULL,
  changes_snapshot JSONB,
    -- snapshot of requested_changes at the time of this action
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 1c. New table for activity log

```sql
CREATE TABLE IF NOT EXISTS activity_log (
  log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID REFERENCES users(user_id),
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
    -- e.g. 'CHANGE_REQUEST_CLAIMED', 'CHANGE_REQUEST_APPROVED', 'CHANGE_REQUEST_REJECTED'
  entity_type VARCHAR(50),
    -- e.g. 'STAFF_CHANGE_REQUEST', 'BOOKING', 'STAFF_PROFILE'
  entity_id UUID,
  details JSONB,
    -- any extra context about the action
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_change_requests_staff ON staff_change_requests(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_change_requests_status ON staff_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_staff_change_request_logs_request ON staff_change_request_logs(request_id);
```

---

## Step 2 — Backend: Activity Log Helper

Before the change request API, create a reusable helper so all controllers can log activity in one line.

**New file: `backend/utils/activityLogger.js`**

```js
const db = require('../config/db');

async function logActivity({ actorUserId, actorName, actorRole, actionType, entityType, entityId, details }) {
  await db.query(
    `INSERT INTO activity_log
     (actor_user_id, actor_name, actor_role, action_type, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorUserId, actorName, actorRole, actionType, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logActivity };
```

This helper is used throughout Step 3 and Step 4.

---

## Step 3 — Backend: Change Request Controller & Routes

### New file: `backend/controllers/staffChangeRequestController.js`

Implement the following functions:

| Function | Method | Path | Auth |
|---|---|---|---|
| `submitChangeRequest` | POST | `/api/staff-change-requests` | `protect` + staff roles |
| `getMyChangeRequests` | GET | `/api/staff-change-requests/my` | `protect` + staff roles |
| `getAllChangeRequests` | GET | `/api/staff-change-requests` | `protect` + internal roles |
| `claimChangeRequest` | PATCH | `/api/staff-change-requests/:id/claim` | `protect` + internal roles |
| `resolveChangeRequest` | PATCH | `/api/staff-change-requests/:id/resolve` | `protect` + internal roles |
| `getChangeRequestLogs` | GET | `/api/staff-change-requests/:id/logs` | `protect` + internal roles |

**Key business logic:**

`submitChangeRequest`
- For `PROFILE_UPDATE`: Accept a partial payload of changed fields. For each field present, record `{ old_value: <current_db_value>, new_value: <submitted_value> }` inside `requested_changes` JSONB. Fetch current values from DB to build the diff.
- For `BANK_ACCOUNT_ADD`: Store the full new bank account payload in `requested_changes`.
- For `BANK_ACCOUNT_EDIT`: Require `target_bank_account_id`. Fetch current values and build a diff.
- For `BANK_ACCOUNT_REMOVE`: Store `{ staff_bank_account_id }` in `requested_changes`.
- Insert row into `staff_change_requests`.
- Insert a `SUBMITTED` log into `staff_change_request_logs`.
- Call `logActivity(...)` with `action_type: 'CHANGE_REQUEST_SUBMITTED'`.

`claimChangeRequest`
- Check request exists and is `PENDING`.
- If `reviewer_user_id` is already set → return 409 (already claimed).
- Update `status` to `UNDER_REVIEW`, set `reviewer_user_id` and `reviewer_name` from `req.user`.
- Insert a `CLAIMED` log.
- Call `logActivity(...)` with `action_type: 'CHANGE_REQUEST_CLAIMED'`.

`resolveChangeRequest`
- Accept body: `{ action: 'APPROVE' | 'REJECT', review_notes: string }`.
- Check request exists and `reviewer_user_id === req.user.user_id` (only the claimer can resolve).
- Check status is `UNDER_REVIEW`.
- If `APPROVE`:
  - Apply the changes to the actual tables:
    - `PROFILE_UPDATE` → `UPDATE staff_profiles SET ... WHERE staff_profile_id = ?`
    - `BANK_ACCOUNT_ADD` → `INSERT INTO staff_bank_accounts ...`
    - `BANK_ACCOUNT_EDIT` → `UPDATE staff_bank_accounts SET ... WHERE staff_bank_account_id = ?`
    - `BANK_ACCOUNT_REMOVE` → `UPDATE staff_bank_accounts SET is_active = false WHERE staff_bank_account_id = ?`
  - Update request `status` to `APPROVED`.
- If `REJECT`: Update request `status` to `REJECTED`, store `review_notes`.
- Insert an `APPROVED` or `REJECTED` log into `staff_change_request_logs`.
- Call `logActivity(...)`.

### New file: `backend/routes/staffChangeRequestRoutes.js`

Register routes with appropriate middleware as described in the table above.

### Register in `backend/server.js`

```js
const staffChangeRequestRoutes = require('./routes/staffChangeRequestRoutes');
app.use('/api/staff-change-requests', staffChangeRequestRoutes);
```

---

## Step 4 — Backend: Activity Log Routes

### New file: `backend/controllers/activityLogController.js`

| Function | Method | Path | Auth |
|---|---|---|---|
| `getActivityLog` | GET | `/api/activity-log` | `protect` + `SUPER_ADMIN`, `COORDINATOR` |
| `getActivityLogByActor` | GET | `/api/activity-log/actor/:user_id` | `protect` + `SUPER_ADMIN` |

Support query params: `?page=1&limit=50&action_type=...&from=...&to=...`

### New file: `backend/routes/activityLogRoutes.js`

### Register in `backend/server.js`

```js
const activityLogRoutes = require('./routes/activityLogRoutes');
app.use('/api/activity-log', activityLogRoutes);
```

---

## Step 5 — Frontend: Add API Methods

In `client/src/api/api.js`, add the following methods to the `ApiClient` class:

```js
// Staff-facing
submitChangeRequest(data)        // POST /api/staff-change-requests
getMyChangeRequests()            // GET  /api/staff-change-requests/my

// Admin-facing
getAllChangeRequests(params)      // GET  /api/staff-change-requests?status=PENDING
claimChangeRequest(id)           // PATCH /api/staff-change-requests/:id/claim
resolveChangeRequest(id, data)   // PATCH /api/staff-change-requests/:id/resolve
getChangeRequestLogs(id)         // GET  /api/staff-change-requests/:id/logs

// Activity log
getActivityLog(params)           // GET  /api/activity-log
```

---

## Step 6 — Frontend: Staff Side

### 6a. Add "Request a Change" button to `WorkerDashboardDemo.jsx`

Add a button (e.g., near the profile section or in a new "Account" card) that opens a modal or navigates to a dedicated page.

### 6b. New page: `client/src/modules/public/service_team/StaffChangeRequestPage.jsx`

Route: `/services/change-request`

**UI Sections:**

1. **Request Type Selector** — 4 options (Profile Update, Add Bank Account, Edit Bank Account, Remove Bank Account)

2. **Profile Update Form** — show only editable fields, pre-filled with current values:
   - `full_name`, `home_address`, `location`, `gender`, `date_of_birth`, `willing_to_live_in`, `qualifications`, `nic_number`
   - File upload fields for `profile_picture_url`, `nic_front_url`, `nic_back_url`

3. **Bank Account Forms** — standard fields: `account_holder_name`, `bank_name`, `branch_name`, `account_number`; for Edit/Remove, let staff select from their existing accounts first.

4. **My Requests History** — table showing past requests with status badges.

### 6c. Add route in `App.jsx`

```jsx
<Route path="/services/change-request" element={<StaffChangeRequestPage />} />
```

### 6d. Add sidebar link in `StaffSidebar.jsx`

Add a "Request Change" navigation item.

---

## Step 7 — Frontend: Admin Side

### 7a. New page: `client/src/modules/admin/change_requests/ChangeRequestsPage.jsx`

Route: `/admin/change-requests`

**UI:**
- Tabs or filter: `PENDING` | `UNDER_REVIEW` | `APPROVED` | `REJECTED`
- Table columns: Staff Name, Request Type, Submitted At, Status, Reviewer
- Click row → open detail drawer/modal

**Detail view per request:**
- Show staff info
- Show the diff: for Profile Updates, display old vs new values side by side; for bank account requests, show the payload
- If `PENDING`: show "Claim Review" button
- If `UNDER_REVIEW` and `reviewer_user_id === currentUser.id`: show "Approve" / "Reject" buttons with a notes field
- If `UNDER_REVIEW` but claimed by someone else: show reviewer name, read-only
- Audit log section at the bottom showing all `staff_change_request_logs` entries for this request

### 7b. New page: `client/src/modules/admin/activity_log/ActivityLogPage.jsx`

Route: `/admin/activity-log`

**UI:**
- Date range filter, action type filter, actor filter
- Table: Timestamp, Actor, Role, Action, Entity, Details (expandable)
- Paginated

### 7c. Register admin routes in `App.jsx`

```jsx
<Route path="/admin/change-requests" element={<ChangeRequestsPage />} />
<Route path="/admin/activity-log" element={<ActivityLogPage />} />
```

### 7d. Add links in admin sidebar/nav

Add "Change Requests" and "Activity Log" entries to the admin navigation.

---

## Implementation Order

| # | Task | Touches |
|---|---|---|
| 1 | Add internal_staff tables + new schema tables to `migrate.js` | `backend/migrate.js` |
| 2 | Create `activityLogger.js` helper | `backend/utils/activityLogger.js` (new) |
| 3 | Create `staffChangeRequestController.js` | new file |
| 4 | Create `staffChangeRequestRoutes.js` | new file |
| 5 | Register change request routes in `server.js` | `backend/server.js` |
| 6 | Create `activityLogController.js` | new file |
| 7 | Create `activityLogRoutes.js` | new file |
| 8 | Register activity log routes in `server.js` | `backend/server.js` |
| 9 | Add API methods to `api.js` | `client/src/api/api.js` |
| 10 | Build `StaffChangeRequestPage.jsx` | new file |
| 11 | Add "Request a Change" entry point in `WorkerDashboardDemo.jsx` | existing file |
| 12 | Add staff route + sidebar link | `App.jsx`, `StaffSidebar.jsx` |
| 13 | Build `ChangeRequestsPage.jsx` (admin) | new file |
| 14 | Build `ActivityLogPage.jsx` (admin) | new file |
| 15 | Add admin routes + nav links | `App.jsx`, admin nav component |

---

## Notes & Decisions

- **JSONB for `requested_changes`**: Flexible enough to hold profile diffs and bank account payloads without separate columns for each field. The `changes_snapshot` in the log table captures the state at decision time.
- **Reviewer locking**: Done at the DB level — `UPDATE ... WHERE status='PENDING' AND reviewer_user_id IS NULL` with a check on the returned row count. If 0 rows updated, return 409.
- **Applying changes**: Only happens inside `resolveChangeRequest` on `APPROVE`. The controller reads the `requested_changes` JSONB and applies them field by field. File URL fields (profile picture, NIC) are stored as-is since uploads are handled separately before the change request is submitted.
- **Activity log scope**: Initially covers `SUPER_ADMIN`, `COORDINATOR`, `ACCOUNTS` performing actions on change requests. Other action types (booking management, payment approvals) can be added later by calling `logActivity()` in the relevant controllers.
- **No soft-delete on requests**: Requests are never deleted; they are resolved with APPROVED or REJECTED status.
