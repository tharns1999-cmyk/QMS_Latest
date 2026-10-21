import { describe, it, expect } from 'vitest';
import { toCopyTasks, toStoreCopy, distributionsOf } from './copies';

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
