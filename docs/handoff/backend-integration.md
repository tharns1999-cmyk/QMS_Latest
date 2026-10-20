# DCC Backend Integration Handoff

This document provides essential context for the backend developer migrating the QMS Portal from its mock Zustand frontend store to a real database-backed API architecture.

## 1. Frontend Architecture

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand (`apps/web/src/store/useStore.js`)
- **Routing**: React Router DOM (`apps/web/src/app/App.jsx`)
- **Testing**: Vitest (Unit/Integration) and Playwright (E2E)

The frontend currently operates entirely in the browser using an in-memory/localStorage mock database via Zustand. The backend developer's goal is to replace the data operations in `useStore.js` with standard `fetch` or `axios` API calls.

## 2. Active Routes

The active production routes are defined in `apps/web/src/app/App.jsx` under the `/dcc` path:
- `/dcc/dashboard` - Main overview
- `/dcc/dar/new/*` - New Document Action Requests (New, Revise, Obsolete)
- `/dcc/dar/list` - List of active DARs
- `/dcc/dar/:id` - DAR detail view
- `/dcc/tasks/*` - User inbox and task execution views (Review, Approve, Acknowledge, Revise)
- `/dcc/library` - Document Master List (Active documents)
- `/dcc/viewer/:docId/:rev` - PDF viewer wrapper
- `/dcc/admin/*` - Admin reports and action logs
- `/dcc/controlled-copy` - Controlled Copy distribution register
- `/dcc/external-docs` - External Documents register
- `/dcc/master-list` - Unified Master List view
- `/dcc/periodic-reviews` - Periodic Review dashboards and execution

## 3. Zustand Data Models (To become Database Tables)

Currently, the following entities exist as JSON arrays in `useStore.js`. These represent the core entities that must become database tables:

1. **Users (`masterUsers`)**: Stores `id`, `name`, `position`, `department`, `depts` array.
2. **Departments (`masterDepartments`)**: Department hierarchy.
3. **DARs (`dars`)**: Document Action Requests containing metadata, requester, reviewer, approver, and status.
4. **Tasks (`tasks`)**: Workflow tasks assigned to specific users with deadlines (`dueDate`) and statuses (`PENDING`, `COMPLETED`).
5. **Documents (`documents`)**: Approved and effective documents in the library. Includes revision history, effective dates, and distributions.
6. **Timeline (`timeline`)**: Audit trail specific to DARs.
7. **Action Log (`actionLog`)**: System-wide audit trail.
8. **Periodic Review Schedules (`periodicReviewSchedules`)**: Metadata about when a document needs its 1-year or 2-year review.
9. **Controlled Copy Instances (`controlledCopyInstances`)**: Tracking of printed physical document copies distributed to departments.
10. **External Documents (`externalDocuments`)**: Documents originating outside the company that must be tracked and distributed.

## 4. Expected API Boundaries

The Zustand store currently acts as a monolithic repository. You should expect to build RESTful or GraphQL endpoints to replace the following operations:

- `GET /api/users/me` (replace `useStore(state => state.currentUser)`)
- `GET /api/dars`, `POST /api/dars`, `PUT /api/dars/:id`
- `GET /api/tasks`, `PUT /api/tasks/:id/complete`
- `GET /api/documents`, `GET /api/documents/:id`
- `GET /api/periodic-reviews`, `POST /api/periodic-reviews/:id/submit`

*Note: The frontend currently uses synchronous actions. You will need to introduce React Query, SWR, or standard async thunks to handle loading states.*

## 5. Authentication & Permissions

**Current Mock State**: 
The app has a mock Persona switcher (currently disabled since the UAT harness was removed). The `currentUser` in `useStore.js` dictates what the user sees.

**Future State**:
- You must implement a real authentication layer (e.g., JWT, OAuth, session cookies).
- The frontend expects the backend to securely validate if a user is allowed to approve a DAR or view a document.
- The `isDcc: true` flag on a user entity grants them admin access to DCC panels.

## 6. Business Rules to Migrate

### DAR Workflow (Document Action Request)
1. **Draft**: User creates a DAR.
2. **Review**: Routed to the selected reviewer (e.g., QA).
3. **Approval**: Routed to the final approver (e.g., Plant Manager).
4. **DCC Action**: Routed to Document Control Center (DCC) to publish.
5. **Acknowledge**: Tasks generated for all assigned departments to acknowledge the new document.

### Periodic Review Workflow
1. **SLA**: Documents must be reviewed annually (or bi-annually).
2. **Locking**: While a document is under a DAR workflow (e.g., being revised), it is "locked" and cannot undergo a Periodic Review. Conversely, if a Periodic Review outcome dictates a revision, a linked DAR is created.
3. **Outcomes**: 
   - `NO_CHANGE`: Next review date is advanced by 1 year.
   - `REVISION_REQUIRED`: Creates a draft DAR for revision. Next review date is advanced *only after* the DAR is fully approved.
   - `OBSOLETE_REQUIRED`: Creates a draft DAR for obsolescence.

## 7. Known Limitations for Backend Developer

1. **PDF Watermarking**: Currently, the application uses `@pdf-lib` in the browser or via a tiny Node script to stamp "UNCONTROLLED WHEN PRINTED" on PDFs. The backend must take over this responsibility (e.g., returning a dynamically watermarked PDF stream when requested).
2. **File Storage**: The frontend currently relies on mock URLs or static local files. You must integrate an S3-compatible blob storage for PDF uploads.
3. **Notifications**: The `useStore.js` `addNotification` method simulates real-time push notifications. You will need to implement WebSockets or polling if real-time updates are required.

## 8. Commands for Dev/Build/Test

```bash
# Start local dev server
npm run dev

# Run code linter
npm run lint

# Run unit and integration tests
npm run test

# Run E2E Playwright tests (Requires backend API or current mock to be intact)
npm run test:e2e

# Production build
npm run build
```
