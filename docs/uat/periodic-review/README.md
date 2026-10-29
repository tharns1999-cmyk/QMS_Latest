# Periodic Review UAT Package

This directory contains the complete User Acceptance Testing (UAT) package for the DCC Periodic Review module.

## A. Start the Application
1. **Project Directory:** `c:/Users/User/Desktop/qms-portal`
2. **Dependency Installation Command:** `pnpm install`
3. **Application Start Command:** `npm run dev:uat` (Must use UAT mode)
4. **Exact Local URL:** `http://localhost:5173/dcc/uat-tools` (to access the UAT Panel)
5. **Supported Browser:** Google Chrome (latest)

## B. Persona Usage
For every Persona P-001 to P-011:
- **Login Method:** The current prototype uses an automatic mock login or a Persona Selector dropdown in the UI (if available).
- **Employee ID / Identity:** Use the exact `Test User ID` (e.g., `u1`, `u2`) if a login form is present, or select the exact name from the Persona dropdown.
- **Password:** No password is required in the current prototype (or use `password` if prompted).
- **Confirmation:** Verify the active persona name and role in the top-right user profile menu.
- **DO NOT** edit role, isDcc, level, memberships, or authorization manually through DevTools.

## C. Test Data Loading
- **Data Source:** The deterministic UAT data is pre-configured and loaded dynamically in UAT mode.
- **UAT Execution Blocker:** **RESOLVED**
- **Exact Capability:** Open the UAT Control Panel at `/dcc/uat-tools` or click "Open UAT Control Panel" in the yellow top banner. Click "Reset Data" to seed all 18 TD-PR records instantly. The reference date is locked to 2026-07-20.

## D. Reset Procedure
1. If data becomes corrupted during a test, click the **Reset Data** button in the yellow UAT banner.
2. To completely clear UAT storage, click the **Clear** button in the banner.
3. Verify the initial state is restored.
- **What is cleared:** current persona/session, DAR drafts, Periodic Review schedules, task state, local test progress.
- **DO NOT clear during:** browser refresh persistence tests, Revision/Obsolete DAR completion tests, retry/idempotency tests.

## E. Evidence Rules
- **Screenshot filename:** `PR-UAT-<CASE-ID>_<PERSONA-ID>_<YYYYMMDD>_<STEP>.png`
- **Defect ID Format:** `PR-DEF-001`, `PR-DEF-002`, ...
- **Storage:** Store screenshots and defect evidence in a shared UAT Evidence drive or a designated `docs/uat/evidence` folder.

## Traceability Matrix

