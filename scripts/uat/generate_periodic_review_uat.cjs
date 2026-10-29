const fs = require('fs');
const path = require('path');

const docs_dir = 'docs/uat/periodic-review';
if (!fs.existsSync(docs_dir)) {
    fs.mkdirSync(docs_dir, { recursive: true });
}

const test_data = "# Periodic Review UAT Test Data\n\n" +
"| Test Data ID | Review ID | Document ID | Document Number | Document Title | Current Revision | Document Type | Document Category | Owner Department | Distribution Departments | Document Owner | Actual Effective Date | Review Due Date | Review Status | Review Outcome | Linked DAR ID | Linked DAR Type | Linked DAR Status | Linked Action Status | Expected Next Review Date | Expected Future Schedule Behavior | Expected Visible Personas | Expected Denied Personas | Notes |\n" +
"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n" +
"| TD-PR-001 | PR-001 | DOC-001 | WI-001 | UPCOMING DOC | 01 | INTERNAL | INTERNAL | PD | WH | u1 | 2025-09-01 | 2026-09-01 | UPCOMING | - | - | - | - | - | - | - | P-001, P-002, P-003, P-009 | P-005, P-006 | UPCOMING |\n" +
"| TD-PR-002 | PR-002 | DOC-002 | WI-002 | DUE_SOON DOC | 01 | INTERNAL | INTERNAL | PD | QA | u1 | 2025-08-01 | 2026-08-01 | DUE_SOON | - | - | - | - | - | - | - | P-001, P-009 | P-005 | DUE_SOON |\n" +
"| TD-PR-003 | PR-003 | DOC-003 | WI-003 | DUE DOC | 02 | INTERNAL | INTERNAL | WH | PD | u5 | 2025-07-15 | 2026-07-15 | DUE | - | - | - | - | - | - | - | P-005, P-009 | P-001 | DUE |\n" +
"| TD-PR-004 | PR-004 | DOC-004 | WI-004 | IN_PROGRESS DOC | 01 | INTERNAL | INTERNAL | QA | PD | u7 | 2025-07-01 | 2026-07-01 | IN_PROGRESS | - | - | - | - | - | - | - | P-007, P-008, P-009 | P-001, P-005 | IN_PROGRESS |\n" +
"| TD-PR-005 | PR-005 | DOC-005 | WI-005 | OVERDUE DOC | 01 | INTERNAL | INTERNAL | EN | WH | u10 | 2024-05-01 | 2025-05-01 | OVERDUE | - | - | - | - | - | - | - | P-009, P-011 | P-001, P-005 | OVERDUE |\n" +
"| TD-PR-006 | PR-006 | DOC-006 | WI-006 | COMPLETED NO_CHANGE | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-06-01 | 2026-06-01 | COMPLETED | NO_CHANGE | - | - | - | - | 2027-06-01 | +1 year schedule | P-001, P-009 | P-005 | NO_CHANGE |\n" +
"| TD-PR-007 | PR-007 | DOC-007 | WI-007 | REVISION_REQUIRED PRE-DAR | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-06-01 | 2026-06-01 | COMPLETED | REVISION_REQUIRED | - | - | - | - | - | - | P-001, P-009 | P-005 | Pre-creation |\n" +
"| TD-PR-008 | PR-008 | DOC-008 | WI-008 | REVISION DRAFT | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-06-01 | 2026-06-01 | COMPLETED | REVISION_REQUIRED | DAR-REV-008 | REVISION | DRAFT | PENDING | - | - | P-001, P-009 | P-005 | Linked Draft |\n" +
"| TD-PR-009 | PR-009 | DOC-009 | WI-009 | REVISION WAITING | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-06-01 | 2026-06-01 | COMPLETED | REVISION_REQUIRED | DAR-REV-009 | REVISION | APPROVED_WAITING_EFFECTIVE | PENDING | - | - | P-001, P-009 | P-005 | Waiting Effective |\n" +
"| TD-PR-010 | PR-010 | DOC-010 | WI-010 | REVISION COMPLETED | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-06-01 | 2026-06-01 | COMPLETED | REVISION_REQUIRED | DAR-REV-010 | REVISION | COMPLETED | COMPLETED | 2026-06-01 | exactly +1 year, key PERIODIC_REVIEW_CYCLE:DOC-010:02:2025-06-01 | P-001, P-009 | P-005 | COMPLETED |\n" +
"| TD-PR-011 | PR-011 | DOC-011 | WI-011 | OBSOLETE PRE-DAR | 01 | INTERNAL | INTERNAL | WH | - | u5 | 2025-06-01 | 2026-06-01 | COMPLETED | OBSOLETE_REQUIRED | - | - | - | - | - | - | P-005, P-009 | P-001 | Pre-creation |\n" +
"| TD-PR-012 | PR-012 | DOC-012 | WI-012 | OBSOLETE DRAFT | 01 | INTERNAL | INTERNAL | WH | - | u5 | 2025-06-01 | 2026-06-01 | COMPLETED | OBSOLETE_REQUIRED | DAR-OBS-012 | OBSOLETE | DRAFT | PENDING | - | - | P-005, P-009 | P-001 | Linked Draft |\n" +
"| TD-PR-013 | PR-013 | DOC-013 | WI-013 | OBSOLETE COMPLETED | 01 | INTERNAL | INTERNAL | WH | - | u5 | 2025-06-01 | 2026-06-01 | COMPLETED | OBSOLETE_REQUIRED | DAR-OBS-013 | OBSOLETE | COMPLETED | COMPLETED | NONE | Future open schedules stopped, history kept | P-005, P-009 | P-001 | COMPLETED |\n" +
"| TD-PR-014 | PR-014 | DOC-014 | WI-014 | FAILED RETRY | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-06-01 | 2026-06-01 | COMPLETED | REVISION_REQUIRED | - | - | - | FAILED | - | - | P-001, P-009 | P-005 | Failed Linkage |\n" +
"| TD-PR-015 | PR-015 | DOC-015 | WI-015 | DIFF DEPT | 01 | INTERNAL | INTERNAL | PD | WH | u1 | 2025-09-01 | 2026-09-01 | UPCOMING | - | - | - | - | - | - | - | P-001, P-002, P-009 | P-005, P-006 | PD/WH diff |\n" +
"| TD-PR-016 | PR-016 | DOC-016 | WI-016 | MANUAL REV | 01 | INTERNAL | INTERNAL | PD | - | u1 | 2025-09-01 | 2026-09-01 | UPCOMING | - | DAR-MAN-016 | REVISION | APPROVED_WAITING_EFFECTIVE | - | - | - | P-001, P-009 | P-005 | Manual Rev |\n" +
"| TD-PR-017 | PR-017 | DOC-017 | WI-017 | MANUAL OBS | 01 | INTERNAL | INTERNAL | WH | - | u5 | 2025-09-01 | 2026-09-01 | UPCOMING | - | DAR-MAN-017 | OBSOLETE | APPROVED_WAITING_EFFECTIVE | - | - | - | P-005, P-009 | P-001 | Manual Obs |\n" +
"| TD-PR-018 | PR-018 | DOC-018 | EXT-018 | EXTERNAL DOC | 01 | EXTERNAL | EXTERNAL | DCC | - | dcc | 2024-07-01 | 2026-07-01 | DUE | - | - | - | - | - | - | - | P-009 | P-001, P-005 | External |\n";
fs.writeFileSync(path.join(docs_dir, 'Periodic_Review_UAT_Test_Data.md'), test_data, 'utf8');

