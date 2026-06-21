# add-entity-code

Add a human-readable code column (e.g. SR-00001) to a backend entity, replacing UUID display throughout the stack.

## Usage

```
/add-entity-code <EntityName> <table_name> <code_prefix> <controller_file> [frontend_files...]
```

**Example:**
```
/add-entity-code ServiceRequest service_requests SR serviceRequestController.js "admin/service_requests/ServiceRequests.jsx"
```

**Arguments:**
- `EntityName` — PascalCase name (for context/description only)
- `table_name` — exact PostgreSQL table name
- `code_prefix` — 2-3 letter prefix, e.g. SR, AR, INV
- `controller_file` — filename inside `backend/controllers/`
- `frontend_files` — space-separated relative paths inside `client/src/modules/`

---

## Steps to execute

### 1. migrate.js

Add this block immediately before the `// SEED DEFAULT PRESET ITEMS` comment in `backend/migrate.js`:

```js
  // HUMAN-READABLE CODE: <table_name>
  await db.query(`CREATE SEQUENCE IF NOT EXISTS <table_name>_code_seq START 1`);
  await db.query(`ALTER TABLE <table_name> ADD COLUMN IF NOT EXISTS <table_name_singular>_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE <table_name>
    SET <table_name_singular>_code = '<PREFIX>-' || LPAD(nextval('<table_name>_code_seq')::text, 5, '0')
    WHERE <table_name_singular>_code IS NULL
  `);
  await db.query(`
    ALTER TABLE <table_name>
    ALTER COLUMN <table_name_singular>_code SET DEFAULT '<PREFIX>-' || LPAD(nextval('<table_name>_code_seq')::text, 5, '0')
  `);
```

Where `<table_name_singular>` is the singular form of `<table_name>` (e.g. `service_requests` → `service_request`).

### 2. Controller

In every `SELECT` query that reads from the table (look for `FROM <table_name>` with alias, e.g. `FROM service_requests sr`), add:
```sql
sr.<table_name_singular>_code,
```
immediately after the primary ID field (e.g. `sr.request_id,`).

Also update any `INSERT ... RETURNING <id>` to `RETURNING <id>, <table_name_singular>_code`, and include it in the response object.

### 3. Frontend

In each frontend file, find all places that display the UUID id (e.g. `{b.request_id}`, `#{b.request_id || b.id}`).

Replace display occurrences with:
```jsx
{b.<table_name_singular>_code || b.<primary_id_field>}
```

Keep the UUID in:
- `navigate(...)` calls — URLs still use UUID
- API call parameters — backend routes still use UUID
- `key={...}` props — React keys still use UUID

Replace label text like `"Request ID"` with `"Request Code"` or just the entity name.

---

## Pattern reference (from Bookings implementation)

- Column name: `booking_code VARCHAR(15) UNIQUE`
- Sequence: `booking_code_seq`
- Format: `BK-00001`
- Migration: idempotent — `IF NOT EXISTS`, `WHERE code IS NULL`, `SET DEFAULT`
- Controller: added `b.booking_code` to all SELECT queries and INSERT RETURNING
- Frontend fallback: `b.booking_code || b.booking_id` — graceful for rows created before migration

## Notes

- The UUID stays as the primary key and in all URL routes — only the display changes
- The `|| b.<id>` fallback in JSX handles any rows that existed before migration ran
- `SELECT *` queries (like `getActiveBookings`) automatically include the new column — no change needed
