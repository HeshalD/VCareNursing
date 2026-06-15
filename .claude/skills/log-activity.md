# log-activity

Add activity logging to a backend controller action in VCareNursing.

## Usage

```
/log-activity <controller_file> <function_name> <ACTION_TYPE> <ENTITY_TYPE>
```

**Example:**
```
/log-activity staffController.js createStaffProfile STAFF_PROFILE_CREATED STAFF_PROFILE
/log-activity bookingController.js cancelBooking BOOKING_CANCELLED BOOKING
/log-activity clientController.js createClient CLIENT_CREATED CLIENT_PROFILE
```

**Arguments:**
- `controller_file` — filename inside `backend/controllers/`
- `function_name` — the exported function to add logging to
- `ACTION_TYPE` — SCREAMING_SNAKE_CASE label for the action (stored in `action_type` column)
- `ENTITY_TYPE` — SCREAMING_SNAKE_CASE entity name (stored in `entity_type` column)

---

## How activity logging works in this project

The logger lives at `backend/utils/activityLogger.js`:

```js
async function logActivity({ actorUserId, actorName, actorRole, actionType, entityType, entityId, details }) {
  await db.query(
    `INSERT INTO activity_log
     (actor_user_id, actor_name, actor_role, action_type, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorUserId, actorName, actorRole, actionType, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}
```

The `activity_log` table columns:
| Column | Type | Notes |
|---|---|---|
| `actor_user_id` | UUID | `req.user.user_id` |
| `actor_name` | TEXT | looked up from `staff_profiles.full_name`, fallback `'Admin'` |
| `actor_role` | TEXT | first role string from `req.user.role` |
| `action_type` | TEXT | e.g. `STAFF_PROFILE_CREATED` |
| `entity_type` | TEXT | e.g. `STAFF_PROFILE` |
| `entity_id` | TEXT | primary key of the affected row as string |
| `details` | JSONB | any extra context — names, statuses, amounts, etc. |

---

## Steps to execute

### 1. Add import (if not already present)

At the top of `backend/controllers/<controller_file>`, add:

```js
const { logActivity } = require('../utils/activityLogger');
```

Check first — many controllers already import it.

### 2. Find the right insertion point

Inside the target function, find where the primary operation succeeds (after `await db.query(insertQuery, ...)` or `await db.query(updateQuery, ...)` returns the result row). Add the log block **after** that, **before** the `res.json(...)` response.

### 3. Add the non-fatal log block

```js
// Activity log (non-fatal)
try {
    const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    const actorNameResult = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
    const actorName = actorNameResult.rows[0]?.full_name || 'Admin';
    await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
        actionType: '<ACTION_TYPE>',
        entityType: '<ENTITY_TYPE>',
        entityId: String(result.rows[0].<primary_key_field>),
        details: { /* relevant fields: names, statuses, amounts */ }
    });
} catch (logErr) {
    console.error('Activity log failed (<function_name>):', logErr.message);
}
```

Replace:
- `<ACTION_TYPE>` — the action label passed as argument
- `<ENTITY_TYPE>` — the entity label passed as argument
- `<primary_key_field>` — the primary key returned by the insert/update (e.g. `booking_id`, `staff_profile_id`, `client_profile_id`)
- `details` — include human-readable fields that would be useful in the audit log (names, statuses, amounts, roles)

### 4. Rules to follow

- **Always wrap in try/catch** — a log failure must never break the main operation
- **Always call `String()`** on the entity ID — the column is TEXT
- **Never log passwords, tokens, or raw NIC/document data** in details
- **`req.user` must be in scope** — only applies to routes protected by `protect` middleware. If the route is public (e.g. staff application submission), use the applicant's data directly instead of `req.user`
- For public routes without `req.user`, use:
  ```js
  actorUserId: null,
  actorName: full_name,  // applicant's name from req.body
  actorRole: 'PUBLIC',
  ```

---

## Common ACTION_TYPE values already in use

| Action | Entity |
|---|---|
| `APPLICATION_ACCEPTED` | `STAFF_APPLICATION` |
| `APPLICATION_REJECTED` | `STAFF_APPLICATION` |
| `APPLICATION_SUBMITTED` | `STAFF_APPLICATION` |
| `BOOKING_CREATED` | `BOOKING` |
| `BOOKING_CANCELLED` | `BOOKING` |
| `STAFF_PROFILE_CREATED` | `STAFF_PROFILE` |
| `STAFF_ASSIGNED` | `BOOKING` |
| `PAYMENT_RECORDED` | `PAYMENT` |
| `TRANSACTION_CREATED` | `TRANSACTION` |
| `PATIENT_CREATED` | `PATIENT` |
| `PATIENT_UPDATED` | `PATIENT` |

Follow the same naming pattern: `<NOUN>_<PAST_TENSE_VERB>`.
