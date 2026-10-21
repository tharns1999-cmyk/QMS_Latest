import { describe, it, expect, vi, afterEach } from 'vitest';
import { toCopyTasks, toStoreCopy, distributionsOf, requestAdditionalCopies, reportCopyDamagedOrLost, requestCopyRelocation, requestCopyReturn, decideCopyRequest } from './copies';
import useStore from '../store/useStore';

const row = (over) => toStoreCopy({ id: 'c1', document_id: 'd1', doc_code: 'WI-QC-01', doc_name: 'ล้างมือ', revision: '00', copy_no: '01', department: 'QC', location_name: 'QC Office',
  status: 'PENDING_ISSUE', issued_at: '2026-10-21T01:00:00.000Z', ...over });
const dcc = { id: 'dcc', name: 'DCC', isDcc: true, approval_level: 4, department: 'DC', depts: ['DC'] };
const qcHead = { id: 'qc', name: 'หัวหน้า', approval_level: 4, department: 'QC', depts: ['QC'] };

describe('controlled copy tasks', () => {
  it('gives DCC one dispatch task per revision and one recall task per superseded revision', () => {
    const copies = [row(), row({ id: 'c2', copy_no: '02' }), row({ id: 'c3', revision: '01', status: 'PENDING_RECALL' })];
    const tasks = toCopyTasks(copies, dcc);
    expect(tasks.map((t) => t.type).sort()).toEqual(['DCC_DISTRIBUTE', 'DCC_RECALL']);
    expect(tasks.find((t) => t.type === 'DCC_DISTRIBUTE').title).toContain('2 เล่ม');
    expect(toCopyTasks(copies, qcHead)).toEqual([]); // not DCC's work, nothing dispatched yet
  });

  it('gives the receiving department head, and only them, a receipt task per dispatched copy', () => {
    const copies = [row({ status: 'DISPATCHED_PENDING_RECEIPT' })];
    expect(toCopyTasks(copies, qcHead)).toMatchObject([{ type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT', category: 'RECEIPT', copy_id: 'c1', target_department: 'QC' }]);
    expect(toCopyTasks(copies, { ...qcHead, approval_level: 3 })).toEqual([]);
    expect(toCopyTasks(copies, { ...qcHead, department: 'PD', depts: ['PD'] })).toEqual([]);
  });

  it('asks for printed copies only for NEW and REVISION documents that are not forms', () => {
    const allocations = [{ department: 'QC', locationId: 'QC-1', locationName: 'QC Office' }];
    expect(distributionsOf({ type: 'NEW', docType: 'WI' }, allocations)).toEqual([{ department: 'QC', location_id: 'QC-1', location_name: 'QC Office' }]);
    expect(distributionsOf({ type: 'NEW', docType: 'FM' }, allocations)).toEqual([]);
    expect(distributionsOf({ type: 'OBSOLETE', docType: 'WI' }, allocations)).toEqual([]);
  });
});

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('copy requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a damaged copy under the demo status, a replacement as such, and what is pending', () => {
    expect(row({ status: 'PENDING_RECALL', report_kind: 'DAMAGED', request_reason: 'ขาด' })).toMatchObject({ status: 'DAMAGED_PENDING_RECALL', isDamaged: true, reportReason: 'ขาด' });
    expect(row({ status: 'PENDING_RECALL' }).status).toBe('PENDING_RECALL'); // a superseded one stays as it is
    expect(row({ status: 'LOST', report_kind: 'LOST' })).toMatchObject({ status: 'LOST', isLost: true });
    expect(row({ origin: 'REPLACEMENT', issue_no: 2, replaces_id: 'c0' })).toMatchObject({ is_replacement: true, issue_no: '02', issueNumber: 'I02', replaced_copy_id: 'c0' });
    expect(row({ origin: 'ADDITIONAL' }).is_adhoc).toBe(true);
    expect(row({ status: 'RELOCATION_PENDING_APPROVAL', new_location_name: 'คลัง C', new_department: 'PD' })).toMatchObject({ pendingNewLocation: 'คลัง C', pendingNewDepartment: 'PD' });
  });

  it('gives DCC, and only DCC, a task for each relocation or return waiting, with what the modal reads', () => {
    useStore.setState({ masterUsers: [{ id: 'u1', name: 'ผู้ขอ' }] });
    const copies = [
      row({ id: 'r1', copy_no: '02', status: 'RELOCATION_PENDING_APPROVAL', new_location_name: 'คลัง C', new_department: 'PD', request_reason: 'ย้ายไลน์', requested_by: 'u1' }),
      row({ id: 'r2', copy_no: '03', status: 'RETURN_PENDING_APPROVAL', request_reason: 'เลิกใช้', requested_by: 'u1', return_date: '2026-11-01' })
    ];
    const tasks = toCopyTasks(copies, dcc);
    expect(tasks.map((t) => [t.type, t.copyId])).toEqual([['DCC_RELOCATE', 'r1'], ['DCC_RETURN', 'r2']]);
    expect(tasks[0]).toMatchObject({ copy_no: '02', newLocation: 'คลัง C', newDepartment: 'PD', reason: 'ย้ายไลน์', requesterName: 'ผู้ขอ', currentLocation: 'QC Office' });
    expect(tasks[1].returnDate).toBe('2026-11-01');
    expect(toCopyTasks(copies, qcHead)).toEqual([]);
  });

  it('recalls a damaged copy under its own task, apart from the old revision', () => {
    const tasks = toCopyTasks([row({ id: 'a', status: 'PENDING_RECALL', report_kind: 'DAMAGED' }), row({ id: 'b', copy_no: '02', status: 'PENDING_RECALL' })], dcc);
    expect(tasks.map((t) => t.title.split(':')[0]).sort()).toEqual(['เรียกคืนสำเนาควบคุมของเอกสารที่ถูกแทนที่', 'เรียกคืนสำเนาชำรุด']);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(2);
  });

  it('sends each request to the server and says whether it took it', async () => {
    const fetch = vi.fn((url, init) => (init?.method === 'POST' ? json(201, {}) : json(200, { copies: [] })));
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ currentUser: dcc, tasks: [], controlledCopyInstances: [] });
    const sent = (i) => [fetch.mock.calls[i][0].replace(/^.*\/api/, '/api'), JSON.parse(fetch.mock.calls[i][1].body)];

    expect(await requestAdditionalCopies('d1', [{ departmentId: 'QC', station_id: 'QC-1', locationName: 'คลัง 1' }], 'ขยายไลน์')).toBe(true);
    expect(sent(0)).toEqual(['/api/documents/d1/additional-copies', { reason: 'ขยายไลน์', locations: [{ department: 'QC', location_id: 'QC-1', location_name: 'คลัง 1' }] }]);
    await reportCopyDamagedOrLost('c1', 'LOST', 'หาย');
    expect(sent(2)).toEqual(['/api/controlled-copies/c1/report', { type: 'LOST', reason: 'หาย' }]);
    await requestCopyRelocation('c1', { newLocation: 'คลัง C', newDepartment: 'PD', reason: 'ย้าย' });
    expect(sent(4)).toEqual(['/api/controlled-copies/c1/relocate', { reason: 'ย้าย', new_location_name: 'คลัง C', new_department: 'PD' }]);
    await requestCopyReturn('c1', { reason: 'คืน', returnDate: '2026-11-01' });
    expect(sent(6)).toEqual(['/api/controlled-copies/c1/return', { reason: 'คืน', return_date: '2026-11-01' }]);

    vi.stubGlobal('fetch', vi.fn(() => json(403, { error: 'ไม่ใช่แผนกของคุณ' })));
    expect(await requestCopyReturn('c1', { reason: 'คืน' })).toBe(false);
  });

  it("answers DCC's task by the copy it is about, and refuses a task that is gone", async () => {
    const fetch = vi.fn((url, init) => (init?.method === 'POST' ? json(200, {}) : json(200, { copies: [] })));
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ currentUser: dcc, tasks: [{ id: 'api-cc-return-c9', copyId: 'c9' }] });
    expect(await decideCopyRequest('api-cc-return-c9', 'APPROVE', { notes: 'ok', dispositionMethod: 'DESTROY', witnessName: 'สมชาย' })).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ decision: 'APPROVE', note: 'ok', disposition: 'DESTROY', witness: 'สมชาย' });
    useStore.setState({ tasks: [{ id: 'api-cc-return-c9', copyId: 'c9' }] }); // the reload above dropped it
    await decideCopyRequest('api-cc-return-c9', 'REJECT', { rejectReason: 'ยังไม่พร้อม' });
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({ decision: 'REJECT', note: 'ยังไม่พร้อม' });
    expect(await decideCopyRequest('missing', 'APPROVE')).toBe(false);
  });
});
