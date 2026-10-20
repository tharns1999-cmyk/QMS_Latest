/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from '@playwright/test';

// Deterministic Personas (Mirroring Unit test fixtures)
export const TEST_PERSONAS = {
  GENERAL_USER: {
    id: 'T_U001', name: 'General User', role: 'USER', isDcc: false,
    depts: ['PC'], departmentMemberships: [{ departmentId: 'PC', positionLevel: 1, isActive: true }]
  },
  DOCUMENT_OWNER: {
    id: 'T_U002', name: 'Document Owner', role: 'USER', isDcc: false,
    depts: ['PD'], departmentMemberships: [{ departmentId: 'PD', positionLevel: 3, isActive: true }]
  },
  QAQC_MONITOR: {
    id: 'T_U005', name: 'QAQC Monitor', role: 'USER', isDcc: true,
    depts: ['QA'], departmentMemberships: [{ departmentId: 'QA', positionLevel: 2, isActive: true }]
  },
  DCC_ADMIN: {
    id: 'T_U006', name: 'DCC Admin', role: 'DCC_ADMIN', isDcc: true,
    depts: ['QA'], departmentMemberships: [{ departmentId: 'QA', positionLevel: 4, isActive: true }]
  },
  UNRELATED_DEPT: {
    id: 'T_U008', name: 'Unrelated User', role: 'USER', isDcc: false,
    depts: ['MKT'], departmentMemberships: [{ departmentId: 'MKT', positionLevel: 6, isActive: true }]
  },
};

const setupTestState = async (page, user) => {
  // Create deterministic store data
  const storeData = {
    state: {
      currentUser: user,
      periodicReviewSchedules: [
        {
          id: 'SCH-1',
          documentId: 'DOC-1',
          documentNumber: 'DOC-PD-001',
          documentName: 'Test Document PD',
          ownerDepartmentId: 'PD',
          ownerUserId: 'T_U002',
          status: 'DUE', // Due state
          outcome: null,
          nextReviewDate: '2026-07-14',
          originalReviewAnchorDate: '2025-07-14',
          frequencyMonths: 12
        },
        {
          id: 'SCH-2',
          documentId: 'DOC-2',
          documentNumber: 'DOC-MKT-001',
          documentName: 'Test Document MKT',
          ownerDepartmentId: 'MKT',
          status: 'DUE',
          outcome: null,
          nextReviewDate: '2026-07-14',
          originalReviewAnchorDate: '2025-07-14',
          frequencyMonths: 12
        }
      ],
      periodicReviewTasks: [
        {
          id: 'TASK-1',
          scheduleId: 'SCH-1',
          status: 'ACTION_REQUIRED',
          dueDate: '2026-07-14'
        }
      ],
      dars: [],
      documents: [
        { id: 'DOC-1', doc_code: 'DOC-PD-001', title: 'DOC-PD-001', name: 'Test Document PD', department: 'PD', ownerId: 'T_U002', status: 'EFFECTIVE' },
        { id: 'DOC-2', doc_code: 'DOC-MKT-001', title: 'DOC-MKT-001', name: 'Test Document MKT', department: 'MKT', ownerId: 'T_U008', status: 'EFFECTIVE' }
      ]
    },
    version: 5
  };

  // Seed before app scripts run (a live store could persist over it), once per tab so later navigations keep test changes.
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('__e2e_seeded')) return;
    localStorage.clear();
    localStorage.setItem('qms-enterprise-storage', JSON.stringify(data));
    sessionStorage.setItem('__e2e_seeded', '1');
  }, storeData);
};

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject fixed clock to ensure deterministic DUE_SOON testing
    await page.clock.setFixedTime(new Date('2026-07-14T00:00:00Z'));
    
    await use(page);
  },
  setupSession: async ({ page }, use) => {
    await use(async (user) => {
      await setupTestState(page, user);
      await page.goto('/dcc');
    });
  }
});

export { expect } from '@playwright/test';