| UAT Test Case ID | Priority | Persona ID | Test Data ID | Starting Route | Preconditions | Expected Evidence |
|---|---|---|---|---|---|---|
| PR-UAT-001 | Critical | P-001 | TD-PR-001 | /dcc/periodic-reviews | P-001 logged in | Screenshot PR-UAT-001 |
| PR-UAT-002 | Critical | P-002 | TD-PR-002 | /dcc/periodic-reviews | P-002 logged in | Screenshot PR-UAT-002 |
| PR-UAT-003 | Critical | P-003 | TD-PR-003 | /dcc/periodic-reviews | P-003 logged in | Screenshot PR-UAT-003 |
| PR-UAT-004 | Critical | P-004 | TD-PR-004 | /dcc/periodic-reviews | P-004 logged in | Screenshot PR-UAT-004 |
| PR-UAT-005 | Critical | P-005 | TD-PR-005 | /dcc/periodic-reviews | P-005 logged in | Screenshot PR-UAT-005 |
| PR-UAT-006 | Critical | P-006 | TD-PR-006 | /dcc/periodic-reviews | P-006 logged in | Screenshot PR-UAT-006 |
| PR-UAT-007 | Critical | P-007 | TD-PR-007 | /dcc/periodic-reviews | P-007 logged in | Screenshot PR-UAT-007 |
| PR-UAT-008 | Critical | P-008 | TD-PR-008 | /dcc/periodic-reviews | P-008 logged in | Screenshot PR-UAT-008 |
| PR-UAT-009 | Critical | P-009 | TD-PR-009 | /dcc/periodic-reviews | P-009 logged in | Screenshot PR-UAT-009 |
| PR-UAT-010 | Critical | P-010 | TD-PR-010 | /dcc/periodic-reviews | P-010 logged in | Screenshot PR-UAT-010 |
| PR-UAT-011 | Critical | P-011 | TD-PR-011 | /dcc/periodic-reviews | P-011 logged in | Screenshot PR-UAT-011 |
| PR-UAT-012 | Critical | P-001 | TD-PR-012 | /dcc/periodic-reviews | P-001 logged in | Screenshot PR-UAT-012 |
| PR-UAT-013 | Critical | P-002 | TD-PR-013 | /dcc/periodic-reviews | P-002 logged in | Screenshot PR-UAT-013 |
| PR-UAT-014 | Critical | P-003 | TD-PR-014 | /dcc/periodic-reviews | P-003 logged in | Screenshot PR-UAT-014 |
| PR-UAT-015 | Critical | P-004 | TD-PR-015 | /dcc/periodic-reviews | P-004 logged in | Screenshot PR-UAT-015 |
| PR-UAT-016 | Critical | P-005 | TD-PR-016 | /dcc/periodic-reviews | P-005 logged in | Screenshot PR-UAT-016 |
| PR-UAT-017 | Critical | P-006 | TD-PR-017 | /dcc/periodic-reviews | P-006 logged in | Screenshot PR-UAT-017 |
| PR-UAT-018 | Critical | P-007 | TD-PR-018 | /dcc/periodic-reviews | P-007 logged in | Screenshot PR-UAT-018 |
| PR-UAT-019 | Critical | P-008 | TD-PR-001 | /dcc/periodic-reviews | P-008 logged in | Screenshot PR-UAT-019 |
| PR-UAT-020 | Critical | P-009 | TD-PR-002 | /dcc/periodic-reviews | P-009 logged in | Screenshot PR-UAT-020 |
| PR-UAT-021 | Critical | P-010 | TD-PR-003 | /dcc/periodic-reviews | P-010 logged in | Screenshot PR-UAT-021 |
| PR-UAT-022 | High | P-011 | TD-PR-004 | /dcc/periodic-reviews | P-011 logged in | Screenshot PR-UAT-022 |
| PR-UAT-023 | High | P-001 | TD-PR-005 | /dcc/periodic-reviews | P-001 logged in | Screenshot PR-UAT-023 |
| PR-UAT-024 | High | P-002 | TD-PR-006 | /dcc/periodic-reviews | P-002 logged in | Screenshot PR-UAT-024 |
| PR-UAT-025 | High | P-003 | TD-PR-007 | /dcc/periodic-reviews | P-003 logged in | Screenshot PR-UAT-025 |
| PR-UAT-026 | High | P-004 | TD-PR-008 | /dcc/periodic-reviews | P-004 logged in | Screenshot PR-UAT-026 |
| PR-UAT-027 | High | P-005 | TD-PR-009 | /dcc/periodic-reviews | P-005 logged in | Screenshot PR-UAT-027 |
| PR-UAT-028 | High | P-006 | TD-PR-010 | /dcc/periodic-reviews | P-006 logged in | Screenshot PR-UAT-028 |
| PR-UAT-029 | High | P-007 | TD-PR-011 | /dcc/periodic-reviews | P-007 logged in | Screenshot PR-UAT-029 |
| PR-UAT-030 | High | P-008 | TD-PR-012 | /dcc/periodic-reviews | P-008 logged in | Screenshot PR-UAT-030 |
| PR-UAT-031 | High | P-009 | TD-PR-013 | /dcc/periodic-reviews | P-009 logged in | Screenshot PR-UAT-031 |
| PR-UAT-032 | High | P-010 | TD-PR-014 | /dcc/periodic-reviews | P-010 logged in | Screenshot PR-UAT-032 |
| PR-UAT-033 | High | P-011 | TD-PR-015 | /dcc/periodic-reviews | P-011 logged in | Screenshot PR-UAT-033 |
| PR-UAT-034 | High | P-001 | TD-PR-016 | /dcc/periodic-reviews | P-001 logged in | Screenshot PR-UAT-034 |
| PR-UAT-035 | High | P-002 | TD-PR-017 | /dcc/periodic-reviews | P-002 logged in | Screenshot PR-UAT-035 |
| PR-UAT-036 | High | P-003 | TD-PR-018 | /dcc/periodic-reviews | P-003 logged in | Screenshot PR-UAT-036 |
| PR-UAT-037 | High | P-004 | TD-PR-001 | /dcc/periodic-reviews | P-004 logged in | Screenshot PR-UAT-037 |
| PR-UAT-038 | High | P-005 | TD-PR-002 | /dcc/periodic-reviews | P-005 logged in | Screenshot PR-UAT-038 |
| PR-UAT-039 | High | P-006 | TD-PR-003 | /dcc/periodic-reviews | P-006 logged in | Screenshot PR-UAT-039 |
| PR-UAT-040 | High | P-007 | TD-PR-004 | /dcc/periodic-reviews | P-007 logged in | Screenshot PR-UAT-040 |
| PR-UAT-041 | High | P-008 | TD-PR-005 | /dcc/periodic-reviews | P-008 logged in | Screenshot PR-UAT-041 |
| PR-UAT-042 | High | P-009 | TD-PR-006 | /dcc/periodic-reviews | P-009 logged in | Screenshot PR-UAT-042 |
| PR-UAT-043 | High | P-010 | TD-PR-007 | /dcc/periodic-reviews | P-010 logged in | Screenshot PR-UAT-043 |
| PR-UAT-044 | High | P-011 | TD-PR-008 | /dcc/periodic-reviews | P-011 logged in | Screenshot PR-UAT-044 |
| PR-UAT-045 | High | P-001 | TD-PR-009 | /dcc/periodic-reviews | P-001 logged in | Screenshot PR-UAT-045 |
| PR-UAT-046 | High | P-002 | TD-PR-010 | /dcc/periodic-reviews | P-002 logged in | Screenshot PR-UAT-046 |
| PR-UAT-047 | Medium | P-003 | TD-PR-011 | /dcc/periodic-reviews | P-003 logged in | Screenshot PR-UAT-047 |
| PR-UAT-048 | Medium | P-004 | TD-PR-012 | /dcc/periodic-reviews | P-004 logged in | Screenshot PR-UAT-048 |
| PR-UAT-049 | Medium | P-005 | TD-PR-013 | /dcc/periodic-reviews | P-005 logged in | Screenshot PR-UAT-049 |
| PR-UAT-050 | Medium | P-006 | TD-PR-014 | /dcc/periodic-reviews | P-006 logged in | Screenshot PR-UAT-050 |
| PR-UAT-051 | Medium | P-007 | TD-PR-015 | /dcc/periodic-reviews | P-007 logged in | Screenshot PR-UAT-051 |
| PR-UAT-052 | Medium | P-008 | TD-PR-016 | /dcc/periodic-reviews | P-008 logged in | Screenshot PR-UAT-052 |
| PR-UAT-053 | Medium | P-009 | TD-PR-017 | /dcc/periodic-reviews | P-009 logged in | Screenshot PR-UAT-053 |
| PR-UAT-054 | Medium | P-010 | TD-PR-018 | /dcc/periodic-reviews | P-010 logged in | Screenshot PR-UAT-054 |
| PR-UAT-055 | Medium | P-011 | TD-PR-001 | /dcc/periodic-reviews | P-011 logged in | Screenshot PR-UAT-055 |
| PR-UAT-056 | Medium | P-001 | TD-PR-002 | /dcc/periodic-reviews | P-001 logged in | Screenshot PR-UAT-056 |
| PR-UAT-057 | Medium | P-002 | TD-PR-003 | /dcc/periodic-reviews | P-002 logged in | Screenshot PR-UAT-057 |
| PR-UAT-058 | Medium | P-003 | TD-PR-004 | /dcc/periodic-reviews | P-003 logged in | Screenshot PR-UAT-058 |
| PR-UAT-059 | Medium | P-004 | TD-PR-005 | /dcc/periodic-reviews | P-004 logged in | Screenshot PR-UAT-059 |
| PR-UAT-060 | Medium | P-005 | TD-PR-006 | /dcc/periodic-reviews | P-005 logged in | Screenshot PR-UAT-060 |
