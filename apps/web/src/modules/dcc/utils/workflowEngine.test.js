import { describe, it, expect } from 'vitest';
import { generateDynamicWorkflow } from './workflowEngine';

const user = (id, department, level, extra = {}) => ({ id, name: id, department, depts: [department], level, approval_level: level, status: 'ACTIVE', ...extra });
const idOf = (steps, role) => steps.find((s) => s.role === role).userId;

describe('generateDynamicWorkflow routing matches the server rules', () => {
  const requester = user('req', 'QC', 4);

  it('uses the QMR as reviewer and never a signer from another department as approver', () => {
    const users = [requester, user('qmr', 'MGMT', 6, { isQmr: true }), user('pd-head', 'PD', 5), user('ex', 'EXEC', 7)];
    const steps = generateDynamicWorkflow(requester, 'QC', users, 'WI');
    expect(idOf(steps, 'REVIEWER')).toBe('qmr');
    expect(idOf(steps, 'APPROVER')).toBe('ex');
  });

  it('leaves the approver empty when only people outside the department and below L6 could sign', () => {
    const users = [requester, user('qmr', 'MGMT', 6, { isQmr: true }), user('pd-head', 'PD', 5)];
    expect(idOf(generateDynamicWorkflow(requester, 'QC', users, 'WI'), 'APPROVER')).toBeNull();
  });
});
