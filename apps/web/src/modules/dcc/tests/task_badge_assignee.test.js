import { describe, it, expect } from 'vitest';
import { isAssignedToSomeoneElse } from '../utils/taskFilter';

const head = { id: 'head', name: 'หัวหน้า', approval_level: 5, department: 'PD', depts: ['PD', 'QC'] };
const owner = 'owner';

describe('menu badge counts only what the inbox shows', () => {
  it('skips a task that names another person', () => {
    expect(isAssignedToSomeoneElse({ type: 'PERIODIC_REVIEW', assigneeId: owner }, head)).toBe(true);
    expect(isAssignedToSomeoneElse({ type: 'PERIODIC_REVIEW', assigneeId: 'head' }, head)).toBe(false);
    expect(isAssignedToSomeoneElse({ type: 'PERIODIC_REVIEW' }, head)).toBe(false); // no assignee: a department task
  });

  it('leaves approvals, receipts, DCC and QMR to their own rules', () => {
    expect(isAssignedToSomeoneElse({ type: 'PERIODIC_REVIEW_APPROVAL', assigneeId: owner }, head)).toBe(false);
    expect(isAssignedToSomeoneElse({ type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT', assigneeId: owner }, head)).toBe(false);
    expect(isAssignedToSomeoneElse({ type: 'Review', assigneeId: owner }, { ...head, isQmr: true })).toBe(false);
    expect(isAssignedToSomeoneElse({ type: 'Review', assigneeId: owner }, { ...head, isDcc: true, role: 'DCC_ADMIN' })).toBe(false);
  });
});
