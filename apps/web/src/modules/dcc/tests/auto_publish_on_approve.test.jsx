import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';

describe('Auto-Publish Master Document to EFFECTIVE upon Final Approval', () => {
  beforeEach(() => {
    useStore.setState({
      dars: [],
      darRequests: [],
      documents: [],
      tasks: [],
      timeline: [],
      actionLog: [],
      notifications: [],
      controlledCopyInstances: [],
      documentControlledCopies: [],
      controlledCopyAuditTrail: [],
      mockDateOffset: 0,
      simulatedDate: '2026-09-06',
      currentUser: { id: 'U003', name: 'กัลยาณี ผู้อำนวยการ', department: 'PD', level: 5, role: 'DIRECTOR' },
      masterUsers: [
        { id: 'U001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', level: 1, role: 'STAFF' },
        { id: 'U002', name: 'สมศักดิ์ ผู้จัดการฝ่ายผลิต', department: 'PD', level: 3, role: 'MANAGER' },
        { id: 'U003', name: 'กัลยาณี ผู้อำนวยการ', department: 'PD', level: 5, role: 'DIRECTOR' }
      ]
    });
  });

  describe('1. Immediate Auto-Publish for NEW Document (Effective Today)', () => {
    it('publishes document to documents array with status EFFECTIVE and published_at upon final approval', () => {
      const darId = 'DAR-2026-001';
      const newDar = {
        id: darId,
        darNumber: darId,
        title: 'ระเบียบปฏิบัติงานการตรวจสอบคุณภาพชิ้นงาน',
        docIdInput: 'SOP-PD-001',
        type: 'NEW',
        department: 'PD',
        requesterId: 'U001',
        effectiveDate: '2026-09-06', // Today
        status: 'PENDING_APPROVAL',
        rev: '00',
        distributions: [{ dept: 'PD', copy_no: '01' }]
      };

      const approveTask = {
        id: 'task-app-1',
        darId,
        type: 'Approve',
        assigneeId: 'U003',
        status: 'NORMAL'
      };

      useStore.setState({
        dars: [newDar],
        tasks: [approveTask],
        documents: []
      });

      // Execute final approval via processWorkflow
      useStore.getState().processWorkflow('task-app-1', 'APPROVE', 'อนุมัติการบังคับใช้เอกสาร');

      const state = useStore.getState();

      // 1. DAR status should be COMPLETED
      const updatedDar = state.dars.find(d => d.id === darId);
      expect(updatedDar.status).toBe('COMPLETED');

      // 2. Document must be present in documents array with status EFFECTIVE
      const pubDoc = state.documents.find(d => d.code === 'SOP-PD-001' || d.document_code === 'SOP-PD-001' || d.title === 'SOP-PD-001');
      expect(pubDoc).toBeDefined();
      expect(pubDoc.status).toBe('EFFECTIVE');
      expect(pubDoc.published_at).toBeDefined();
      expect(pubDoc.effective_date || pubDoc.effectiveDate).toBe('2026-09-06');

      // 3. Digital document is effective regardless of physical distribution tasks
      expect(pubDoc.status).toBe('EFFECTIVE');
    });

    it('publishes immediately via standalone approveDar action helper', () => {
      const darId = 'DAR-2026-002';
      const newDar = {
        id: darId,
        darNumber: darId,
        title: 'ขั้นตอนการจัดเก็บแม่พิมพ์',
        docIdInput: 'WI-PD-002',
        type: 'NEW',
        department: 'PD',
        requesterId: 'U001',
        effectiveDate: '2026-09-05', // Past date
        status: 'PENDING_APPROVAL'
      };

      const approveTask = {
        id: 'task-app-2',
        darId,
        type: 'Approve',
        assigneeId: 'U003'
      };

      useStore.setState({
        dars: [newDar],
        tasks: [approveTask],
        documents: []
      });

      useStore.getState().approveDar(darId, 'Direct Approval');

      const state = useStore.getState();
      const pubDoc = state.documents.find(d => d.code === 'WI-PD-002' || d.title === 'WI-PD-002');
      expect(pubDoc).toBeDefined();
      expect(pubDoc.status).toBe('EFFECTIVE');
      expect(pubDoc.published_at).toBeTruthy();
    });
  });

  describe('2. REVISION Lifecycle: Previous Revision SUPERSEDED & New Revision EFFECTIVE', () => {
    it('supersedes previous revision (Rev.00) and marks new revision (Rev.01) as EFFECTIVE', () => {
      const docCode = 'SOP-PD-010';
      const oldDoc = {
        id: 'doc-old-001',
        code: docCode,
        document_code: docCode,
        title: docCode,
        name: 'คู่มือการผลิต Rev 00',
        status: 'EFFECTIVE',
        rev: '00',
        revision: '00',
        department: 'PD',
        controlledCopy: 1
      };

      const oldCopy = {
        id: 'cc-old-01',
        doc_id: 'doc-old-001',
        doc_code: docCode,
        doc_version: '00',
        rev: '00',
        copy_no: '01',
        holder_dept: 'PD',
        status: 'ACTIVE'
      };

      const darId = 'DAR-2026-003';
      const revisionDar = {
        id: darId,
        darNumber: darId,
        docIdRef: 'doc-old-001',
        docIdInput: docCode,
        document_code: docCode,
        title: docCode,
        type: 'REVISION',
        department: 'PD',
        rev: '01',
        revision: '01',
        effectiveDate: '2026-09-06',
        status: 'PENDING_APPROVAL',
        distributions: [{ dept: 'PD', copy_no: '01' }]
      };

      const approveTask = {
        id: 'task-app-3',
        darId,
        type: 'Approve',
        assigneeId: 'U003'
      };

      useStore.setState({
        documents: [oldDoc],
        controlledCopyInstances: [oldCopy],
        documentControlledCopies: [oldCopy],
        dars: [revisionDar],
        tasks: [approveTask]
      });

      useStore.getState().processWorkflow('task-app-3', 'APPROVE', 'Approved Revision');

      const state = useStore.getState();

      // Old doc must be SUPERSEDED
      const previousDoc = state.documents.find(d => d.id === 'doc-old-001');
      expect(previousDoc.status).toBe('SUPERSEDED');

      // New doc must be EFFECTIVE
      const newRevDoc = state.documents.find(d => (d.code === docCode || d.title === docCode) && d.status === 'EFFECTIVE');
      expect(newRevDoc).toBeDefined();
      expect(newRevDoc.rev).toBe('01');
      expect(newRevDoc.published_at).toBeTruthy();

      // Recall task created for Rev.00
      const recallTask = state.tasks.find(t => t.type === 'RECALL_HARDCOPY' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST');
      expect(recallTask).toBeDefined();
    });
  });

  describe('3. Future Effective Date (SCHEDULED_EFFECTIVE)', () => {
    it('sets status to SCHEDULED_EFFECTIVE if effectiveDate is in the future, then flips to EFFECTIVE when reached', () => {
      const darId = 'DAR-2026-004';
      const futureDar = {
        id: darId,
        darNumber: darId,
        title: 'แบบฟอร์มบันทึกการซ่อมบำรุง',
        docIdInput: 'FM-MT-005',
        type: 'NEW',
        department: 'MT',
        effectiveDate: '2026-09-15', // Future date (simulated today is 2026-09-06)
        status: 'PENDING_APPROVAL'
      };

      const approveTask = {
        id: 'task-app-4',
        darId,
        type: 'Approve',
        assigneeId: 'U003'
      };

      useStore.setState({
        dars: [futureDar],
        tasks: [approveTask],
        documents: []
      });

      useStore.getState().processWorkflow('task-app-4', 'APPROVE', 'Approved for future effective date');

      let state = useStore.getState();
      const scheduledDoc = state.documents.find(d => d.code === 'FM-MT-005' || d.title === 'FM-MT-005');
      expect(scheduledDoc).toBeDefined();
      expect(scheduledDoc.status).toBe('SCHEDULED_EFFECTIVE');

      // Advancing simulated date to 2026-09-15 and running checkScheduledEffectiveDocs
      useStore.setState({ simulatedDate: '2026-09-15' });
      useStore.getState().checkScheduledEffectiveDocs();

      state = useStore.getState();
      const effectiveDoc = state.documents.find(d => d.code === 'FM-MT-005' || d.title === 'FM-MT-005');
      expect(effectiveDoc.status).toBe('EFFECTIVE');
      expect(effectiveDoc.published_at).toBeTruthy();

      const updatedDar = state.dars.find(d => d.id === darId);
      expect(updatedDar.status).toBe('COMPLETED');
    });
  });
});
