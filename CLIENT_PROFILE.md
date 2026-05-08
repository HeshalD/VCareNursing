# VCareNursing Client Profile Implementation Guide

This document outlines a comprehensive set of features for building a client profile page in your VCareNursing application. It leverages the existing database schema from `migrate.js` to maximize the use of stored data. Each feature is listed as a step-by-step recommendation, allowing you to implement them one by one.

The features are grouped by category for clarity. For each feature, I've included:
- **Description**: What the feature entails.
- **Data Sources**: Relevant tables from the database.
- **Implementation Notes**: High-level guidance on backend/frontend changes.
- **Checklist**: Mark as complete once implemented.

## Prerequisites
- Ensure your database is migrated using `migrate.js`.
- Backend: Use controllers (e.g., `clientController.js`) for data fetching via JOINs.
- Frontend: Build in `client/modules/` using React components.
- Security: Restrict access to authenticated clients/admins via `authMiddleware.js`.

## 1. Basic Client Information (Core Profile)
- **Description**: Display and allow editing of core client details for a quick overview.
- **Data Sources**: `client_profiles` (joined with `users`).
- **Implementation Notes**:
  - Backend: Add a GET endpoint in `clientController.js` to fetch profile data.
  - Frontend: Create a profile component with editable fields (e.g., address, email).
  - Include wallet balance as a key metric.
- **Checklist**:
  - [x] Backend endpoint for fetching profile data.
  - [x] Frontend profile component with display/edit functionality.
  - [x] Validation for updates (e.g., email format).

## 2. Service Requests and Quotations
- **Description**: List all service requests with associated quotes and payment proofs.
- **Data Sources**: `service_requests`, `quotations`, `payment_slips`.
- **Implementation Notes**:
  - Backend: Query requests with JOINs to quotations and slips.
  - Frontend: Use a table or list component to display requests, with expandable quote details.
  - Show status (e.g., NEW_LEAD, SENT) and allow filtering.
- **Checklist**:
  - [ ] Backend query for requests + quotes.
  - [ ] Frontend list component for requests.
  - [ ] Display payment slips with verification status.

## 3. Active and Past Bookings
- **Description**: Show all bookings, including assigned staff, swaps, and terminations.
- **Data Sources**: `bookings`, `staff_profiles`, `staff_swaps`, `service_terminations`.
- **Implementation Notes**:
  - Backend: JOIN bookings with staff details and swaps.
  - Frontend: Dashboard view with booking cards, including overdue flags (e.g., if `actual_end_time` is null).
  - Highlight active vs. completed bookings.
- **Checklist**:
  - [ ] Backend endpoint for bookings with staff info.
  - [ ] Frontend booking list with status indicators.
  - [ ] Include staff swap and termination details.

## 4. Patient Management
- **Description**: Manage and display patients under the client account.
- **Data Sources**: `patient_profiles`, `bookings` (via `patient_id`).
- **Implementation Notes**:
  - Backend: Fetch patients and link to their bookings.
  - Frontend: Patient list with details; allow adding/editing patients.
  - Cross-reference with bookings for personalized views.
- **Checklist**:
  - [ ] Backend patient fetch with booking links.
  - [ ] Frontend patient management component.
  - [ ] Edit/add patient functionality.

## 5. Financial and Payment History
- **Description**: Provide full transaction history, including overdue payments.
- **Data Sources**: `transactions`, `bookings`.
- **Implementation Notes**:
  - Backend: Query transactions by `client_id`; calculate overdue by comparing dates.
  - Frontend: Transaction table with filters (e.g., by category/type).
  - Integrate wallet balance from `client_profiles`.
- **Checklist**:
  - [ ] Backend transaction history endpoint.
  - [ ] Frontend payment dashboard.
  - [ ] Overdue payment alerts/highlights.

## 6. Reviews and Feedback
- **Description**: Display client-submitted reviews for staff.
- **Data Sources**: `staff_reviews`.
- **Implementation Notes**:
  - Backend: Fetch reviews by `client_profile_id`.
  - Frontend: Review list with ratings; show aggregate stats.
  - Allow submitting new reviews if not already implemented.
- **Checklist**:
  - [ ] Backend review fetch.
  - [ ] Frontend review display component.
  - [ ] Aggregate rating calculations.

## 7. Alerts and Notifications
- **Description**: Show recent alerts for the client.
- **Data Sources**: `client_alerts`.
- **Implementation Notes**:
  - Backend: Query alerts by `client_id`.
  - Frontend: Notification panel or inbox.
  - Integrate with real-time updates if possible.
- **Checklist**:
  - [ ] Backend alert endpoint.
  - [ ] Frontend alert display.
  - [ ] Mark as read functionality.

## 8. Additional Aggregated Insights
- **Description**: Provide summaries like total bookings, spent amount, and preferred staff.
- **Data Sources**: Aggregations from `bookings`, `transactions`, `service_requests`.
- **Implementation Notes**:
  - Backend: Use SQL aggregates (e.g., COUNT, SUM) for summaries.
  - Frontend: Dashboard widgets (e.g., charts for statuses).
  - Include location maps using GPS data.
- **Checklist**:
  - [ ] Backend summary calculations.
  - [ ] Frontend dashboard widgets.
  - [ ] Visual elements (e.g., maps, charts).

## Implementation Considerations
- **Queries**: Use JOINs for efficiency (e.g., `SELECT b.*, sp.full_name FROM bookings b LEFT JOIN staff_profiles sp ON b.assigned_staff_id = sp.staff_profile_id`).
- **Performance**: Add database indexes on foreign keys (e.g., `client_id`) if queries are slow.
- **Security**: Authenticate all endpoints; use roles from `users.role`.
- **Testing**: After each feature, test with sample data and run builds/tests.
- **Frontend Tools**: Use components from `client/components/`; consider libraries like Chart.js for visuals.
- **Extensions**: If data is missing (e.g., product purchases), note in future migrations.

Track your progress by checking off items. If you need code snippets or help with a specific feature, refer back to the original recommendations or ask for implementation details!