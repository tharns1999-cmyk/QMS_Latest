import { describe, it, expect } from 'vitest';
import { isReceiptTask, isActionableTask } from './taskFilter';

describe('DAR tasks whose document name mentions "ตรวจรับ"', () => {
  const darTask = { id: 't1', referenceType: 'INTERNAL_DAR', type: 'Approve', title: '[DAR อนุมัติ] วิธีตรวจรับวัตถุดิบ (WI-QC-03)', assigneeId: 'u-app', department: 'QC' };

  it('are not mistaken for hard-copy receipt tasks', () => {
    expect(isReceiptTask(darTask)).toBe(false);
    expect(isReceiptTask({ id: 'r1', title: 'ตรวจรับเล่มเอกสาร WI-QC-03' })).toBe(true);
  });

  it('stay in an L6 approver\'s inbox', () => {
    expect(isActionableTask(darTask, { id: 'u-app', approval_level: 6, department: 'QC' })).toBe(true);
  });
});
