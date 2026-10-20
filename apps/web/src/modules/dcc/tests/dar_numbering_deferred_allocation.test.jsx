import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { generateInternalDarNumber } from '../../../store/useStore';

describe('DAR Numbering Format DAR-YYYY-XXX & Deferred Allocation on Submit', () => {
  beforeEach(() => {
    useStore.setState({
      dars: [],
      darRequests: [],
      documents: [],
      tasks: [],
      timeline: [],
      actionLog: [],
      notifications: [],
      mockDateOffset: 0,
      simulatedDate: null,
      currentUser: { id: 'U001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', level: 1, role: 'STAFF' },
      masterUsers: [
        { id: 'U001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', level: 1, role: 'STAFF' },
        { id: 'U002', name: 'สมศักดิ์ ผู้จัดการฝ่ายผลิต', department: 'PD', level: 3, role: 'MANAGER' },
        { id: 'U003', name: 'กัลยาณี ผู้อำนวยการ', department: 'PD', level: 5, role: 'DIRECTOR' }
      ],
      reviewUsers: [
        { id: 'U002', name: 'สมศักดิ์ ผู้จัดการฝ่ายผลิต', department: 'PD', level: 3, role: 'MANAGER' }
      ],
      approveUsers: [
        { id: 'U003', name: 'กัลยาณี ผู้อำนวยการ', department: 'PD', level: 5, role: 'DIRECTOR' }
      ]
    });
  });

  describe('1. generateInternalDarNumber Utility', () => {
    it('generates DAR-2026-001 for empty DAR list', () => {
      const darNo = generateInternalDarNumber([], 2026);
      expect(darNo).toBe('DAR-2026-001');
    });

    it('increments sequence sequentially (DAR-2026-002, DAR-2026-003)', () => {
      const existing = [
        { id: 'DAR-2026-001', darNumber: 'DAR-2026-001', status: 'COMPLETED' },
        { id: 'DAR-2026-002', darNumber: 'DAR-2026-002', status: 'UNDER_REVIEW' }
      ];
      const nextNo = generateInternalDarNumber(existing, 2026);
      expect(nextNo).toBe('DAR-2026-003');
    });

    it('strictly ignores draft DARs without allocating or skipping numbers', () => {
      const existing = [
        { id: 'DAR-2026-001', darNumber: 'DAR-2026-001', status: 'UNDER_REVIEW' },
        { id: 'draft_1725600000_abc', darNumber: null, isDraft: true, status: 'DRAFT' },
        { id: 'draft_1725600001_xyz', darNumber: null, isDraft: true, status: 'DRAFT' }
      ];
      const nextNo = generateInternalDarNumber(existing, 2026);
      expect(nextNo).toBe('DAR-2026-002');
    });

    it('resets counter to 001 for a new calendar year', () => {
      const existing = [
        { id: 'DAR-2025-089', darNumber: 'DAR-2025-089', status: 'COMPLETED' },
        { id: 'DAR-2025-090', darNumber: 'DAR-2025-090', status: 'COMPLETED' }
      ];
      const next2026 = generateInternalDarNumber(existing, 2026);
      expect(next2026).toBe('DAR-2026-001');
    });
  });

  describe('2. Store saveDarDraft - Deferred Allocation', () => {
    it('saves a draft with temporary id and null darNumber', () => {
      const { saveDarDraft } = useStore.getState();
      saveDarDraft({
        title: 'Draft Work Instruction for Assembly',
        docType: 'WI',
        department: 'PD'
      });

      const state = useStore.getState();
      expect(state.dars.length).toBe(1);
      const draft = state.dars[0];
      expect(draft.id).toMatch(/^draft_/);
      expect(draft.darNumber).toBeNull();
      expect(draft.isDraft).toBe(true);
      expect(draft.status).toBe('DRAFT');
    });
  });

  describe('3. Store submitDar / addDar - Formal Allocation on Submit', () => {
    it('allocates official DAR-YYYY-XXX on submission and records DAR_SUBMITTED action log', () => {
      const { submitDar } = useStore.getState();
      const currentYear = new Date().getFullYear();

      submitDar({
        title: 'Standard Operating Procedure for Quality Control',
        docType: 'SOP',
        department: 'PD',
        requesterId: 'U001',
        effectiveDate: '2026-09-06'
      });

      const state = useStore.getState();
      expect(state.dars.length).toBe(1);
      const submittedDar = state.dars[0];

      expect(submittedDar.darNumber).toBe(`DAR-${currentYear}-001`);
      expect(submittedDar.id).toBe(`DAR-${currentYear}-001`);
      expect(submittedDar.status).toBe('UNDER_REVIEW');

      // Check tasks bind to the official DAR number
      const reviewTask = state.tasks.find(t => t.type === 'Review');
      expect(reviewTask).toBeDefined();
      expect(reviewTask.darId).toBe(`DAR-${currentYear}-001`);

      // Check action log
      const submitLog = state.actionLog.find(l => l.actionType === 'DAR_SUBMITTED');
      expect(submitLog).toBeDefined();
      expect(submitLog.details).toContain(`DAR-${currentYear}-001`);
    });
  });
});
