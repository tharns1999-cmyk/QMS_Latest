import { describe, it, expect } from 'vitest';
import { resolveProgressiveSignatories } from '../utils/signatoryResolver';

const sig = { id: 'U1', name: 'A', position: 'P', isSigned: true };
const signatories = { requester: sig, reviewer: sig, approver: sig };

describe('superseded/obsolete revisions keep their sign-off table', () => {
  it.each(['SUPERSEDED', 'OBSOLETE', 'SUPERSEDED_ARCHIVED'])('%s resolves all three signers', (status) => {
    const r = resolveProgressiveSignatories({ masterDoc: { status, signatories }, stage: 'MASTER' });
    expect(r.requester.isSigned && r.reviewer.isSigned && r.approver.isSigned).toBe(true);
  });
});
