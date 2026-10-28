import { describe, it, expect } from 'vitest';
import { toStoreExternalDoc, toStoreExternalRequest, toExternalTask, isExternalRow } from './external';

const users = [{ id: 'req', name: 'ผู้ขอ' }, { id: 'rev', name: 'ผู้ทบทวน' }, { id: 'app', name: 'ผู้อนุมัติ' }];
const dar = { id: 5, type: 'NEW', doc_code: 'ED-QC-01', doc_type: 'ED', department: 'QC', revision: '00', name: 'มาตรฐาน', ext_issuer: 'ISO', ext_edition: '2015', review_cycle_months: 12,
  status: 'PENDING_REVIEW', requester_id: 'req', reviewer_id: 'rev', approver_id: 'app', reviewed_at: null, approved_at: null, created_at: '2026-10-21T01:00:00Z', effective_date: '2027-01-01' };

describe('external document mapping', () => {
  it('recognises external rows and maps a register row onto the external pages shape', () => {
    expect(isExternalRow(dar)).toBe(true);
    expect(isExternalRow({ doc_type: 'WI' })).toBe(false);
    const doc = toStoreExternalDoc({ id: 'd1', doc_code: 'ED-QC-01', name: 'มาตรฐาน', doc_type: 'ED', department: 'QC', revision: '00', status: 'EFFECTIVE', access_scope: 'GENERAL',
      ext_issuer: 'ISO', ext_edition: '2015', review_cycle_months: 12, effective_date: '2026-10-21', next_review_date: '2027-10-21', file_key: 'k' });
    expect(doc).toMatchObject({ status: 'ACTIVE', edCode: 'ED-QC-01', issuer: 'ISO', sourceVersion: '2015', nextReviewDate: '2027-10-21', accessScope: 'General', apiFilePath: '/api/documents/d1/file' });
    expect(toStoreExternalDoc({ ...dar, id: 'd2', status: 'OBSOLETE' }).status).toBe('OBSOLETE_ARCHIVED');
  });

  it('turns a request into a request record with signoffs, and the current stage into a task for the signer', () => {
    const request = toStoreExternalRequest(dar, 'dar-5', users);
    expect(request).toMatchObject({ requestNo: 'EDR-5', status: 'PENDING_EXT_REVIEW', requestType: 'NEW', reviewerName: 'ผู้ทบทวน', docId: 'dar-5' });
    expect(toStoreExternalRequest({ ...dar, edr_no: 'EDR-26-001' }, 'dar-5', users)).toMatchObject({ requestNo: 'EDR-26-001', requestId: 'EDR-26-001', id: 'EDR-5' });
    expect(request.signoffs.map((s) => s.status)).toEqual(['COMPLETED', 'PENDING', 'WAITING']);
    expect(toExternalTask(dar, 'dar-5', users)).toMatchObject({ type: 'EXT_REVIEW', assigneeId: 'rev', referenceType: 'EXTERNAL_DOC', referenceId: 'dar-5', darId: '5' });
    expect(toExternalTask({ ...dar, status: 'PENDING_APPROVAL', reviewed_at: 'x' }, 'dar-5', users)).toMatchObject({ type: 'EXT_APPROVAL', assigneeId: 'app' });
    expect(toExternalTask({ ...dar, status: 'PENDING_DCC' }, 'dar-5', users)).toBeNull(); // waits for its date
    expect(toStoreExternalRequest({ ...dar, status: 'COMPLETED', type: 'OBSOLETE' }, 'd1', users).status).toBe('OBSOLETE_ARCHIVED');
    expect(toStoreExternalRequest({ ...dar, status: 'REJECTED', reviewed_at: 'x', reject_comment: 'ไม่ครบ' }, 'dar-5', users).signoffs.map((s) => s.status)).toEqual(['COMPLETED', 'COMPLETED', 'REJECTED']);
  });
});
