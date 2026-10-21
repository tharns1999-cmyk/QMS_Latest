import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadDars, toStoreDar, submitDarToApi } from './dars';
import { acknowledgeOnApi } from './acknowledgements';
import useStore from '../store/useStore';

const users = [{ id: 'me', name: 'ฉัน' }, { id: 'you', name: 'เธอ' }];
const ack = (id, user_id, status, extra = {}) => ({ id, dar_id: 7, document_id: 'd7', doc_code: 'WI-QA-001', revision: '00', doc_name: 'ล้างมือ', department: 'QA', requester_id: 'req', user_id, status, created_at: '2026-10-21T01:00:00.000Z', acknowledged_at: null, ...extra });
const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('acknowledgements', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives the person asked an inbox task, and the confirmed ones a timeline event', async () => {
    const rows = [ack(1, 'me', 'PENDING'), ack(2, 'you', 'PENDING'), ack(3, 'you', 'ACKNOWLEDGED', { acknowledged_at: '2026-10-22T03:04:00.000Z' })];
    vi.stubGlobal('fetch', vi.fn((url) => json(200, url.endsWith('/api/acknowledgements') ? { acknowledgements: rows } : { dars: [] })));
    useStore.setState({ currentUser: users[0], masterUsers: users, dars: [], tasks: [], timeline: [] });
    await loadDars();
    const { tasks, timeline } = useStore.getState();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 'api-ack-1', type: 'Ack', assigneeId: 'me', darId: '7', docId: 'd7', acknowledgementId: 1 });
    expect(timeline).toEqual([expect.objectContaining({ action: 'Acknowledged', user: 'เธอ', darId: '7', date: '2026-10-22 03:04' })]);
  });

  it('still loads the DARs when the acknowledgement list cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (url.endsWith('/api/acknowledgements') ? json(500, { error: 'x' }) : json(200, { dars: [] }))));
    useStore.setState({ currentUser: users[0], masterUsers: users, dars: [], tasks: [], timeline: [] });
    await expect(loadDars()).resolves.not.toThrow();
  });

  it('reads who must acknowledge from the DAR, and sends the choice with a new one', async () => {
    expect(toStoreDar({ id: 7, status: 'COMPLETED', created_at: '2026-10-21T01:00:00.000Z', ack_user_ids: '["you"]' }, users)).toMatchObject({ ackRequirement: 'REQUIRED', ackUserIds: ['you'], ackUserId: 'you' });
    // The detail page maps over the list, so it must not be the raw JSON text.
    expect(toStoreDar({ id: 7, status: 'COMPLETED', created_at: '2026-10-21T01:00:00.000Z', distributions: '[{"department":"QA","location_id":"l1","location_name":"ห้องเอกสาร"}]' }, users).distributions)
      .toEqual([{ departmentId: 'QA', locationId: 'l1', locationName: 'ห้องเอกสาร', copyNo: '01' }]);
    expect(toStoreDar({ id: 8, status: 'COMPLETED', created_at: '2026-10-21T01:00:00.000Z', ack_user_ids: null }, users)).toMatchObject({ ackRequirement: 'NOT_REQUIRED', ackUserIds: [] });

    const fetch = vi.fn((url, init) => (init?.method === 'POST' ? json(201, { dar: { id: 9, status: 'PENDING_REVIEW', doc_code: 'WI-QA-002', created_at: '2026-10-21T01:00:00.000Z' } }) : json(200, { dars: [] })));
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ currentUser: { id: 'req', department: 'QA' }, masterUsers: users });
    await submitDarToApi({ type: 'NEW', docCode: 'WI-QA-002', docType: 'WI', department: 'QA', title: 'ใหม่', reason: 'ทดสอบ', ackRequirement: 'REQUIRED', ackUserIds: ['you'], workflowSteps: [{ role: 'REVIEWER', userId: 'rev' }, { role: 'APPROVER', userId: 'app' }] });
    expect(JSON.parse(fetch.mock.calls[0][1].body).ack_user_ids).toEqual(['you']);
  });

  it('sends the confirmation and says whether the server took it', async () => {
    const fetch = vi.fn((url, init) => (init?.method === 'POST' ? json(409, { error: 'รับทราบเอกสารนี้ไปแล้ว' }) : json(200, { dars: [], acknowledgements: [] })));
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ currentUser: users[0], masterUsers: users, dars: [], tasks: [], timeline: [] });
    expect(await acknowledgeOnApi(5)).toBe(false);
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/acknowledgements\/5\/acknowledge$/);
    vi.stubGlobal('fetch', vi.fn((url, init) => (init?.method === 'POST' ? json(200, { acknowledgement: {} }) : json(200, { dars: [], acknowledgements: [] }))));
    expect(await acknowledgeOnApi(5)).toBe(true);
  });
});
