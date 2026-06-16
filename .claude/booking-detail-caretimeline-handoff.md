---
name: booking-detail-caretimeline-handoff
description: "Handoff state for BookingDetailPage + CareTimeline feature work — what was built, what's unresolved, and where to resume"
metadata: 
  node_type: memory
  type: project
  originSessionId: 18dc4bf2-c4d1-464b-b83b-613669a95f8a
---

## What was built (sessions ending 2026-06-15)

### BookingDetailPage redesign
File: `client/src/modules/admin/bookings/BookingDetailPage.jsx`

Full visual redesign from dark-theme to warm-white card palette (`#FBF9F4` / `bg-white border border-[#ECE7DF]`). New layout:
- **Hero card** at top: back button, booking code badge, patient name + service type as H1, status pill, subtitle line
- **4 stat cards**: Total paid, Outstanding, Days served, Daily rate
- **CareTimeline** component inline below stat cards (always visible, above tabs)
- **6-tab pill switcher**: Payments | Staff & Swaps | Client & Care | Settlement | Termination | Overview

### CareTimeline component
File: `client/src/modules/admin/bookings/CareTimeline.jsx`

New standalone component (did not exist before). Week-by-week calendar grid showing each care day. See [[care-timeline-design]] for full design spec.

### Simulation feature
- `simDate` state (YYYY-MM-DD | null) lives in **BookingDetailPage** (not in CareTimeline)
- Passed down as controlled prop pair: `simDate={simDate}` + `onSimDateChange={setSimDate}`
- When simDate is set: stat cards show yellow tint + "SIM" badge, values recalculate from the sim date
- CareTimeline auto-scrolls to the week containing simDate when it changes
- "Test date" button in CareTimeline header opens a date picker dropdown

### Overrun handling
- `servedDays` and `paidDays` are NOT capped at `plannedDays`
- `displayDays = Math.max(plannedDays, servedDays)` — cell count expands when booking overruns
- Overrun cells (dayNum > plannedDays) get dashed red border `1.5px dashed #E8A09A`
- Progress bar and "Day X" label both handle overrun state

### Staff swap start date picker
- Step 2 of the swap modal now has a "New staff start date" field (date input, default = today)
- Sent to API as `new_staff_start_date` in the `swapBookingStaff` call
- Reset on modal close

### getNurseForDay fix
Fixed to use **latest-starting match** instead of first match:
- Iterates all assignments, picks the one with the latest `service_start_date` that still covers the day
- Without this fix, old nurse (no end date) would shadow new nurse on all days after swap

### Allocation history redesign
Replaced table with colour-coded cards:
- Each card uses the nurse's colour (left border + tinted background + avatar)
- Colours match the CareTimeline grid cells
- Shows Day X → Day Y range badge + date text + day count + allocated amount
- Effective end date inference: if `service_end_date` is null and a later assignment exists, effective end = day before next assignment's start

---

## Known unresolved issue

**Allocation history date ranges are still not showing what the user wants.** The root cause is likely one of:

1. The backend `staff_assignment_history` API response doesn't include proper `service_start_date` / `service_end_date` fields on old assignments after a swap — the new assignment may have a `service_start_date` but the old one may still show null for `service_end_date`, and the effective end inference may still produce wrong day numbers if dates are in UTC vs local time.

2. The `colorKey` lookup in `normalizedStaffHistory` uses `r.staff_profile_id || r.staffId || r.id` but the actual field name in the API response may differ — if the key doesn't match between the color map and the row, all swatches fall back to grey.

**To debug**: `console.log(detail.staff_assignment_history)` on the booking detail API response and check: what fields does each assignment row actually have? Specifically: `staff_profile_id`, `service_start_date`, `service_end_date` for both the original and the swapped-in nurse.

**User expectation**: 3-day booking, swap initiated at day 2 → allocation history should show Nurse A: Day 1 only, Nurse B: Day 2 → ongoing. Timeline cells should show Nurse A colour on day 1, Nurse B colour on days 2–3.

---

## Key files

| File | Role |
|---|---|
| `client/src/modules/admin/bookings/BookingDetailPage.jsx` | Parent — owns simDate state, stat cards, all tab panels |
| `client/src/modules/admin/bookings/CareTimeline.jsx` | Calendar grid component (controlled by parent for simDate) |

## How to apply
Resume from the allocation history issue. Before making further frontend changes, log the raw `staff_assignment_history` array from the API to see what field names and values are actually returned, then reconcile with the normalization logic in `normalizedStaffHistory` (around line 240 of BookingDetailPage.jsx).
