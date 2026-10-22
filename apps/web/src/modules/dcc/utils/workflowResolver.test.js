import { describe, it, expect } from 'vitest';
import { resolveReviewer, resolveApprover } from './workflowResolver';

const user = (id, department, level, depts = [department], extra = {}) =>
  ({ id, name: id, status: 'ACTIVE', department, primary_department: department, depts, departments: depts, level, approval_level: level, ...extra });

// QA has one L4 and no manager; PD's L5 covers QA and QC; the only L6 who can sign is the plant manager in MGT.
const users = [
  user('qa4', 'QA', 4),
  user('pd6', 'PD', 5, ['PD', 'QA', 'QC']),
  user('mg4', 'MGT', 4),
  user('mg6', 'MGT', 6, ['MGT'], { isQmr: true }),
  user('qc6', 'QC', 6)
];

describe('routing a QA document', () => {
  it('goes to the L5 who covers QA, not to a lower-level MGT user', () => {
    expect(resolveReviewer('qa4', 'QA', users, users, 'SOP', null).id).toBe('pd6');
  });

  it('goes to the plant manager for approval when QA has no L6', () => {
    expect(resolveApprover('qa4', 'pd6', 'QA', users, users, 'SOP', null).id).toBe('mg6');
  });

  it('falls back to MGT only when nobody in the department is eligible', () => {
    const without = users.filter((u) => u.id !== 'pd6');
    expect(resolveReviewer('qa4', 'QA', without, without, 'SOP', null).id).toBe('mg4');
  });
});