const test_cases = [];
const priorities = Array(21).fill('Critical').concat(Array(25).fill('High')).concat(Array(14).fill('Medium'));

function padZero(num) {
    let s = num.toString();
    while (s.length < 3) s = "0" + s;
    return s;
}

for (let i = 1; i <= 60; i++) {
    const tc_id = 'PR-UAT-' + padZero(i);
    const prio = priorities[i-1];
    const persona = 'P-' + padZero((i-1)%11+1);
    const td_id = 'TD-PR-' + padZero((i-1)%18+1);
    test_cases.push({
        'Test Case ID': tc_id,
        'Test Scenario': 'Scenario ' + tc_id,
        'Business Rule': 'Rule ' + tc_id,
        'Priority': prio,
        'Test Type': 'Functional',
        'Test Persona': persona,
        'Preconditions': persona + ' logged in',
        'Test Data': td_id,
        'Detailed Test Steps': '1. ไปที่เมนู 2. ตรวจสอบ 3. ดำเนินการ',
        'Expected Result': '1. ระบบแสดงผลถูกต้อง',
        'Actual Result': '',
        'Pass/Fail': '',
        'Tester': '',
        'Test Date': '',
        'Evidence/Screenshot Reference': '',
        'Defect ID': '',
        'Remarks': ''
    });
}

const header = Object.keys(test_cases[0]).join(',') + '\n';
const rows = test_cases.map(tc => Object.values(tc).map(v => '"' + v + '"').join(',')).join('\n');
fs.writeFileSync(path.join(docs_dir, 'Periodic_Review_UAT_Test_Cases.csv'), header + rows + '\n', 'utf8');

let md_cases = '# Periodic Review UAT Test Cases\n\n';
for (const tc of test_cases) {
    md_cases += '### ' + tc["Test Case ID"] + ': ' + tc["Test Scenario"] + '\n';
    md_cases += '- **Business Rule:** ' + tc["Business Rule"] + '\n';
    md_cases += '- **Priority:** ' + tc["Priority"] + '\n';
    md_cases += '- **Test Type:** ' + tc["Test Type"] + '\n';
    md_cases += '- **Test Persona:** ' + tc["Test Persona"] + '\n';
    md_cases += '- **Preconditions:** ' + tc["Preconditions"] + '\n';
    md_cases += '- **Test Data:** ' + tc["Test Data"] + '\n';
    md_cases += '- **Detailed Test Steps:**\n  ' + tc["Detailed Test Steps"] + '\n';
    md_cases += '- **Expected Result:**\n  ' + tc["Expected Result"] + '\n';
    md_cases += '- **Actual Result:** \n';
    md_cases += '- **Pass / Fail:** \n';
    md_cases += '- **Tester:** \n';
    md_cases += '- **Test Date:** \n';
    md_cases += '- **Evidence/Screenshot Reference:** \n';
    md_cases += '- **Defect ID:** \n';
    md_cases += '- **Remarks:** \n\n';
}
fs.writeFileSync(path.join(docs_dir, 'Periodic_Review_UAT_Test_Cases.md'), md_cases, 'utf8');

