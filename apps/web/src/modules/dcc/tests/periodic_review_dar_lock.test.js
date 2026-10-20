import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { 
  validateOutcomeAndDarType, 
  getLinkedActionStatus, 
  createOrGetLinkedDarDraft,
  syncRevisionEffective,
  syncObsoleteCompleted
} from '../services/PeriodicReviewDarLinkService';

describe('PeriodicReviewDarLinkService', () => {
  beforeEach(() => {
    useStore.setState({
      documents: [
        { id: 'DOC01', code: 'DOC-001', title: 'Internal Doc', name: 'Internal Doc', rev: '01', type: 'QP', department: 'QA', ownerId: 'U001', effectiveDate: '2023-01-01', status: 'EFFECTIVE' },
        { id: 'EXT01', code: 'EXT-001', title: 'External Doc', name: 'External Doc', rev: '01', type: 'EXT', department: 'QA', ownerId: 'U001', effectiveDate: '2023-01-01', status: 'EFFECTIVE' }
      ],
      periodicReviewSchedules: [
        { id: 'PR01', documentId: 'DOC01', documentCategory: 'INTERNAL', status: 'COMPLETED', outcome: 'REVISION_REQUIRED' },
        { id: 'PR02', documentId: 'DOC01', documentCategory: 'INTERNAL', status: 'COMPLETED', outcome: 'OBSOLETE_REQUIRED' },
        { id: 'PR03', externalDocumentId: 'EXT01', documentCategory: 'EXTERNAL', status: 'COMPLETED', outcome: 'REVISION_REQUIRED' }
      ],
      dars: [],
      addDarAndReturnId: (payload) => {
        const id = 'DAR_' + Date.now();
        useStore.setState(state => ({
          dars: [...state.dars, { id, ...payload }]
        }));
        return id;
      }
    });
  });

  describe('validateOutcomeAndDarType', () => {
    it('should reject mismatched outcome and dar type', () => {
      expect(validateOutcomeAndDarType('REVISION_REQUIRED', 'OBSOLETE')).toBe(false);
      expect(validateOutcomeAndDarType('OBSOLETE_REQUIRED', 'REVISION')).toBe(false);
    });

    it('should accept matching outcome and dar type', () => {
      expect(validateOutcomeAndDarType('REVISION_REQUIRED', 'REVISION')).toBe(true);
      expect(validateOutcomeAndDarType('OBSOLETE_REQUIRED', 'OBSOLETE')).toBe(true);
    });
  });

  describe('getLinkedActionStatus', () => {
    it('should map COMPLETED to COMPLETED', () => {
      expect(getLinkedActionStatus('COMPLETED')).toBe('COMPLETED');
    });

    it('should map DRAFT to DAR_DRAFT', () => {
      expect(getLinkedActionStatus('DRAFT')).toBe('DAR_DRAFT');
    });
  });

  describe('createOrGetLinkedDarDraft', () => {
    it('should create valid internal DAR draft', () => {
      const state = useStore.getState();
      const schedule = state.periodicReviewSchedules.find(s => s.id === 'PR01');
      const payload = { type: 'REVISION' };
      
      const id = createOrGetLinkedDarDraft(schedule, 'REVISION_REQUIRED', payload, useStore.getState);
      expect(id).toBeDefined();
      
      const draft = useStore.getState().dars.find(d => d.id === id);
      expect(draft.sourceType).toBe('PERIODIC_REVIEW');
      expect(draft.sourceSnapshot.documentNo).toBe('DOC-001');
    });

    it('should snapshot doc_code (seed/live shape) as the document number', () => {
      useStore.setState(state => ({
        documents: [{ ...state.documents[0], code: undefined, doc_code: 'SOP-QA-009' }, ...state.documents.slice(1)]
      }));
      const schedule = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PR01');
      const id = createOrGetLinkedDarDraft(schedule, 'REVISION_REQUIRED', { type: 'REVISION' }, useStore.getState);
      expect(useStore.getState().dars.find(d => d.id === id).sourceSnapshot.documentNo).toBe('SOP-QA-009');
    });

    it('should reject external document linkage', () => {
      const state = useStore.getState();
      const schedule = state.periodicReviewSchedules.find(s => s.id === 'PR03'); // PR03 is EXTERNAL
      const payload = { type: 'REVISION' };
      
      expect(() => {
        createOrGetLinkedDarDraft(schedule, 'REVISION_REQUIRED', payload, useStore.getState);
      }).toThrow('ไม่สามารถเชื่อมโยง DAR สำหรับเอกสารภายนอกได้');
    });

    it('should reject when canonical internal document cannot be found', () => {
      const state = useStore.getState();
      const schedule = {
         ...state.periodicReviewSchedules[0],
         documentId: 'NON_EXISTENT_DOC'
      };
      const payload = { type: 'REVISION' };
      
      expect(() => {
        createOrGetLinkedDarDraft(schedule, 'REVISION_REQUIRED', payload, useStore.getState);
      }).toThrow('ไม่สามารถยืนยันว่าเอกสารต้นทางเป็นเอกสารภายในได้');
    });

    it('should allow legacy missing category when canonical Internal Document found', () => {
      const state = useStore.getState();
      const schedule = {
         ...state.periodicReviewSchedules.find(s => s.id === 'PR01'),
         documentCategory: undefined
      };
      const payload = { type: 'REVISION' };
      
      const id = createOrGetLinkedDarDraft(schedule, 'REVISION_REQUIRED', payload, useStore.getState);
      expect(id).toBeDefined();
    });

    it('should reject legacy missing category when no canonical Internal Document found', () => {
      const state = useStore.getState();
      const schedule = {
         ...state.periodicReviewSchedules.find(s => s.id === 'PR01'),
         documentCategory: undefined,
         documentId: 'UNKNOWN_DOC'
      };
      const payload = { type: 'REVISION' };
      
      expect(() => {
        createOrGetLinkedDarDraft(schedule, 'REVISION_REQUIRED', payload, useStore.getState);
      }).toThrow('ไม่สามารถยืนยันว่าเอกสารต้นทางเป็นเอกสารภายในได้');
    });
  });

  describe('syncRevisionEffective', () => {
    it('should sync EFFECTIVE state and create new schedule', () => {
      const dar = {
        sourceType: 'PERIODIC_REVIEW',
        type: 'REVISION',
        sourceId: 'PR01',
        targetDocumentId: 'DOC01',
        actualEffectiveDate: '2025-01-01',
        rev: '02',
        status: 'COMPLETED'
      };

      syncRevisionEffective(dar, useStore.getState, useStore.setState);
      
      const schedules = useStore.getState().periodicReviewSchedules;
      const updatedPr = schedules.find(s => s.id === 'PR01');
      expect(updatedPr.linkageStatus).toBe('COMPLETED');

      const nextSchedule = schedules.find(s => s.idempotencyKey === 'PERIODIC_REVIEW_CYCLE:DOC01:02:2025-01-01');
      expect(nextSchedule).toBeDefined();
      expect(nextSchedule.dueDate).toBe('2026-01-01');
    });
  });

  describe('syncObsoleteCompleted', () => {
    it('should sync OBSOLETE completed state but not create new schedule', () => {
      const dar = {
        id: 'D02',
        sourceType: 'PERIODIC_REVIEW',
        sourceId: 'PR02',
        type: 'OBSOLETE',
        status: 'COMPLETED',
        targetDocumentId: 'DOC01'
      };

      syncObsoleteCompleted(dar, useStore.getState, useStore.setState);
      
      const schedules = useStore.getState().periodicReviewSchedules;
      const updatedPr = schedules.find(s => s.id === 'PR02');
      expect(updatedPr.linkageStatus).toBe('COMPLETED');
      
      // Should not create new schedule for OBSOLETE
      const nextSchedules = schedules.filter(s => s.id.startsWith('PR-NEXT-'));
      expect(nextSchedules.length).toBe(0);
    });

    it('should not sync completed state if status is not COMPLETED', () => {
      let state = { periodicReviewSchedules: [{ id: 'PR02', linkageStatus: 'SUCCESS' }] };
      const set = (updater) => { state = updater(state); };
      
      const dar = {
        id: 'D02',
        sourceType: 'PERIODIC_REVIEW',
        sourceId: 'PR02',
        type: 'OBSOLETE',
        status: 'APPROVED'
      };

      syncObsoleteCompleted(dar, () => state, set);

      expect(state.periodicReviewSchedules[0].linkageStatus).toBe('SUCCESS');
    });
  });
});
