import { describe, it, expect } from 'vitest';
import useStore from '../store/useStore';
import { clearSession } from './session';
import { getToken, setToken } from './client';

describe('clearSession (sign-out on a shared PC)', () => {
  it('drops the token and server data, including the people directory, but keeps unsent DAR drafts', () => {
    const draft = { id: 'DAR-DRAFT-1', isDraft: true, status: 'DRAFT' };
    const person = { id: 'U1', name: 'คนทดสอบ', email: 'person@company.test' };
    setToken('token-1');
    useStore.setState({
      masterUsers: [person], requestUsers: [person], reviewUsers: [person], approveUsers: [person], adminUsers: [person],
      documents: [{ id: 'D1' }], dars: [draft, { id: 'DAR-26-001', status: 'PENDING_REVIEW' }], tasks: [{ id: 'T1' }]
    });

    clearSession();

    const s = useStore.getState();
    expect(getToken()).toBeNull();
    expect(s.masterUsers).toEqual([]);
    expect(s.requestUsers).toEqual([]);
    expect(s.reviewUsers).toEqual([]);
    expect(s.approveUsers).toEqual([]);
    expect(s.adminUsers).toEqual([]);
    expect(s.documents).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.dars).toEqual([draft]);
  });
});