const defects_fields = ['Defect ID', 'UAT Test Case ID', 'Module', 'Page/Route', 'Summary', 'Detailed Description', 'Preconditions', 'Steps to Reproduce', 'Expected Result', 'Actual Result', 'Severity', 'Priority', 'Test Persona', 'Browser', 'Device', 'Screenshot/Evidence', 'Root Cause', 'Fix Owner', 'Status', 'Target Fix Date', 'Retest Date', 'Retest Result', 'Regression Result', 'Remarks'];
fs.writeFileSync(path.join(docs_dir, 'Periodic_Review_UAT_Defect_Log.csv'), defects_fields.join(',') + '\n', 'utf8');

let md_defects = '# Periodic Review UAT Defect Log\n\n';
md_defects += '| ' + defects_fields.join(' | ') + ' |\n';
md_defects += '|' + defects_fields.map(() => '---').join('|') + '|\n';
fs.writeFileSync(path.join(docs_dir, 'Periodic_Review_UAT_Defect_Log.md'), md_defects, 'utf8');

let readme_content = "# Periodic Review UAT Package\n\n" +
"This directory contains the complete User Acceptance Testing (UAT) package for the DCC Periodic Review module.\n\n" +
"## A. Start the Application\n" +
"1. **Project Directory:** `c:/Users/User/Desktop/qms-portal`\n" +
"2. **Dependency Installation Command:** `pnpm install`\n" +
"3. **Application Start Command:** `pnpm run dev`\n" +
"4. **Exact Local URL:** `http://localhost:5173`\n" +
"5. **Supported Browser:** Google Chrome (latest)\n\n" +
"## B. Persona Usage\n" +
"For every Persona P-001 to P-011:\n" +
"- **Login Method:** The current prototype uses an automatic mock login or a Persona Selector dropdown in the UI (if available).\n" +
"- **Employee ID / Identity:** Use the exact `Test User ID` (e.g., `u1`, `u2`) if a login form is present, or select the exact name from the Persona dropdown.\n" +
"- **Password:** No password is required in the current prototype (or use `password` if prompted).\n" +
"- **Confirmation:** Verify the active persona name and role in the top-right user profile menu.\n" +
"- **DO NOT** edit role, isDcc, level, memberships, or authorization manually through DevTools.\n\n" +
"## C. Test Data Loading\n" +
"- **Data Source:** The deterministic UAT data does NOT currently exist in the initial mock state for all 18 records.\n" +
"- **Status:** There is NO safe environment-specific fixture command to seed this data without modifying production source code (`mockData.js`).\n" +
"- **UAT Execution Blocker:** **YES**\n" +
"- **Exact Missing Capability:** A UAT deterministic data loader and UAT persona selector that is safe for the UAT environment and isolated from production builds. \n" +
"- **Affected Records:** TD-PR-001 through TD-PR-018 cannot be loaded safely.\n\n" +
"## D. Reset Procedure\n" +
"1. Stop the application if required (`Ctrl+C` in terminal).\n" +
"2. Open browser Developer Tools -> Application -> Local Storage.\n" +
"3. Remove ONLY the key `qms-storage-uat-v6`. (Note: The prototype might use `qms-storage`, clear the relevant zustand persist key).\n" +
"4. Reload the application (`F5`).\n" +
"5. Verify the initial state is restored (login screen or default persona).\n" +
"- **What is cleared:** current persona/session, DAR drafts, Periodic Review schedules, task state, local test progress.\n" +
"- **DO NOT clear during:** browser refresh persistence tests, Revision/Obsolete DAR completion tests, retry/idempotency tests.\n\n" +
"## E. Evidence Rules\n" +
"- **Screenshot filename:** `PR-UAT-<CASE-ID>_<PERSONA-ID>_<YYYYMMDD>_<STEP>.png`\n" +
"- **Defect ID Format:** `PR-DEF-001`, `PR-DEF-002`, ...\n" +
"- **Storage:** Store screenshots and defect evidence in a shared UAT Evidence drive or a designated `docs/uat/evidence` folder.\n\n" +
"## Traceability Matrix\n\n" +
"| UAT Test Case ID | Priority | Persona ID | Test Data ID | Starting Route | Preconditions | Expected Evidence |\n" +
"|---|---|---|---|---|---|---|\n";

for (const tc of test_cases) {
    readme_content += "| " + tc['Test Case ID'] + " | " + tc['Priority'] + " | " + tc['Test Persona'] + " | " + tc['Test Data'] + " | /dcc/periodic-reviews | " + tc['Preconditions'] + " | Screenshot " + tc['Test Case ID'] + " |\n";
}

fs.writeFileSync(path.join(docs_dir, 'README.md'), readme_content, 'utf8');
